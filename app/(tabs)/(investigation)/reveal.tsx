import { router } from "expo-router";
import { Text } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, ui, ViewerRead } from "@/components/companion";

export default function Reveal() {
  return <Page label="THE FINAL REVEAL"><Action title="‹ Back to Investigation" onPress={() => router.replace("/investigation")} /><ViewerRead query="reveal">{reveal => reveal ? <><Heading>The truth comes to light.</Heading><Card><Text style={ui.eyebrow}>THE CULPRIT</Text><Text style={ui.sectionTitle}>{reveal.culprit}</Text>{reveal.solvedBy ? <Copy muted>Accusation by {reveal.solvedBy}{reveal.solvedDay !== null ? ` on day ${reveal.solvedDay}` : ""}.</Copy> : null}</Card>{reveal.story.map((paragraph, index) => <Copy key={index}>{paragraph}</Copy>)}</> : <Notice title="The truth is still sealed" body="Solve the case through your messaging conversation. The final reveal will appear here afterward." />}</ViewerRead></Page>;
}
