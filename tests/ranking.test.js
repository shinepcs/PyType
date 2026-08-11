import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  RankingService,
  recalculateRankingScore,
  validateRankingResult,
} from "../js/services/ranking.js";
import {
  SupabaseClientError,
  SupabaseRestClient,
  isSupabaseConfigured,
  toSafeNetworkError,
} from "../js/services/supabase-client.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function validResult(overrides = {}) {
  return {
    sessionId: SESSION_ID,
    playerName: "PythonKing",
    rawScore: 1_000,
    score: 1_250,
    accuracy: 98,
    cpm: 261.7,
    problemsSolved: 25,
    bestCombo: 14,
    survivalMs: 240_000,
    gameMode: "quick",
    contentVersion: "1.0.0",
    clientVersion: "1.0.0",
    rankEligible: true,
    endReason: "time_over",
    ...overrides,
  };
}

function rankingRow(overrides = {}) {
  return {
    rank: 1,
    player_name: "PythonKing",
    score: 1_250,
    accuracy: "98.00",
    cpm: "261.70",
    problems_solved: 25,
    best_combo: 14,
    survival_ms: 240_000,
    created_at: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

class FakeClient {
  constructor() {
    this.maxRetries = 1;
    this.requests = [];
    this.rpcCalls = [];
    this.requestResult = null;
    this.rpcResult = [];
    this.requestError = null;
  }

  isConfigured() {
    return true;
  }

  async ensureAnonymousSession() {
    return { accessToken: "a".repeat(30), userId: USER_ID };
  }

  async request(path, options) {
    this.requests.push({ path, options });
    if (this.requestError) throw this.requestError;
    return this.requestResult;
  }

  async rpc(name, parameters, options) {
    this.rpcCalls.push({ name, parameters, options });
    return this.rpcResult;
  }
}

test("ranking payload accepts only completed eligible Quick Play bounds", () => {
  assert.equal(validateRankingResult(validResult()).ok, true);
  assert.equal(validateRankingResult(validResult({ gameMode: "practice" })).ok, false);
  assert.equal(validateRankingResult(validResult({ rankEligible: false })).ok, false);
  assert.equal(validateRankingResult(validResult({ problemsSolved: 0 })).ok, false);
  assert.equal(validateRankingResult(validResult({ survivalMs: 300_001 })).ok, false);
  assert.equal(validateRankingResult(validResult({ playerName: "<script>" })).ok, false);
  assert.equal(validateRankingResult(validResult({ endReason: "abandoned" })).ok, false);
  for (const endReason of ["time-limit", "game-over", "question-limit"]) {
    assert.equal(validateRankingResult(validResult({ endedNormally: undefined, endReason })).ok, true);
  }
  assert.equal(validateRankingResult(validResult({ accuracy: "98" })).ok, false);
});

test("default score proof uses the core final-score formula", () => {
  assert.equal(recalculateRankingScore(validResult()), 1_250);
  assert.equal(recalculateRankingScore(validResult({ rawScore: undefined })), null);
});

test("submitRanking verifies score and sends only minimal database columns", async () => {
  const client = new FakeClient();
  const service = new RankingService({ client });

  const outcome = await service.submitRanking(validResult());

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "submitted");
  assert.equal(client.requests.length, 1);
  const request = client.requests[0];
  assert.equal(request.path, "rest/v1/ranking_entries");
  assert.equal(request.options.idempotent, true);
  assert.equal(request.options.body.user_id, USER_ID);
  assert.equal(request.options.body.session_id, SESSION_ID);
  assert.equal(request.options.body.game_mode, "quick");
  assert.equal("created_at" in request.options.body, false);
  assert.equal("rawScore" in request.options.body, false);
  assert.equal("problemScores" in request.options.body, false);
});

test("score mismatch is rejected before authentication or network access", async () => {
  const client = new FakeClient();
  const service = new RankingService({ client });

  const outcome = await service.submitRanking(validResult({ score: 1_249 }));

  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, "invalid");
  assert.deepEqual(outcome.errors, ["score_mismatch"]);
  assert.equal(client.requests.length, 0);
});

test("duplicate session conflict is treated as idempotent success", async () => {
  const client = new FakeClient();
  client.requestError = new SupabaseClientError("conflict", { status: 409 });
  const service = new RankingService({ client });

  const outcome = await service.submitRanking(validResult());

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "duplicate");
  assert.equal(outcome.duplicate, true);
  assert.equal(outcome.sessionId, SESSION_ID);
});

test("offline submission queues the same session for a later retry", async () => {
  const queued = [];
  const storageRepository = {
    enqueueRankingSubmission(result) {
      queued.push(result);
    },
  };
  const service = new RankingService({ client: null, storageRepository });

  const outcome = await service.submitRanking(validResult());

  assert.equal(outcome.ok, false);
  assert.equal(outcome.status, "offline");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].sessionId, SESSION_ID);
});

