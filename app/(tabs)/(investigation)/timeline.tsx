import { router } from "expo-router";
import { Text } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, ui, ViewerRead } from "@/components/companion";

export default function Timeline() {
  return <Page label="THE CASE CLOCK"><Action title="‹ Back to Investigation" onPress={() => router.replace("/investigation")} /><Heading>One day at a time.</Heading><Copy muted>The case timeline, not your personal session history.</Copy>
    <ViewerRead query="timeline">{days => days.length ? days.map(day => <Card key={day.day}><Text style={ui.eyebrow}>DAY {day.day} · {day.state === "today" ? "TODAY" : day.state === "ahead" ? "AHEAD" : "PAST"}</Text><Copy>{day.title ?? "The next chapter is still sealed."}</Copy></Card>) : <Notice title="No case days yet" body="Your timeline will appear when the case is ready." />}</ViewerRead>
  </Page>;
}
