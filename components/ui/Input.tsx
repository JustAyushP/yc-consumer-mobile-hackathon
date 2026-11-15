import { StyleSheet, TextInput, TextInputProps } from "react-native";

import { colors, fonts, radius, space } from "./theme";

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />;
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.typewriter,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    padding: space.md,
  },
});
