import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, Section, ui, ViewerRead } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";
import { hasVelvetLanternScene, locations } from "@/components/world-content";

export default function World() {
  return <Page label="THE WORLD">
    <ViewerRead query="caseFile">{data => <>
      <Heading>{data.title}</Heading>
      <Copy muted>{data.setting}</Copy>
      {hasVelvetLanternScene(data.title) ? <>
        <View style={styles.scene}>
          <Image source={require("@/assets/images/velvet-lantern-scene.jpg")} style={styles.art} accessibilityLabel="Illustrative cutaway of the Velvet Lantern jazz club. Locations are also listed below." />
          {locations.map(location => <Pressable key={location.id} accessibilityRole="button" accessibilityLabel={`Read about ${location.name}`} onPress={() => router.push({ pathname: "/location/[id]", params: { id: location.id } })} style={[styles.pin, { left: `${location.x}%`, top: `${location.y}%` }]}><Text style={styles.pinText}>{location.number}</Text></Pressable>)}
        </View>
        <Text style={ui.small}>Illustrative setting, not an evidentiary floor plan</Text>
        <Section title="The setting">{locations.map(location => <Action key={location.id} title={`${location.number}  ${location.name}`} subtitle={location.subtitle} onPress={() => router.push({ pathname: "/location/[id]", params: { id: location.id } })} />)}</Section>
      </> : null}
      <Section title="The case file"><Card><Text style={ui.eyebrow}>VICTIM · {data.victim}</Text><Copy>{data.logline}</Copy></Card></Section>
      <Section title="People of interest">{data.suspects.map(suspect => <Card key={suspect.key}><Text style={ui.rowTitle}>{suspect.name}</Text><Text style={ui.small}>{suspect.title}</Text><Copy muted>{suspect.bio}</Copy></Card>)}</Section>
      <Section title="Unlocked evidence"><ViewerRead query="board">{board => <>
        {board.clues.length ? board.clues.map(clue => <Card key={clue.key}><Text style={ui.eyebrow}>DAY {clue.day} · {clue.kind}</Text><Text style={ui.rowTitle}>{clue.name}</Text><Copy muted>{clue.summary}</Copy></Card>) : <Notice title="The evidence board is quiet" body="Evidence will appear here as it is unlocked through your conversations." />}
        {board.deductions.length ? <Section title="Team deductions">{board.deductions.map(deduction => <Card key={deduction.key}><Text style={ui.eyebrow}>DAY {deduction.day}</Text><Copy>{deduction.label}</Copy></Card>)}</Section> : null}
      </>}</ViewerRead></Section>
    </>}</ViewerRead>
  </Page>;
}

const styles = StyleSheet.create({
  scene: { marginTop: 14, aspectRatio: 1264 / 848, backgroundColor: "#000000", overflow: "hidden", borderRadius: 12 },
  art: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", resizeMode: "contain" },
  pin: { position: "absolute", width: 44, height: 44, marginLeft: -22, marginTop: -22, alignItems: "center", justifyContent: "center" },
  pinText: { backgroundColor: colors.paper, color: colors.ink, borderWidth: 2, borderColor: colors.bg, borderRadius: 16, width: 32, height: 32, textAlign: "center", lineHeight: 28, fontFamily: fonts.bodyBold, fontSize: 11 },
});
