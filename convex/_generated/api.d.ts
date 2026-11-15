/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cases_seed from "../cases/seed.js";
import type * as cases_velvetLantern from "../cases/velvetLantern.js";
import type * as chat_messages from "../chat/messages.js";
import type * as crons from "../crons.js";
import type * as game_accuse from "../game/accuse.js";
import type * as game_catalog from "../game/catalog.js";
import type * as game_engine from "../game/engine.js";
import type * as game_groups from "../game/groups.js";
import type * as game_lib from "../game/lib.js";
import type * as game_roles from "../game/roles.js";
import type * as game_session from "../game/session.js";
import type * as game_survey from "../game/survey.js";
import type * as game_viewer from "../game/viewer.js";
import type * as http from "../http.js";
import type * as ravo_casts from "../ravo/casts.js";
import type * as ravo_clues from "../ravo/clues.js";
import type * as ravo_consult from "../ravo/consult.js";
import type * as ravo_entry from "../ravo/entry.js";
import type * as ravo_hints from "../ravo/hints.js";
import type * as ravo_lateJoiner from "../ravo/lateJoiner.js";
import type * as ravo_llm from "../ravo/llm.js";
import type * as ravo_pace from "../ravo/pace.js";
import type * as ravo_scoring from "../ravo/scoring.js";
import type * as ravo_threads from "../ravo/threads.js";
import type * as ravo_types from "../ravo/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "cases/seed": typeof cases_seed;
  "cases/velvetLantern": typeof cases_velvetLantern;
  "chat/messages": typeof chat_messages;
  crons: typeof crons;
  "game/accuse": typeof game_accuse;
  "game/catalog": typeof game_catalog;
  "game/engine": typeof game_engine;
  "game/groups": typeof game_groups;
  "game/lib": typeof game_lib;
  "game/roles": typeof game_roles;
  "game/session": typeof game_session;
  "game/survey": typeof game_survey;
  "game/viewer": typeof game_viewer;
  http: typeof http;
  "ravo/casts": typeof ravo_casts;
  "ravo/clues": typeof ravo_clues;
  "ravo/consult": typeof ravo_consult;
  "ravo/entry": typeof ravo_entry;
  "ravo/hints": typeof ravo_hints;
  "ravo/lateJoiner": typeof ravo_lateJoiner;
  "ravo/llm": typeof ravo_llm;
  "ravo/pace": typeof ravo_pace;
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
