import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { graph } from "./game/story/model";
import { segmentDefinition } from "./game/integration/segmentModel";

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
    contentRevision: v.optional(v.string()),
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
    requiredForSession: v.optional(v.boolean()),
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
    dayOpenedAt: v.optional(v.number()),
    gameTimeOffsetMs: v.optional(v.number()),
    hostId: v.optional(v.id("players")),
    progress: v.number(),
    wrongAccusations: v.number(),
    solvedBy: v.optional(v.id("players")),
    solvedDay: v.optional(v.number()),
    ravoThreadId: v.optional(v.string()),
    dailyTurnLimit: v.optional(v.number()),
    demoOnboarding: v.optional(v.boolean()),
  }).index("by_joinCode", ["joinCode"]).index("by_status", ["status"]),

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
    status: v.optional(v.union(v.literal("open"), v.literal("completed"), v.literal("missed"))),
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
    dailyTurnCharged: v.optional(v.boolean()),
    dailyTurn: v.optional(v.number()),
    dailyTurnLimit: v.optional(v.number()),
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
    lineId: v.optional(v.string()),
    answerId: v.optional(v.id("answers")),
    intakeCaseId: v.optional(v.id("cases")),
    intakeDay: v.optional(v.number()),
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

  storyStates: defineTable({
    groupId: v.id("groups"),
    version: v.number(),
    act: v.number(),
    doneBeats: v.array(v.string()),
    flags: v.record(v.string(), v.boolean()),
    lastProgressDay: v.number(),
    lastStallDay: v.optional(v.number()),
  }).index("by_group", ["groupId"]),

  storyInstances: defineTable({
    groupId: v.id("groups"), caseId: v.id("cases"), graph, route: v.optional(v.string()),
  }).index("by_group", ["groupId"]),

  storyDecisions: defineTable({
    groupId: v.id("groups"), key: v.string(), electorate: v.array(v.id("players")),
    deadline: v.number(), votes: v.array(v.object({ playerId: v.id("players"), optionKey: v.string() })),
    resolvedOption: v.optional(v.string()),
  }).index("by_group_key", ["groupId", "key"]).index("by_group", ["groupId"]),

  storyOperations: defineTable({
    groupId: v.id("groups"), eventKey: v.string(), operation: v.string(), payload: v.string(), version: v.number(),
  }).index("by_group_event", ["groupId", "eventKey"]),

  brainFixtures: defineTable({
    groupId: v.id("groups"), caseId: v.id("cases"), contentJson: v.string(),
  }).index("by_group", ["groupId"]),

  brainRecipients: defineTable({
    groupId: v.id("groups"), playerId: v.id("players"), lineId: v.string(), agentKey: v.string(),
    contentRevision: v.string(), authorizedFacts: v.array(v.string()), pendingAgentKey: v.optional(v.string()),
  }).index("by_player_line", ["playerId", "lineId"]),

  brainPacing: defineTable({ groupId: v.id("groups"), stateJson: v.string() }).index("by_group", ["groupId"]),

  brainSegments: defineTable({
    groupId: v.id("groups"), caseId: v.id("cases"), definitions: v.array(segmentDefinition), index: v.number(), completed: v.boolean(),
  }).index("by_group", ["groupId"]),

  brainDailyTurns: defineTable({ groupId: v.id("groups"), caseId: v.id("cases"), playerId: v.id("players"), day: v.number(), turns: v.number() })
    .index("by_player_day", ["playerId", "day"]),

  brainRecoveryReceipts: defineTable({
    messageId: v.id("messages"), groupId: v.id("groups"), caseId: v.id("cases"), playerId: v.id("players"),
    day: v.number(), insightKey: v.string(), text: v.string(), messageBody: v.string(), credited: v.boolean(),
    dailyTurn: v.optional(v.number()), dailyTurnLimit: v.optional(v.number()),
  }).index("by_message", ["messageId"]),

  commandReceipts: defineTable({
    messageId: v.id("messages"), groupId: v.id("groups"), caseId: v.id("cases"), playerId: v.id("players"),
    lineId: v.union(v.literal("1"), v.literal("2"), v.literal("3")), day: v.number(),
    dailyTurn: v.optional(v.number()), dailyTurnLimit: v.optional(v.number()),
    command: v.union(
      v.object({ kind: v.literal("survey"), answers: v.array(v.object({ questionKey: v.string(), optionIndex: v.number() })) }),
      v.object({ kind: v.literal("answer"), questionKey: v.string(), text: v.string() }),
      v.object({ kind: v.literal("ability"), targetKey: v.string() }),
      v.object({ kind: v.literal("hint"), insightKey: v.string() }),
      v.object({ kind: v.literal("accusation"), suspectKey: v.string(), reasoning: v.string() }),
    ),
    result: v.union(
      v.object({ kind: v.literal("survey"), value: v.null() }),
      v.object({ kind: v.literal("answer"), value: v.id("answers") }),
      v.object({ kind: v.literal("ability"), value: v.string() }),
      v.object({ kind: v.literal("hint"), value: v.boolean() }),
      v.object({ kind: v.literal("accusation"), value: v.object({ correct: v.boolean() }) }),
    ),
  }).index("by_message", ["messageId"]),

  storyEvents: defineTable({
    groupId: v.id("groups"),
    caseId: v.id("cases"),
    playerId: v.id("players"),
    messageId: v.id("messages"),
    lineId: v.string(),
    answerId: v.optional(v.id("answers")),
    questionKey: v.optional(v.string()),
    questionDay: v.optional(v.number()),
    sheetJson: v.string(),
    contentJson: v.string(),
    clueKeys: v.array(v.string()),
    insightKeys: v.array(v.string()),
    directiveJson: v.string(),
    integrationJson: v.optional(v.string()),
    dailyClosureDay: v.optional(v.number()),
    dailyTurn: v.optional(v.number()),
    dailyTurnDay: v.optional(v.number()),
    dailyTurnLimit: v.optional(v.number()),
  }).index("by_message", ["messageId"]).index("by_answer", ["answerId"]).index("by_group", ["groupId"]),

  viewerTokens: defineTable({
    token: v.string(),
    playerId: v.id("players"),
    groupId: v.id("groups"),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  keikiBindings: defineTable({
    agentId: v.string(),
    channel: v.string(),
    conversationId: v.string(),
    senderId: v.string(),
    lineId: v.string(),
    playerId: v.id("players"),
    groupId: v.id("groups"),
    active: v.boolean(),
  }).index("by_transport", ["agentId", "channel", "conversationId", "senderId", "lineId"])
    .index("by_player_line_active", ["playerId", "lineId", "active"]),

  pendingPlayerLinks: defineTable({
    tokenHash: v.string(),
    groupId: v.id("groups"),
    playerId: v.id("players"),
    agentId: v.string(),
    botId: v.string(),
    lineId: v.literal("1"),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    bindingId: v.optional(v.id("keikiBindings")),
  }).index("by_token_hash", ["tokenHash"]),

  demoOnboardingSessions: defineTable({
    sessionHash: v.string(),
    expiresAt: v.number(),
    failedJoins: v.number(),
    payloadHash: v.optional(v.string()),
    groupId: v.optional(v.id("groups")),
    playerId: v.optional(v.id("players")),
    linkId: v.optional(v.id("pendingPlayerLinks")),
    viewerId: v.optional(v.id("viewerTokens")),
  }).index("by_session_hash", ["sessionHash"]),

  demoOnboardingBudget: defineTable({
    key: v.literal("demo"),
    sessions: v.number(),
    groups: v.number(),
    hour: v.number(),
    hourlySessions: v.number(),
  }).index("by_key", ["key"]),

  keikiReceipts: defineTable({
    eventKey: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("uncertain")),
    messageId: v.id("messages"),
    bindingId: v.id("keikiBindings"),
    directiveJson: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  }).index("by_eventKey", ["eventKey"]),

  narration: defineTable({
    groupId: v.id("groups"),
    playerId: v.optional(v.id("players")),
    kind: vMessageKind,
    body: v.string(),
    clueKey: v.optional(v.string()),
    segmentIndex: v.optional(v.number()),
  }).index("by_group", ["groupId"]),

  warnings: defineTable({
    groupId: v.id("groups"),
    playerId: v.id("players"),
    day: v.number(),
    kind: v.union(v.literal("lagging"), v.literal("missed")),
  })
    .index("by_group", ["groupId"])
    .index("by_player", ["playerId"]),
});
