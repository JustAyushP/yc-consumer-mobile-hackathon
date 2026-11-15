import { StyleSheet, Text, View } from "react-native";
import { Card, Copy, Heading, Notice, Page, Section, ui, ViewerRead } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";

export default function Profile() {
  return <Page label="YOUR PROFILE"><ViewerRead query="me">{me => <>
    <Heading>{me.name}</Heading><Copy muted>A private journal for {me.group.name}.</Copy>
    {me.role ? <>
      <View style={styles.role}><Text style={ui.eyebrow}>YOUR ROLE</Text><Text accessible={false} style={styles.glyph}>{me.role.glyph}</Text><Text accessibilityRole="header" style={ui.sectionTitle}>{me.role.title}</Text><Copy muted>{me.role.tagline}</Copy>{me.role.blurb ? <Copy>{me.role.blurb}</Copy> : null}<View style={styles.skills}>{me.role.skills.map(skill => <Text key={skill} style={styles.skill}>{skill}</Text>)}</View></View>
      <Card><Text style={ui.eyebrow}>SPECIAL ABILITY</Text><Text style={ui.rowTitle}>{me.role.ability.name}</Text><Copy muted>{me.role.ability.description}</Copy><Text style={ui.small}>Use your ability in your messaging conversation.</Text></Card>
    </> : <Section title="Your part in the story"><Notice title="Your role is being assigned" body="Continue your conversation in iMessage or WhatsApp. Your role and skills will appear here when assigned." /></Section>}
    <Section title="Your findings in this case"><ViewerRead query="board">{board => board.myFindings.length ? board.myFindings.map((finding, index) => <Card key={`${finding.day}-${index}`}><Text style={ui.eyebrow}>DAY {finding.day} · PRIVATE FINDING</Text><Copy>{finding.result}</Copy></Card>) : <Notice title="Your journal is waiting" body="Your own ability findings will appear here. Other detectives' private findings stay with them." />}</ViewerRead></Section>
    <Section title="Session history"><ViewerRead query="history">{history => history.length ? <>{history.map(session => <Card key={session.day}><Text style={ui.eyebrow}>DAY {session.day}</Text><Copy>{session.completed ? "Session complete" : session.status === "missed" ? "Session missed" : "Session open"}</Copy></Card>)}<Copy muted>History belongs to this case only.</Copy></> : <Notice title="No sessions recorded yet" body="Your current-case sessions will appear here as the investigation begins." />}</ViewerRead></Section>
  </>}</ViewerRead></Page>;
}

const styles = StyleSheet.create({
  role: { backgroundColor: colors.surfaceRaised, padding: 22, borderRadius: 18, marginTop: 20, gap: 15 },
  glyph: { color: colors.amber, fontSize: 48, marginVertical: 10 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  skill: { color: colors.text, fontFamily: fonts.body, fontSize: 12, lineHeight: 20, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: "#6A5963", borderRadius: 5 },
});
