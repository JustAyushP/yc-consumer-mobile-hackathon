import { useMutation } from "convex/react";
import { Href, Link, router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Body, Kicker, Title } from "@/components/ui/Text";
import { colors } from "@/components/ui/theme";

export default function Home() {
  const create = useMutation(api.game.groups.create);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    try {
      const { playerId } = await create({ groupName: "The Night Shift", playerName: name });
      router.push(`/play/${playerId}/survey` as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Kicker>RAVO presents</Kicker>
      <Title>Death at the Velvet Lantern</Title>
      <Body style={{ color: colors.muted }}>A murder mystery for 3 to 6 detectives, run by RAVO.</Body>
      <Input placeholder="Your detective name" value={name} onChangeText={setName} />
      <Button label="Open a new case" onPress={open} disabled={!name.trim()} />
      <Link href="/join" asChild>
        <Button label="Join with an invite code" variant="ghost" />
      </Link>
      {error && <Text style={{ color: colors.blood }}>{error}</Text>}
    </Screen>
  );
}
