import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { buildPrivateContext, planAssignment, planTestimony, reduceRequest, type Line, type Snapshot } from "../../ravo/characters/lifecycle";
import { initialPacingState, planPacing, type PacingState } from "../../ravo/pacing/planner";
import { selectReviewedOption } from "../../ravo/model/adapter";
import type { RavoDirective } from "../../ravo/types";
import type { FixtureContent } from "./fixtures";
import { projectedDay } from "../engine";
import { advanceSegment } from "./segments";
import { verifiedSfGroup } from "./sf";
import { SF_CONTENT_REVISION } from "../../cases/sfCandidate";

const planNext = makeFunctionReference<"mutation", { groupId: Id<"groups"> }, { version: number; beatKey: string | null }>("game/story/engine:planNext");
const transition = makeFunctionReference<"mutation", { groupId: Id<"groups">; beatKey: string; eventKey: string; expectedVersion: number }, number>("game/story/engine:transition");
const openDecision = makeFunctionReference<"mutation", { groupId: Id<"groups">; decisionKey: string; eventKey: string; expectedVersion: number }, number>("game/story/engine:openDecision");
const resolveDeadline = makeFunctionReference<"mutation", { groupId: Id<"groups">; decisionId: Id<"storyDecisions">; eventKey: string; expectedVersion: number }, number>("game/story/engine:resolveDeadline");

async function entitlement(ctx: QueryCtx, event: { groupId: Id<"groups">; playerId: Id<"players">; messageId: Id<"messages">; lineId: string; questionKey?: string; questionDay?: number }) {
  const group = await ctx.db.get(event.groupId);
  const player = await ctx.db.get(event.playerId);
  const message = await ctx.db.get(event.messageId);
  const fixture = await ctx.db.query("brainFixtures").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).unique();
  const instance = await ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).unique();
  const state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).unique();
  const recipient = await ctx.db.query("brainRecipients").withIndex("by_player_line", (q) => q.eq("playerId", event.playerId).eq("lineId", event.lineId)).unique();
  const segments = await ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", event.groupId)).unique();
  const cast = event.lineId === "1" ? null : await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", event.playerId).eq("lineId", event.lineId)).unique();
  if (!group || group.status !== "active" || !player || player.groupId !== group._id || !message || message.groupId !== group._id || message.playerId !== player._id || message.lineId !== event.lineId || message.source !== "keiki" || message.kind !== "chat" || !fixture || fixture.caseId !== group.caseId || !instance || instance.caseId !== group.caseId || !state || !recipient || recipient.groupId !== group._id || (event.lineId !== "1" && (!cast || cast.groupId !== group._id || cast.agentKey !== recipient.agentKey))) return null;
  const caseRecord = await ctx.db.get(group.caseId);
  const content = JSON.parse(fixture.contentJson) as FixtureContent;
  if (!caseRecord || caseRecord.key !== content.characters.caseKey) return null;
  if ((caseRecord.contentRevision === SF_CONTENT_REVISION || content.characters.revision === SF_CONTENT_REVISION) && !await verifiedSfGroup(ctx, group._id, group.caseId)) return null;
  if (event.lineId !== "1") {
    const sheet = content.characters.characters.find((item) => item.agentKey === recipient.agentKey);
    const suspects = await ctx.db.query("suspects").withIndex("by_case", (q) => q.eq("caseId", group.caseId)).collect();
    if (!sheet || !suspects.some((suspect) => suspect.key === sheet.agentKey && suspect.name === sheet.name)) return null;
  }
  const [progress, unlocks, decisions] = await Promise.all([
    ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
    ctx.db.query("storyDecisions").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect(),
  ]);
  let question = null;
  if (event.questionKey !== undefined && event.questionDay !== undefined) {
    const answers = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", event.questionDay!)).collect();
    const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", event.questionDay!)).collect();
    if (projectedDay(group) !== event.questionDay || answers.some((answer) => answer.questionKey === event.questionKey)) return null;
    question = questions.find((item) => item.key === event.questionKey)?.prompt ?? null;
    if (!question) return null;
  }
  return JSON.stringify({ caseId: group.caseId, day: projectedDay(group), role: player.roleKey, fixture: fixture.contentJson,
    message: { body: message.body, agentKey: message.agentKey ?? null, answerId: message.answerId ?? null, intakeCaseId: message.intakeCaseId ?? null, intakeDay: message.intakeDay ?? null },
    graph: instance.graph, route: instance.route ?? null, segments: segments ? { caseId: segments.caseId, definitions: segments.definitions, index: segments.index, completed: segments.completed } : null, state: { act: state.act, flags: state.flags, doneBeats: state.doneBeats },
    recipient: { agentKey: recipient.agentKey, contentRevision: recipient.contentRevision, authorizedFacts: recipient.authorizedFacts, pendingAgentKey: recipient.pendingAgentKey ?? null },
    progress: progress.map((p) => p.insightKey).sort(), unlocks: unlocks.map((u) => u.clueKey).sort(), decisions: decisions.map((decision) => ({ id: decision._id, key: decision.key, deadline: decision.deadline, resolvedOption: decision.resolvedOption ?? null, eligible: decision.electorate.includes(player._id), voted: decision.votes.some((vote) => vote.playerId === player._id) })),
    openDecisions: decisions.filter((decision) => !decision.resolvedOption && decision.deadline > Date.now() + (group.gameTimeOffsetMs ?? 0)).map((decision) => decision._id), question });
}

