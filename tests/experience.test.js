import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSessionExperience,
  getExperienceProgress,
  xpNeededForNextLevel,
} from "../js/core/experience.js";

test("experience levels grow with an increasing next-level requirement", () => {
  assert.equal(xpNeededForNextLevel(1), 100);
  assert.equal(xpNeededForNextLevel(2), 150);
  assert.deepEqual(getExperienceProgress(0), {
    totalXp: 0, level: 1, currentLevelXp: 0, nextLevelXp: 100, progressPercent: 0,
  });
  assert.deepEqual(getExperienceProgress(260), {
    totalXp: 260, level: 3, currentLevelXp: 10, nextLevelXp: 200, progressPercent: 5,
  });
});

test("session experience rewards solved, clean, Level 2, and combo progress", () => {
  const earned = calculateSessionExperience({
    bestCombo: 4,
    problemResults: [
      { problemScore: 100, cleanSolve: true, level: 1 },
      { problemScore: 80, cleanSolve: false, level: 2 },
      { problemScore: 0, submittedIncorrect: true, level: 1 },
    ],
  });
  assert.equal(earned, 36);
});