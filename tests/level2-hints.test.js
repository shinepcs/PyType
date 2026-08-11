import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getLevel2Hint } from "../js/content/level2-hints.js";
import { createQuestionRepository } from "../js/content/question-repository.js";

test("Level 2 provides a Korean inference hint without embedding a dynamic answer", () => {
  const hint = getLevel2Hint({ level: 2, type: "fill", skill: "variable", answer: "secret_name" });
  assert.match(hint, /[가-힣]/u);
  assert.equal(hint.includes("secret_name"), false);
});

test("Level 1 does not render a Level 2 hint", () => {
  assert.equal(getLevel2Hint({ level: 1, type: "copy", skill: "print" }), "");
});

test("every shipped Level 2 skill has a Korean hint that does not reveal its exact answer", async () => {
  const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
  const repository = createQuestionRepository({
    skills: await readJson("../data/skills.json"),
    questions: await readJson("../data/questions.json"),
    templates: await readJson("../data/question-templates.json"),
  });
  const level2 = repository.getAll({ seed: "hint-coverage", levels: [2] });
  assert.equal(level2.length, 183);
  for (const question of level2) {
    const hint = getLevel2Hint(question);
    assert.match(hint, /[가-힣]/u, question.instanceId);
    assert.equal(hint.toLowerCase().includes(question.answer.toLowerCase()), false, question.instanceId);
  }
});
