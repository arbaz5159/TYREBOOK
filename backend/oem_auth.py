"""Firebase ID-token verification for the Super-Admin write gate.

Backend endpoints that mutate the global OEM database (edit / Excel
import) MUST call `require_super_admin(request)` before doing any
work. The gate does two things:

    1. Verifies the caller's Firebase ID token cryptographically
       against the Google-signed JWKS for `securetoken@system.gserviceaccount.com`.
       No Firebase Admin SDK / service-account credentials are needed —
       the tokens are signed by Google and the public keys are served
       from a well-known URL.

    2. Checks that the token's verified `email` claim is present in
       `SUPER_ADMIN_EMAILS` (comma-separated, backend .env).

If either step fails an HTTP 401/403 is raised. There is NO in-code
override — a service that cannot verify tokens simply denies writes,
which is the safe default and matches user directive #7 ("Do not
weaken security to make tests pass").
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import jwt
import requests
from fastapi import HTTPException, Request

logger = logging.getLogger("uvicorn.error")

_JWKS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_ISSUER_TEMPLATE = "https://securetoken.google.com/{project_id}"

# In-process cache for the public keys. Google rotates them roughly
# daily so a short TTL is fine. If the network call fails we fall back
# to the cached copy until it expires.
_jwks_cache: dict = {"keys": {}, "fetched_at": 0.0}
_JWKS_TTL_SEC = 60 * 60  # 1 h


def _project_id() -> str:
    p = (os.environ.get("FIREBASE_PROJECT_ID") or "").strip()
    if not p:
        raise HTTPException(
            status_code=500,
            detail="Backend not configured: FIREBASE_PROJECT_ID env variable missing.",
        )
    return p


def _super_admin_emails() -> set[str]:
    raw = os.environ.get("SUPER_ADMIN_EMAILS", "") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _load_jwks() -> dict:
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL_SEC:
        return _jwks_cache["keys"]
    try:
        r = requests.get(_JWKS_URL, timeout=8)
        r.raise_for_status()
        _jwks_cache["keys"] = r.json()
        _jwks_cache["fetched_at"] = now
    except Exception as e:  # noqa: BLE001
        # Fall back to cached copy so a transient outage doesn't wedge
        # writes for a legitimate super admin. If cache is empty we
        # must fail closed.
        if not _jwks_cache["keys"]:
            logger.exception("Failed to fetch Firebase JWKS: %s", e)
            raise HTTPException(
                status_code=503,
                detail="Cannot verify auth right now (JWKS unreachable). Retry.",
            )
        logger.warning("Using stale JWKS cache (fetch failed: %s)", e)
    return _jwks_cache["keys"]


def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return auth[7:].strip()


def verify_firebase_id_token(token: str) -> dict:
    """Cryptographically verify a Firebase ID token and return its
    decoded claims. Raises HTTPException 401 on failure."""
    project_id = _project_id()
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Malformed token: {e}")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token missing kid header")

    jwks = _load_jwks()
    pem_cert = jwks.get(kid)
    if not pem_cert:
        # kid rotated — force refresh and retry once.
        _jwks_cache["fetched_at"] = 0.0
        jwks = _load_jwks()
        pem_cert = jwks.get(kid)
    if not pem_cert:
        raise HTTPException(status_code=401, detail="Unknown token signing key")

    try:
        # Firebase publishes X.509 certificates; extract the public key.
        from cryptography import x509
        from cryptography.hazmat.backends import default_backend

        cert = x509.load_pem_x509_certificate(pem_cert.encode(), default_backend())
        public_key = cert.public_key()

        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=_ISSUER_TEMPLATE.format(project_id=project_id),
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired — sign in again")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    return claims


def require_super_admin(request: Request) -> dict:
    """FastAPI dependency helper. Extracts + verifies the bearer token
    and enforces the SUPER_ADMIN_EMAILS allow-list. Returns the caller's
    verified email + uid so route handlers can attribute audit-log
    entries.
    """
    token = _extract_bearer(request)
    claims = verify_firebase_id_token(token)
    email: Optional[str] = None
    if isinstance(claims.get("email"), str):
        email = claims["email"].strip().lower()
    if not email:
        raise HTTPException(status_code=403, detail="Token has no email claim")
    if email not in _super_admin_emails():
        raise HTTPException(
            status_code=403,
            detail="Super Admin privileges required for this operation.",
        )
    # Optional strict email-verified check. Firebase Auth sets
    # `email_verified=False` for brand-new email/password accounts until
    # they click the confirmation link, which is inconvenient for a
    # closed super-admin allow-list. We keep the check off by default
    # and let deployments opt in via `REQUIRE_SUPER_ADMIN_EMAIL_VERIFIED=1`.
    if os.environ.get("REQUIRE_SUPER_ADMIN_EMAIL_VERIFIED", "").strip() in ("1", "true", "yes"):
        if claims.get("email_verified") is False:
            raise HTTPException(
                status_code=403,
                detail="Email not verified in Firebase Auth.",
            )
    return {
        "uid": claims.get("user_id") or claims.get("sub"),
        "email": email,
        "name": claims.get("name"),
    }
