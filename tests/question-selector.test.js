import test from "node:test";
import assert from "node:assert/strict";

import { createSeededRandom } from "../js/utils/random.js";
import {
  calculateLevel2TargetRatio,
  calculateQuestionWeight,
  QuestionSelector,
  randomInteger,
  weightedChoice,
} from "../js/core/question-selector.js";
import { insertDailyReviewQuestions, SessionQueue } from "../js/core/session.js";

function question(id, level = 1, skill = "print") {
  return { id, level, skill, answer: id, targetSeconds: 8, enabled: true };
}

function readyRecord() {
  return {
    mastery: 95,
    recentResults: Array.from({ length: 10 }, (_, index) => ({
      correctKeystrokes: 9,
      totalKeystrokes: 10,
      cleanSolve: index < 7,
    })),
  };
}

test("seed injection produces the same selection sequence", () => {
  const questions = [question("a"), question("b"), question("c"), question("d", 2)];
  const run = () => {
    const selector = new QuestionSelector(questions, { random: createSeededRandom("same") });
    const sequence = [];
    let previousQuestion = null;
    for (let index = 0; index < 20; index += 1) {
      const selected = selector.select({ previousQuestion, now: 0 });
      sequence.push(selected.id);
      previousQuestion = selected;
    }
    return sequence;
  };
  assert.deepEqual(run(), run());
});

test("selector never returns the immediately previous question", () => {
  const questions = [question("a"), question("b")];
  const selector = new QuestionSelector(questions, { random: () => 0 });
  const first = selector.select({ level: 1, now: 0 });
  const second = selector.select({ level: 1, previousQuestion: first, now: 0 });
  assert.notEqual(first.id, second.id);
  const only = new QuestionSelector([question("only")], { random: () => 0 });
  assert.equal(only.select({ previousQuestion: question("only"), now: 0 }), null);
});

test("question weights add +3 error, +2 slow, +1 unseen/due", () => {
  const q = question("a");
  assert.equal(calculateQuestionWeight(q, {
    questionStats: { a: { errorCount: 1, slow: true } },
    now: 0,
  }), 7);
  assert.equal(calculateQuestionWeight(q, {
    questionStats: { a: { errorCount: 0, slow: false, lastSeenAt: 1, dueAt: 100 } },
    now: 0,
  }), 1);
});

test("Level 2 ratio remains between 20% and 60%", () => {
  assert.equal(calculateLevel2TargetRatio({}), 0.2);
  assert.equal(calculateLevel2TargetRatio({ print: readyRecord() }), 0.6);
  assert.equal(calculateLevel2TargetRatio({ print: readyRecord(), range: { recentResults: [{}] } }), 0.4);
});

test("weightedChoice and random integer honor lower and upper boundaries", () => {
  assert.equal(weightedChoice(["a", "b"], () => 1, () => 0), "a");
  assert.equal(weightedChoice(["a", "b"], () => 1, () => 0.999999), "b");
  assert.equal(randomInteger(() => 0, 3, 7), 3);
  assert.equal(randomInteger(() => 0.999999, 3, 7), 7);
});

test("repeat scheduling waits for 3 intervening problems and allows at most two repeats", () => {
  const original = question("original");
  const filler = [question("b"), question("c"), question("d"), question("e"), question("f")];
  let fillerIndex = 0;
  const selector = {
    select() {
      const selected = filler[fillerIndex % filler.length];
      fillerIndex += 1;
      return selected;
    },
  };
  const queue = new SessionQueue({ selector, random: () => 0, mode: "quick" });
  // Make the original the first issued question through a one-shot selector.
  selector.select = () => {
    if (fillerIndex++ === 0) return original;
    return filler[(fillerIndex - 2) % filler.length];
  };
  assert.equal(queue.next().id, "original");
  const firstSchedule = queue.recordResult(original, { errorCount: 1, slow: false });
  assert.equal(firstSchedule.delay, 3);
  assert.equal(firstSchedule.dueIssueNumber, 5);
  assert.notEqual(queue.next().id, "original");
  assert.notEqual(queue.next().id, "original");
  assert.notEqual(queue.next().id, "original");
  const firstRepeat = queue.next();
  assert.equal(firstRepeat.id, "original");
  assert.equal(queue.lastSelectionWasRepeat, true);

  assert.ok(queue.recordResult(firstRepeat, { errorCount: 0, slow: true }));
  assert.equal(queue.repeatCounts.get("original"), 2);
  assert.equal(queue.recordResult(firstRepeat, { errorCount: 1, slow: true }), null, "pending duplicate is not added");
  while (queue.issuedCount < 9) queue.next();
  assert.equal(queue.history.at(-1).question.id, "original");
  assert.equal(queue.recordResult(original, { errorCount: 1, slow: true }), null, "third repeat is forbidden");
});

test("every complete Quick sequence keeps Level 2 between 20% and 60%", () => {
  const questions = Array.from({ length: 12 }, (_, index) => [
    question(`skill-${index}-l1`, 1, `skill-${index}`),
    question(`skill-${index}-l2`, 2, `skill-${index}`),
  ]).flat();
  for (let seed = 0; seed < 100; seed += 1) {
    const random = createSeededRandom(`ratio-${seed}`);
    const queue = new SessionQueue({
      selector: new QuestionSelector(questions, { random }),
      random,
      mode: "quick",
    });
    const firstLevelBySkill = new Map();
    let level2Count = 0;
    while (!queue.exhausted) {
      const selected = queue.next();
      assert.ok(selected);
      if (!firstLevelBySkill.has(selected.skill)) firstLevelBySkill.set(selected.skill, selected.level);
      if (selected.level === 2) level2Count += 1;
      if (queue.issuedCount >= 2) {
        const ratio = level2Count / queue.issuedCount;
        assert.ok(ratio >= 0.2 && ratio <= 0.6, `seed ${seed}, issue ${queue.issuedCount}: ${ratio}`);
      }
    }
    assert.ok([...firstLevelBySkill.values()].every((level) => level === 1));
    assert.ok(level2Count >= 8 && level2Count <= 24);
  }
});

test("Daily review insertion is deterministic and replaces at most ten base slots", () => {
  const base = Array.from({ length: 30 }, (_, index) => question(`base-${index}`));
  const reviews = Array.from({ length: 15 }, (_, index) => question(`review-${index}`));
  const first = insertDailyReviewQuestions(base, reviews, 10);
  const second = insertDailyReviewQuestions(base, reviews, 10);
  assert.deepEqual(first, second);
  const changed = first.filter((item, index) => item.id !== base[index].id);
  assert.equal(changed.length, 10);
  assert.ok(changed.every((item) => item.id.startsWith("review-")));
  assert.deepEqual(base.map((item) => item.id), Array.from({ length: 30 }, (_, index) => `base-${index}`));
});
