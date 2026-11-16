import { describe, expect, it } from "vitest";
import { initialPacingState, planPacing, type PacingPolicy, type PacingSnapshot } from "./planner";

const policy: PacingPolicy = { stallDays: 2, lagMissedSessions: 2, cooldownDays: 1, maxInterventionsPerProgress: 3 };
const snapshot = (day: number): PacingSnapshot => ({
  groupId: "group", caseId: "case", day, progressRevision: 0, lastProgressDay: 1,
  players: [{ playerId: "a", joinedDay: 1, missedSessionDays: [] }],
});
const turn = (id: string, playerId = "a") => ({ id, playerId, eligibleQuestions: [] });

describe("pacing planner", () => {
  it("uses game days equally for compressed and fast-forwarded clocks", () => {
    let state = initialPacingState(snapshot(1));
    for (const day of [1, 2]) state = planPacing(snapshot(day), state, policy, turn(`day-${day}`)).nextState;
    const stepped = planPacing(snapshot(3), state, policy, turn("turn"));
    const jumped = planPacing(snapshot(3), initialPacingState(snapshot(1)), policy, turn("turn"));
    expect(stepped.plan?.id).toEqual(jumped.plan?.id);
    expect(stepped.plan?.intervention).toEqual(jumped.plan?.intervention);
    expect(stepped.plan?.intervention).toEqual({ kind: "nudge", playerId: "a" });
  });

  it("is deterministic on retries and does not let chatter reset the clock", () => {
    const s = snapshot(3);
    const state = initialPacingState(snapshot(1));
    const first = planPacing(s, state, policy, turn("message"));
    expect(planPacing(s, state, policy, turn("message"))).toEqual(first);
    expect(planPacing(s, first.nextState, policy, turn("another-message"))).toEqual({ expectedVersion: first.nextState.version, plan: null, nextState: first.nextState });
  });

  it("only selects an eligible current-day question ID without copying facts or hint effects", () => {
    const input = { ...turn("message"), eligibleQuestions: [{ key: "tomorrow-LOCKED-FACT", day: 4 }, { key: "today", day: 3 }] };
    const result = planPacing(snapshot(3), initialPacingState(snapshot(1)), policy, input);
    expect(result.plan?.intervention).toEqual({ kind: "question", playerId: "a", questionKey: "today", day: 3 });
    expect(JSON.stringify(result)).not.toMatch(/LOCKED-FACT|clue|hint|PRIVATE/);
  });

  it("only targets the current eligible roster member and counts unique missed sessions", () => {
    const s: PacingSnapshot = { ...snapshot(4), players: [{ playerId: "a", joinedDay: 1, missedSessionDays: [1, 1, 2] }] };
    const state = initialPacingState(snapshot(1));
    expect(planPacing(s, state, policy, turn("missing", "absent")).plan).toBeNull();
    expect(planPacing(s, state, policy, turn("present")).plan?.intervention).toEqual({ kind: "lag", playerId: "a", missedSessions: 2 });
    expect(() => planPacing({ ...s, players: [{ playerId: "a", joinedDay: 3, missedSessionDays: [2] }] }, state, policy, turn("bad"))).toThrow();
  });

  it("plans a single catch-up for a late joiner without disclosing history", () => {
    const s: PacingSnapshot = { ...snapshot(3), players: [{ playerId: "new", joinedDay: 3, missedSessionDays: [] }] };
    const first = planPacing(s, initialPacingState(snapshot(1)), policy, turn("join", "new"));
    expect(first.plan?.intervention).toEqual({ kind: "catchUp", playerId: "new" });
    const next = planPacing({ ...s, day: 4 }, first.nextState, policy, turn("next", "new"));
    expect(next.plan?.intervention.kind).not.toBe("catchUp");
  });

  it("bounds escalation and resets only on authoritative progress", () => {
    let state = initialPacingState(snapshot(1));
    for (const day of [3, 4, 5]) {
      const result = planPacing(snapshot(day), state, policy, turn(`t${day}`));
      expect(result.plan?.escalation).toBe(day - 2);
      state = result.nextState;
    }
    expect(planPacing(snapshot(100), state, policy, turn("storm")).plan).toBeNull();
    const progress = { ...snapshot(100), progressRevision: 1, lastProgressDay: 100 };
    const reset = planPacing(progress, state, policy, turn("progress"));
    expect(reset.plan).toBeNull();
    expect(reset.nextState.interventions).toBe(0);
    expect(planPacing({ ...progress, day: 102 }, reset.nextState, policy, turn("later")).plan?.escalation).toBe(1);
    expect(() => planPacing({ ...progress, progressRevision: 0 }, reset.nextState, policy, turn("stale"))).toThrow();
  });

  it("keeps catch-up available after the stalled-group budget is exhausted", () => {
    let state = initialPacingState(snapshot(1));
    for (const day of [3, 4, 5]) state = planPacing(snapshot(day), state, policy, turn(`t${day}`)).nextState;
    const s: PacingSnapshot = { ...snapshot(6), players: [{ playerId: "new", joinedDay: 6, missedSessionDays: [] }] };
    expect(planPacing(s, state, policy, turn("join", "new")).plan?.intervention.kind).toBe("catchUp");
  });

  it("does not starve another player and detects late-corrected missed days", () => {
    const base: PacingSnapshot = { ...snapshot(5), players: [
      { playerId: "a", joinedDay: 1, missedSessionDays: [2, 4] },
      { playerId: "new", joinedDay: 5, missedSessionDays: [] },
    ] };
    const warning = planPacing(base, initialPacingState(snapshot(1)), policy, turn("warning"));
    const catchup = planPacing(base, warning.nextState, policy, turn("join", "new"));
    expect(catchup.plan?.intervention.kind).toBe("catchUp");
    const corrected = { ...base, day: 6, players: [{ playerId: "a", joinedDay: 1, missedSessionDays: [1, 2, 4] }] };
    expect(planPacing(corrected, catchup.nextState, policy, turn("corrected")).plan?.intervention).toEqual({ kind: "lag", playerId: "a", missedSessions: 3 });
  });

  it("keeps cooldown and warning history across progress and rejects clock rollback", () => {
    const lag: PacingSnapshot = { ...snapshot(4), players: [{ playerId: "a", joinedDay: 1, missedSessionDays: [1, 2] }] };
    const warned = planPacing(lag, initialPacingState(snapshot(1)), policy, turn("warning"));
    expect(warned.plan?.intervention.kind).toBe("lag");
    const progress = { ...lag, progressRevision: 1, lastProgressDay: 4 };
    const reset = planPacing(progress, warned.nextState, policy, turn("progress"));
    expect(reset.plan).toBeNull();
    const later = planPacing({ ...progress, day: 100, lastProgressDay: 100, progressRevision: 2 }, reset.nextState, policy, turn("later"));
    expect(later.plan).toBeNull();
    expect(() => planPacing({ ...progress, day: 5, lastProgressDay: 100, progressRevision: 2 }, later.nextState, policy, turn("rollback"))).toThrow();
    expect(() => planPacing({ ...progress, day: 5 }, later.nextState, policy, turn("rollback"))).toThrow();
    expect(planPacing({ ...progress, day: 5 }, reset.nextState, policy, turn("next")).plan).toBeNull();
  });
});
