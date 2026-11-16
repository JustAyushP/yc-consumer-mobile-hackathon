import * as Linking from "expo-linking";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { openTelegram, TELEGRAM_BOTS } from "./telegram-link";
import { colors, fonts } from "./ui/theme";

export function TelegramButton({ demo = false }: { demo?: boolean }) {
  const opening = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const open = async (bot: (typeof TELEGRAM_BOTS)[number]) => {
    if (opening.current) return;
    opening.current = true;
    setPending(bot.lineId);
    setFailed(null);
    const success = await openTelegram(Linking.openURL, bot.url);
    setFailed(success ? null : bot.handle);
    setPending(null);
    opening.current = false;
  };

  return <View style={styles.container}>
    {TELEGRAM_BOTS.map((bot) => <Pressable key={bot.lineId} accessibilityRole="button" accessibilityLabel={`${bot.label}, open Telegram`} accessibilityState={{ disabled: pending !== null }} disabled={pending !== null} onPress={() => open(bot)} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <Text style={styles.title}>{pending === bot.lineId ? "Opening Telegram…" : `${bot.label}  ·  Open Telegram`}</Text>
    </Pressable>)}
    <Text style={styles.note}>{demo ? "Opens the Telegram demo bots. Sample case data isn’t synchronized." : "Opens the Telegram demo bots. All three characters share what you tell any of them. No viewer details are sent from this app."}</Text>
    {failed ? <Text accessibilityLiveRegion="polite" style={styles.note}>Couldn’t open Telegram. Try again or visit t.me/{failed}.</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { marginTop: 24, gap: 8 },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.amber, borderRadius: 12, padding: 14 },
  title: { fontFamily: fonts.bodyBold, color: colors.amber, fontSize: 13 },
  note: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 17 },
});
