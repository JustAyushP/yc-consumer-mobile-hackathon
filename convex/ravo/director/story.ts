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
  let currentCasts = casts.filter((cast) => active.has(cast.playerId));
  if (currentCasts.some((cast) => cast.lineId !== "2" && cast.lineId !== "3")) throw new Error("Invalid cast line");
  const planned: PlannedEffect[] = [];
  for (const effect of effects) {
    if (effect.kind === "trust") {
      planned.push(...currentCasts.filter((cast) => cast.agentKey === effect.agentKey)
        .slice().sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : a.lineId < b.lineId ? -1 : a.lineId > b.lineId ? 1 : 0)
        .map((cast): PlannedEffect => ({ kind: "trust", agentKey: effect.agentKey, delta: effect.delta, playerId: cast.playerId, lineId: cast.lineId })));
    } else if (effect.kind === "cast") {
      if (effect.lineId !== "2" && effect.lineId !== "3") throw new Error("Invalid cast line");
      currentCasts = currentCasts.filter((cast) => cast.lineId !== effect.lineId);
      for (const playerId of players) {
        const cast = { playerId, lineId: effect.lineId, agentKey: effect.agentKey };
        currentCasts.push(cast);
        planned.push({ kind: "cast", ...cast });
      }
    } else if (effect.kind === "flag") {
      planned.push({ kind: "flag", key: effect.key, value: effect.value });
    } else if (effect.kind === "unlockClue") {
      planned.push({ kind: "unlockClue", clueKey: effect.clueKey });
    } else {
      throw new Error("Unsupported story effect");
    }
  }
  return planned;
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
