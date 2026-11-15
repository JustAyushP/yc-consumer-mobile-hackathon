import type { RoleKey } from "../../game/catalog";
import { planCast, type CastPlan, type Character } from "../director/casting";
import { buildCharacterContext } from "../director/context";
import type { StorySnapshot } from "../director/story";

export type Line = "1" | "2" | "3";
export type Requirements = {
  minAct: number;
  minDay: number;
  insights: readonly string[];
  clues: readonly string[];
  flags: Readonly<Record<string, boolean>>;
};
export type Sheet = Character & {
  publicIdentity: string;
  publicVoice: string;
  entry: Requirements;
  factKeys: readonly string[];
};
export type Fact = {
  key: string;
  text: string;
  audience: "group" | "player";
  clueKey?: string;
  requirements: Requirements;
};
export type CharacterContent = {
  caseKey: string;
  revision: string;
  common: Sheet;
  characters: readonly Sheet[];
  castPlan: CastPlan;
  facts: readonly Fact[];
};
export type Player = { id: string; role: RoleKey; roleOrdinal: number };
export type Assignment = { playerId: string; lineId: Line; agentKey: string };
export type Delivery = {
  playerId: string;
  lineId: Line;
  agentKey: string;
  factKey: string;
  contentRevision: string;
  status: "authorized" | "delivered";
};
export type Snapshot = {
  caseKey: string;
  contentRevision: string;
  story: StorySnapshot;
  players: readonly Player[];
  assignments: readonly Assignment[];
  deliveries: readonly Delivery[];
  entitledFacts: Readonly<Record<string, readonly string[]>>;
};
export type Request =
  | { kind: "assign"; expectedVersion: number; contentRevision: string; playerId: string; lineId: Line; agentKey: string; previousAgentKey: string | null }
  | { kind: "authorizeTestimony"; expectedVersion: number; contentRevision: string; playerId: string; lineId: Line; agentKey: string; factKey: string }
  | { kind: "recordDelivery"; expectedVersion: number; contentRevision: string; playerId: string; lineId: Line; agentKey: string; factKey: string; testimonyRevision: string; receiptId: string };

const roles: readonly RoleKey[] = ["forensic", "interrogator", "profiler", "archivist"];
const lines: readonly Line[] = ["1", "2", "3"];
const nonempty = (value: string) => typeof value === "string" && value.trim().length > 0;

export function validateContent(content: CharacterContent, requiredRoles: readonly RoleKey[]): string[] {
  const errors: string[] = [];
  const sheets = [content.common, ...content.characters];
  const keys = sheets.map((sheet) => sheet.agentKey);
  const factKeys = content.facts.map((fact) => fact.key);
  if (!nonempty(content.caseKey) || !nonempty(content.revision) || content.common.agentKey !== "common" || content.common.name !== "Sal, the night bartender") errors.push("Invalid case or common character");
  if (new Set(keys).size !== keys.length || new Set(factKeys).size !== factKeys.length) errors.push("Duplicate stable key");
  const validRequirements = (r: Requirements) => Number.isSafeInteger(r.minAct) && r.minAct >= 1 && Number.isSafeInteger(r.minDay) && r.minDay >= 1
    && r.insights.every(nonempty) && r.clues.every(nonempty) && Object.entries(r.flags).every(([key, value]) => nonempty(key) && typeof value === "boolean");
  for (const sheet of sheets) {
    if (![sheet.agentKey, sheet.name, sheet.publicIdentity, sheet.publicVoice].every(nonempty) || !validRequirements(sheet.entry)
      || new Set(sheet.factKeys).size !== sheet.factKeys.length || sheet.factKeys.some((key) => !factKeys.includes(key))) errors.push(`Invalid sheet: ${sheet.agentKey}`);
  }
  for (const fact of content.facts) {
    if (!nonempty(fact.key) || !nonempty(fact.text) || (fact.audience !== "group" && fact.audience !== "player")
      || (fact.clueKey !== undefined && !nonempty(fact.clueKey)) || !validRequirements(fact.requirements)) errors.push(`Invalid fact: ${fact.key}`);
  }
  for (const role of requiredRoles) {
    if (!roles.includes(role)) { errors.push(`Invalid role: ${role}`); continue; }
    for (const line of ["2", "3"] as const) {
      const options = content.castPlan[role]?.[line];
      if (!options?.length || new Set(options).size !== options.length || options.some((key) => !content.characters.some((sheet) => sheet.agentKey === key))) errors.push(`Invalid cast coverage: ${role}/${line}`);
    }
  }
  return errors;
}

