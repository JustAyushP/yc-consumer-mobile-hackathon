import { Href, Link, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Screen } from "./Screen";
import { Body, Kicker, Title } from "./Text";
import { colors, fonts, radius, space } from "./theme";

const SCREENS = ["survey", "role", "lobby", "session", "chat", "board", "accuse", "reveal"] as const;

/** Shell screen: names the lane that builds it and the Convex functions it uses. */
export function Placeholder({ kicker, title, uses }: { kicker: string; title: string; uses: string[] }) {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  return (
    <Screen>
      <Kicker>{kicker}</Kicker>
      <Title>{title}</Title>
      <View style={styles.card}>
        <Text style={styles.label}>Uses</Text>
        {uses.map((u) => (
          <Text key={u} style={styles.code}>
            {u}
          </Text>
        ))}
      </View>
      <Body style={{ color: colors.muted }}>Placeholder. Detective {playerId ?? "?"}</Body>
      <View style={styles.nav}>
        {SCREENS.map((s) => (
          <Link key={s} href={`/play/${playerId}/${s}` as Href} style={styles.link}>
            {s}
          </Link>
        ))}
        <Link href="/" style={styles.link}>
          home
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  label: { fontFamily: fonts.bodyBold, color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 2 },
  code: { fontFamily: fonts.typewriter, color: colors.paper, fontSize: 14 },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  link: { fontFamily: fonts.typewriter, color: colors.amber, borderColor: colors.line, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm },
});
