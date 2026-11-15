import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const vRoleKey = v.union(v.literal("forensic"), v.literal("interrogator"), v.literal("profiler"), v.literal("archivist"));
export const vGroupStatus = v.union(v.literal("lobby"), v.literal("active"), v.literal("solved"));
export const vMessageKind = v.union(
  v.literal("chat"),
  v.literal("ravo"),
  v.literal("clue"),
  v.literal("hint"),
  v.literal("notice"),
  v.literal("warning"),
  v.literal("intro"),
  v.literal("day"),
  v.literal("accusation"),
  v.literal("reveal"),
);
export const vMessageSource = v.union(v.literal("app"), v.literal("keiki"), v.literal("ravo"));
export const vUnlock = v.union(v.object({ day: v.number() }), v.object({ insight: v.string() }));

export default defineSchema({
  // ---- Case content (seeded from convex/cases, read-only at runtime) ----
  cases: defineTable({
    key: v.string(),
    title: v.string(),
    setting: v.string(),
    victim: v.string(),
    logline: v.string(),
    culpritKey: v.string(),
    reveal: v.array(v.string()),
  }).index("by_key", ["key"]),

  suspects: defineTable({
    caseId: v.id("cases"),
    key: v.string(),
    name: v.string(),
    title: v.string(),
    bio: v.string(),
    interrogation: v.string(),
    profile: v.string(),
    records: v.string(),
  }).index("by_case", ["caseId"]),

  clues: defineTable({
    caseId: v.id("cases"),
    key: v.string(),
    name: v.string(),
    kind: v.string(),
    summary: v.string(),
    detail: v.string(),
    unlock: vUnlock,
  }).index("by_case", ["caseId"]),

  insights: defineTable({
    caseId: v.id("cases"),
    key: v.string(),
    label: v.string(),
    weight: v.number(),
    keywords: v.array(v.array(v.string())),
    hint: v.string(),
  }).index("by_case", ["caseId"]),

  days: defineTable({
    caseId: v.id("cases"),
    day: v.number(),
    title: v.string(),
    briefing: v.string(),
  }).index("by_case_day", ["caseId", "day"]),

  questions: defineTable({
    caseId: v.id("cases"),
    day: v.number(),
    key: v.string(),
    prompt: v.string(),
    reference: v.string(),
    insightKeys: v.array(v.string()),
  }).index("by_case_day", ["caseId", "day"]),

  roles: defineTable({
    key: vRoleKey,
    title: v.string(),
    tagline: v.string(),
    skills: v.array(v.string()),
    abilityName: v.string(),
    abilityDescription: v.string(),
    abilityTarget: v.union(v.literal("clue"), v.literal("suspect")),
  }).index("by_key", ["key"]),

  // ---- Live game state ----
  groups: defineTable({
    name: v.string(),
    joinCode: v.string(),
    caseId: v.id("cases"),
    status: vGroupStatus,
    day: v.number(),
    hostId: v.optional(v.id("players")),
    progress: v.number(),
    wrongAccusations: v.number(),
    solvedBy: v.optional(v.id("players")),
    solvedDay: v.optional(v.number()),
    ravoThreadId: v.optional(v.string()),
  }).index("by_joinCode", ["joinCode"]),

  players: defineTable({
    groupId: v.id("groups"),
    name: v.string(),
    phone: v.optional(v.string()),
    roleKey: v.optional(vRoleKey),
    roleBlurb: v.optional(v.string()),
    joinedDay: v.number(),
    lateJoiner: v.boolean(),
  })
    .index("by_group", ["groupId"])
    .index("by_phone", ["phone"]),

  surveyAnswers: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    questionKey: v.string(),
    optionIndex: v.number(),
  }).index("by_player", ["playerId"]),

  sessions: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    day: v.number(),
    completed: v.boolean(),
    abilityTarget: v.optional(v.string()),
    abilityResult: v.optional(v.string()),
  })
    .index("by_player_day", ["playerId", "day"])
    .index("by_group_day", ["groupId", "day"]),

  answers: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    day: v.number(),
    questionKey: v.string(),
    text: v.string(),
    score: v.optional(v.number()),
    verdict: v.optional(v.string()),
  })
    .index("by_player_day", ["playerId", "day"])
    .index("by_group", ["groupId"]),

  messages: defineTable({
    groupId: v.id("groups"),
    kind: vMessageKind,
    source: vMessageSource,
    playerId: v.optional(v.id("players")),
    body: v.string(),
    meta: v.optional(v.string()),
    externalId: v.optional(v.string()),
    agentKey: v.optional(v.string()),
  })
    .index("by_group", ["groupId"])
    .index("by_player_agent", ["playerId", "agentKey"])
    .index("by_externalId", ["externalId"]),

  clueUnlocks: defineTable({
    groupId: v.id("groups"),
    clueKey: v.string(),
    day: v.number(),
  }).index("by_group", ["groupId"]),

  progress: defineTable({
    groupId: v.id("groups"),
    insightKey: v.string(),
    playerId: v.optional(v.id("players")),
    day: v.number(),
  }).index("by_group", ["groupId"]),

  hints: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    week: v.number(),
    day: v.number(),
    insightKey: v.string(),
    body: v.string(),
  }).index("by_group_week", ["groupId", "week"]),

  casts: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    lineId: v.string(),
    agentKey: v.string(),
  }).index("by_player_line", ["playerId", "lineId"]),

  viewerTokens: defineTable({
    token: v.string(),
    playerId: v.id("players"),
    groupId: v.id("groups"),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  warnings: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    day: v.number(),
    kind: v.union(v.literal("lagging"), v.literal("missed")),
  })
    .index("by_group", ["groupId"])
    .index("by_player", ["playerId"]),
});
