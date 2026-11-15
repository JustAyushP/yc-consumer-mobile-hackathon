import { StyleSheet, Text, TextProps } from "react-native";

import { colors, fonts } from "./theme";

export function Title(props: TextProps) {
  return <Text {...props} style={[styles.title, props.style]} />;
}

export function Kicker(props: TextProps) {
  return <Text {...props} style={[styles.kicker, props.style]} />;
}

export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]} />;
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.text, letterSpacing: 0.5 },
  kicker: { fontFamily: fonts.typewriter, fontSize: 13, color: colors.amber, letterSpacing: 3, textTransform: "uppercase" },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
