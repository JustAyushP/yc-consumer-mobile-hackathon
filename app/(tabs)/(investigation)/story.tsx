import { router } from "expo-router";
import { Text } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, ui, ViewerRead } from "@/components/companion";

export default function Story() {
  return <Page label="CASE NARRATION"><Action title="‹ Back to Investigation" onPress={() => router.replace("/investigation")} /><Heading>The story so far.</Heading><Copy muted>RAVO’s case narration, never your private conversations.</Copy>
    <ViewerRead query="story">{story => story.length ? [...story].reverse().map(item => <Card key={item._id}><Text style={ui.eyebrow}>{item.kind.toUpperCase()}</Text><Copy>{item.body}</Copy></Card>) : <Notice title="The story is about to begin" body="Case narration will appear as your investigation unfolds." />}</ViewerRead>
  </Page>;
}
