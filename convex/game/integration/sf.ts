import { makeFunctionReference } from "convex/server";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { SF_CASE_CANDIDATE, SF_CONTENT_REVISION } from "../../cases/sfCandidate";
import { SF_CHARACTER_CONTENT_CANDIDATE, SF_STORY_GRAPH_CANDIDATE } from "../../cases/sfContent";
import { SF_SEGMENTS } from "../../cases/sfSegments";
import type { FixtureContent } from "./fixtures";

const initialize = makeFunctionReference<"mutation", { groupId: Id<"groups">; graph: typeof SF_STORY_GRAPH_CANDIDATE }, Id<"storyInstances">>("game/story/engine:initialize");
const installSegments = makeFunctionReference<"mutation", { groupId: Id<"groups">; definitions: typeof SF_SEGMENTS }, null>("game/integration/segments:installFixtureSegments");

export async function verifiedSfCase(ctx: QueryCtx, caseId: Id<"cases">) {
  const [record, suspects, clues, insights, days, questions] = await Promise.all([
    ctx.db.get(caseId), ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
    ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
    ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect(),
    ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", caseId)).collect(),
    ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", caseId)).collect(),
  ]);
  if (!record || record.contentRevision !== SF_CONTENT_REVISION) return false;
  const c = SF_CASE_CANDIDATE;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const ordered = <T extends { key: string }>(rows: T[]) => rows.sort((a, b) => a.key.localeCompare(b.key));
  if (!equal({ key: record.key, title: record.title, setting: record.setting, victim: record.victim, logline: record.logline, culpritKey: record.culpritKey, reveal: record.reveal },
    { key: c.key, title: c.title, setting: c.setting, victim: c.victim, logline: c.logline, culpritKey: c.culpritKey, reveal: c.reveal })) return false;
  if (!equal(ordered(suspects.map(({ key, name, title, bio, interrogation, profile, records }) => ({ key, name, title, bio, interrogation, profile, records }))), ordered(c.suspects.map(({ id, name, title, bio, interrogation, profile, records }) => ({ key: id, name, title, bio, interrogation, profile, records }))))) return false;
  if (!equal(ordered(clues.map(({ key, name, kind, summary, detail, unlock }) => ({ key, name, kind, summary, detail, unlock }))), ordered(c.clues.map(({ id, name, kind, summary, detail, unlock }) => ({ key: id, name, kind, summary, detail, unlock }))))) return false;
  if (!equal(ordered(insights.map(({ key, label, weight, keywords, hint }) => ({ key, label, weight, keywords, hint }))), ordered(c.insights.map(({ id, label, weight, keywords, hint }) => ({ key: id, label, weight, keywords, hint }))))) return false;
  if (!equal(days.map(({ day, title, briefing }) => ({ day, title, briefing })).sort((a, b) => a.day - b.day), c.days.map(({ day, title, briefing }) => ({ day, title, briefing })))) return false;
  return equal(ordered(questions.map(({ key, day, prompt, reference, insightKeys, requiredForSession }) => ({ key, day, prompt, reference, insightKeys, requiredForSession: requiredForSession ?? false }))),
    ordered(c.days.flatMap(({ day, questions: entries }) => entries.map(({ id, prompt, reference, insights: insightKeys }) => ({ key: id, day, prompt, reference, insightKeys, requiredForSession: false })))));
}

function sfContent(): FixtureContent {
  const facts = SF_CHARACTER_CONTENT_CANDIDATE.facts.map((fact) => fact.key);
  return { characters: SF_CHARACTER_CONTENT_CANDIDATE,
    roleFacts: { forensic: facts, interrogator: facts, profiler: facts, archivist: facts },
    pacing: { stallDays: 1, lagMissedSessions: 2, cooldownDays: 1, maxInterventionsPerProgress: 2 },
    nudges: ["Review the evidence already available, and say what remains uncertain."] };
}

export async function verifiedSfGroup(ctx: QueryCtx, groupId: Id<"groups">, caseId: Id<"cases">) {
  if (!await verifiedSfCase(ctx, caseId)) return false;
  const [existing, instance, segments] = await Promise.all([
    ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
    ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
    ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique(),
  ]);
  return !!existing && existing.caseId === caseId && existing.contentJson === JSON.stringify(sfContent()) && !!instance && instance.caseId === caseId &&
    JSON.stringify(instance.graph) === JSON.stringify(SF_STORY_GRAPH_CANDIDATE) && !!segments && segments.caseId === caseId && JSON.stringify(segments.definitions) === JSON.stringify(SF_SEGMENTS);
}

export async function initializeSfGroup(ctx: MutationCtx, groupId: Id<"groups">, caseId: Id<"cases">) {
  if (!await verifiedSfCase(ctx, caseId)) throw new Error("SF case revision changed");
  const existing = await ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
  if (existing) {
    if (!await verifiedSfGroup(ctx, groupId, caseId)) throw new Error("SF story revision changed");
    return existing;
  }
  await ctx.runMutation(initialize, { groupId, graph: SF_STORY_GRAPH_CANDIDATE });
  const id = await ctx.db.insert("brainFixtures", { groupId, caseId, contentJson: JSON.stringify(sfContent()) });
  await ctx.runMutation(installSegments, { groupId, definitions: SF_SEGMENTS });
  return (await ctx.db.get(id))!;
}
