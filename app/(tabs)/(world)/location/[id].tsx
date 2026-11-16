import { router, useLocalSearchParams } from "expo-router";
import { Image, Text, View } from "react-native";
import { Action, Card, Copy, Heading, Notice, Page, Section, ui, ViewerRead } from "@/components/companion";
import { hasVelvetLanternScene, locations } from "@/components/world-content";

export default function Location() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = locations.find(item => item.id === id);
  return <Page label="PUBLIC LOCATION"><Action title="‹ Back to World" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />
    <ViewerRead query="caseFile">{data => location && hasVelvetLanternScene(data.title) ? <>
      <Text style={ui.eyebrow}>LOCATION {location.number}</Text><Heading>{location.name}</Heading>
      <View style={{ aspectRatio: 1264 / 848 }}><Image source={require("@/assets/images/velvet-lantern-scene.jpg")} style={{ width: "100%", height: "100%", borderRadius: 16 }} accessibilityLabel="Illustrative jazz club cutaway" /></View>
      <Card><Copy>{location.body}</Copy></Card>
      <Section title="Keep following the evidence"><Copy muted>Unlocked evidence is on the World tab. Ask questions and investigate through your messaging conversation.</Copy></Section>
    </> : <Notice title="Location unavailable" body="This location is not part of your current case." />}</ViewerRead>
  </Page>;
}
