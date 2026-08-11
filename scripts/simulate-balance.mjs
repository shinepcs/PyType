import assert from "node:assert/strict";

import {
  advanceCombo,
  calculateAccuracy,
  calculateFinalScore,
  calculateProblemScore,
  calculateCpm,
} from "../js/core/scoring.js";
import {
  advanceDanger,
  applySolveRecovery,
  applyTypoPenalty,
  isGameOver,
} from "../js/core/survival.js";

const QUESTION_COUNT = 30;
const SESSION_LIMIT_MS = 240_000;
const TRANSITION_MS = 450;
const questions = Array.from({ length: QUESTION_COUNT }, (_, index) => ({
  answerLength: 8 + (index * 7) % 25,
  level: index % 4 === 0 ? 2 : 1,
  targetSeconds: 7,
}));

const profiles = [
  {
    id: "accurate-fast",
    label: "정확하고 빠른 플레이",
    targetAccuracy: 0.995,
    cleanRate: 0.95,
    elapsedFactors: [0.48, 0.52, 0.56],
  },
  {
    id: "accurate-slow",
    label: "정확하지만 느린 플레이",
    targetAccuracy: 0.98,
    cleanRate: 0.85,
    elapsedFactors: [0.88, 0.94, 0.99],
  },
  {
    id: "fast-inaccurate",
    label: "빠르지만 오타가 많은 플레이",
    targetAccuracy: 0.76,
    cleanRate: 0.1,
    elapsedFactors: [0.4, 0.45, 0.5],
  },
  {
    id: "beginner-irregular",
    label: "초보 수준의 느리고 불규칙한 플레이",
    targetAccuracy: 0.86,
    cleanRate: 0.5,
    elapsedFactors: [0.78, 0.96, 1.22, 0.88],
  },
];

function dirtyIndexes(profile) {
  const dirtyCount = Math.round(QUESTION_COUNT * (1 - profile.cleanRate));
  const indexes = [];
  for (let number = 0; number < dirtyCount; number += 1) {
    indexes.push(Math.floor((number + 0.5) * QUESTION_COUNT / dirtyCount));
  }
  return new Set(indexes);
}

function simulate(profile) {
  const dirty = dirtyIndexes(profile);
  const totalCorrectIfComplete = questions.reduce((sum, item) => sum + item.answerLength, 0);
  const desiredErrors = Math.round(totalCorrectIfComplete * (1 / profile.targetAccuracy - 1));
  const dirtyCount = Math.max(1, dirty.size);
  const errorsPerDirty = Math.floor(desiredErrors / dirtyCount);
  let extraErrors = desiredErrors % dirtyCount;

  let danger = 20;
  let combo = 0;
  let bestCombo = 0;
  let rawScore = 0;
  let correctKeystrokes = 0;
  let totalKeystrokes = 0;
  let activeTypingMs = 0;
  let survivalMs = 0;
  let problemsSolved = 0;

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const elapsedSeconds = question.targetSeconds
      * profile.elapsedFactors[index % profile.elapsedFactors.length];
    const elapsedMs = elapsedSeconds * 1_000;
    if (survivalMs + elapsedMs > SESSION_LIMIT_MS) break;

    danger = advanceDanger(danger, {
      fromElapsedMs: 0,
      toElapsedMs: elapsedMs,
      targetMs: question.targetSeconds * 1_000,
    });
    if (isGameOver(danger)) break;

    const clean = !dirty.has(index);
    const errorCount = clean ? 0 : errorsPerDirty + (extraErrors-- > 0 ? 1 : 0);
    danger = applyTypoPenalty(danger, 0, errorCount).danger;
    if (isGameOver(danger)) break;

    combo = advanceCombo(combo, clean);
    bestCombo = Math.max(bestCombo, combo);
    rawScore += calculateProblemScore({
      targetLength: question.answerLength,
      level: question.level,
      targetSeconds: question.targetSeconds,
      elapsedSeconds,
      comboAfterSolve: combo,
    });
    danger = applySolveRecovery(danger, clean);
    correctKeystrokes += question.answerLength;
    totalKeystrokes += question.answerLength + errorCount;
    activeTypingMs += elapsedMs;
    survivalMs += elapsedMs;
    problemsSolved += 1;

    if (index < questions.length - 1) {
      survivalMs += TRANSITION_MS;
      if (survivalMs >= SESSION_LIMIT_MS) break;
    }
  }

  const accuracy = calculateAccuracy(correctKeystrokes, totalKeystrokes);
  return {
    profile: profile.label,
    problems: problemsSolved,
    survivalSeconds: Math.round(survivalMs / 100) / 10,
    accuracy,
    cpm: calculateCpm(correctKeystrokes, activeTypingMs),
    bestCombo,
    endingDanger: Math.round(danger * 10) / 10,
    rawScore,
    finalScore: calculateFinalScore(rawScore, accuracy),
  };
}

const results = profiles.map(simulate);
const byId = Object.fromEntries(profiles.map((profile, index) => [profile.id, results[index]]));

for (const result of results) {
  assert.ok(result.problems >= 20 && result.problems <= 40, `${result.profile}: expected 20-40 solved`);
  assert.ok(result.survivalSeconds <= 240, `${result.profile}: session must stay within four minutes`);
}
assert.equal(
  byId["accurate-slow"].problems,
  byId["fast-inaccurate"].problems,
  "accuracy comparison uses the same solved count",
);
assert.ok(
  byId["accurate-slow"].finalScore > byId["fast-inaccurate"].finalScore,
  "fast inaccurate play must not beat accurate play with the same solved count",
);
assert.ok(
  byId["accurate-fast"].finalScore > byId["accurate-slow"].finalScore,
  "speed remains a useful secondary reward among accurate players",
);

console.log("Python Typing Survival balance simulation (PRD constants)");
console.table(results);
console.log("PASS: all profiles solve 20-40 questions within 240s; accuracy remains the primary score factor.");
