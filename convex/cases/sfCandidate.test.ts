/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ROLES } from "../game/catalog";
import { settleScheduled } from "../game/testScheduler.support";
import { buildPrivateContext, planTestimony, reduceRequest, validateContent, type Snapshot } from "../ravo/characters/lifecycle";
import { buildCharacterContext } from "../ravo/director/context";
import { selectEligibleBeat, type StorySnapshot } from "../ravo/director/story";
import { matchInsights } from "../ravo/scoring";
import schema from "../schema";
import { SF_CASE_CANDIDATE as candidate } from "./sfCandidate";
import { SF_BEATS, SF_CHARACTER_CONTENT_CANDIDATE, SF_CLUE_CRITICALITY, SF_REVIEWED_CONTENT_CANDIDATE, SF_REVIEWED_HINTS, SF_SAFE_LEADS, SF_STORY_GRAPH_CANDIDATE } from "./sfContent";
import { SF_BASELINE_DEFECTS, SF_INSIGHT_FIXTURES, SF_QUESTION_NEGATIVES } from "./sfFixtures";
import { VELVET_LANTERN, type SeedCase } from "./velvetLantern";

async function fixture(content: SeedCase = candidate, day = 1) {
  const t = convexTest(schema, import.meta.glob("/convex/**/*.{ts,js}"));
  const ids = await t.run(async (ctx) => {
    const { suspects, clues, insights, days, ...fields } = content;
    const caseId = await ctx.db.insert("cases", fields);
    for (const { id, ...suspect } of suspects) await ctx.db.insert("suspects", { caseId, key: id, ...suspect });
    for (const { id, ...clue } of clues) await ctx.db.insert("clues", { caseId, key: id, ...clue });
    for (const { id, ...insight } of insights) await ctx.db.insert("insights", { caseId, key: id, ...insight });
    for (const { questions, ...entry } of days) {
      await ctx.db.insert("days", { caseId, ...entry });
      for (const { id, insights: insightKeys, ...question } of questions) await ctx.db.insert("questions", { caseId, day: entry.day, key: id, insightKeys, ...question });
    }
    const groupId = await ctx.db.insert("groups", { name: "Isolated fixture", joinCode: "FIXTURE", caseId, status: "active", day, dayOpenedAt: Date.now(), progress: 0, wrongAccusations: 0 });
    const playerId = await ctx.db.insert("players", { groupId, name: "Fixture A", roleKey: "forensic", joinedDay: 1, lateJoiner: false });
    const otherId = await ctx.db.insert("players", { groupId, name: "Fixture B", roleKey: "interrogator", joinedDay: 1, lateJoiner: false });
    for (const [player, token] of [[playerId, "fixture-a"], [otherId, "fixture-b"]] as const) await ctx.db.insert("viewerTokens", { playerId: player, groupId, token, expiresAt: Date.now() + 3600000 });
    return { caseId, groupId, playerId, otherId };
  });
  const insights = await t.run((ctx) => ctx.db.query("insights").collect());
  return { t, ...ids, insights };
}

