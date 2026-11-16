import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/** Dev demo: bind one Telegram sender (Keiki context.phone, e.g. "tg:123") to a player on every configured line. */
export const bindTelegram = internalMutation({
  args: { joinCode: v.string(), playerName: v.string(), senderId: v.string() },
  handler: async (ctx, { joinCode, playerName, senderId }) => {
    const group = await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode.trim().toUpperCase())).first();
    if (!group) throw new Error(`No group with join code ${joinCode}`);
    const player = (await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect()).find((p) => p.name === playerName);
    if (!player) throw new Error(`No player ${playerName}`);
    const bound = [];
    for (const lineId of ["1", "2", "3"]) {
      const agentId = process.env[`KEIKI_DEMO_AGENT_ID_${lineId}`];
      const botId = process.env[`KEIKI_DEMO_TELEGRAM_BOT_ID_${lineId}`];
      if (!agentId || !botId) continue;
      const transport = { agentId, channel: "telegram", conversationId: JSON.stringify(["telegram", botId, senderId]), senderId, lineId };
      for (const row of await ctx.db.query("keikiBindings").withIndex("by_transport", (q) => q.eq("agentId", agentId).eq("channel", "telegram").eq("conversationId", transport.conversationId).eq("senderId", senderId).eq("lineId", lineId)).collect()) await ctx.db.delete(row._id);
      await ctx.db.insert("keikiBindings", { ...transport, playerId: player._id, groupId: group._id, active: true });
      bound.push(lineId);
    }
    return { playerId: player._id, bound };
  },
});

/** Dev demo: deactivate every Telegram binding in a group. */
export const unbindGroup = internalMutation({
  args: { joinCode: v.string() },
  handler: async (ctx, { joinCode }) => {
    const group = await ctx.db.query("groups").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode.trim().toUpperCase())).first();
    if (!group) throw new Error("No group with join code " + joinCode);
    let count = 0;
    for (const row of await ctx.db.query("keikiBindings").collect()) if (row.groupId === group._id && row.active) { await ctx.db.patch(row._id, { active: false }); count++; }
    return count;
  },
});
