import { useMutation } from "convex/react";
import { Href, router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Kicker, Title } from "@/components/ui/Text";
import { colors } from "@/components/ui/theme";

export default function Join() {
  const join = useMutation(api.game.groups.join);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      const { playerId } = await join({ code, playerName: name });
      router.push(`/play/${playerId}/survey` as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Kicker>Join a case</Kicker>
      <Title>Invite code</Title>
      <Input placeholder="ABCDE" autoCapitalize="characters" value={code} onChangeText={setCode} />
      <Input placeholder="Your detective name" value={name} onChangeText={setName} />
      <Button label="Join the team" onPress={submit} disabled={!code.trim() || !name.trim()} />
      {error && <Text style={{ color: colors.blood }}>{error}</Text>}
    </Screen>
  );
}
