import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold_Italic } from "@expo-google-fonts/playfair-display";
import { SpecialElite_400Regular } from "@expo-google-fonts/special-elite";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { colors } from "@/components/ui/theme";
import { ViewerProvider } from "@/components/viewer";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("EXPO_PUBLIC_CONVEX_URL is missing. Run the `convex push` command to write .env.local.");
const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, PlayfairDisplay_400Regular, PlayfairDisplay_700Bold_Italic, SpecialElite_400Regular });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return (
    <ConvexProvider client={convex}>
      <ViewerProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </ViewerProvider>
    </ConvexProvider>
  );
}