function eligible(r: Requirements, story: StorySnapshot): boolean {
  return story.act >= r.minAct && story.day >= r.minDay
    && r.insights.every((key) => story.creditedInsights.includes(key))
    && r.clues.every((key) => story.unlockedClues.includes(key))
    && Object.entries(r.flags).every(([key, value]) => story.flags[key] === value);
}

function prepare(content: CharacterContent, snapshot: Snapshot, playerId: string, lineId: Line) {
  if (snapshot.caseKey !== content.caseKey || snapshot.contentRevision !== content.revision || !lines.includes(lineId) || !Number.isSafeInteger(snapshot.story.version) || snapshot.story.version < 0) throw new Error("Invalid snapshot");
  const errors = validateContent(content, snapshot.players.map((player) => player.role));
  if (errors.length) throw new Error(errors.join("; "));
  const matches = snapshot.players.filter((player) => player.id === playerId);
  if (matches.length !== 1 || !nonempty(playerId) || !Number.isSafeInteger(matches[0].roleOrdinal) || matches[0].roleOrdinal < 0) throw new Error("Invalid player");
  const casts = snapshot.assignments.filter((cast) => cast.playerId === playerId && cast.lineId === lineId);
  if (casts.length > 1) throw new Error("Ambiguous assignment");
  if (casts[0] && (lineId === "1" ? casts[0].agentKey !== "common" : !content.castPlan[matches[0].role]?.[lineId]?.includes(casts[0].agentKey))) throw new Error("Invalid assignment");
  return { player: matches[0], assignment: casts[0] };
}

export function planAssignment(content: CharacterContent, snapshot: Snapshot, playerId: string, lineId: Line, recastTo?: string): Request {
  const { player, assignment } = prepare(content, snapshot, playerId, lineId);
  if (lineId === "1" && assignment && assignment.agentKey !== content.common.agentKey) throw new Error("Invalid common assignment");
  if (assignment && recastTo === undefined) throw new Error("Already assigned");
  if (lineId === "1" && recastTo !== undefined) throw new Error("Common line cannot be recast");
  const eligiblePlan: CastPlan = lineId === "1" ? content.castPlan : {
    [player.role]: { [lineId]: content.castPlan[player.role]?.[lineId]?.filter((key) => {
      const candidate = content.characters.find((sheet) => sheet.agentKey === key);
      return candidate !== undefined && eligible(candidate.entry, snapshot.story);
    }) },
  };
  const planned = recastTo === undefined
    ? planCast({ lineId, role: player.role, roleOrdinal: player.roleOrdinal, commonCharacter: content.common, characters: content.characters, castPlan: eligiblePlan })
    : content.characters.find((sheet) => sheet.agentKey === recastTo && lineId !== "1" && content.castPlan[player.role]?.[lineId]?.includes(recastTo));
  const sheet = [content.common, ...content.characters].find((candidate) => candidate.agentKey === planned?.agentKey);
  if (!sheet || !eligible(sheet.entry, snapshot.story) || (recastTo !== undefined && (!assignment || assignment.agentKey === recastTo))) throw new Error("Character is not eligible");
  return { kind: "assign", expectedVersion: snapshot.story.version, contentRevision: content.revision, playerId, lineId, agentKey: sheet.agentKey, previousAgentKey: assignment?.agentKey ?? null };
}

