import { Stack } from "expo-router";
import { colors } from "@/components/ui/theme";

export const unstable_settings = { anchor: "index" };

export default function WorldLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
