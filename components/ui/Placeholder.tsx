import { Href, Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useViewerToken } from "../viewer";
import { Screen } from "./Screen";
import { Body, Kicker, Title } from "./Text";
import { colors, fonts, radius, space } from "./theme";

const SCREENS: { href: string; label: string }[] = [
  { href: "/", label: "case file" },
  { href: "/role", label: "role" },
  { href: "/board", label: "board" },
  { href: "/story", label: "story" },
  { href: "/team", label: "team" },
  { href: "/timeline", label: "timeline" },
  { href: "/reveal", label: "reveal" },
];

/** Read-only shell screen: names the query it reads and previews its live data. Studio replaces each one. */
export function Placeholder({ kicker, title, uses, data }: { kicker: string; title: string; uses: string; data: unknown }) {
  const { token, ready } = useViewerToken();
  return (
    <Screen>
      <Kicker>{kicker}</Kicker>
      <Title>{title}</Title>
      {ready && !token ? (
        <Body style={{ color: colors.muted }}>Open the personal link RAVO texted you to see your case.</Body>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Reads {uses}</Text>
          <Text style={styles.code} numberOfLines={18}>
            {data === undefined ? "Loading…" : JSON.stringify(data, null, 2)}
          </Text>
        </View>
      )}
      <View style={styles.nav}>
        {SCREENS.map((s) => (
          <Link key={s.href} href={s.href as Href} style={styles.link}>
            {s.label}
          </Link>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  label: { fontFamily: fonts.bodyBold, color: colors.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 2 },
  code: { fontFamily: fonts.typewriter, color: colors.paper, fontSize: 12, lineHeight: 17 },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  link: { fontFamily: fonts.typewriter, color: colors.amber, borderColor: colors.line, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm },
});
