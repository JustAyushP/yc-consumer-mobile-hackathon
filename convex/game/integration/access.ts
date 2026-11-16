import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import type { FixtureContent } from "./fixtures";
import { SF_CONTENT_REVISION } from "../../cases/sfCandidate";
import { isSfBound, verifiedSfCase, verifiedSfGroup } from "./sf";

export async function segmentAccess(ctx: QueryCtx, group: Doc<"groups">): Promise<{
  index: number; completed: boolean; opening: string | null; questionKeys: string[]; abilityTargets: string[]; clueKeys: string[];
} | null> {
  const segments = await ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  const caseRecord = await ctx.db.get(group.caseId);
  if (await isSfBound(ctx, group._id, group.caseId) && !(segments ? await verifiedSfGroup(ctx, group._id, group.caseId) : await verifiedSfCase(ctx, group.caseId))) throw new Error("SF case revision changed");
  if (!segments) {
    return caseRecord?.contentRevision === SF_CONTENT_REVISION ? { index: 0, completed: false, opening: null, questionKeys: [], abilityTargets: [], clueKeys: [] } : null;
  }
  const fixture = await ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  if (!fixture || fixture.caseId !== group.caseId || segments.caseId !== group.caseId || segments.index < 0 || segments.index > 7) throw new Error("Invalid segment audience");
  const active = segments.definitions[segments.index - 1];
  if (segments.index > 0 && !active) throw new Error("Invalid segment audience");
  const content = JSON.parse(fixture.contentJson) as FixtureContent;
  const factKeys = active?.factKeys ?? [];
  return {
    index: segments.index,
    completed: segments.completed,
    opening: active?.opening ?? null,
    questionKeys: active?.questionKeys ?? [],
    abilityTargets: active?.abilityTargets ?? [],
    clueKeys: content.characters.facts.filter((fact) => fact.clueKey && factKeys.includes(fact.key)).map((fact) => fact.clueKey!),
  };
}
