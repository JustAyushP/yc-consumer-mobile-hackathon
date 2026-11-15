import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { PlayfairDisplay_400Regular, PlayfairDisplay_700Bold_Italic } from "@expo-google-fonts/playfair-display";
import { SpecialElite_400Regular } from "@expo-google-fonts/special-elite";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { colors } from "@/components/ui/theme";
import { ViewerProvider } from "@/components/viewer";
import { BackendProvider } from "@/components/backend";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, PlayfairDisplay_400Regular, PlayfairDisplay_700Bold_Italic, SpecialElite_400Regular });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;
  return (
    <BackendProvider>
      <ViewerProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </ViewerProvider>
    </BackendProvider>
  );
}
