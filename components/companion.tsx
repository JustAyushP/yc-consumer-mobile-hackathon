import { useQueries } from "convex/react";
import { FunctionReturnType } from "convex/server";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { api } from "@/convex/_generated/api";
import { colors, fonts } from "./ui/theme";
import { useViewerToken } from "./viewer";

export function Icon({ name, color = colors.amber }: { name: "world" | "investigation" | "profile"; color?: string }) {
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
    {name === "world" ? <Path d="M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3zM8 2v17M16 5v17" /> : name === "investigation" ? <><Circle cx={10} cy={10} r={7} /><Path d="m15 15 7 7M7 10h6M10 7v6" /></> : <><Circle cx={12} cy={7} r={4} /><Path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>}
  </Svg>;
}

export function Page({ children, label }: { children: ReactNode; label: string }) {
  return <SafeAreaView edges={["top", "left", "right"]} style={ui.safe}>
    <ScrollView contentContainerStyle={ui.scroll}>
      <View style={ui.column}>
        <View style={ui.masthead}><Text style={ui.brand}>RAVO</Text><Text style={ui.label}>{label}</Text></View>
        {children}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={ui.heading}>{children}</Text>;
}

export function Copy({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[ui.copy, muted && ui.muted]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={ui.card}>{children}</View>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={ui.section}><Text accessibilityRole="header" style={ui.sectionTitle}>{title}</Text>{children}</View>;
}

export function Action({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [ui.row, pressed && { opacity: 0.6 }]}>
    <View style={ui.grow}><Text style={ui.rowTitle}>{title}</Text>{subtitle ? <Text style={ui.small}>{subtitle}</Text> : null}</View><Text style={ui.arrow}>›</Text>
  </Pressable>;
}

export function Notice({ title, body }: { title: string; body: string }) {
  return <Card><Text style={ui.rowTitle}>{title}</Text><Copy muted>{body}</Copy></Card>;
}

type ViewerApi = typeof api.game.viewer;
type QueryName = "me" | "caseFile" | "board" | "story" | "team" | "timeline" | "reveal";

export function ViewerRead<N extends QueryName>({ query, children }: { query: N; children: (data: FunctionReturnType<ViewerApi[N]>) => ReactNode }) {
  const { token, ready } = useViewerToken();
  const results = useQueries(token ? { data: { query: api.game.viewer[query], args: { viewerToken: token } } } : {});
  const result = results.data as FunctionReturnType<ViewerApi[N]> | Error | undefined;
  if (!ready) return <View style={ui.loading}><ActivityIndicator color={colors.amber} /><Copy muted>Opening your case…</Copy></View>;
  if (!token) return <Notice title="Your personal link is the key" body="Open the link from your iMessage or WhatsApp conversation to see your case. No login needed." />;
  if (result instanceof Error) return <Notice title="This case couldn't be opened" body="Your link may be invalid or expired. Reopen a fresh personal link from your messaging conversation. If it still fails, try again when your connection returns." />;
  if (result === undefined) return <View style={ui.loading}><ActivityIndicator color={colors.amber} /><Copy muted>Waiting for your case…</Copy><Text style={ui.small}>Check your connection if this takes a while.</Text></View>;
  return <View key={token} style={ui.content}>{children(result)}</View>;
}

export const ui = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: "center", paddingBottom: 32 },
  column: { width: "100%", maxWidth: 720, paddingHorizontal: 22 },
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 18, paddingBottom: 28 },
  brand: { fontFamily: fonts.bodyBold, color: colors.amber, fontSize: 13, letterSpacing: 4 },
  label: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, letterSpacing: 1.5 },
  heading: { fontFamily: fonts.display, fontSize: 34, lineHeight: 42, color: colors.text, marginBottom: 12 },
  copy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 24, color: colors.text },
  muted: { color: colors.muted },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 19, backgroundColor: colors.surface, gap: 10 },
  section: { marginTop: 26, gap: 14 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 25, lineHeight: 32, color: colors.text },
  row: { paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: "row", gap: 14, alignItems: "center", minHeight: 58 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 23, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.muted },
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 16, letterSpacing: 1.5, color: colors.amber },
  arrow: { color: colors.amber, fontSize: 25 },
  grow: { flex: 1, gap: 4 },
  content: { gap: 10 },
  loading: { paddingVertical: 40, gap: 16, alignItems: "center" },
});
