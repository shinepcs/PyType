import test from "node:test";
import assert from "node:assert/strict";

import { getLevel2Choices } from "../js/content/level2-hints.js";

test("Level 2 choices show four unique contents including the answer", () => {
  const question = { id: "sample.fill.append", level: 2, answer: "append" };
  const choices = getLevel2Choices(question);
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices).size, 4);
  assert.ok(choices.includes("append"));
  assert.deepEqual(getLevel2Choices(question), choices);
});

test("Level 2 literal answers stay selectable as typed content", () => {
  const choices = getLevel2Choices({ id: "sample.fill.literal", level: 2, answer: "[4, 9, 16]" });
  assert.ok(choices.includes("[4, 9, 16]"));
  assert.equal(choices.length, 4);
});