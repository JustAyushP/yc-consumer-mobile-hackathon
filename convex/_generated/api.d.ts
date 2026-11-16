/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cases_installSf from "../cases/installSf.js";
import type * as cases_seed from "../cases/seed.js";
import type * as cases_sfCandidate from "../cases/sfCandidate.js";
import type * as cases_sfContent from "../cases/sfContent.js";
import type * as cases_sfFixtures from "../cases/sfFixtures.js";
import type * as cases_sfSegments from "../cases/sfSegments.js";
import type * as cases_velvetLantern from "../cases/velvetLantern.js";
import type * as chat_answerCommand from "../chat/answerCommand.js";
import type * as chat_bindings from "../chat/bindings.js";
import type * as chat_harness from "../chat/harness.js";
import type * as chat_keikiHandler from "../chat/keikiHandler.js";
import type * as chat_keikiIngress from "../chat/keikiIngress.js";
import type * as chat_messages from "../chat/messages.js";
import type * as crons from "../crons.js";
import type * as game_accuse from "../game/accuse.js";
import type * as game_catalog from "../game/catalog.js";
import type * as game_commands_dispatch from "../game/commands/dispatch.js";
import type * as game_commands_reviewedHints from "../game/commands/reviewedHints.js";
import type * as game_engine from "../game/engine.js";
import type * as game_groups from "../game/groups.js";
import type * as game_integration_access from "../game/integration/access.js";
import type * as game_integration_daily from "../game/integration/daily.js";
import type * as game_integration_fixtureCaller from "../game/integration/fixtureCaller.js";
import type * as game_integration_fixtures from "../game/integration/fixtures.js";
import type * as game_integration_recast from "../game/integration/recast.js";
import type * as game_integration_recoverDeduction from "../game/integration/recoverDeduction.js";
import type * as game_integration_results from "../game/integration/results.js";
import type * as game_integration_runtime from "../game/integration/runtime.js";
import type * as game_integration_segmentModel from "../game/integration/segmentModel.js";
import type * as game_integration_segments from "../game/integration/segments.js";
import type * as game_integration_sf from "../game/integration/sf.js";
import type * as game_integration_sfEvidence from "../game/integration/sfEvidence.js";
import type * as game_integration_sfInvitations from "../game/integration/sfInvitations.js";
import type * as game_lib from "../game/lib.js";
import type * as game_roles from "../game/roles.js";
import type * as game_runtime from "../game/runtime.js";
import type * as game_session from "../game/session.js";
import type * as game_story_engine from "../game/story/engine.js";
import type * as game_story_model from "../game/story/model.js";
import type * as game_survey from "../game/survey.js";
import type * as game_viewer from "../game/viewer.js";
import type * as http from "../http.js";
import type * as ravo_actor from "../ravo/actor.js";
import type * as ravo_casts from "../ravo/casts.js";
import type * as ravo_characters_lifecycle from "../ravo/characters/lifecycle.js";
import type * as ravo_clues from "../ravo/clues.js";
import type * as ravo_consult from "../ravo/consult.js";
import type * as ravo_director_casting from "../ravo/director/casting.js";
import type * as ravo_director_content from "../ravo/director/content.js";
import type * as ravo_director_context from "../ravo/director/context.js";
import type * as ravo_director_story from "../ravo/director/story.js";
import type * as ravo_entry from "../ravo/entry.js";
import type * as ravo_hints from "../ravo/hints.js";
import type * as ravo_lateJoiner from "../ravo/lateJoiner.js";
import type * as ravo_llm from "../ravo/llm.js";
import type * as ravo_model_adapter from "../ravo/model/adapter.js";
import type * as ravo_pace from "../ravo/pace.js";
import type * as ravo_pacing_planner from "../ravo/pacing/planner.js";
import type * as ravo_scoring from "../ravo/scoring.js";
import type * as ravo_threads from "../ravo/threads.js";
import type * as ravo_types from "../ravo/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "cases/installSf": typeof cases_installSf;
  "cases/seed": typeof cases_seed;
  "cases/sfCandidate": typeof cases_sfCandidate;
  "cases/sfContent": typeof cases_sfContent;
  "cases/sfFixtures": typeof cases_sfFixtures;
  "cases/sfSegments": typeof cases_sfSegments;
  "cases/velvetLantern": typeof cases_velvetLantern;
  "chat/answerCommand": typeof chat_answerCommand;
  "chat/bindings": typeof chat_bindings;
  "chat/harness": typeof chat_harness;
  "chat/keikiHandler": typeof chat_keikiHandler;
  "chat/keikiIngress": typeof chat_keikiIngress;
  "chat/messages": typeof chat_messages;
  crons: typeof crons;
  "game/accuse": typeof game_accuse;
  "game/catalog": typeof game_catalog;
  "game/commands/dispatch": typeof game_commands_dispatch;
  "game/commands/reviewedHints": typeof game_commands_reviewedHints;
  "game/engine": typeof game_engine;
  "game/groups": typeof game_groups;
  "game/integration/access": typeof game_integration_access;
  "game/integration/daily": typeof game_integration_daily;
  "game/integration/fixtureCaller": typeof game_integration_fixtureCaller;
  "game/integration/fixtures": typeof game_integration_fixtures;
  "game/integration/recast": typeof game_integration_recast;
  "game/integration/recoverDeduction": typeof game_integration_recoverDeduction;
  "game/integration/results": typeof game_integration_results;
  "game/integration/runtime": typeof game_integration_runtime;
  "game/integration/segmentModel": typeof game_integration_segmentModel;
  "game/integration/segments": typeof game_integration_segments;
  "game/integration/sf": typeof game_integration_sf;
  "game/integration/sfEvidence": typeof game_integration_sfEvidence;
  "game/integration/sfInvitations": typeof game_integration_sfInvitations;
  "game/lib": typeof game_lib;
  "game/roles": typeof game_roles;
  "game/runtime": typeof game_runtime;
  "game/session": typeof game_session;
  "game/story/engine": typeof game_story_engine;
  "game/story/model": typeof game_story_model;
  "game/survey": typeof game_survey;
  "game/viewer": typeof game_viewer;
  http: typeof http;
  "ravo/actor": typeof ravo_actor;
  "ravo/casts": typeof ravo_casts;
  "ravo/characters/lifecycle": typeof ravo_characters_lifecycle;
  "ravo/clues": typeof ravo_clues;
  "ravo/consult": typeof ravo_consult;
  "ravo/director/casting": typeof ravo_director_casting;
  "ravo/director/content": typeof ravo_director_content;
  "ravo/director/context": typeof ravo_director_context;
  "ravo/director/story": typeof ravo_director_story;
  "ravo/entry": typeof ravo_entry;
  "ravo/hints": typeof ravo_hints;
  "ravo/lateJoiner": typeof ravo_lateJoiner;
  "ravo/llm": typeof ravo_llm;
  "ravo/model/adapter": typeof ravo_model_adapter;
  "ravo/pace": typeof ravo_pace;
  "ravo/pacing/planner": typeof ravo_pacing_planner;
  "ravo/scoring": typeof ravo_scoring;
  "ravo/threads": typeof ravo_threads;
  "ravo/types": typeof ravo_types;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
