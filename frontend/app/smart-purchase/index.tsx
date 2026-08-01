import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { scanInvoice, type InvoiceExtraction } from "@/src/api/ocr";
import { storage } from "@/src/utils/storage";
import { usePermissions } from "@/src/hooks/usePermissions";
import { colors, fontSize, radius, spacing } from "@/src/theme/tokens";

const DRAFT_KEY = "tyrebook.smartPurchase.draft";

export default function SmartPurchaseScanner() {
  const router = useRouter();
  const perms = usePermissions();
  const [busy, setBusy] = useState<null | "camera" | "gallery" | "pdf">(null);
  const [error, setError] = useState<string | null>(null);

  if (!perms.canCreatePurchase) return <Redirect href="/(tabs)/dashboard" />;

  const run = async (b64: string, mime: string, imageUri?: string) => {
    setError(null);
    try {
      const extraction: InvoiceExtraction = await scanInvoice(b64, mime);
      await storage.setItem(
        DRAFT_KEY,
        JSON.stringify({ extraction, imageUri: imageUri ?? null, mime }),
      );
      router.push("/smart-purchase/preview");
    } catch (e: any) {
      setError(e?.message ?? "Scan failed");
    } finally {
      setBusy(null);
    }
  };

  const chooseCamera = async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError(
          perm.canAskAgain
            ? "Camera permission is required to capture invoices."
            : "Camera permission is blocked. Enable it from device Settings → Apps → TyreBook.",
        );
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        base64: true,
        // expo-image-picker v17+ uses the string-array API; MediaTypeOptions is
        // removed and will throw on newer Android builds.
        mediaTypes: ["images"],
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        setError("Could not read image.");
        return;
      }
      setBusy("camera");
      await run(asset.base64, asset.mimeType ?? "image/jpeg", asset.uri);
    } catch (e: any) {
      setError("Camera failed: " + (e?.message ?? "unknown error"));
    }
  };

  const chooseGallery = async () => {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          perm.canAskAgain
            ? "Photo permission is required to upload invoices."
            : "Photo permission is blocked. Enable it from device Settings → Apps → TyreBook.",
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        base64: true,
        mediaTypes: ["images"],
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if (!asset.base64) {
        setError("Could not read image.");
        return;
      }
      setBusy("gallery");
      await run(asset.base64, asset.mimeType ?? "image/jpeg", asset.uri);
    } catch (e: any) {
      setError("Gallery failed: " + (e?.message ?? "unknown error"));
    }
  };

  const choosePdf = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const file = res.assets[0];
    setBusy("pdf");
    try {
      // Read file as base64 (works for images; PDFs are also read but the OCR
      // model handles them best when first page is rasterised. Since Expo has
      // no easy rasteriser, we send the PDF bytes — gpt-4o-mini's vision
      // endpoint won't process PDFs directly, so we recommend an image if it
      // fails and fall back to PDF.)
      const b64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: "base64" as any,
      });
      const mime = file.mimeType ?? (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      if (mime === "application/pdf") {
        setError("PDF detected. For best OCR results, please capture / upload the invoice as an image (JPG or PNG). PDF support requires a native converter step.");
        setBusy(null);
        return;
      }
      await run(b64, mime, file.uri);
    } catch (e: any) {
      setError(e?.message ?? "Could not read file.");
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.title}>AI Smart Purchase</Text>
          <Text style={styles.sub}>Scan invoice, auto-extract fields</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <MaterialCommunityIcons name="text-recognition" size={44} color="#FFFFFF" />
          <Text style={styles.heroTitle}>Scan Purchase Invoice</Text>
          <Text style={styles.heroSub}>
            Capture or upload a supplier invoice. AI will detect supplier, invoice #, brand, model, size, quantity, price, GST, and total. You can review + edit before saving.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.big, { backgroundColor: colors.brandPrimary }]}
          onPress={chooseCamera}
          disabled={!!busy}
          testID="scan-camera"
          activeOpacity={0.85}
        >
          {busy === "camera" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="camera-outline" size={28} color="#FFFFFF" />
          )}
          <Text style={styles.bigText}>Capture with Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.big, { backgroundColor: colors.brandSecondary }]}
          onPress={chooseGallery}
          disabled={!!busy}
          testID="scan-gallery"
          activeOpacity={0.85}
        >
          {busy === "gallery" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="image-multiple-outline" size={28} color="#FFFFFF" />
          )}
          <Text style={styles.bigText}>Upload Invoice Image</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.big, { backgroundColor: colors.surfaceInverse }]}
          onPress={choosePdf}
          disabled={!!busy}
          testID="scan-pdf"
          activeOpacity={0.85}
        >
          {busy === "pdf" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="file-pdf-box" size={28} color="#FFFFFF" />
          )}
          <Text style={styles.bigText}>Upload PDF Invoice</Text>
        </TouchableOpacity>

        {error ? (
          <View style={styles.errBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.note}>
          Tip · Good lighting, flat surface, no glare gives the best results.{"\n"}
          Powered by GPT‑4o vision · your data stays in your Firestore.
        </Text>

        <PrimaryButton
          label="Enter Purchase Manually"
          onPress={() => router.push("/purchase/new")}
          variant="ghost"
          testID="manual-purchase-btn"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.md },
  hero: {
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heroTitle: { color: "#FFFFFF", fontSize: fontSize.xl, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.75)", fontSize: fontSize.sm, lineHeight: 20 },
  big: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
  },
  bigText: { color: "#FFFFFF", fontSize: fontSize.lg, fontWeight: "700" },
  errBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "#FFDAD6",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errText: { color: colors.error, flex: 1, fontSize: fontSize.sm },
  note: {
    fontSize: fontSize.xs,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: "center",
    lineHeight: 18,
  },
});
