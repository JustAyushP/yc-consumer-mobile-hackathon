import { v, type Infer } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { FixtureContent } from "./fixtures";
import { segmentDefinition, segmentGate } from "./segmentModel";

type Gate = Infer<typeof segmentGate>;
type Definition = Infer<typeof segmentDefinition>;

export const installFixtureSegments = internalMutation({
  args: { groupId: v.id("groups"), definitions: v.array(segmentDefinition) },
  handler: async (ctx, { groupId, definitions }) => {
    const [group, fixture, instance, state, existing, events] = await Promise.all([
      ctx.db.get(groupId),
      ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
      ctx.db.query("storyEvents").withIndex("by_group", (q) => q.eq("groupId", groupId)).first(),
    ]);
    if (!group || group.status !== "active" || !fixture || fixture.caseId !== group.caseId || !instance || instance.caseId !== group.caseId || !state) throw new Error("Invalid fixture story");
    if (existing) {
      if (existing.caseId !== group.caseId || JSON.stringify(existing.definitions) !== JSON.stringify(definitions)) throw new Error("Segments are immutable");
      return null;
    }
    if (state.version !== 0 || state.doneBeats.length || events) throw new Error("Segments must be installed before play");
    const content = JSON.parse(fixture.contentJson) as FixtureContent;
    const [insights, clues, questions, suspects] = await Promise.all([
      ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
      ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
      ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect(),
      ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect(),
    ]);
    const beats = instance.graph.beats.map((beat) => beat.key);
    const positions = new Map(definitions.flatMap((definition) => definition.beatKeys.map((key) => [key, definition.index] as const)));
    const allBeats = definitions.flatMap((definition) => definition.beatKeys);
    const flagAvailable = (key: string, value: boolean, maxIndex: number) => state.flags[key] === value ||
      instance.graph.beats.some((beat) => positions.get(beat.key)! <= maxIndex && beat.effects.some((effect) => effect.kind === "flag" && effect.key === key && effect.value === value)) ||
      instance.graph.decisions.some((decision) => positions.get(decision.requiredBeat)! <= maxIndex && decision.options.some((option) => option.effects.some((effect) => effect.kind === "flag" && effect.key === key && effect.value === value)));
    const unique = (values: string[]) => values.length <= 100 && new Set(values).size === values.length;
    const safeText = (value: string | undefined) => typeof value === "string" && value.trim().length > 0 && value.length <= 500;
    const keys = (gate: Gate) => [...gate.beats.map((key) => `beat:${key}`), ...gate.insights.map((key) => `insight:${key}`), ...gate.clues.map((key) => `clue:${key}`), ...Object.entries(gate.flags).map(([key, value]) => `flag:${key}:${value}`)];
    const seen = new Set<string>();
    if (definitions.length !== 7 || allBeats.length !== beats.length || !unique(allBeats) || beats.some((key) => !positions.has(key)) || beats.some((key, index) => index > 0 && positions.get(beats[index - 1])! > positions.get(key)!)) throw new Error("Invalid segment beat coverage");
    for (const [i, definition] of definitions.entries()) {
      if (definition.index !== i + 1 || !safeText(definition.opening) || !safeText(definition.high) || (i < 6 ? !safeText(definition.nextHook) : definition.nextHook !== undefined) ||
        !unique(definition.beatKeys) || !unique(definition.factKeys) || !unique(definition.questionKeys) || !unique(definition.abilityTargets) ||
        definition.factKeys.some((key) => !content.characters.facts.some((fact) => fact.key === key)) ||
        definition.questionKeys.some((key) => !questions.some((question) => question.key === key)) ||
        definition.abilityTargets.some((key) => !clues.some((clue) => clue.key === key) && !suspects.some((suspect) => suspect.key === key))) throw new Error("Invalid segment content");
      for (const [gate, maxIndex] of [[definition.entry, i], [definition.exit, i + 1]] as const) {
        if (!unique(gate.beats) || !unique(gate.insights) || !unique(gate.clues) || Object.keys(gate.flags).length > 100 ||
          gate.beats.some((key) => !positions.has(key) || positions.get(key)! > maxIndex) ||
          gate.insights.some((key) => !insights.some((item) => item.key === key)) || gate.clues.some((key) => !clues.some((item) => item.key === key)) ||
          Object.entries(gate.flags).some(([key, value]) => !flagAvailable(key, value, maxIndex))) throw new Error("Invalid segment gate");
      }
      const exitKeys = keys(definition.exit);
      if (!exitKeys.some((key) => !seen.has(key))) throw new Error("Segment needs new progress");
      for (const key of exitKeys) seen.add(key);
    }
    await ctx.db.insert("brainSegments", { groupId, caseId: group.caseId, definitions, index: 0, completed: false });
    return null;
  },
});

function eligible(gate: Gate, state: Doc<"storyStates">, insights: string[], clues: string[]) {
  return gate.beats.every((key) => state.doneBeats.includes(key)) && gate.insights.every((key) => insights.includes(key)) &&
    gate.clues.every((key) => clues.includes(key)) && Object.entries(gate.flags).every(([key, value]) => state.flags[key] === value);
}

export async function advanceSegment(ctx: MutationCtx, group: Doc<"groups">, segments: Doc<"brainSegments">) {
  if (segments.caseId !== group.caseId || segments.definitions.length !== 7) throw new Error("Invalid segment state");
  const [state, progress, unlocks] = await Promise.all([
    ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique(),
    ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
  ]);
  if (!state || !Number.isSafeInteger(segments.index) || segments.index < 0 || segments.index > 7 || (segments.index === 0 && segments.completed)) throw new Error("Invalid segment state");
  const insights = progress.map((item) => item.insightKey);
  const clues = unlocks.map((item) => item.clueKey);
  let index = segments.index;
  let completed = segments.completed;
  let text: string | undefined;
  const current: Definition | undefined = segments.definitions[index - 1];
  if (current && !completed && eligible(current.exit, state, insights, clues)) {
    completed = true;
    text = [current.high, current.nextHook].filter(Boolean).join("\n");
  } else if ((index === 0 || completed) && index < 7) {
    const next = segments.definitions[index];
    if (eligible(next.entry, state, insights, clues)) { index++; completed = false; text = next.opening; }
  }
  if (index !== segments.index || completed !== segments.completed) {
    await ctx.db.patch(segments._id, { index, completed });
    await ctx.db.patch(state._id, { version: state.version + 1 });
    if (text) await ctx.db.insert("narration", { groupId: group._id, kind: "day", body: text, segmentIndex: index });
  }
  return { index, completed, text, active: index ? segments.definitions[index - 1] : undefined };
}