function authorizedFact(content: CharacterContent, snapshot: Snapshot, playerId: string, lineId: Line, factKey: string) {
  const { assignment } = prepare(content, snapshot, playerId, lineId);
  const sheet = [content.common, ...content.characters].find((candidate) => candidate.agentKey === assignment?.agentKey);
  const fact = content.facts.find((candidate) => candidate.key === factKey);
  if (!assignment || !sheet || (lineId === "1" && sheet.agentKey !== "common") || (lineId !== "1" && sheet.agentKey === "common")
    || !eligible(sheet.entry, snapshot.story) || !fact || !sheet.factKeys.includes(fact.key) || !eligible(fact.requirements, snapshot.story)
    || (fact.clueKey !== undefined && !snapshot.story.unlockedClues.includes(fact.clueKey))
    || !Object.hasOwn(snapshot.entitledFacts, playerId) || !snapshot.entitledFacts[playerId].includes(fact.key)) throw new Error("Testimony not authorized");
  return { assignment, sheet, fact };
}

export function planTestimony(content: CharacterContent, snapshot: Snapshot, playerId: string, lineId: Line, factKey: string): Request {
  const { assignment } = authorizedFact(content, snapshot, playerId, lineId, factKey);
  if (snapshot.deliveries.some((item) => item.playerId === playerId && item.lineId === lineId && item.agentKey === assignment.agentKey && item.factKey === factKey && item.contentRevision === content.revision)) throw new Error("Testimony already authorized");
  return { kind: "authorizeTestimony", expectedVersion: snapshot.story.version, contentRevision: content.revision, playerId, lineId, agentKey: assignment.agentKey, factKey };
}

export function planDelivery(snapshot: Snapshot, playerId: string, lineId: Line, agentKey: string, factKey: string, testimonyRevision: string, receiptId: string): Request {
  const records = snapshot.deliveries.filter((item) => item.playerId === playerId && item.lineId === lineId && item.agentKey === agentKey && item.factKey === factKey && item.contentRevision === testimonyRevision);
  if (!lines.includes(lineId) || snapshot.players.filter((player) => player.id === playerId).length !== 1 || !nonempty(receiptId) || records.length !== 1 || records[0].status !== "authorized") throw new Error("Delivery not authorized");
  return { kind: "recordDelivery", expectedVersion: snapshot.story.version, contentRevision: snapshot.contentRevision, playerId, lineId, agentKey, factKey, testimonyRevision, receiptId };
}

export function planCatchUp(content: CharacterContent, snapshot: Snapshot, playerId: string): { nextRequest?: Request; awaitingDelivery: Delivery[] } {
  let nextRequest: Request | undefined;
  const awaitingDelivery: Delivery[] = [];
  for (const lineId of lines) {
    const { assignment, player } = prepare(content, snapshot, playerId, lineId);
    if (!assignment) {
      const available = lineId === "1" ? eligible(content.common.entry, snapshot.story) : content.castPlan[player.role]?.[lineId]?.some((key) => {
        const candidate = content.characters.find((sheet) => sheet.agentKey === key);
        return candidate !== undefined && eligible(candidate.entry, snapshot.story);
      });
      if (available && !nextRequest) nextRequest = planAssignment(content, snapshot, playerId, lineId);
      continue;
    }
    const sheet = [content.common, ...content.characters].find((candidate) => candidate.agentKey === assignment.agentKey);
    if (!sheet) throw new Error("Unknown assignment");
    for (const factKey of sheet.factKeys) {
      try {
        authorizedFact(content, snapshot, playerId, lineId, factKey);
      } catch { continue; }
      const records = snapshot.deliveries.filter((item) => item.playerId === playerId && item.lineId === lineId && item.agentKey === assignment.agentKey && item.factKey === factKey && item.contentRevision === content.revision);
      if (records.length > 1) throw new Error("Ambiguous delivery");
      if (records[0]?.status === "authorized") awaitingDelivery.push(records[0]);
      else if (!records.length && !nextRequest) nextRequest = planTestimony(content, snapshot, playerId, lineId, factKey);
    }
  }
  return { ...(nextRequest ? { nextRequest } : {}), awaitingDelivery };
}