export async function authorizeIntegratedReplay(ctx: QueryCtx, event: Doc<"storyEvents">): Promise<boolean> {
  return !!event.integrationJson && event.integrationJson === await entitlement(ctx, event);
}

export async function processIntegratedTurn(ctx: MutationCtx, args: {
  group: Doc<"groups">; player: Doc<"players">; messageId: Id<"messages">; lineId: Line; agentKey?: string;
  answerId?: Id<"answers">; progressDelta: number; fixture: Doc<"brainFixtures">; admitted?: { turn: number; limit: number };
}): Promise<RavoDirective> {
  const { group, player, lineId, fixture } = args;
  if (fixture.caseId !== group.caseId) throw new Error("Fixture case changed");
  const content = JSON.parse(fixture.contentJson) as FixtureContent;
  const segmentState = await ctx.db.query("brainSegments").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  const expired = await ctx.db.query("storyDecisions").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  let priorState = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  if (!priorState) throw new Error("Missing story");
  for (const decision of expired) {
    if (!decision.resolvedOption && decision.deadline <= Date.now() + (group.gameTimeOffsetMs ?? 0)) {
      const version: number = await ctx.runMutation(resolveDeadline, { groupId: group._id, decisionId: decision._id, eventKey: `consult-deadline:${decision._id}`, expectedVersion: priorState.version });
      priorState = { ...priorState, version };
    }
  }
  const segment = segmentState ? await advanceSegment(ctx, group, segmentState) : null;
  const next = await ctx.runMutation(planNext, { groupId: group._id });
  if (next.beatKey && (!segment || (segment.active && !segment.completed && segment.active.beatKeys.includes(next.beatKey)))) await ctx.runMutation(transition, { groupId: group._id, beatKey: next.beatKey, eventKey: `consult-beat:${args.messageId}`, expectedVersion: next.version });
  let state = await ctx.db.query("storyStates").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  const instance = await ctx.db.query("storyInstances").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  if (!state || !instance) throw new Error("Missing story");
  let decisions = await ctx.db.query("storyDecisions").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  const unopened = instance.graph.decisions.find((item) => state!.doneBeats.includes(item.requiredBeat) && !decisions.some((decision) => decision.key === item.key));
  if (unopened && (!segment || (segment.active && !segment.completed)) && !decisions.some((decision) => !decision.resolvedOption)) {
    await ctx.runMutation(openDecision, { groupId: group._id, decisionKey: unopened.key, eventKey: `consult-open:${args.messageId}`, expectedVersion: state.version });
    state = (await ctx.db.get(state._id))!;
    decisions = await ctx.db.query("storyDecisions").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  }
  const players = await ctx.db.query("players").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  const progress = await ctx.db.query("progress").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  const unlocks = await ctx.db.query("clueUnlocks").withIndex("by_group", (q) => q.eq("groupId", group._id)).collect();
  const recipient = await ctx.db.query("brainRecipients").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", lineId)).unique();
  if (!player.roleKey && lineId !== "1") throw new Error("Role required for character entry");
  const role = player.roleKey ?? "forensic";
  const roleOrdinal = players.filter((p) => (p.roleKey ?? "forensic") === role).findIndex((p) => p._id === player._id);
  const snapshot: Snapshot = {
    caseKey: content.characters.caseKey, contentRevision: content.characters.revision,
    story: { day: group.day, act: state.act, version: state.version, doneBeats: state.doneBeats, flags: state.flags, creditedInsights: progress.map((p) => p.insightKey), unlockedClues: unlocks.map((u) => u.clueKey) },
    players: [{ id: player._id, role, roleOrdinal }],
    assignments: recipient ? [{ playerId: player._id, lineId, agentKey: recipient.agentKey }] : [],
    deliveries: recipient ? recipient.authorizedFacts.map((factKey) => ({ playerId: player._id, lineId, agentKey: recipient.agentKey, factKey, contentRevision: recipient.contentRevision, status: "authorized" as const })) : [],
    entitledFacts: { [player._id]: player.roleKey ? (content.roleFacts[role] ?? []).filter((key) => !segment || segment.active?.factKeys.includes(key)) : [] },
  };
  let current = snapshot;
  if (!recipient) current = reduceRequest(content.characters, current, planAssignment(content.characters, current, player._id, lineId));
  else if (recipient.pendingAgentKey && args.agentKey === recipient.pendingAgentKey) current = reduceRequest(content.characters, current, planAssignment(content.characters, current, player._id, lineId, recipient.pendingAgentKey));
  const assignment = current.assignments[0];
  if (!assignment || (args.agentKey && args.agentKey !== assignment.agentKey)) throw new Error("Invalid conversation");
  if (lineId !== "1") {
    const cast = await ctx.db.query("casts").withIndex("by_player_line", (q) => q.eq("playerId", player._id).eq("lineId", lineId)).unique();
    if (cast && (cast.groupId !== group._id || (cast.agentKey !== assignment.agentKey && cast.agentKey !== recipient?.agentKey))) throw new Error("Cast changed");
    if (cast && cast.agentKey !== assignment.agentKey) await ctx.db.patch(cast._id, { agentKey: assignment.agentKey });
    if (!cast) await ctx.db.insert("casts", { groupId: group._id, playerId: player._id, lineId, agentKey: assignment.agentKey });
  }
  const sheet = [content.characters.common, ...content.characters.characters].find((item) => item.agentKey === assignment.agentKey)!;
  for (const factKey of sheet.factKeys) {
    if (current.deliveries.some((item) => item.agentKey === assignment.agentKey && item.factKey === factKey && item.contentRevision === content.characters.revision)) continue;
    try { current = reduceRequest(content.characters, current, planTestimony(content.characters, current, player._id, lineId, factKey)); } catch { continue; }
  }
  const authorizedFacts = current.deliveries.filter((item) => item.agentKey === assignment.agentKey && item.contentRevision === content.characters.revision).map((item) => item.factKey);
  if (recipient) await ctx.db.patch(recipient._id, { agentKey: assignment.agentKey, pendingAgentKey: assignment.agentKey === recipient.pendingAgentKey ? undefined : recipient.pendingAgentKey, contentRevision: content.characters.revision, authorizedFacts });
  else await ctx.db.insert("brainRecipients", { groupId: group._id, playerId: player._id, lineId, agentKey: assignment.agentKey, contentRevision: content.characters.revision, authorizedFacts });
  if (current.story.version !== state.version) await ctx.db.patch(state._id, { version: current.story.version });
  const privateContext = buildPrivateContext(content.characters, current, player._id, lineId);
  const pending = decisions.find((decision) => !decision.resolvedOption && decision.deadline > Date.now() + (group.gameTimeOffsetMs ?? 0) && decision.electorate.includes(player._id) && !decision.votes.some((vote) => vote.playerId === player._id));
  const definition = pending && instance.graph.decisions.find((item) => item.key === pending.key);
  const resolved = decisions.filter((item) => item.resolvedOption).at(-1);
  const resolvedDefinition = resolved && instance.graph.decisions.find((item) => item.key === resolved.key);
  const outcome = resolvedDefinition?.options.find((item) => item.key === resolved?.resolvedOption)?.publicLabel;
  const directive: RavoDirective = { character: { agentKey: sheet.agentKey, name: sheet.name }, guidance: `Scripted guidance (no live model):\n${privateContext}`, tone: "noir", endTurn: false, progressDelta: args.progressDelta };
  if (segment?.text) directive.guidance += `\n${segment.text}`;
  if (!segment || (segment.active && !segment.completed)) {
    if (definition) directive.guidance += `\nDecision: ${definition.publicLabel}\n${definition.options.map((option, index) => `${index + 1}. ${option.publicLabel}`).join("\n")}`;
    else if (outcome) directive.guidance += `\nDecision result: ${outcome}`;
  }
  const sessions = await ctx.db.query("sessions").withIndex("by_group_day", (q) => q.eq("groupId", group._id)).collect();
  const revision = progress.length;
  const pacingRow = await ctx.db.query("brainPacing").withIndex("by_group", (q) => q.eq("groupId", group._id)).unique();
  const prior = pacingRow ? JSON.parse(pacingRow.stateJson) as PacingState : null;
  const pacingSnapshot = { groupId: group._id, caseId: group.caseId, day: group.day, progressRevision: revision,
    lastProgressDay: Math.max(prior?.lastProgressDay ?? state.lastProgressDay, ...progress.map((item) => item.day)),
    players: players.map((p) => ({ playerId: p._id, joinedDay: Math.max(1, p.joinedDay), missedSessionDays: sessions.filter((s) => s.playerId === p._id && s.status === "missed" && s.day < group.day).map((s) => s.day) })) };
  const questions = await ctx.db.query("questions").withIndex("by_case_day", (q) => q.eq("caseId", group.caseId).eq("day", group.day)).collect();
  const answers = await ctx.db.query("answers").withIndex("by_player_day", (q) => q.eq("playerId", player._id).eq("day", group.day)).collect();
  const eligibleQuestions = questions.filter((q) => (!segment || segment.active?.questionKeys.includes(q.key)) && !answers.some((answer) => answer.questionKey === q.key));
  const plan = segment?.index === 7 && segment.completed ? null : planPacing(pacingSnapshot, prior ?? initialPacingState(pacingSnapshot), content.pacing, { id: args.messageId, playerId: player._id, eligibleQuestions });
  if (plan && pacingRow) await ctx.db.patch(pacingRow._id, { stateJson: JSON.stringify(plan.nextState) });
  else if (plan) await ctx.db.insert("brainPacing", { groupId: group._id, stateJson: JSON.stringify(plan.nextState) });
  let questionKey: string | undefined;
  if (plan?.plan?.intervention.kind === "question") {
    questionKey = plan.plan.intervention.questionKey;
    directive.nextQuestion = eligibleQuestions.find((item) => item.key === questionKey)?.prompt;
  } else if (plan?.plan?.intervention.kind === "nudge") {
    const selection = await selectReviewedOption({ options: content.nudges.map((text, index) => ({ id: String(index), text })), offline: true, provider: async () => undefined });
    if (selection) directive.guidance += `\n${selection.option.text}`;
  } else if (plan?.plan?.intervention.kind === "catchUp") directive.guidance += "\nWelcome the detective and help them catch up on available evidence.";
  else if (plan?.plan?.intervention.kind === "lag") directive.guidance += "\nEncourage the detective to revisit their available questions.";
  const event = { groupId: group._id, playerId: player._id, messageId: args.messageId, lineId, questionKey, questionDay: questionKey ? group.day : undefined };
  const integrationJson = await entitlement(ctx, event);
  if (!integrationJson) throw new Error("Unable to authorize directive");
  await ctx.db.insert("storyEvents", { ...event, caseId: group.caseId, answerId: args.answerId,
    sheetJson: "null", contentJson: "{}", clueKeys: [], insightKeys: [], directiveJson: JSON.stringify(directive), integrationJson,
    dailyTurn: args.admitted?.turn, dailyTurnDay: args.admitted ? group.day : undefined, dailyTurnLimit: args.admitted?.limit });
  return directive;
}
