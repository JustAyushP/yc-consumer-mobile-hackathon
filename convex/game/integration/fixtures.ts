import { makeFunctionReference } from "convex/server";
import { v, type Infer } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { graph } from "../story/model";
import { validateContent, type CharacterContent } from "../../ravo/characters/lifecycle";
import type { RoleKey } from "../catalog";
import type { PacingPolicy } from "../../ravo/pacing/planner";

export type FixtureContent = {
  characters: CharacterContent;
  roleFacts: Partial<Record<RoleKey, string[]>>;
  pacing: PacingPolicy;
  nudges: string[];
};

const initialize = makeFunctionReference<"mutation", { groupId: string; graph: Infer<typeof graph> }, string>("game/story/engine:initialize");

export const installFixture = internalMutation({
  args: { groupId: v.id("groups"), graph, content: v.any() },
  handler: async (ctx, { groupId, graph: definition, content: input }) => {
    const group = await ctx.db.get(groupId);
    const caseRecord = group && await ctx.db.get(group.caseId);
    if (!group || !caseRecord || !caseRecord.key.startsWith("fixture-") || definition.caseKey !== caseRecord.key) throw new Error("Fixture case required");
    const content = input as FixtureContent;
    try {
      const roles: RoleKey[] = ["forensic", "interrogator", "profiler", "archivist"];
      if (content.characters.caseKey !== caseRecord.key || validateContent(content.characters, roles).length ||
        !content.roleFacts || roles.some((role) => !Array.isArray(content.roleFacts[role]) || content.roleFacts[role]!.some((key) => !content.characters.facts.some((fact) => fact.key === key))) ||
        !content.nudges.length || content.nudges.some((text) => typeof text !== "string" || !text.trim() || text.length > 500) ||
        Object.values(content.pacing).length !== 4 || Object.values(content.pacing).some((n) => !Number.isSafeInteger(n) || n < 1)) throw new Error();
      const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
      if (content.characters.characters.some((sheet) => !suspects.some((suspect) => suspect.key === sheet.agentKey && suspect.name === sheet.name))) throw new Error();
    } catch { throw new Error("Invalid reviewed fixture"); }
    const json = JSON.stringify(content);
    const existing = await ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", groupId)).unique();
    if (existing && (existing.caseId !== group.caseId || existing.contentJson !== json)) throw new Error("Fixture is immutable");
    await ctx.runMutation(initialize, { groupId, graph: definition });
    if (!existing) await ctx.db.insert("brainFixtures", { groupId, caseId: group.caseId, contentJson: json });
    return null;
  },
});
