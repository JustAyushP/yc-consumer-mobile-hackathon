import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Notice, ui } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";
import { useBackendReady } from "@/components/backend";
import { useViewerToken } from "@/components/viewer";
import { api } from "@/convex/_generated/api";

type LineId = "1" | "2" | "3";

export default function Chat() {
  const backendReady = useBackendReady();
  const { token, ready } = useViewerToken();
  return <SafeAreaView edges={["top", "left", "right"]} style={ui.safe}>
    <View style={[ui.column, styles.fill]}>
      <View style={ui.masthead}><Text style={ui.brand}>RAVO</Text><Text style={ui.label}>TALK TO THE CHARACTERS</Text></View>
      {!backendReady ? <Notice title="Live case connection isn't configured" body="This build cannot reach a live case." />
        : !ready ? <ActivityIndicator color={colors.amber} />
        : !token ? <Notice title="Your personal link is the key" body="Open your personal link to chat with the characters." />
        : <Conversation token={token} />}
    </View>
  </SafeAreaView>;
}

function Conversation({ token }: { token: string }) {
  const [lineId, setLineId] = useState<LineId>("1");
  const info = useQuery(api.chat.harness.lines, { viewerToken: token });
  const messages = useQuery(api.chat.harness.thread, { viewerToken: token, lineId });
  const send = useAction(api.chat.harness.send);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<LineId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const active = info?.lines.find((line) => line.lineId === lineId);

  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }); }, [messages?.length, pending]);

  const submit = async () => {
    const body = text.trim();
    if (!body || pending) return;
    setText("");
    setError(null);
    setPending(lineId);
    try { await send({ viewerToken: token, lineId, text: body }); } catch { setError("Couldn't reach the lounge. Try again."); setText(body); }
    setPending(null);
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill} keyboardVerticalOffset={60}>
    <View style={styles.tabs}>
      {(info?.lines ?? []).map((line) => <Pressable key={line.lineId} accessibilityRole="tab" accessibilityState={{ selected: line.lineId === lineId }} onPress={() => setLineId(line.lineId)} style={[styles.tab, line.lineId === lineId && styles.tabActive]}>
        <Text numberOfLines={1} style={[styles.tabText, line.lineId === lineId && styles.tabTextActive]}>{line.name}</Text>
      </Pressable>)}
    </View>
    {active ? <Text style={ui.small}>{active.title}{info ? `  ·  Day ${info.day}  ·  ${info.progress}% of the case connected` : ""}</Text> : null}
    <ScrollView ref={scroll} style={styles.fill} contentContainerStyle={styles.list}>
      {messages === undefined ? <ActivityIndicator color={colors.amber} />
        : messages.length === 0 ? <Text style={ui.small}>Say something to {active?.name ?? "them"}. Everyone in the lounge hears what you tell the others.</Text>
        : messages.map((m) => m.system ? <Text key={m.id} style={styles.system}>{m.body}</Text> : <View key={m.id} style={[styles.bubble, m.fromPlayer ? styles.mine : styles.theirs]}>
          {!m.fromPlayer ? <Text style={ui.eyebrow}>{active?.name?.toUpperCase()}</Text> : null}
          <Text style={[styles.body, m.fromPlayer && styles.mineText]}>{m.body}</Text>
        </View>)}
      {pending === lineId ? <View style={[styles.bubble, styles.theirs]}><Text style={ui.small}>{active?.name} is thinking…</Text></View> : null}
    </ScrollView>
    {error ? <Text style={ui.small}>{error}</Text> : null}
    <View style={styles.composer}>
      <TextInput value={text} onChangeText={setText} placeholder={`Message ${active?.name ?? ""}`} placeholderTextColor={colors.muted} style={styles.input} multiline onSubmitEditing={submit} accessibilityLabel="Message" />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!!pending || !text.trim()} onPress={submit} style={({ pressed }) => [styles.send, (pressed || !!pending || !text.trim()) && { opacity: 0.5 }]}>
        <Text style={styles.sendText}>Send</Text>
      </Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tab: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center" },
  tabActive: { borderColor: colors.amber, backgroundColor: colors.surface },
  tabText: { fontFamily: fonts.body, color: colors.muted, fontSize: 13 },
  tabTextActive: { color: colors.amber, fontFamily: fonts.bodyBold },
  list: { gap: 10, paddingVertical: 12 },
  bubble: { maxWidth: "85%", borderRadius: 14, padding: 12, gap: 4 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.amber },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 14, lineHeight: 20 },
  mineText: { color: colors.ink },
  system: { alignSelf: "center", textAlign: "center", fontFamily: fonts.typewriter, color: colors.amber, fontSize: 12, lineHeight: 18, paddingHorizontal: 12 },
  composer: { flexDirection: "row", gap: 8, paddingVertical: 10, alignItems: "flex-end" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontFamily: fonts.body, fontSize: 14, backgroundColor: colors.surface },
  send: { height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.amber, justifyContent: "center" },
  sendText: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 14 },
});
