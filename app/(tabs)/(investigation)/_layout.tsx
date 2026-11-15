import { Stack } from "expo-router";
import { colors } from "@/components/ui/theme";

export const unstable_settings = { anchor: "investigation" };

export default function InvestigationLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
