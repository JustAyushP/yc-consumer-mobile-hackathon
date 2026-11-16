import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import type { Claim } from "./keikiHandler";

const transport = {
  agentId: v.string(),
  channel: v.string(),
  conversationId: v.string(),
  senderId: v.string(),
  lineId: v.string(),
};

export const claim = internalMutation({
  args: { ...transport, eventKey: v.string(), body: v.string() },
  returns: v.union(
    v.object({ status: v.literal("rejected") }),
    v.object({ status: v.union(v.literal("pending"), v.literal("uncertain")) }),
    v.object({ status: v.literal("completed"), directiveJson: v.string() }),
    v.object({ status: v.literal("claimed"), receiptId: v.id("keikiReceipts"), messageId: v.id("messages"), groupId: v.id("groups"), playerId: v.id("players") }),
  ),
  handler: async (ctx, args): Promise<Claim> => {
    if (!["1", "2", "3"].includes(args.lineId)) return { status: "rejected" };
    const agentKey = args.lineId === "1" ? "common" : undefined;
    const bindings = await ctx.db.query("keikiBindings").withIndex("by_transport", (q) =>
      q.eq("agentId", args.agentId).eq("channel", args.channel).eq("conversationId", args.conversationId).eq("senderId", args.senderId).eq("lineId", args.lineId),
    ).take(2);
    if (bindings.length !== 1 || !bindings[0].active) return { status: "rejected" };
    const binding = bindings[0];
    const [player, group] = await Promise.all([ctx.db.get(binding.playerId), ctx.db.get(binding.groupId)]);
    if (!player || !group || player.groupId !== group._id) return { status: "rejected" };
    const receipts = await ctx.db.query("keikiReceipts").withIndex("by_eventKey", (q) => q.eq("eventKey", args.eventKey)).take(2);
    if (receipts.length > 1) return { status: "rejected" };
    if (receipts.length === 1) {
      const receipt = receipts[0];
      if (receipt.bindingId !== binding._id) return { status: "rejected" };
      const message = await ctx.db.get(receipt.messageId);
      if (!message || message.playerId !== binding.playerId || message.groupId !== binding.groupId || message.lineId !== binding.lineId || message.body !== args.body || message.source !== "keiki" || message.agentKey !== agentKey) return { status: "rejected" };
      if (receipt.status === "completed") {
        return receipt.directiveJson ? { status: "completed", directiveJson: receipt.directiveJson } : { status: "uncertain" };
      }
      return { status: receipt.status };
    }
    const messageId = await ctx.db.insert("messages", {
      groupId: binding.groupId, playerId: binding.playerId, kind: "chat", source: "keiki", body: args.body, lineId: args.lineId, agentKey,
    });
    const receiptId = await ctx.db.insert("keikiReceipts", { eventKey: args.eventKey, status: "pending", messageId, bindingId: binding._id });
    return { status: "claimed", receiptId, messageId, groupId: binding.groupId, playerId: binding.playerId };
  },
});

export const complete = internalMutation({
  args: { receiptId: v.id("keikiReceipts"), directiveJson: v.string() },
  returns: v.null(),
  handler: async (ctx, { receiptId, directiveJson }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt || receipt.status !== "pending") throw new Error("Receipt is not pending");
    const [binding, message] = await Promise.all([ctx.db.get(receipt.bindingId), ctx.db.get(receipt.messageId)]);
    if (!binding?.active || !message || message.playerId !== binding.playerId || message.groupId !== binding.groupId || message.lineId !== binding.lineId || message.source !== "keiki" || message.agentKey !== (binding.lineId === "1" ? "common" : undefined)) throw new Error("Invalid binding");
    const bindings = await ctx.db.query("keikiBindings").withIndex("by_transport", (q) =>
      q.eq("agentId", binding.agentId).eq("channel", binding.channel).eq("conversationId", binding.conversationId).eq("senderId", binding.senderId).eq("lineId", binding.lineId),
    ).take(2);
    if (bindings.length !== 1 || bindings[0]._id !== binding._id) throw new Error("Invalid binding");
    const [player, group] = await Promise.all([ctx.db.get(binding.playerId), ctx.db.get(binding.groupId)]);
    if (!player || !group || player.groupId !== group._id) throw new Error("Invalid binding");
    const scope: unknown = JSON.parse(receipt.eventKey);
    if (!Array.isArray(scope) || scope.length !== 7 || JSON.stringify(scope.slice(0, 6)) !== JSON.stringify(["keiki-demo-trace", binding.agentId, binding.channel, binding.conversationId, binding.senderId, binding.lineId])) throw new Error("Invalid binding");
    const { authorized } = await ctx.runQuery(internal.ravo.consult.authorizeCachedDirective, {
      groupId: binding.groupId,
      playerId: binding.playerId,
      messageId: receipt.messageId,
      lineId: binding.lineId,
      agentKey: binding.lineId === "1" ? "common" : (JSON.parse(directiveJson) as { character: { agentKey: string } }).character.agentKey,
      directiveJson,
    });
    if (!authorized) throw new Error("Directive authorization denied");
    await ctx.db.patch(receiptId, { status: "completed", directiveJson });
    return null;
  },
});

export const uncertain = internalMutation({
  args: { receiptId: v.id("keikiReceipts") },
  returns: v.null(),
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (receipt?.status === "pending") await ctx.db.patch(receiptId, { status: "uncertain", failureCode: "consult_unavailable" });
    return null;
  },
});
