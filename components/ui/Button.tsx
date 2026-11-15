import { Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius, space } from "./theme";

export function Button({ label, onPress, variant = "primary", disabled }: { label: string; onPress?: () => void; variant?: "primary" | "ghost"; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, variant === "primary" ? styles.primary : styles.ghost, (pressed || disabled) && styles.dim]}
    >
      <Text style={[styles.label, variant === "primary" ? styles.primaryLabel : styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.sm, alignItems: "center" },
  primary: { backgroundColor: colors.amber },
  ghost: { borderWidth: 1, borderColor: colors.line },
  dim: { opacity: 0.6 },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 1 },
  primaryLabel: { color: colors.ink },
  ghostLabel: { color: colors.text },
});
