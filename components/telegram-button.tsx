import * as Linking from "expo-linking";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { openTelegram } from "./telegram-link";
import { colors, fonts } from "./ui/theme";

export function TelegramButton({ demo = false }: { demo?: boolean }) {
  const opening = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    setPending(true);
    setFailed(false);
    const success = await openTelegram(Linking.openURL);
    setFailed(!success);
    setPending(false);
    opening.current = false;
  };

  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Chat with Sal, open Telegram" accessibilityState={{ disabled: pending }} disabled={pending} onPress={open} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Text style={styles.title}>{pending ? "Opening Telegram…" : "Chat with Sal  ·  Open Telegram"}</Text>
    </Pressable>
    <Text style={styles.note}>{demo ? "Opens the Telegram demo bot. Sample case data isn’t synchronized." : "Opens the Telegram demo bot. No viewer details are sent from this app."}</Text>
    {failed ? <Text accessibilityLiveRegion="polite" style={styles.note}>Couldn’t open Telegram. Try again or visit t.me/ravo_sal_demo_bot.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 24, gap: 8 },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.amber, borderRadius: 12, padding: 14 },
  title: { fontFamily: fonts.bodyBold, color: colors.amber, fontSize: 13 },
  note: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 17 },
});
