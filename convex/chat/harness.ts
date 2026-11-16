import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, query } from "../_generated/server";
import { requireViewer } from "../game/lib";
import type { RavoDirective } from "../ravo/types";

// In-app chat with the three characters. Public by explicit exception to the read-only rule; every function is scoped by viewerToken.

const vLine = v.union(v.literal("1"), v.literal("2"), v.literal("3"));
const FAILED = "One moment, detective. I can't open the case file right now.";

export const lines = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const order = (await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).findIndex((p) => p._id === player._id);
    const suspectLine = async (lineId: "2" | "3") => {
      const cast = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", lineId)).unique();
      const suspect = cast ? suspects.find((s) => s.key === cast.agentKey) : suspects[(order * 2 + (lineId === "3" ? 1 : 0)) % Math.max(1, suspects.length)];
      return { lineId, name: suspect?.name ?? (lineId === "2" ? "Suspect A" : "Suspect B"), title: suspect?.title ?? "" };
    };
    return { lines: [{ lineId: "1" as const, name: "Sal", title: "The night bartender" }, await suspectLine("2"), await suspectLine("3")], day: group.day, progress: group.progress };
  },
});

export const thread = query({
  args: { viewerToken: v.string(), lineId: vLine },
  handler: async (ctx, { viewerToken, lineId }) => {
    const { player } = await requireViewer(ctx, viewerToken);
    const rows = await ctx.db.query("messages").withIndex("by_player_agent", (q) => q.eq("playerId", player._id)).collect();
    return rows.filter((m) => (m.kind === "chat" || m.kind === "notice") && m.lineId === lineId).sort((a, b) => a._creationTime - b._creationTime).slice(-100)
      .map((m) => ({ id: m._id, fromPlayer: m.source !== "ravo", system: m.kind === "notice", body: m.body, at: m._creationTime }));
  },
});

export const ingest = internalMutation({
  args: { viewerToken: v.string(), lineId: vLine, text: v.string() },
  handler: async (ctx, { viewerToken, lineId, text }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const body = text.trim().slice(0, 2000);
    if (!body) throw new Error("Say something, detective.");
    const messageId = await ctx.db.insert("messages", { groupId: group._id, playerId: player._id, kind: "chat", source: "keiki", body, lineId, agentKey: lineId === "1" ? "common" : undefined, externalId: "app" });
    return { groupId: group._id, playerId: player._id, messageId };
  },
});

export const saveReply = internalMutation({
  args: { groupId: v.id("groups"), playerId: v.id("players"), lineId: vLine, agentKey: v.optional(v.string()), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", { groupId: args.groupId, playerId: args.playerId, kind: "chat", source: "ravo", body: args.body, lineId: args.lineId, agentKey: args.agentKey });
  },
});

export const send = action({
  args: { viewerToken: v.string(), lineId: vLine, text: v.string() },
  handler: async (ctx, { viewerToken, lineId, text }): Promise<string> => {
    const { groupId, playerId, messageId }: { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages"> } = await ctx.runMutation(internal.chat.harness.ingest, { viewerToken, lineId, text });
    await ctx.runAction(internal.ravo.actor.judge, { messageId }).catch(() => null);
    let directive: RavoDirective;
    try {
      directive = await ctx.runAction(internal.ravo.consult.consult, { groupId, playerId, messageId, lineId, agentKey: lineId === "1" ? "common" : undefined });
    } catch {
      await ctx.runMutation(internal.chat.harness.saveReply, { groupId, playerId, lineId, body: FAILED });
      return FAILED;
    }
    const memory: string = await ctx.runQuery(internal.chat.story.characterContext, { playerId, messageId, agentKey: directive.character.agentKey });
    const reply: string = await ctx.runAction(internal.ravo.actor.act, { directiveJson: JSON.stringify(directive), memory, message: text.trim().slice(0, 2000) });
    await ctx.runMutation(internal.chat.harness.saveReply, { groupId, playerId, lineId, agentKey: directive.character.agentKey, body: reply });
    return reply;
  },
});