export function buildPrivateContext(content: CharacterContent, snapshot: Snapshot, playerId: string, lineId: Line): string {
  const { assignment } = prepare(content, snapshot, playerId, lineId);
  if (!assignment) throw new Error("Missing assignment");
  const sheet = [content.common, ...content.characters].find((candidate) => candidate.agentKey === assignment.agentKey);
  if (!sheet || (lineId === "1" && sheet.agentKey !== "common") || (lineId !== "1" && sheet.agentKey === "common") || !eligible(sheet.entry, snapshot.story)) throw new Error("Invalid assignment");
  const facts = snapshot.deliveries.filter((item) => item.playerId === playerId && item.lineId === lineId && item.agentKey === sheet.agentKey && item.contentRevision === content.revision && (item.status === "authorized" || item.status === "delivered")).flatMap((item) => {
    try {
      const { fact } = authorizedFact(content, snapshot, playerId, lineId, item.factKey);
      return [{ text: fact.text, audience: fact.audience, ...(fact.audience === "player" ? { playerId } : {}), unlocked: true }];
    } catch { return []; }
  });
  return buildCharacterContext({ recipientId: playerId, character: sheet, publicIdentity: sheet.publicIdentity, publicVoice: sheet.publicVoice, facts });
}

export function reduceRequest(content: CharacterContent, snapshot: Snapshot, request: Request, verifiedReceiptId?: string): Snapshot {
  if (request.expectedVersion !== snapshot.story.version || request.contentRevision !== snapshot.contentRevision || request.contentRevision !== content.revision) throw new Error("Stale snapshot");
  if (request.kind === "assign") {
    const actual = planAssignment(content, snapshot, request.playerId, request.lineId, request.previousAgentKey === null ? undefined : request.agentKey);
    if (actual.kind !== "assign" || actual.agentKey !== request.agentKey || actual.previousAgentKey !== request.previousAgentKey) throw new Error("Assignment changed");
    return { ...snapshot, story: { ...snapshot.story, version: snapshot.story.version + 1 }, assignments: [...snapshot.assignments.filter((item) => item.playerId !== request.playerId || item.lineId !== request.lineId), { playerId: request.playerId, lineId: request.lineId, agentKey: request.agentKey }] };
  }
  if (request.kind === "authorizeTestimony") {
    const actual = planTestimony(content, snapshot, request.playerId, request.lineId, request.factKey);
    if (actual.kind !== "authorizeTestimony" || actual.agentKey !== request.agentKey) throw new Error("Assignment changed");
    return { ...snapshot, story: { ...snapshot.story, version: snapshot.story.version + 1 }, deliveries: [...snapshot.deliveries, { playerId: request.playerId, lineId: request.lineId, agentKey: request.agentKey, factKey: request.factKey, contentRevision: content.revision, status: "authorized" }] };
  }
  const actual = planDelivery(snapshot, request.playerId, request.lineId, request.agentKey, request.factKey, request.testimonyRevision, request.receiptId);
  if (actual.kind !== "recordDelivery" || actual.agentKey !== request.agentKey || verifiedReceiptId !== request.receiptId) throw new Error("Unverified delivery receipt");
  return { ...snapshot, story: { ...snapshot.story, version: snapshot.story.version + 1 }, deliveries: snapshot.deliveries.map((item) => item.playerId === request.playerId && item.lineId === request.lineId && item.agentKey === request.agentKey && item.factKey === request.factKey && item.contentRevision === request.testimonyRevision ? { ...item, status: "delivered" } : item) };
}
