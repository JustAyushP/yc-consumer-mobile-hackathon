export type PacingPolicy = {
  stallDays: number;
  lagMissedSessions: number;
  cooldownDays: number;
  maxInterventionsPerProgress: number;
};

export type PacingSnapshot = {
  groupId: string;
  caseId: string;
  day: number;
  progressRevision: number;
  lastProgressDay: number;
  players: readonly {
    playerId: string;
    joinedDay: number;
    missedSessionDays: readonly number[];
  }[];
};

export type PacingState = {
  version: number;
  groupId: string;
  caseId: string;
  progressRevision: number;
  lastProgressDay: number;
  lastObservedDay: number;
  interventions: number;
  lastInterventionDay: number | null;
  caughtUpPlayerIds: readonly string[];
  recoveryDays: readonly { playerId: string; day: number }[];
  warnedMissedDays: readonly { playerId: string; days: readonly number[] }[];
};

export type EligibleQuestion = { key: string; day: number };
export type Intervention =
  | { kind: "catchUp"; playerId: string }
  | { kind: "lag"; playerId: string; missedSessions: number }
  | { kind: "question"; playerId: string; questionKey: string; day: number }
  | { kind: "nudge"; playerId: string };

export type PacingPlan = {
  id: string;
  expectedVersion: number;
  progressRevision: number;
  day: number;
  escalation: number;
  intervention: Intervention;
};

export type PacingResult = { expectedVersion: number; plan: PacingPlan | null; nextState: PacingState };

export function initialPacingState(snapshot: PacingSnapshot): PacingState {
  return {
    version: 0, groupId: snapshot.groupId, caseId: snapshot.caseId,
    progressRevision: snapshot.progressRevision, lastProgressDay: snapshot.lastProgressDay, lastObservedDay: snapshot.day,
    interventions: 0, lastInterventionDay: null, caughtUpPlayerIds: [], recoveryDays: [], warnedMissedDays: [],
  };
}

export function planPacing(
  snapshot: PacingSnapshot,
  state: PacingState,
  policy: PacingPolicy,
  turn: { id: string; playerId: string; eligibleQuestions: readonly EligibleQuestion[] },
): PacingResult {
  const integer = (n: number, min: number) => Number.isSafeInteger(n) && n >= min;
  if (!snapshot.groupId || !snapshot.caseId || !turn.id || !turn.playerId
    || !integer(snapshot.day, 1) || !integer(snapshot.lastProgressDay, 1)
    || snapshot.lastProgressDay > snapshot.day || !integer(snapshot.progressRevision, 0)
    || !integer(state.version, 0) || !integer(state.interventions, 0)
    || !integer(policy.stallDays, 1) || !integer(policy.lagMissedSessions, 1)
    || !integer(policy.cooldownDays, 1) || !integer(policy.maxInterventionsPerProgress, 1)) {
    throw new Error("Invalid pacing input");
  }
  if (state.groupId !== snapshot.groupId || state.caseId !== snapshot.caseId
    || snapshot.progressRevision < state.progressRevision || snapshot.lastProgressDay < state.lastProgressDay
    || (snapshot.progressRevision === state.progressRevision && snapshot.lastProgressDay !== state.lastProgressDay)
    || snapshot.day < state.lastObservedDay) {
    throw new Error("Stale or mismatched pacing snapshot");
  }
  const ids = new Set<string>();
  for (const player of snapshot.players) {
    if (!player.playerId || ids.has(player.playerId) || !integer(player.joinedDay, 1) || player.joinedDay > snapshot.day
      || player.missedSessionDays.some((day) => !integer(day, player.joinedDay) || day >= snapshot.day)) {
      throw new Error("Invalid pacing roster");
    }
    ids.add(player.playerId);
  }
  if (turn.eligibleQuestions.some((question) => !question.key || !integer(question.day, 1))) throw new Error("Invalid question");

  const progressed = snapshot.progressRevision > state.progressRevision;
  const advanced = snapshot.day > state.lastObservedDay;
  const current: PacingState = progressed ? {
    ...state, progressRevision: snapshot.progressRevision, lastProgressDay: snapshot.lastProgressDay,
    lastObservedDay: snapshot.day, interventions: 0,
  } : advanced ? { ...state, lastObservedDay: snapshot.day } : state;
  const player = snapshot.players.find((item) => item.playerId === turn.playerId);
  let intervention: Intervention | null = null;
  if (player) {
    const missedSessions = new Set(player.missedSessionDays).size;
    const warnedDays = current.warnedMissedDays.find((item) => item.playerId === player.playerId)?.days ?? [];
    const recoveryDay = current.recoveryDays.find((item) => item.playerId === player.playerId)?.day;
    const recoveryReady = recoveryDay === undefined || snapshot.day - recoveryDay >= policy.cooldownDays;
    const stallReady = current.lastInterventionDay === null || snapshot.day - current.lastInterventionDay >= policy.cooldownDays;
    if (recoveryReady && player.joinedDay > 1 && !current.caughtUpPlayerIds.includes(player.playerId)) {
      intervention = { kind: "catchUp", playerId: player.playerId };
    } else if (recoveryReady && missedSessions >= policy.lagMissedSessions && player.missedSessionDays.some((day) => !warnedDays.includes(day))) {
      intervention = { kind: "lag", playerId: player.playerId, missedSessions };
    } else if (recoveryReady && stallReady && current.interventions < policy.maxInterventionsPerProgress && snapshot.day - snapshot.lastProgressDay >= policy.stallDays) {
      const question = turn.eligibleQuestions.filter((item) => item.day === snapshot.day)
        .slice().sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)[0];
      intervention = question
        ? { kind: "question", playerId: player.playerId, questionKey: question.key, day: snapshot.day }
        : { kind: "nudge", playerId: player.playerId };
    }
  }
  if (!intervention) return { expectedVersion: state.version, plan: null, nextState: progressed || advanced ? { ...current, version: state.version + 1 } : state };
  const recovery = intervention.kind === "catchUp" || intervention.kind === "lag";
  const nextState: PacingState = {
    ...current, version: state.version + 1,
    interventions: current.interventions + (recovery ? 0 : 1),
    lastInterventionDay: recovery ? current.lastInterventionDay : snapshot.day,
    caughtUpPlayerIds: intervention.kind === "catchUp" ? [...current.caughtUpPlayerIds, intervention.playerId] : current.caughtUpPlayerIds,
    recoveryDays: [...current.recoveryDays.filter((item) => item.playerId !== intervention.playerId), { playerId: intervention.playerId, day: snapshot.day }],
    warnedMissedDays: intervention.kind === "lag" && player
      ? [...current.warnedMissedDays.filter((item) => item.playerId !== player.playerId), { playerId: player.playerId, days: [...new Set([...(current.warnedMissedDays.find((item) => item.playerId === player.playerId)?.days ?? []), ...player.missedSessionDays])].sort((a, b) => a - b) }]
      : current.warnedMissedDays,
  };
  return {
    expectedVersion: state.version,
    plan: {
      id: JSON.stringify(["pacing-v1", snapshot.groupId, snapshot.caseId, turn.id]),
      expectedVersion: state.version, progressRevision: snapshot.progressRevision, day: snapshot.day,
      escalation: Math.max(1, nextState.interventions), intervention,
    },
    nextState,
  };
}
