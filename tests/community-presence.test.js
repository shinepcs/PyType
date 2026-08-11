import test from "node:test";
import assert from "node:assert/strict";

import { CommunityContentService } from "../js/services/community-content.js";
import { PresenceService } from "../js/services/presence.js";

const USER_ID = "22222222-2222-4222-8222-222222222222";

class FakeClient {
  constructor() {
    this.rpcCalls = [];
    this.rpcResult = [];
  }
  isConfigured() { return true; }
  async ensureAnonymousSession() { return { userId: USER_ID, accessToken: "token" }; }
  async rpc(name, parameters, options) {
    this.rpcCalls.push({ name, parameters, options });
    return this.rpcResult;
  }
}

const skillIds = new Set(["print"]);
const questionRow = {
  question_id: "community.example",
  level: 1,
  type: "copy",
  skill: "print",
  difficulty: 1,
  code: "print(1)",
  output: "",
  output_mode: "exact",
  answer: "print(1)",
  accepted_answers: ["print(1)"],
  target_seconds: 6,
  tags: ["community"],
};

test("shared questions are structurally validated before entering Practice", async () => {
  const client = new FakeClient();
  client.rpcResult = [questionRow];
  const service = new CommunityContentService({ client });

  const result = await service.getQuestions({ contentVersion: "1.0.0", skillIds });

  assert.equal(result.ok, true);
  assert.equal(result.questions[0].id, "community.example");
  assert.equal(result.questions[0].answer, "print(1)");
  assert.equal(client.rpcCalls[0].name, "get_shared_questions");
});

test("anonymous shared save uses authenticated RPC and rejects invalid Level 2", async () => {
  const client = new FakeClient();
  client.rpcResult = [{ question_id: "community.saved", revision_id: 1 }];
  const service = new CommunityContentService({ client });
  const question = {
    level: 1, type: "copy", skill: "print", difficulty: 1,
    code: "print(2)", output: "", outputMode: "exact", answer: "print(2)",
    acceptedAnswers: ["print(2)"], targetSeconds: 6, tags: ["community"],
  };

  const saved = await service.saveQuestion({ question, contentVersion: "1.0.0", skillIds });
  assert.equal(saved.ok, true);
  assert.deepEqual(client.rpcCalls[0].options, { authenticated: true });

  const invalid = await service.saveQuestion({
    question: { ...question, level: 2, type: "fill", code: "print(2)", output: "2", answer: "2", acceptedAnswers: ["2"] },
    contentVersion: "1.0.0",
    skillIds,
  });
  assert.equal(invalid.status, "invalid");
  assert.equal(client.rpcCalls.length, 1);
});

test("presence heartbeat is authenticated and public list exposes only nickname and best score", async () => {
  const client = new FakeClient();
  const service = new PresenceService({ client });
  await service.heartbeat("PythonKing");
  assert.deepEqual(client.rpcCalls[0], {
    name: "touch_online_player",
    parameters: { p_player_name: "PythonKing" },
    options: { authenticated: true },
  });

  client.rpcResult = [{ player_name: "PythonKing", best_score: 1234 }];
  const result = await service.getOnlinePlayers({ contentVersion: "1.0.0", limit: 50 });
  assert.deepEqual(result.players, [{ playerName: "PythonKing", bestScore: 1234 }]);
  assert.deepEqual(Object.keys(result.players[0]), ["playerName", "bestScore"]);
});
