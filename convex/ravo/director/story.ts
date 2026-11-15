export type StorySnapshot = {
  day: number;
  act: number;
  version: number;
  doneBeats: readonly string[];
  flags: Readonly<Record<string, boolean>>;
  creditedInsights: readonly string[];
  unlockedClues: readonly string[];
};

export type StoryEffect =
  | { kind: "flag"; key: string; value: boolean }
  | { kind: "trust"; agentKey: string; delta: number }
  | { kind: "cast"; lineId: "2" | "3"; agentKey: string }
  | { kind: "unlockClue"; clueKey: string };

export type Beat = {
  key: string;
  act: number;
  minDay?: number;
  forceAtDay?: number;
  requiredInsights?: readonly string[];
  requiredClues?: readonly string[];
  requiredFlags?: Readonly<Record<string, boolean>>;
  effects: readonly StoryEffect[];
};

export type CastSnapshot = { playerId: string; lineId: "2" | "3"; agentKey: string };
export type PlannedEffect =
  | Extract<StoryEffect, { kind: "flag" | "unlockClue" }>
  | { kind: "trust"; playerId: string; lineId: "2" | "3"; agentKey: string; delta: number }
  | { kind: "cast"; playerId: string; lineId: "2" | "3"; agentKey: string };

export function selectEligibleBeat(snapshot: StorySnapshot, beats: readonly Beat[]): Beat | undefined {
  return beats.find((beat) => {
    if (snapshot.doneBeats.includes(beat.key)) return false;
    const timeReady = beat.minDay === undefined || snapshot.day >= beat.minDay;
    const forced = beat.forceAtDay !== undefined && snapshot.day >= beat.forceAtDay;
    return (timeReady || forced)
      && (beat.requiredInsights ?? []).every((key) => snapshot.creditedInsights.includes(key))
      && (beat.requiredClues ?? []).every((key) => snapshot.unlockedClues.includes(key))
      && Object.entries(beat.requiredFlags ?? {}).every(([key, value]) => snapshot.flags[key] === value);
  });
}

export function planSharedEffects(
  effects: readonly StoryEffect[],
  activePlayerIds: readonly string[],
  casts: readonly CastSnapshot[],
): PlannedEffect[] {
  const players = [...new Set(activePlayerIds)].sort();
  const active = new Set(players);
  return effects.flatMap((effect): PlannedEffect[] => {
    if (effect.kind === "trust") {
      return casts.filter((cast) => active.has(cast.playerId) && cast.agentKey === effect.agentKey)
        .slice().sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0)
        .map((cast) => ({ kind: "trust", agentKey: effect.agentKey, delta: effect.delta, playerId: cast.playerId, lineId: cast.lineId }));
    }
    if (effect.kind === "cast") return players.map((playerId) => ({ kind: "cast", agentKey: effect.agentKey, lineId: effect.lineId, playerId }));
    if (effect.kind === "flag") return [{ kind: "flag", key: effect.key, value: effect.value }];
    if (effect.kind === "unlockClue") return [{ kind: "unlockClue", clueKey: effect.clueKey }];
    throw new Error("Unsupported story effect");
  });
}

export function planStoryTransition(
  snapshot: StorySnapshot,
  beats: readonly Beat[],
  requestedBeatKey: string,
  activePlayerIds: readonly string[],
  casts: readonly CastSnapshot[],
): { expectedVersion: number; beatKey: string; nextAct: number; effects: PlannedEffect[] } {
  const beat = selectEligibleBeat(snapshot, beats);
  if (!beat || beat.key !== requestedBeatKey) throw new Error("Beat is not the next eligible beat");
  return {
    expectedVersion: snapshot.version,
    beatKey: beat.key,
    nextAct: Math.max(snapshot.act, beat.act),
    effects: planSharedEffects(beat.effects, activePlayerIds, casts),
  };
}
