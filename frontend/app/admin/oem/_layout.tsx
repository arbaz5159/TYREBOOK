import { Stack } from "expo-router";

// Nested stack so the admin/oem sub-screens (viewer / editor / import /
// audit) push on top of each other without redrawing the Admin panel
// backdrop.
export default function AdminOemLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