describe("unactivated SF case compatibility", () => {
  it("retains the exact identities, weights, gates and day/question mappings", () => {
    expect(candidate.key).toBe(VELVET_LANTERN.key);
    expect(candidate.culpritKey).toBe(VELVET_LANTERN.culpritKey);
    expect(candidate.victim).toBe(VELVET_LANTERN.victim);
    expect(candidate.suspects.map(({ id, name }) => ({ id, name }))).toEqual(VELVET_LANTERN.suspects.map(({ id, name }) => ({ id, name })));
    expect(candidate.clues.map(({ id, unlock }) => ({ id, unlock }))).toEqual(VELVET_LANTERN.clues.map(({ id, unlock }) => ({ id, unlock })));
    expect(candidate.insights.map(({ id, weight }) => ({ id, weight }))).toEqual(VELVET_LANTERN.insights.map(({ id, weight }) => ({ id, weight })));
    expect(candidate.insights.reduce((sum, insight) => sum + insight.weight, 0)).toBe(100);
    expect(candidate.days.map(({ day, questions }) => ({ day, questions: questions.map(({ id, insights }) => ({ id, insights })) }))).toEqual(VELVET_LANTERN.days.map(({ day, questions }) => ({ day, questions: questions.map(({ id, insights }) => ({ id, insights })) })));
    expect(candidate.days[3].questions[0].id).toBe("d4q1");
    expect(candidate.days.flatMap((day) => day.questions).every((question) => !("requiredForSession" in question))).toBe(true);
    expect(Object.keys(ROLES).sort()).toEqual(["archivist", "forensic", "interrogator", "profiler"]);
  });

  for (const pair of SF_INSIGHT_FIXTURES) {
    it(`${pair.insight}: accepts evidence and rejects its paired incomplete answer`, async () => {
      const { insights } = await fixture();
      expect(matchInsights(insights, pair.positive)).toContain(pair.insight);
      expect(matchInsights(insights, pair.negative)).not.toContain(pair.insight);
    });
  }

  for (const day of candidate.days) for (const question of day.questions) {
    it(`${question.id}: reference earns every assigned insight; negative earns none`, async () => {
      const { insights } = await fixture();
      const assignedHits = (text: string) => matchInsights(insights, text).filter((key) => question.insights.includes(key));
      expect(assignedHits(question.reference).sort()).toEqual([...question.insights].sort());
      expect(assignedHits(SF_QUESTION_NEGATIVES[question.id])).toEqual([]);
    });
  }

  for (const defect of SF_BASELINE_DEFECTS) {
    it(`records the legacy defect without changing Brain: ${defect.insight}`, async () => {
      const baseline = await fixture(VELVET_LANTERN);
      const authored = await fixture();
      expect(matchInsights(baseline.insights, defect.text).includes(defect.insight)).toBe(defect.baselineMatches);
      expect(matchInsights(authored.insights, defect.text).includes(defect.insight)).toBe(defect.candidateMatches);
    });
  }

  it("uses Brain's AND groups, OR terms, case/apostrophe normalization and prefix semantics", async () => {
    const { insights } = await fixture();
    expect(matchInsights(insights, "MARGOT is the BOOKKEEPER")).toContain("i_mk");
    expect(matchInsights(insights, "The accounts show embezzlement")).toContain("i_ledger");
    expect(matchInsights(insights, "The accounts are tidy")).not.toContain("i_ledger");
    for (const apostrophe of ["'", "’"]) expect(matchInsights(insights, `Margot didn${apostrophe}t leave; compare the clock.`)).toContain("i_timeline");
    expect(matchInsights(insights, "amargot xbookkeeper")).not.toContain("i_mk");
  });

  it("reviewed hints do not themselves supply the assigned scored deduction", async () => {
    const { insights } = await fixture();
    for (const hint of SF_REVIEWED_HINTS) expect(matchInsights(insights, hint.body)).not.toContain(hint.insightKey);
  });

  it("accepts the evidenced before-first-set lipstick paraphrase", async () => {
    const { insights } = await fixture();
    expect(matchInsights(insights, "Vivian’s lipstick is from the toast before her first set, not the closing drink")).toContain("i_lipstick");
    expect(matchInsights(insights, "Vivian’s lipstick is suspicious")).not.toContain("i_lipstick");
  });

  it("makes Leo's continuous whereabouts available in the unlocked public report", async () => {
    const { t, groupId } = await fixture(candidate, 2);
    await t.mutation(internal.ravo.clues.unfold, { groupId });
    const board = await t.query(api.game.viewer.board, { viewerToken: "fixture-a" });
    expect(board.clues.find((clue) => clue.key === "e_taxi")?.summary).toContain("continuously from 1:05 to 2:00");
  });

  it("documents remaining lexical limitations instead of claiming semantic grading", async () => {
    const { insights } = await fixture();
    expect(matchInsights(insights, "Margot is not the bookkeeper")).toContain("i_mk");
    expect(matchInsights(insights, "Margot is a bookkeeping impostor")).toContain("i_mk");
  });

  for (const clue of candidate.clues) {
    it(`${clue.id}: rejects before the stable gate and unlocks once after it`, async () => {
      const { t, groupId, playerId } = await fixture(candidate, "day" in clue.unlock ? Math.max(0, clue.unlock.day - 1) : 1);
      expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: clue.id })).toBe(false);
      if ("day" in clue.unlock) {
        const day = clue.unlock.day;
        await t.run((ctx) => ctx.db.patch(groupId, { day }));
      } else {
        expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: clue.unlock.insight })).toBe(true);
      }
      expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: clue.id })).toBe(true);
      expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: clue.id })).toBe(false);
    });
  }

  it("permits the identity-first ledger path without pretending a same-player answer can be edited", async () => {
    const { t, groupId, playerId, insights } = await fixture(candidate, 2);
    const identity = "M.K. identifies Margot the bookkeeper.";
    expect(matchInsights(insights, identity)).toEqual(["i_mk"]);
    expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: "e_ledger" })).toBe(false);
    await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: "i_mk" });
    expect(await t.mutation(internal.ravo.clues.unfold, { groupId })).toContain("e_ledger");
    const day4 = candidate.days[3].questions[0];
    expect(matchInsights(insights, day4.reference)).toContain("i_ledger");
    expect(day4.insights).toContain("i_ledger");
  });

  for (const gap of [
    { day: 1, question: "d1q1", insight: "i_poison", clue: "e_prescription", correction: "Digitalis poisoned the bourbon" },
    { day: 2, question: "d2q2", insight: "i_mk", clue: "e_ledger", correction: "M.K. is Margot the bookkeeper" },
  ]) {
    it(`records the unresolved recovery gap after everyone misses ${gap.question}`, async () => {
      vi.useFakeTimers();
      try {
        const { t, groupId, playerId, otherId } = await fixture(candidate, gap.day);
        const thirdId = await t.run((ctx) => ctx.db.insert("players", { groupId, name: "Fixture C", roleKey: "profiler", joinedDay: 1, lateJoiner: false }));
        for (const player of [playerId, otherId, thirdId]) {
          const first = await t.mutation(internal.game.session.submitAnswer, { playerId: player, questionKey: gap.question, text: "I do not know" });
          await settleScheduled(t);
          expect(await t.mutation(internal.game.session.submitAnswer, { playerId: player, questionKey: gap.question, text: gap.correction })).toBe(first);
          expect((await t.run((ctx) => ctx.db.get(first)))?.text).toBe("I do not know");
        }
        const messageId = await t.run((ctx) => ctx.db.insert("messages", { groupId, playerId, kind: "chat", source: "keiki", lineId: "1", body: gap.correction }));
        await t.action(internal.ravo.entry.onMessage, { groupId, messageId });
        expect(await t.mutation(internal.game.engine.unlockClue, { groupId, clueKey: gap.clue })).toBe(false);
        expect((await t.run((ctx) => ctx.db.query("progress").collect())).map((row) => row.insightKey)).not.toContain(gap.insight);
        await t.run((ctx) => ctx.db.patch(groupId, { day: gap.day + 1 }));
        await expect(t.mutation(internal.game.session.submitAnswer, { playerId, questionKey: gap.question, text: gap.correction })).rejects.toThrow("not open today");
        await settleScheduled(t);
      } finally {
        vi.useRealTimers();
      }
    });
  }

  it("credits exactly 100 once and rejects unknown insight credit", async () => {
    const { t, groupId, playerId } = await fixture();
    let total = 0;
    for (const insight of candidate.insights) {
      expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: insight.id })).toBe(true);
      total += insight.weight;
      expect((await t.run((ctx) => ctx.db.get(groupId)))?.progress).toBe(total);
      expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: insight.id })).toBe(false);
    }
    expect(await t.mutation(internal.game.engine.recordInsight, { groupId, playerId, insightKey: "i_staging" })).toBe(false);
  });

  it("keeps group clues shared but ability findings private, and hides the active-case solution", async () => {
    const { t, groupId, playerId } = await fixture();
    expect(await t.query(api.game.viewer.reveal, { viewerToken: "fixture-a" })).toBeNull();
    expect((await t.query(api.game.viewer.board, { viewerToken: "fixture-a" })).clues).toEqual([]);
    await t.mutation(internal.ravo.clues.unfold, { groupId });
    await t.mutation(internal.game.session.useAbility, { playerId, targetKey: "e_glass" });
    const a = await t.query(api.game.viewer.board, { viewerToken: "fixture-a" });
    const b = await t.query(api.game.viewer.board, { viewerToken: "fixture-b" });
    expect(a.clues).toEqual(b.clues);
    expect(a.myFindings).toHaveLength(1);
    expect(b.myFindings).toEqual([]);
    expect(a.clues.map((clue) => clue.key)).not.toContain("e_ledger");
    const publicFile = await t.query(api.game.viewer.caseFile, { viewerToken: "fixture-a" });
    expect(publicFile).not.toHaveProperty("culpritKey");
    expect(publicFile).not.toHaveProperty("reveal");
  });

  it("keeps d4q1 unavailable on Day 3 and available on Day 4", async () => {
    const { t, groupId, playerId } = await fixture(candidate, 3);
    await expect(t.mutation(internal.game.session.submitAnswer, { playerId, questionKey: "d4q1", text: "guess" })).rejects.toThrow("not open today");
    await t.run((ctx) => ctx.db.patch(groupId, { day: 4 }));
    const session = await t.query(internal.game.session.today, { playerId });
    expect(session.questions.map((question) => question.key)).toEqual(["d4q1"]);
  });

  it("retains the shared three-hint budget and recipient-only hint archive", async () => {
    const { t, groupId, playerId, otherId } = await fixture();
    for (const hint of SF_REVIEWED_HINTS.slice(0, 3)) expect(await t.mutation(internal.game.engine.giveHint, { groupId, playerId, insightKey: hint.insightKey, body: hint.body })).toBe(true);
    const fourth = SF_REVIEWED_HINTS[3];
    expect(await t.mutation(internal.game.engine.giveHint, { groupId, playerId: otherId, insightKey: fourth.insightKey, body: fourth.body })).toBe(false);
    expect(await t.query(api.game.viewer.hints, { viewerToken: "fixture-a" })).toHaveLength(3);
    expect(await t.query(api.game.viewer.hints, { viewerToken: "fixture-b" })).toEqual([]);
  });

  it("documents culprit-only accusation and solved-only reveal without claiming motive gates", async () => {
    vi.useFakeTimers();
    try {
      const { t, playerId } = await fixture();
      expect(await t.mutation(internal.game.accuse.accuse, { playerId, suspectKey: "s_leo", reasoning: "A guess" })).toEqual({ correct: false });
      expect(await t.query(api.game.viewer.reveal, { viewerToken: "fixture-a" })).toBeNull();
      expect(await t.mutation(internal.game.accuse.accuse, { playerId, suspectKey: "s_margot", reasoning: "" })).toEqual({ correct: true });
      expect((await t.query(api.game.viewer.reveal, { viewerToken: "fixture-a" }))?.story).toEqual(candidate.reveal);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
      expect(jobs.every((job) => job.state.kind === "success")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reviewed content candidate boundaries", () => {
  for (const fact of SF_CHARACTER_CONTENT_CANDIDATE.facts) {
    it(`${fact.key}: actual lifecycle requires recipient entitlement, unlock and current revision`, () => {
      const content = SF_CHARACTER_CONTENT_CANDIDATE;
      const state: Snapshot = {
        caseKey: content.caseKey, contentRevision: content.revision,
        story: { day: fact.requirements.minDay, act: 1, version: 0, doneBeats: [], flags: {}, creditedInsights: fact.requirements.insights, unlockedClues: [fact.clueKey] },
        players: [{ id: "a", role: "forensic", roleOrdinal: 0 }, { id: "b", role: "interrogator", roleOrdinal: 0 }],
        assignments: [{ playerId: "a", lineId: "1", agentKey: "common" }, { playerId: "b", lineId: "1", agentKey: "common" }],
        deliveries: [], entitledFacts: { a: [fact.key], b: [] },
      };
      expect(validateContent(content, ["forensic", "interrogator", "profiler", "archivist"])).toEqual([]);
      const request = planTestimony(content, state, "a", "1", fact.key);
      expect(() => planTestimony(content, state, "b", "1", fact.key)).toThrow("not authorized");
      expect(() => planTestimony(content, { ...state, story: { ...state.story, unlockedClues: [] } }, "a", "1", fact.key)).toThrow("not authorized");
      expect(() => planTestimony(content, { ...state, contentRevision: "old" }, "a", "1", fact.key)).toThrow("Invalid snapshot");
      const authorized = reduceRequest(content, state, request);
      expect(buildPrivateContext(content, authorized, "a", "1")).toContain(fact.text);
      expect(buildPrivateContext(content, authorized, "b", "1")).not.toContain(fact.text);
      expect(buildPrivateContext(content, { ...authorized, story: { ...authorized.story, unlockedClues: [] } }, "a", "1")).not.toContain(fact.text);
      expect(buildPrivateContext(content, authorized, "a", "1")).not.toContain("Margot Kell killed Victor");
    });
  }

  it("covers every existing role, character, clue and insight without new score keys", () => {
    const content = SF_CHARACTER_CONTENT_CANDIDATE;
    expect(content.common.agentKey).toBe("common");
    expect(content.common.name).toBe("Sal, the night bartender");
    expect(content.characters.map((sheet) => sheet.agentKey)).toEqual(candidate.suspects.map((suspect) => suspect.id));
    for (const role of Object.keys(ROLES) as (keyof typeof ROLES)[]) for (const line of ["2", "3"] as const) {
      for (const key of content.castPlan[role][line]) expect(candidate.suspects.map((suspect) => suspect.id)).toContain(key);
    }
    expect(content.facts.map((fact) => fact.clueKey)).toEqual(candidate.clues.map((clue) => clue.id));
    expect(SF_CLUE_CRITICALITY.map((clue) => clue.clueKey)).toEqual(candidate.clues.map((clue) => clue.id));
    expect(Object.keys(SF_REVIEWED_CONTENT_CANDIDATE.insightLabels)).toEqual(candidate.insights.map((insight) => insight.id));
    expect(SF_REVIEWED_HINTS.map((hint) => hint.insightKey)).toEqual(candidate.insights.map((insight) => insight.id));
    for (const hint of SF_REVIEWED_HINTS) {
      expect(hint.caseKey).toBe(candidate.key);
      expect(hint.body).not.toContain("Margot");
    }
    for (const lead of SF_SAFE_LEADS) for (const key of lead.clueKeys) expect(candidate.clues.map((clue) => clue.id)).toContain(key);
  });

  for (const beat of SF_BEATS) {
    it(`${beat.key}: requires time and every evidence/flag prerequisite`, () => {
      const snapshot: StorySnapshot = { day: beat.minDay, act: 3, version: 1, doneBeats: [], flags: beat.requiredFlags ?? {}, creditedInsights: beat.requiredInsights ?? [], unlockedClues: beat.requiredClues ?? [] };
      expect(selectEligibleBeat(snapshot, [beat])?.key).toBe(beat.key);
      expect(selectEligibleBeat({ ...snapshot, day: beat.minDay - 1 }, [beat])).toBeUndefined();
      expect(selectEligibleBeat({ ...snapshot, doneBeats: [beat.key] }, [beat])).toBeUndefined();
      for (const key of beat.requiredInsights ?? []) expect(selectEligibleBeat({ ...snapshot, creditedInsights: snapshot.creditedInsights.filter((value) => value !== key) }, [beat])).toBeUndefined();
      for (const key of beat.requiredClues ?? []) expect(selectEligibleBeat({ ...snapshot, unlockedClues: snapshot.unlockedClues.filter((value) => value !== key) }, [beat])).toBeUndefined();
      for (const key of Object.keys(beat.requiredFlags ?? {})) expect(selectEligibleBeat({ ...snapshot, flags: { ...snapshot.flags, [key]: false } }, [beat])).toBeUndefined();
      expect(beat.effects.every((effect) => effect.kind === "flag")).toBe(true);
    });
  }

  it("has a reachable ordered graph without implicit clue unlock or new choices", () => {
    const snapshot: StorySnapshot = { day: 4, act: 1, version: 1, doneBeats: [], flags: {}, creditedInsights: candidate.insights.map((insight) => insight.id), unlockedClues: candidate.clues.map((clue) => clue.id) };
    for (const beat of SF_STORY_GRAPH_CANDIDATE.beats) {
      expect(beat.requiredBeats.every((key) => snapshot.doneBeats.includes(key))).toBe(true);
      expect(selectEligibleBeat(snapshot, SF_BEATS)?.key).toBe(beat.key);
      snapshot.doneBeats = [...snapshot.doneBeats, beat.key];
      snapshot.flags = { ...snapshot.flags, ...Object.fromEntries(beat.effects.map((effect) => [effect.key, effect.value])) };
    }
    expect(selectEligibleBeat(snapshot, SF_BEATS)).toBeUndefined();
    expect(SF_STORY_GRAPH_CANDIDATE.decisions).toEqual([]);
  });

  it("builds recipient context without locked facts, another player's result or a solution", () => {
    const sal = SF_CHARACTER_CONTENT_CANDIDATE.common;
    const context = buildCharacterContext({ recipientId: "a", character: sal, publicIdentity: sal.publicIdentity, publicVoice: sal.publicVoice, facts: [
      { text: "Authorized scene report", audience: "group", unlocked: true },
      { text: "LOCKED_LEDGER", audience: "group", unlocked: false },
      { text: "OTHER_PRIVATE_RESULT", audience: "player", playerId: "b", unlocked: true },
      { text: "OWN_PRIVATE_RESULT", audience: "player", playerId: "a", unlocked: true },
    ] });
    expect(context).toContain("Authorized scene report");
    expect(context).toContain("OWN_PRIVATE_RESULT");
    expect(context).not.toContain("LOCKED_LEDGER");
    expect(context).not.toContain("OTHER_PRIVATE_RESULT");
    expect(context).not.toContain("Margot Kell killed");
  });
});
