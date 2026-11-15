import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { vMessageKind, vMessageSource } from "../schema";

/** Ingest of a player's message (from Keiki). Builder 2: call this from the webhook. */
export const send = internalMutation({
  args: { playerId: v.id("players"), body: v.string(), source: vMessageSource, externalId: v.optional(v.string()), agentKey: v.optional(v.string()) },
  returns: v.union(v.id("messages"), v.null()),
  handler: async (ctx, { playerId, body, source, externalId, agentKey }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Unknown detective");
    const text = body.trim().slice(0, 1000);
    if (!text) return null;
    const messageId = await ctx.db.insert("messages", { groupId: player.groupId, kind: "chat", source, playerId, body: text, externalId, agentKey });
    await ctx.scheduler.runAfter(0, internal.ravo.entry.onMessage, { groupId: player.groupId, messageId });
    return messageId;
  },
});

/** The group's thread, oldest first, with author names. Internal: the app is read-only and never shows raw chat. */
export const list = internalQuery({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const rows = (await ctx.db.query("messages").withIndex("by_group", (q) => q.eq("groupId", groupId)).order("desc").take(200)).reverse();
    const names = new Map<string, string>();
    for (const m of rows) if (m.playerId && !names.has(m.playerId)) names.set(m.playerId, (await ctx.db.get(m.playerId))?.name ?? "Unknown");
    return rows.map((m) => ({ ...m, authorName: m.playerId ? (names.get(m.playerId) ?? null) : null }));
  },
});

/** RAVO's (and the engine's) outbound channel. Builder 2: also deliver to Keiki here. */
export const postRavoMessage = internalMutation({
  args: {
    groupId: v.id("groups"),
    kind: vMessageKind,
    body: v.string(),
    playerId: v.optional(v.id("players")),
    meta: v.optional(v.string()),
    agentKey: v.optional(v.string()),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => await ctx.db.insert("messages", { ...args, source: "ravo" }),
});

/** Single message read for RAVO and the Keiki webhook. */
export const get = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => await ctx.db.get(messageId),
});
