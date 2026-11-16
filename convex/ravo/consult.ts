import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { authorizedReplay } from "../game/runtime";
import { RavoDirective, vRavoDirective } from "./types";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const consult = internalAction({
  args: {
    groupId: v.id("groups"),
    playerId: v.optional(v.id("players")),
    messageId: v.id("messages"),
    lineId: v.string(),
    agentKey: v.optional(v.string()),
    answerId: v.optional(v.id("answers")),
  },
  returns: vRavoDirective,
  handler: async (ctx, args): Promise<RavoDirective> => await ctx.runMutation(internal.game.engine.processConsult, args),
});

export const authorizeCachedDirective = internalQuery({
  args: { groupId: v.id("groups"), playerId: v.id("players"), messageId: v.id("messages"), lineId: v.string(), agentKey: v.string(), directiveJson: v.string() },
  returns: v.object({ authorized: v.boolean() }),
  handler: async (ctx, args) => {
    try {
      if (args.lineId !== "1" || args.agentKey !== "common") return { authorized: false };
      const event = await ctx.db.query("storyEvents").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).unique();
      if (!event || event.groupId !== args.groupId || event.playerId !== args.playerId || event.lineId !== args.lineId ||
        canonicalJson(JSON.parse(event.directiveJson)) !== canonicalJson(JSON.parse(args.directiveJson))) return { authorized: false };
      const directive = await authorizedReplay(ctx, event);
      return { authorized: !!directive && directive.character.agentKey === args.agentKey };
    } catch {
      return { authorized: false };
    }
  },
});
