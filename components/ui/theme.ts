import { Platform } from "react-native";

export const colors = {
  bg: "#101114",
  surface: "#1B1C20",
  surfaceRaised: "#402A37",
  line: "#353339",
  paper: "#E9DFC7",
  ink: "#1A1612",
  text: "#F2E9DA",
  muted: "#AAA6A0",
  amber: "#D5AE68",
  blood: "#B3261E",
  ravo: "#E2A33B",
};

export const fonts = {
  display: Platform.OS === "android" ? "serif" : "Georgia",
  displayItalic: Platform.OS === "android" ? "serif" : "Georgia-Italic",
  typewriter: "SpecialElite_400Regular",
  body: Platform.OS === "android" ? "sans-serif" : "Arial",
  bodyBold: Platform.select({ ios: "Arial-BoldMT", android: "sans-serif-medium", default: "Arial" }),
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 };

export const radius = { sm: 4, md: 10, lg: 18 };
