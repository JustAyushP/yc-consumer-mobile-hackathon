import { router, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, Card, Copy, Heading, Icon, Page, Section, ui } from "./companion";
import { demoCase } from "./demo-data";
import { colors, fonts } from "./ui/theme";
import { locations } from "./world-content";

const tabs = ["world", "investigation", "profile"] as const;
const labels = { world: "World", investigation: "Investigation", profile: "Profile" };

export default function DemoPreview() {
  const { screen, place } = useLocalSearchParams<{ screen?: string; place?: string }>();
  const tab = tabs.find(value => value === screen) ?? "world";
  const location = locations.find(value => value.id === place);
  const insets = useSafeAreaInsets();
  return <View style={styles.root}>
    <Page key={tab} label="DEMO PREVIEW">
      <View style={styles.demoLabel}><Text style={styles.demoText}>Fictional sample case · not live player data</Text></View>
      {tab === "world" ? <>
        <Heading>{demoCase.title}</Heading><Copy muted>{demoCase.setting}</Copy>
        <View style={styles.hero}><Image source={require("@/assets/images/market-street.jpg")} style={styles.image} accessibilityLabel="Original noir illustration of a fictional lounge on a foggy San Francisco street" /></View>
        <View style={styles.chapter}><Text style={ui.eyebrow}>CHAPTER 01 / THE ROOM WENT DARK</Text><Copy>{demoCase.premise}</Copy></View>
        <Section title="Step inside the Lantern">
          <View style={styles.map}><Image source={require("@/assets/images/velvet-lantern-scene.jpg")} style={styles.image} accessibilityLabel="Illustrative lounge map; the bar, stage and office are also listed below" />{locations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={() => router.setParams({ place: item.id })} style={[styles.pin, { left: `${item.x}%`, top: `${item.y}%` }]}><Text style={styles.pinText}>{item.number}</Text></Pressable>)}</View>
          <Text style={ui.small}>An illustrative setting, not a measured crime-scene plan.</Text>
          {locations.map(item => <Action key={item.id} title={`${item.number}  ${item.name}`} subtitle={item.subtitle} onPress={() => router.setParams({ place: item.id })} />)}
          {location ? <Card><Text style={ui.eyebrow}>LOCATION {location.number}</Text><Text style={ui.sectionTitle}>{location.name}</Text><Copy muted>{location.id === "office" ? "Victor's office overlooks the rear alley. An open cash drawer, a spilled drink and a broken display cabinet are the first pieces of the scene." : location.id === "stage" ? "Vivian's final set ended here. Behind the curtain, a narrow passage connects the dressing room to the office corridor." : "Sal tended this bar on the night of the murder. The room fell silent when the lights went out."}</Copy><Action title="Close location" onPress={() => router.setParams({ place: "" })} /></Card> : null}
        </Section>
        <Section title="On the evidence board">{demoCase.evidence.map(item => <Card key={item.name}><Text style={ui.eyebrow}>{item.kind}</Text><Text style={ui.rowTitle}>{item.name}</Text><Copy muted>{item.summary}</Copy></Card>)}</Section>
        <Section title="Everyone has a version">{demoCase.suspects.map(person => <Card key={person.name}><Text style={ui.rowTitle}>{person.name}</Text><Text style={ui.eyebrow}>{person.title}</Text><Copy muted>{person.bio}</Copy></Card>)}</Section>
      </> : tab === "investigation" ? <>
        <Heading>Follow the threads.</Heading><Copy muted>Three specialties. One version of the truth.</Copy>
        <Section title="The investigation"><Card><View style={styles.stats}><View style={ui.grow}><Text style={ui.small}>Current chapter</Text><Text style={styles.metric}>{demoCase.day}<Text style={styles.metricSmall}> / {demoCase.days}</Text></Text></View><View style={ui.grow}><Text style={ui.small}>Case connected</Text><Text style={styles.metric}>{demoCase.progress}%</Text></View></View><View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Sample case progress" accessibilityValue={{ min: 0, max: 100, now: demoCase.progress }}><View style={styles.fill} /></View><Copy muted>The apparent robbery is the first thread. Next, reconstruct the blackout.</Copy><Text style={ui.small}>Sample progress, not a live engine score</Text></Card></Section>
        <Section title="A nudge in the right direction"><Card><View style={styles.hintHeader}><Text style={ui.eyebrow}>ISSUED HINT / DAY 1</Text><Text style={styles.budget}>{demoCase.hintsRemaining} of 3 left</Text></View><Copy>{demoCase.hint}</Copy><Text style={ui.small}>New hints are requested in messages, never here.</Text></Card></Section>
        <Section title="Meet your detectives">{demoCase.detectives.map((person, index) => <Card key={person.name}><View style={styles.person}><View style={styles.avatar}><Text style={styles.initials}>{person.initials}</Text></View><View style={ui.grow}><Text style={ui.rowTitle}>{person.name}</Text><Text style={ui.small}>{person.role}</Text></View><Text style={styles.ordinal}>0{index + 1}</Text></View><Copy>{person.specialty}</Copy><Copy muted>{person.description}</Copy><View style={styles.pace}><View style={[styles.dot, index !== 0 && { backgroundColor: colors.muted }]} /><Text style={ui.small}>{person.pace}</Text></View></Card>)}</Section>
        <Section title="The story so far"><Card><Text style={ui.eyebrow}>RAVO / DAY 1</Text><Copy>The city has gone quiet. The room has not. Start with what was disturbed, then ask who needed it to look that way.</Copy></Card><Card><Text style={ui.rowTitle}>Day 2 · The missing minutes</Text><Copy muted>The next chapter is still sealed.</Copy></Card><Card><Text style={ui.rowTitle}>Day 3 · The final account</Text><Copy muted>The final reveal remains sealed.</Copy></Card></Section>
      </> : <>
        <Heading>Maya Chen</Heading><Copy muted>Your part in the story.</Copy>
        <View style={styles.roleCard}><Text style={ui.eyebrow}>YOUR SPECIALTY</Text><View style={styles.roleSeal}><Icon name="investigation" /></View><Text accessibilityRole="header" style={styles.roleTitle}>Forensic analyst</Text><Copy muted>The room tells a story. You know where it has been edited.</Copy><View style={styles.skills}>{["Trace evidence", "Scene reconstruction", "Toxicology"].map(skill => <Text key={skill} style={styles.skill}>{skill}</Text>)}</View></View>
        <View style={{ marginTop: 16 }}><Card><Text style={ui.eyebrow}>SPECIAL ABILITY</Text><Text style={ui.rowTitle}>Deep examination</Text><Copy muted>Read the order in which a scene changed. One careful examination can separate the murder from the cover story.</Copy><Text style={ui.small}>Use this specialty in your messaging conversation.</Text></Card></View>
        <Section title="Your private findings"><Card><Text style={ui.eyebrow}>DAY 1 / CABINET GLASS</Text><Copy>{demoCase.finding}</Copy><Text style={ui.small}>Fictional, already-discovered finding for this preview</Text></Card></Section>
        <Section title="Your case history"><Card><View style={styles.history}><View style={styles.dayBadge}><Text style={ui.small}>DAY</Text><Text style={styles.dayNumber}>01</Text></View><View style={ui.grow}><Text style={ui.rowTitle}>The room went dark</Text><Copy muted>Session complete</Copy><Text style={ui.small}>Scene examined · one personal finding</Text></View></View></Card><Copy muted>History belongs to this case only. No lifetime score, streak or ranking.</Copy></Section>
      </>}
      <View style={styles.exit}><Copy muted>All people and venues in this preview are fictional. The artwork and sample progress illustrate the experience, not a live investigation.</Copy><Action title="Leave demo preview" subtitle="Open your personal link for the live case" onPress={() => router.replace("/")} /></View>
    </Page>
    <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">{tabs.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} accessibilityLabel={labels[value]} onPress={() => router.setParams({ screen: value, place: "" })} style={styles.tab}><Icon name={value} color={tab === value ? colors.amber : colors.muted} /><Text style={[styles.tabText, tab === value && { color: colors.amber }]}>{labels[value]}</Text></Pressable>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  demoLabel: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#5A4D39", borderRadius: 5, paddingVertical: 6, paddingHorizontal: 9, marginBottom: 20 },
  demoText: { color: colors.amber, fontFamily: fonts.body, fontSize: 10, lineHeight: 16 },
  hero: { marginHorizontal: -22, marginTop: 23, aspectRatio: 1264 / 848 },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", resizeMode: "cover" },
  chapter: { gap: 13, marginTop: 25 },
  map: { aspectRatio: 1264 / 848, backgroundColor: "#000000", borderRadius: 12, overflow: "hidden" },
  pin: { position: "absolute", width: 44, height: 44, marginLeft: -22, marginTop: -22, alignItems: "center", justifyContent: "center" },
  pinText: { backgroundColor: colors.paper, color: colors.ink, borderWidth: 2, borderColor: colors.bg, borderRadius: 16, width: 32, height: 32, textAlign: "center", lineHeight: 28, fontFamily: fonts.bodyBold, fontSize: 11 },
  stats: { flexDirection: "row", gap: 18 },
  metric: { fontFamily: fonts.display, color: colors.text, fontSize: 44, lineHeight: 56 },
  metricSmall: { color: colors.muted, fontSize: 22 },
  track: { backgroundColor: colors.line, height: 4, marginVertical: 12 },
  fill: { backgroundColor: colors.amber, height: 4, width: "25%" },
  hintHeader: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  budget: { color: colors.amber, fontFamily: fonts.body, fontSize: 12 },
  person: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 5 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.display, color: colors.paper, fontSize: 16 },
  ordinal: { fontFamily: fonts.display, color: colors.muted, fontSize: 23 },
  pace: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber },
  roleCard: { backgroundColor: colors.surfaceRaised, borderRadius: 18, padding: 24, marginTop: 24, gap: 16 },
  roleSeal: { width: 66, height: 66, borderRadius: 33, borderColor: colors.amber, borderWidth: 1, alignItems: "center", justifyContent: "center", marginVertical: 8 },
  roleTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.paper },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skill: { fontFamily: fonts.body, fontSize: 11, lineHeight: 18, color: colors.paper, borderWidth: 1, borderColor: "#6A5963", borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6 },
  history: { flexDirection: "row", alignItems: "center", gap: 17 },
  dayBadge: { alignItems: "center", borderRightWidth: 1, borderColor: colors.line, paddingRight: 18 },
  dayNumber: { fontFamily: fonts.display, fontSize: 28, color: colors.amber },
  exit: { marginTop: 36, gap: 8 },
  tabs: { flexDirection: "row", backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 7 },
  tabText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
});