test("pending ranking submissions retry in order and remove successful sessions", async () => {
  const client = new FakeClient();
  const pending = [
    validResult(),
    validResult({ sessionId: "33333333-3333-4333-8333-333333333333" }),
  ];
  const removed = [];
  const storageRepository = {
    read: () => ({ pendingRankingSubmissions: pending }),
    removePendingRankingSubmission: (sessionId) => removed.push(sessionId),
  };
  const service = new RankingService({ client, storageRepository });

  const outcomes = await service.retryPendingSubmissions();

  assert.equal(outcomes.length, 2);
  assert.ok(outcomes.every((outcome) => outcome.ok));
  assert.equal(client.requests.length, 2);
  assert.deepEqual(removed, pending.map((result) => result.sessionId));
});

test("Global and Today call server-side aggregate RPCs and hide identifiers", async () => {
  const client = new FakeClient();
  client.rpcResult = [rankingRow({ user_id: USER_ID, session_id: SESSION_ID })];
  const service = new RankingService({ client });

  const global = await service.getGlobalRanking({ limit: 50, contentVersion: "1.0.0" });
  const today = await service.getTodayRanking({ limit: 100, contentVersion: "1.0.0" });

  assert.equal(global.ok, true);
  assert.equal(global.status, "ready");
  assert.deepEqual(Object.keys(global.entries[0]), [
    "rank",
    "playerName",
    "score",
    "accuracy",
    "cpm",
    "problemsSolved",
    "bestCombo",
    "survivalMs",
    "createdAt",
  ]);
  assert.deepEqual(client.rpcCalls[0], {
    name: "get_global_ranking",
    parameters: { p_content_version: "1.0.0", p_limit: 50 },
    options: undefined,
  });
  assert.equal(client.rpcCalls[1].name, "get_today_ranking");
  assert.equal(today.ok, true);
});

test("My Best and My Rank require authenticated RPC and support empty state", async () => {
  const client = new FakeClient();
  const service = new RankingService({ client });

  client.rpcResult = [];
  const empty = await service.getMyBest({ contentVersion: "1.0.0" });
  assert.equal(empty.ok, true);
  assert.equal(empty.status, "empty");
  assert.deepEqual(client.rpcCalls[0].options, { authenticated: true });

  client.rpcResult = [rankingRow({ rank: "321" })];
  const rank = await service.getMyRank({ sessionId: SESSION_ID, contentVersion: "1.0.0" });
  assert.equal(rank.entry.rank, 321);
  assert.deepEqual(client.rpcCalls[1].parameters, {
    p_session_id: SESSION_ID,
    p_content_version: "1.0.0",
  });
  assert.deepEqual(client.rpcCalls[1].options, { authenticated: true });
});

test("nearby ranking requests five neighbors and marks only the current user", async () => {
  const client = new FakeClient();
  client.rpcResult = [rankingRow({ is_current_user: true })];
  const service = new RankingService({ client });

  const result = await service.getNearbyRanking({ contentVersion: "1.0.0", radius: 5 });

  assert.equal(result.ok, true);
  assert.equal(result.entries[0].isCurrentUser, true);
  assert.deepEqual(client.rpcCalls[0], {
    name: "get_nearby_ranking",
    parameters: { p_content_version: "1.0.0", p_radius: 5 },
    options: { authenticated: true },
  });
  const invalid = await service.getNearbyRanking({ contentVersion: "1.0.0", radius: 6 });
  assert.equal(invalid.status, "invalid");
});

test("invalid query and malformed server data produce safe states", async () => {
  const client = new FakeClient();
  const service = new RankingService({ client });

  const invalid = await service.getGlobalRanking({ limit: 101, contentVersion: "1.0.0" });
  assert.equal(invalid.status, "invalid");
  assert.equal(client.rpcCalls.length, 0);

  client.rpcResult = [{ ...rankingRow(), user_id: USER_ID, player_name: "<img>" }];
  const malformed = await service.getGlobalRanking({ limit: 10, contentVersion: "1.0.0" });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, "invalid_response");
  assert.equal("user_id" in malformed, false);
});

test("Supabase configuration rejects disabled and placeholder public values", () => {
  assert.equal(isSupabaseConfigured({
    enabled: false,
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
  }), false);
  assert.equal(isSupabaseConfigured({
    enabled: true,
    url: "https://YOUR_PROJECT_REF.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
  }), false);
  assert.equal(isSupabaseConfigured({
    enabled: true,
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
  }), true);
});

