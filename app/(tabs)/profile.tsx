import { StyleSheet, Text, View } from "react-native";
import { Card, Copy, Heading, Notice, Page, Section, ui, ViewerRead } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";

export default function Profile() {
  return <Page label="YOUR PROFILE"><ViewerRead query="me">{me => <>
    <Heading>Your part in the story.</Heading><Text style={styles.subtitle}>A private case journal</Text>
    {me.role ? <>
      <View style={styles.role}><Text style={ui.eyebrow}>{me.name} · YOUR ROLE</Text><View style={styles.seal}><Text style={styles.glyph}>{me.role.glyph}</Text></View><Text accessibilityRole="header" style={ui.sectionTitle}>{me.role.title}</Text><Copy muted>{me.role.tagline}</Copy>{me.role.blurb ? <Copy>{me.role.blurb}</Copy> : null}<View style={styles.skills}>{me.role.skills.map(skill => <Text key={skill} style={styles.skill}>{skill}</Text>)}</View></View>
      <View style={{ marginTop: 14 }}><Card><Text style={ui.eyebrow}>SPECIAL ABILITY</Text><Text style={ui.rowTitle}>{me.role.ability.name}</Text><Copy muted>{me.role.ability.description}</Copy><Text style={ui.small}>Use your ability in your messaging conversation.</Text></Card></View>
    </> : <Section title="Your part in the story"><Notice title="Your role is being assigned" body="Continue your conversation in iMessage or WhatsApp. Your role and skills will appear here when assigned." /></Section>}
    <Section title="Your case journal"><ViewerRead query="board">{board => board.myFindings.length ? board.myFindings.map((finding, index) => <Card key={`${finding.day}-${index}`}><Text style={ui.eyebrow}>DAY {finding.day} · PRIVATE FINDING</Text><Copy>{finding.result}</Copy></Card>) : <Notice title="Your journal is waiting" body="Your own ability findings will appear here. Other detectives' private findings stay with them." />}</ViewerRead></Section>
    <Section title="Session history"><ViewerRead query="history">{history => history.length ? <>{history.map(session => <Card key={session.day}><Text style={ui.eyebrow}>DAY {session.day}</Text><Copy>{session.completed ? "Session complete" : session.status === "missed" ? "Session missed" : "Session open"}</Copy></Card>)}<Copy muted>History belongs to this case only.</Copy></> : <Notice title="No sessions recorded yet" body="Your current-case sessions will appear here as the investigation begins." />}</ViewerRead></Section>
  </>}</ViewerRead></Page>;
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted },
  role: { backgroundColor: colors.surfaceRaised, padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 15, marginTop: 24, gap: 10 },
  seal: { width: 70, height: 70, borderWidth: 1, borderColor: colors.amber, borderRadius: 35, alignItems: "center", justifyContent: "center", marginTop: 14, marginBottom: 8 },
  glyph: { color: colors.amber, fontFamily: fonts.display, fontSize: 32 },
  skills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  skill: { color: colors.text, fontFamily: fonts.body, fontSize: 11, lineHeight: 14, padding: 8, borderWidth: 1, borderColor: colors.line },
});
