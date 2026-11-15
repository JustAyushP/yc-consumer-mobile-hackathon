import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, Section, ui, ViewerRead } from "@/components/companion";
import { colors, fonts } from "@/components/ui/theme";

export default function Investigation() {
  return <Page label="THE INVESTIGATION"><Heading>Follow the threads.</Heading><Copy muted>Your team’s case, in one place.</Copy>
    <ViewerRead query="team">{team => <>
      <Section title="Case progress"><Card><View style={styles.stats}><View style={ui.grow}><Text style={ui.small}>Current day</Text><Text style={styles.value}>{team.day}</Text></View><View style={ui.grow}><Text style={ui.small}>Deductions connected</Text><Text style={styles.value}>{team.progress}%</Text></View></View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: team.progress }} accessibilityLabel="Case deduction progress" style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, team.progress))}%` }]} /></View>
        <Copy muted>{team.detectives.filter(detective => detective.doneToday).length} of {team.detectives.length} detectives have completed today.</Copy>
      </Card></Section>
      <Section title="Hints"><Card><Text style={styles.value}>{team.hintsLeft}<Text style={ui.small}> remaining this week</Text></Text><Copy muted>{team.hintsLeft === 0 ? "Your team has used this week's hint budget. You can still revisit issued hints." : "This is your team's shared weekly budget."}</Copy><Copy muted>Ask for new hints in your messaging conversation.</Copy></Card>
        <ViewerRead query="story">{story => <>{story.filter(item => item.kind === "hint").map(hint => <Card key={hint._id}><Text style={ui.eyebrow}>ISSUED HINT</Text><Copy>{hint.body}</Copy></Card>)}{!story.some(item => item.kind === "hint") ? <Notice title="No hint updates in this view" body="Issued hint updates appear here when available. A complete hint archive isn't available yet." /> : <Text style={ui.small}>Recent issued hint updates, not a complete archive.</Text>}</>}</ViewerRead>
      </Section>
      <Section title="Your detectives">{team.detectives.map((detective, index) => <Card key={index}><Text style={ui.rowTitle}>{detective.name}</Text><Text style={ui.eyebrow}>{detective.roleTitle ?? "ROLE PENDING"}</Text><Copy muted>{detective.doneToday ? "Completed today" : detective.lagging ? "Behind today" : "Not completed today"}</Copy>{detective.lateJoiner ? <Text style={ui.small}>Joined after the case began</Text> : null}{detective.missedDays.length ? <Text style={ui.small}>Missed days: {[...new Set(detective.missedDays)].join(", ")}</Text> : null}</Card>)}</Section>
      <Section title="The case unfolds"><Action title="The story so far" subtitle="RAVO's case narration" onPress={() => router.push("/story")} /><Action title="Day timeline" subtitle="The case's past, present and future" onPress={() => router.push("/timeline")} /><ViewerRead query="reveal">{reveal => reveal ? <Action title="Read the final reveal" subtitle="This case has been solved" onPress={() => router.push("/reveal")} /> : <Text style={ui.small}>The final reveal opens when the case is solved.</Text>}</ViewerRead></Section>
    </>}</ViewerRead>
  </Page>;
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 16 },
  value: { fontFamily: fonts.display, color: colors.text, fontSize: 38, lineHeight: 48 },
  track: { height: 4, backgroundColor: colors.line, marginVertical: 10, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, backgroundColor: colors.amber },
});
