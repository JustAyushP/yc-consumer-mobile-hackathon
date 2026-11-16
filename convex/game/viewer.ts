import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { ROLES } from "./catalog";
import { groupPlayers, hintsLeft, requireViewer } from "./lib";
import { segmentAccess } from "./integration/access";
import { SF_CONTENT_REVISION } from "../cases/sfCandidate";

// The read-only app's API. Every public function in the backend lives here, and each one is scoped by viewerToken.

const NARRATION = ["day", "clue", "intro", "hint", "warning", "reveal"] as const;

/** Mints the personal link token Comms texts to a player. The app reads it from a deep link or ?t= on web. */
export const mintToken = internalMutation({
  args: { playerId: v.id("players"), ttlHours: v.optional(v.number()) },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { playerId, ttlHours }) => {
    const player = await ctx.db.get(playerId);
    if (!player) throw new Error("Unknown detective");
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const expiresAt = Date.now() + (ttlHours ?? 24 * 14) * 3600 * 1000;
    await ctx.db.insert("viewerTokens", { token, playerId, groupId: player.groupId, expiresAt });
    return { token, expiresAt };
  },
});

/** Role card: who you are, your role, its skills and ability. */
export const me = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    return {
      name: player.name,
      lateJoiner: player.lateJoiner,
      role: player.roleKey ? { ...ROLES[player.roleKey], blurb: player.roleBlurb ?? null } : null,
      group: { name: group.name, joinCode: group.joinCode, status: group.status, day: group.day, progress: group.progress },
    };
  },
});

/** Case file: the case header and the suspects. */
export const caseFile = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    await segmentAccess(ctx, group);
    const kase = (await ctx.db.get(group.caseId))!;
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    return {
      title: kase.title,
      setting: kase.setting,
      victim: kase.victim,
      logline: kase.logline,
      suspects: suspects.map((s) => ({ key: s.key, name: s.name, title: s.title, bio: s.bio })),
    };
  },
});

/** Evidence board: unlocked clues, the team's deductions, and the viewer's own ability results. */
export const board = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const clues = await ctx.db.query("clues").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const insights = await ctx.db.query("insights").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    const found = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const sessions = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", player._id)).collect();
    const segment = await segmentAccess(ctx, group);
    const questions = segment ? await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect() : [];
    const visibleInsights = new Set(questions.filter((question) => segment?.questionKeys.includes(question.key)).flatMap((question) => question.insightKeys));
    return {
      clues: unlocks.filter((u) => !segment || segment.clueKeys.includes(u.clueKey)).map((u) => {
        const c = clues.find((x) => x.key === u.clueKey)!;
        return { key: c.key, name: c.name, kind: c.kind, summary: c.summary, day: u.day };
      }),
      deductions: found.filter((f) => !segment || visibleInsights.has(f.insightKey)).map((f) => ({ key: f.insightKey, label: insights.find((i) => i.key === f.insightKey)?.label ?? f.insightKey, day: f.day })),
      myFindings: sessions.filter((s) => s.abilityResult && (!segment || (s.abilityTarget !== undefined && segment.abilityTargets.includes(s.abilityTarget)))).map((s) => ({ day: s.day, target: s.abilityTarget!, result: s.abilityResult! })),
    };
  },
});

/** The story so far: RAVO's narration for the group (day intros, clue drops, intros, hints, warnings, reveal). Never player chat. */
export const story = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const rows = await ctx.db.query("messages").withIndex("by_group", (q) => q.eq("groupId", group._id)).order("desc").take(300);
    const narration = await ctx.db.query("narration").withIndex("by_group", (q) => q.eq("groupId", group._id)).order("desc").take(300);
    const segment = await segmentAccess(ctx, group);
    const caseRecord = segment && await ctx.db.get(group.caseId);
    const revealAllowed = group.status === "solved" && (caseRecord?.contentRevision !== SF_CONTENT_REVISION || (segment?.index === 7 && segment.completed));
    return [...rows.filter((m) => (NARRATION as readonly string[]).includes(m.kind) && !m.agentKey && (m.kind === "intro" || !m.playerId || m.playerId === player._id) &&
      (!segment || (m.kind !== "day" && m.kind !== "clue" && (m.kind !== "reveal" || revealAllowed)))),
      ...narration.filter((m) => (!m.playerId || m.playerId === player._id) && (!segment ||
        (m.kind === "day" ? m.segmentIndex !== undefined && m.segmentIndex <= segment.index : m.kind === "clue" ? m.clueKey !== undefined && segment.clueKeys.includes(m.clueKey) : m.kind !== "reveal" || revealAllowed)))]
      .map((m) => ({ _id: m._id, kind: m.kind, body: m.body, at: m._creationTime }))
      .sort((a, b) => a.at - b.at).slice(-300);
  },
});

