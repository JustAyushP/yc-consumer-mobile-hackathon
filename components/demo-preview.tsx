import { router, useLocalSearchParams } from "expo-router";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Action, Card, Copy, Heading, Icon, Page, Section, ui } from "./companion";
import { demoCase } from "./demo-data";
import { colors, fonts } from "./ui/theme";
import { locations } from "./world-content";

const tabs = ["world", "investigation", "profile"] as const;
const labels = { world: "World", investigation: "Investigation", profile: "Profile" };

export default function DemoPreview() {
  const { screen, place, entry } = useLocalSearchParams<{ screen?: string; place?: string; entry?: string }>();
  const tab = tabs.find(value => value === screen) ?? "world";
  const location = tab === "world" ? locations.find(value => value.id === place) : undefined;
  const journal = tab === "profile" && (entry === "finding" || entry === "history");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const closeDetail = () => router.setParams({ place: "", entry: "" });
  return <View style={styles.root}>
    <Page key={tab} label="DEMO PREVIEW · SAMPLE DATA">
      <Pressable accessibilityRole="button" accessibilityLabel="Back to stories" onPress={() => router.push("/")} style={styles.storiesLink}><Text style={styles.storiesText}>‹  All stories</Text></Pressable>
      {tab === "world" ? <>
        <Heading>{"Last Call on\nMarket Street"}</Heading>
        <Text style={styles.subtitle}>{demoCase.setting}</Text>
        <View style={[styles.scene, { width: Math.min(width, 720) }]}>
          <Image source={require("@/assets/images/velvet-lantern-scene.jpg")} style={styles.image} accessibilityLabel="Original illustrated lounge cutaway; numbered locations are also listed below" />
          {locations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`View ${item.name}`} onPress={() => router.setParams({ place: item.id })} style={[styles.pin, { left: `${item.x}%`, top: `${item.y}%` }]}><Text style={styles.pinText}>{Number(item.number)}</Text></Pressable>)}
        </View>
        <Text style={styles.caption}>Illustrative setting, not an evidentiary floor plan</Text>
        <View style={styles.section}>
          <View style={styles.sectionHead}><Text accessibilityRole="header" style={ui.sectionTitle}>The setting</Text><Text style={ui.small}>Public locations</Text></View>
          {locations.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Read about ${item.name}`} onPress={() => router.setParams({ place: item.id })} style={ui.row}><View style={styles.number}><Text style={styles.numberText}>{Number(item.number)}</Text></View><View style={ui.grow}><Text style={ui.rowTitle}>{item.name}</Text><Text style={styles.rowSub}>{item.subtitle}</Text></View></Pressable>)}
          <View style={styles.cardSpace}><Card><Text style={ui.eyebrow}>THE CASE FILE</Text><Copy muted>{demoCase.premise}</Copy></Card></View>
        </View>
        <Section title="Unlocked evidence">{demoCase.evidence.map(item => <Card key={item.name}><Text style={ui.eyebrow}>{item.kind}</Text><Text style={ui.rowTitle}>{item.name}</Text><Copy muted>{item.summary}</Copy></Card>)}</Section>
        <Section title="People of interest">{demoCase.suspects.map(person => <Card key={person.name}><Text style={ui.rowTitle}>{person.name}</Text><Text style={ui.small}>{person.title}</Text><Copy muted>{person.bio}</Copy></Card>)}</Section>
      </> : tab === "investigation" ? <>
        <Heading>Follow the threads.</Heading>
        <Text style={styles.subtitle}>Your team’s case, in one place</Text>
        <View style={styles.section}>
          <View style={styles.progressCard}>
            <Text style={ui.eyebrow}>CASE PROGRESS</Text>
            <View style={styles.stats}><View style={ui.grow}><Text style={ui.small}>Current day</Text><Text style={styles.value}>{demoCase.day}</Text></View><View style={styles.statRight}><Text style={ui.small}>Deductions</Text><Text style={styles.value}>{demoCase.progress}%</Text></View></View>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel="Sample deduction progress" accessibilityValue={{ min: 0, max: 100, now: demoCase.progress }}><View style={styles.fill} /></View>
            <Copy muted>The apparent robbery is your first thread.</Copy>
          </View>
          <View style={styles.cardSpace}><Card><View style={styles.hintHeader}><Text accessibilityRole="header" style={ui.sectionTitle}>Hints</Text><Text style={styles.hintValue}>{demoCase.hintsRemaining}<Text style={styles.hintUnit}> left</Text></Text></View><Copy muted>Which came first: the fallen drink or the broken glass?</Copy><Copy muted>Ask for new hints in your messaging conversation.</Copy></Card></View>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHead}><Text accessibilityRole="header" style={ui.sectionTitle}>Your detectives</Text><Text style={ui.small}>Public roles & pace</Text></View>
          {demoCase.detectives.map(person => <View key={person.name} style={styles.rosterCard}><Text style={ui.rowTitle}>{person.name}</Text><Text style={styles.rowSub}>{person.role}</Text><Text style={ui.small}>{person.specialty} · {person.pace}</Text></View>)}
          <Action title="The story so far" subtitle="RAVO's narration and the case timeline" onPress={() => router.setParams({ entry: "story" })} />
          <View style={ui.row}><View style={ui.grow}><Text style={ui.rowTitle}>The final reveal</Text><Text style={styles.rowSub}>Available only when the case is solved</Text></View></View>
        </View>
      </> : <>
        <Heading>Your part in the story.</Heading>
        <Text style={styles.subtitle}>A private case journal</Text>
        <View style={styles.section}>
          <View style={styles.roleCard}>
            <Text style={ui.eyebrow}>MAYA CHEN · YOUR ROLE</Text>
            <View style={styles.seal}><Text style={styles.sealText}>◎</Text></View>
            <Text accessibilityRole="header" style={styles.roleTitle}>Forensic analyst</Text>
            <Copy muted>The dead talk. You just listen closer than anyone else.</Copy>
            <View style={styles.skills}>{["Trace evidence", "Toxicology", "Scene reconstruction"].map(skill => <Text key={skill} style={styles.skill}>{skill}</Text>)}</View>
          </View>
          <View style={styles.cardSpace}><Card><Text style={ui.eyebrow}>SPECIAL ABILITY</Text><Text style={ui.rowTitle}>Deep examination</Text><Copy muted>Once per day, put one piece of evidence under the lamp. Use your ability in messages.</Copy></Card></View>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={ui.sectionTitle}>Your case journal</Text>
          <Action title="Personal findings" subtitle="Day 1 · Cabinet glass" onPress={() => router.setParams({ entry: "finding" })} />
          <Action title="Session history" subtitle="Day 1 · The room went dark · Complete" onPress={() => router.setParams({ entry: "history" })} />
        </View>
      </>}
      <View style={styles.exit}><Text style={ui.small}>Fictional demo data. No live player statistics. All people and venues are fictional.</Text><Action title="Back to stories" onPress={() => router.replace("/")} /></View>
    </Page>
    <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 15) }]} accessibilityRole="tablist">{tabs.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} accessibilityLabel={labels[value]} onPress={() => router.setParams({ screen: value, place: "", entry: "" })} style={styles.tab}><Icon name={value} color={tab === value ? colors.amber : colors.muted} /><Text style={[styles.tabText, tab === value && { color: colors.amber }]}>{labels[value]}</Text></Pressable>)}</View>
    <Modal visible={!!location || journal || (tab === "investigation" && entry === "story")} transparent onRequestClose={closeDetail}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close detail" accessibilityRole="button" style={styles.backdrop} onPress={closeDetail} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}><ScrollView contentContainerStyle={{ gap: 16 }}>
          <Text style={ui.eyebrow}>DEMO PREVIEW · SAMPLE DATA</Text>
          <Heading>{location?.name ?? (entry === "finding" ? "Your personal finding" : entry === "history" ? "Your case history" : "The story so far")}</Heading>
          {location ? <Copy muted>{location.id === "office" ? "Victor's office overlooks the rear alley. An open cash drawer, a spilled drink and a broken display cabinet are the first pieces of the scene." : location.id === "stage" ? "Vivian's final set ended here. Behind the curtain, a narrow passage connects the dressing room to the office corridor." : "Sal tended this bar on the night of the murder. The room fell silent when the lights went out."}</Copy> : entry === "finding" ? <><Text style={ui.eyebrow}>DAY 1 / CABINET GLASS</Text><Copy>{demoCase.finding}</Copy><Copy muted>This is Maya’s earned sample finding, not another detective’s private information.</Copy></> : entry === "history" ? <><Text style={ui.rowTitle}>Day 1 · The room went dark</Text><Copy>Session complete · one personal finding</Copy><Copy muted>Current-case sample history only. No lifetime score or ranking.</Copy></> : <><Text style={ui.eyebrow}>DAY 1 / RAVO</Text><Copy>The city has gone quiet. The room has not. Start with what was disturbed, then ask who needed it to look that way.</Copy><Copy muted>Future chapters and the final reveal remain sealed.</Copy></>}
          <Action title="Close detail" onPress={closeDetail} />
        </ScrollView></View>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  storiesLink: { minHeight: 44, justifyContent: "center" },
  storiesText: { color: colors.amber, fontFamily: fonts.body, fontSize: 12 },
  subtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  scene: { marginTop: 16, alignSelf: "center", aspectRatio: 1264 / 848, backgroundColor: "#000000" },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", resizeMode: "contain" },
  pin: { position: "absolute", width: 44, height: 44, marginLeft: -14, marginTop: -14, alignItems: "center", justifyContent: "center" },
  pinText: { backgroundColor: colors.text, color: colors.bg, borderWidth: 3, borderColor: colors.bg, borderRadius: 14, width: 28, height: 28, textAlign: "center", lineHeight: 22, fontFamily: fonts.bodyBold, fontSize: 12 },
  caption: { color: colors.muted, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 5 },
  section: { marginTop: 24 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8 },
  number: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  numberText: { fontFamily: fonts.display, fontSize: 14, color: colors.amber },
  rowSub: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  cardSpace: { marginTop: 14 },
  progressCard: { borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 18, backgroundColor: colors.surface },
  stats: { flexDirection: "row", marginTop: 18 },
  statRight: { flex: 1, borderLeftWidth: 1, borderColor: colors.line, paddingLeft: 24 },
  value: { fontFamily: fonts.display, color: colors.text, fontSize: 38, lineHeight: 44, marginTop: 5 },
  track: { backgroundColor: colors.line, height: 3, marginTop: 20, marginBottom: 12 },
  fill: { backgroundColor: colors.amber, height: 3, width: "25%" },
  hintHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
  hintValue: { fontFamily: fonts.display, color: colors.amber, fontSize: 30, lineHeight: 36 },
  hintUnit: { fontFamily: fonts.body, fontSize: 11 },
  rosterCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 18, marginBottom: 10, gap: 5 },
  roleCard: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 18 },
  seal: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, borderColor: colors.amber, alignItems: "center", justifyContent: "center", marginTop: 24, marginBottom: 18 },
  sealText: { fontFamily: fonts.display, fontSize: 32, color: colors.amber },
  roleTitle: { fontFamily: fonts.display, fontSize: 23, lineHeight: 28, color: colors.text, marginBottom: 10 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 17 },
  skill: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.text, borderWidth: 1, borderColor: colors.line, padding: 8 },
  exit: { marginTop: 30 },
  tabs: { flexDirection: "row", backgroundColor: colors.bg, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, paddingHorizontal: 7 },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 7 },
  tabText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { backgroundColor: colors.surface, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
});
