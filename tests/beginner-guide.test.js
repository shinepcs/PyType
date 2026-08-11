import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BEGINNER_GUIDE_SAMPLE_COUNT,
  loadBeginnerGuideQuestions,
  validateBeginnerGuideDocument,
} from "../js/content/beginner-guide.js";

const document = JSON.parse(await readFile(new URL("../data/beginner-guide.json", import.meta.url), "utf8"));

test("Beginner Guide ships exactly 50 distinct practical long-form samples", () => {
  assert.deepEqual(validateBeginnerGuideDocument(document), []);
  assert.equal(document.samples.length, BEGINNER_GUIDE_SAMPLE_COUNT);
  assert.equal(new Set(document.samples.map((sample) => sample.id)).size, 50);
  assert.equal(new Set(document.samples.map((sample) => sample.code)).size, 50);
  for (const sample of document.samples) {
    const lineCount = sample.code.split("\n").length;
    assert.ok(lineCount >= 4 && lineCount <= 12, sample.id);
    assert.match(sample.code, /^# .*[가-힣]/u, sample.id);
    assert.match(sample.code, /\bdef\b|\bfor\b|\bimport\b/u, sample.id);
  }
});

test("Beginner Guide loader creates Level 1 runtime questions without weakening official content validation", async () => {
  const questions = await loadBeginnerGuideQuestions({
    fetchImpl: async (url) => ({
      ok: String(url) === "./data/beginner-guide.json",
      status: 200,
      json: async () => structuredClone(document),
    }),
  });
  assert.equal(questions.length, 50);
  assert.equal(questions.every((question) => question.level === 1 && question.type === "copy"), true);
  assert.equal(questions.every((question) => question.answer === question.code), true);
  assert.equal(questions.every((question) => question.tags.includes("beginner-guide")), true);
  assert.equal(questions.every((question) => question.targetSeconds >= 20), true);
});