/** Team progress and pace: the progress score, hints left, and each detective's role, status today, and marks. */
export const team = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const players = await groupPlayers(ctx, group._id);
    const warnings = await ctx.db.query("warnings").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
    const today = await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", group._id).eq("day", group.day)).collect();
    return {
      day: group.day,
      progress: group.progress,
      hintsLeft: await hintsLeft(ctx, group),
      detectives: players.map((p) => ({
        id: p._id,
        isMe: p._id === player._id,
        name: p.name,
        roleTitle: p.roleKey ? ROLES[p.roleKey].title : null,
        lateJoiner: p.lateJoiner,
        doneToday: today.some((s) => s.playerId === p._id && s.completed),
        lagging: warnings.some((w) => w.playerId === p._id && w.kind === "lagging" && w.day === group.day),
        missedDays: warnings.filter((w) => w.playerId === p._id && w.kind === "missed").map((w) => w.day),
      })),
    };
  },
});

export const history = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const sessions = await ctx.db.query("sessions").withIndex("by_player_day", (q) => q.eq("playerId", player._id)).collect();
    const warnings = await ctx.db.query("warnings").withIndex("by_player", (q) => q.eq("playerId", player._id)).collect();
    const missed = new Set(warnings.filter((w) => w.groupId === group._id && w.kind === "missed").map((w) => w.day));
    const history = sessions.filter((s) => s.groupId === group._id).map((s) => ({ day: s.day, completed: s.completed, status: s.completed ? "completed" : (s.status === "missed" || missed.has(s.day) ? "missed" : "open") }));
    for (const day of missed) if (!history.some((s) => s.day === day)) history.push({ day, completed: false, status: "missed" });
    return history.sort((a, b) => a.day - b.day);
  },
});

export const hints = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { player, group } = await requireViewer(ctx, viewerToken);
    const rows = await ctx.db.query("hints").withIndex("by_group_week", (q) => q.eq("groupId", group._id)).collect();
    const segment = await segmentAccess(ctx, group);
    const questions = segment ? await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect() : [];
    const visibleInsights = new Set(questions.filter((question) => segment?.questionKeys.includes(question.key)).flatMap((question) => question.insightKeys));
    return rows.filter((h) => h.playerId === player._id && (!segment || visibleInsights.has(h.insightKey))).map((h) => ({ day: h.day, week: h.week, body: h.body }));
  },
});

/** The day timeline: every case day with its title, and whether it is past, today, or ahead. */
export const timeline = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    const days = await ctx.db.query("days").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId)).collect();
    const segment = await segmentAccess(ctx, group);
    return days.map((d) => ({
      day: d.day,
      title: !segment && d.day <= group.day ? d.title : null,
      state: d.day < group.day ? ("past" as const) : d.day === group.day ? ("today" as const) : ("ahead" as const),
    }));
  },
});

/** The full story, once the case is solved. */
export const reveal = query({
  args: { viewerToken: v.string() },
  handler: async (ctx, { viewerToken }) => {
    const { group } = await requireViewer(ctx, viewerToken);
    if (group.status !== "solved") return null;
    const segment = await segmentAccess(ctx, group);
    const kase = (await ctx.db.get(group.caseId))!;
    if (kase.contentRevision === SF_CONTENT_REVISION && (!segment || segment.index !== 7 || !segment.completed)) return null;
    const culprit = (await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect()).find((s) => s.key === kase.culpritKey);
    const solver = group.solvedBy ? await ctx.db.get(group.solvedBy) : null;
    return { culprit: culprit?.name ?? kase.culpritKey, story: kase.reveal, solvedBy: solver?.name ?? null, solvedDay: group.solvedDay ?? null };
  },
});
