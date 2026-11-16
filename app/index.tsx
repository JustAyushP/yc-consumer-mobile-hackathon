import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Copy, Heading, Page, ui } from "@/components/companion";
import { isViewerLink, storyDestination } from "@/components/story-navigation";
import { colors, fonts } from "@/components/ui/theme";
import { useViewerToken } from "@/components/viewer";

export default function Stories() {
  const { t } = useLocalSearchParams<{ t?: string | string[] }>();
  const { token, ready } = useViewerToken();

  if (isViewerLink(t)) return <Redirect href="/world" />;

  return <Page label="STORY COLLECTION">
    <Heading>Choose your story.</Heading>
    <Copy muted>A new case is waiting to be opened.</Copy>
    <View style={styles.section}>
      <Text style={ui.eyebrow}>NOW PLAYING</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={token ? "Open your linked live case" : "Open Last Call on Market Street demo preview"} accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => router.push(storyDestination(token))} style={({ pressed }) => [styles.feature, pressed && styles.pressed]}>
        <View style={styles.imageFrame}><Image source={require("@/assets/images/velvet-lantern-scene.jpg")} style={styles.image} accessibilityIgnoresInvertColors /></View>
        <View style={styles.featureBody}>
          <Text style={styles.kicker}>SAN FRANCISCO · 1947</Text>
          <Text style={styles.featureTitle}>Last Call on Market Street</Text>
          <Text style={styles.description}>A lounge, a blackout, and three detectives chasing the truth.</Text>
          <Text style={styles.action}>{!ready ? "Opening stories…" : token ? "Open your linked case  ›" : "Explore demo  ›"}</Text>
        </View>
      </Pressable>
      {!ready ? <ActivityIndicator color={colors.amber} style={{ marginTop: 12 }} /> : <Text style={styles.note}>{token ? "Your personal link opens its assigned case, which may differ from this story." : "Demo preview uses fictional sample data. Open your personal link for your live case."}</Text>}
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>More stories</Text>
      <View style={styles.grid}>
        <View accessible accessibilityLabel="The Midnight Express, coming soon" style={styles.future}>
          <View style={styles.art}><Image source={require("@/assets/images/midnight-express.jpg")} style={styles.cover} accessible={false} /></View>
          <Text style={styles.futureTitle}>The Midnight Express</Text><Text style={styles.coming}>COMING SOON</Text>
        </View>
        <View accessible accessibilityLabel="The Glass House, coming soon" style={styles.future}>
          <View style={styles.art}><Image source={require("@/assets/images/glass-house.jpg")} style={styles.cover} accessible={false} /></View>
          <Text style={styles.futureTitle}>The Glass House</Text><Text style={styles.coming}>COMING SOON</Text>
        </View>
      </View>
    </View>
  </Page>;
}

const styles = StyleSheet.create({
  section: { marginTop: 26 },
  feature: { marginTop: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 15, overflow: "hidden", backgroundColor: colors.surface },
  pressed: { opacity: 0.75 },
  imageFrame: { aspectRatio: 1264 / 700, backgroundColor: "#000000" },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  featureBody: { padding: 18, gap: 8 },
  kicker: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 1.5, color: colors.amber },
  featureTitle: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.text },
  description: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.muted },
  action: { color: colors.amber, fontFamily: fonts.bodyBold, fontSize: 13, marginTop: 6 },
  note: { fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 12 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, color: colors.text },
  grid: { flexDirection: "row", gap: 12, marginTop: 14 },
  future: { flex: 1, minWidth: 0, overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingBottom: 14 },
  art: { aspectRatio: 1.15 },
  cover: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", resizeMode: "cover" },
  futureTitle: { fontFamily: fonts.display, fontSize: 16, lineHeight: 21, color: colors.text, paddingHorizontal: 12, marginTop: 12 },
  coming: { fontFamily: fonts.body, fontSize: 9, letterSpacing: 1.2, color: colors.muted, paddingHorizontal: 12, marginTop: 6 },
});