test("anonymous auth persists only the minimal refreshable session", async () => {
  const storage = new Map();
  const adapter = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); },
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      access_token: "a".repeat(30),
      refresh_token: "r".repeat(30),
      expires_at: 2_000_000_000,
      user: { id: USER_ID },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new SupabaseRestClient({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
    fetchImpl,
    authStorage: adapter,
    now: () => 1_700_000_000_000,
  });

  const first = await client.ensureAnonymousSession();
  const second = await client.ensureAnonymousSession();

  assert.deepEqual(first, second);
  assert.equal(first.userId, USER_ID);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/signup$/);
  const persisted = JSON.parse([...storage.values()][0]);
  assert.deepEqual(Object.keys(persisted).sort(), [
    "accessToken",
    "expiresAt",
    "refreshToken",
    "userId",
  ]);
});

test("an invalid expired refresh token falls back to a new anonymous identity", async () => {
  const stored = new Map([
    ["auth", JSON.stringify({
      accessToken: "o".repeat(30),
      refreshToken: "x".repeat(30),
      expiresAt: 1,
      userId: "33333333-3333-4333-8333-333333333333",
    })],
  ]);
  const adapter = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };
  const paths = [];
  const client = new SupabaseRestClient({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
    authStorage: adapter,
    authStorageKey: "auth",
    maxRetries: 0,
    now: () => 1_700_000_000_000,
    fetchImpl: async (url) => {
      paths.push(new URL(url).pathname + new URL(url).search);
      if (paths.length === 1) {
        return new Response(JSON.stringify({ code: "refresh_token_not_found" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        access_token: "n".repeat(30),
        refresh_token: "r".repeat(30),
        expires_at: 2_000_000_000,
        user: { id: USER_ID },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const session = await client.ensureAnonymousSession();

  assert.equal(session.userId, USER_ID);
  assert.deepEqual(paths, [
    "/auth/v1/token?grant_type=refresh_token",
    "/auth/v1/signup",
  ]);
});

test("REST client retries a bounded idempotent request but not forever", async () => {
  let attempts = 0;
  const client = new SupabaseRestClient({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
    maxRetries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network details must stay private");
      return new Response("[]", { status: 200 });
    },
  });

  const response = await client.request("rest/v1/rpc/get_global_ranking");

  assert.deepEqual(response, []);
  assert.equal(attempts, 2);
});

test("REST timeout aborts through an injected clock without real waiting", async () => {
  const client = new SupabaseRestClient({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
    maxRetries: 0,
    scheduleTimeout(callback) {
      callback();
      return 1;
    },
    cancelTimeout() {},
    fetchImpl: async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });

  await assert.rejects(
    client.request("rest/v1/rpc/get_global_ranking"),
    (error) => error instanceof SupabaseClientError && error.code === "timeout",
  );
});

test("database unique errors and raw details become safe public errors", async () => {
  const client = new SupabaseRestClient({
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_publicvalue",
    maxRetries: 0,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "23505",
      message: "secret database details",
    }), { status: 409, headers: { "content-type": "application/json" } }),
  });

  await assert.rejects(
    client.request("rest/v1/ranking_entries", { method: "POST", body: {}, retries: 0 }),
    (error) => error instanceof SupabaseClientError
      && error.code === "conflict"
      && !error.message.includes("secret"),
  );
  const safe = toSafeNetworkError(new Error("secret token"));
  assert.equal(safe.code, "network_error");
  assert.equal(safe.message.includes("secret"), false);
});

test("SQL schema keeps table writes minimal and exposes identifier-free RPCs", async () => {
  const schemaUrl = new URL("../supabase/schema.sql", import.meta.url);
  const sql = await readFile(schemaUrl, "utf8");

  assert.match(sql, /alter table public\.ranking_entries enable row level security/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.doesNotMatch(sql, /for\s+(update|delete)/i);
  assert.match(sql, /revoke all on table public\.ranking_entries from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant select on public\.ranking_entries/i);
  assert.match(sql, /security definer\s+set search_path = ''/gi);
  assert.match(sql, /create or replace function public\.get_global_ranking/i);
  assert.match(sql, /create or replace function public\.get_today_ranking/i);
  assert.match(sql, /create or replace function public\.get_my_best/i);
  assert.match(sql, /create or replace function public\.get_my_rank/i);
  assert.match(sql, /create or replace function public\.get_nearby_ranking/i);
  assert.match(sql, /create or replace function public\.get_shared_questions/i);
  assert.match(sql, /create or replace function public\.submit_shared_question/i);
  assert.match(sql, /create or replace function public\.get_online_players/i);
  assert.match(sql, /create or replace function public\.touch_online_player/i);
  assert.match(sql, /alter table public\.shared_question_revisions enable row level security/i);
  assert.match(sql, /alter table public\.online_players enable row level security/i);
  assert.match(sql, /revoke all on table public\.shared_question_revisions from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.online_players from public, anon, authenticated/i);

  const returnsSections = [...sql.matchAll(/returns table \(([^]*?)\)\s*language/gi)]
    .map((match) => match[1]);
  assert.equal(returnsSections.length, 8);
  for (const returnedColumns of returnsSections) {
    assert.doesNotMatch(returnedColumns, /user_id|session_id/i);
  }
});
