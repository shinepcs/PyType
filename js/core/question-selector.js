import { clamp, timestampOf } from "../utils/time.js";
import { getRecentPerformance, isReviewDue } from "./mastery.js";

export const LEVEL_2_RATIO = Object.freeze({ minimum: 0.2, maximum: 0.6 });

export function resolveRandom(random) {
  let value;
  if (typeof random === "function") {
    value = random();
  } else if (random && typeof random.next === "function") {
    value = random.next();
  } else {
    throw new TypeError("a seeded random function or object with next() is required");
  }
  if (!Number.isFinite(value)) {
    throw new TypeError("random generator must return a finite number");
  }
  return clamp(value, 0, 1 - Number.EPSILON);
}

export function randomInteger(random, minimum, maximum) {
  const lower = Math.ceil(Math.min(minimum, maximum));
  const upper = Math.floor(Math.max(minimum, maximum));
  return lower + Math.floor(resolveRandom(random) * (upper - lower + 1));
}

export function questionIdentity(question) {
  return String(question?.instanceId ?? question?.id ?? question?.sourceId ?? "");
}

export function questionSourceIdentity(question) {
  return String(question?.sourceId ?? question?.id ?? question?.instanceId ?? "");
}

export function calculateLevel2TargetRatio(skillRecords = {}, skillIds = Object.keys(skillRecords)) {
  const ids = [...new Set(skillIds)].filter(Boolean);
  if (ids.length === 0) {
    return LEVEL_2_RATIO.minimum;
  }
  const readyCount = ids.map((skillId) => skillRecords[skillId]).filter((record) => (
    Array.isArray(record?.recentResults)
    && record.recentResults.length > 0
    && getRecentPerformance(record).preferLevel2
  )).length;
  return clamp(
    LEVEL_2_RATIO.minimum
      + (LEVEL_2_RATIO.maximum - LEVEL_2_RATIO.minimum) * (readyCount / ids.length),
    LEVEL_2_RATIO.minimum,
    LEVEL_2_RATIO.maximum,
  );
}

export function calculateQuestionWeight(question, {
  questionStats = {},
  skillRecords = {},
  now = Date.now(),
} = {}) {
  const id = questionSourceIdentity(question);
  const result = questionStats[id] ?? {};
  const skillRecord = skillRecords[question?.skill];
  let weight = 1;
  if ((Number(result.errorCount) || 0) > 0) weight += 3;
  if (result.slow) weight += 2;
  if (!result.lastSeenAt || (result.dueAt && timestampOf(result.dueAt) <= timestampOf(now))) {
    weight += 1;
  } else if (skillRecord && isReviewDue(skillRecord, now)) {
    weight += 1;
  }

  if (skillRecord && Number.isFinite(Number(skillRecord.mastery))) {
    weight += clamp((100 - Number(skillRecord.mastery)) / 100, 0, 1);
  }
  return weight;
}

export function weightedChoice(items, getWeight, random) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const weights = items.map((item) => Math.max(0, Number(getWeight(item)) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return items[Math.floor(resolveRandom(random) * items.length)];
  }
  let cursor = resolveRandom(random) * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return items[index];
  }
  return items.at(-1);
}

export class QuestionSelector {
  constructor(questions, { random } = {}) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new TypeError("questions must be a non-empty array");
    }
    if (!random) {
      throw new TypeError("QuestionSelector requires an injected seeded random generator");
    }
    this.questions = questions.filter((question) => question?.enabled !== false);
    if (this.questions.length === 0) {
      throw new RangeError("no enabled questions are available");
    }
    this.random = random;
  }

  select({
    skills,
    level,
    level2Ratio,
    previousQuestion,
    questionStats = {},
    skillRecords = {},
    seenSkills = [],
    now = Date.now(),
    excludeIds = [],
  } = {}) {
    const skillSet = Array.isArray(skills) && skills.length > 0 ? new Set(skills) : null;
    const excluded = new Set(excludeIds.map(String));
    const previousId = questionIdentity(previousQuestion);
    let candidates = this.questions.filter((question) => (
      (!skillSet || skillSet.has(question.skill))
      && !excluded.has(questionIdentity(question))
    ));
    if (candidates.length === 0) return null;

    if (previousId) {
      candidates = candidates.filter((question) => questionIdentity(question) !== previousId);
      if (candidates.length === 0) return null;
    }

    const seenSkillSet = new Set(seenSkills);
    let desiredLevel = level;
    if (desiredLevel !== 1 && desiredLevel !== 2) {
      const ratio = clamp(
        level2Ratio ?? calculateLevel2TargetRatio(
          skillRecords,
          candidates.map((question) => question.skill),
        ),
        LEVEL_2_RATIO.minimum,
        LEVEL_2_RATIO.maximum,
      );
      desiredLevel = resolveRandom(this.random) < ratio ? 2 : 1;
    }
    let levelCandidates = candidates.filter((question) => question.level === desiredLevel);
    if (desiredLevel === 2) {
      const eligibleLevel2 = levelCandidates.filter((question) => {
        const record = skillRecords[question.skill];
        return seenSkillSet.has(question.skill)
          || (Array.isArray(record?.recentResults)
            && record.recentResults.length > 0
            && getRecentPerformance(record).preferLevel2);
      });
      if (eligibleLevel2.length > 0) {
        levelCandidates = eligibleLevel2;
      } else {
        const level1Candidates = candidates.filter((question) => question.level === 1);
        if (level1Candidates.length > 0) levelCandidates = level1Candidates;
      }
    }
    if (levelCandidates.length > 0) {
      candidates = levelCandidates;
    }

    return weightedChoice(
      candidates,
      (question) => calculateQuestionWeight(question, { questionStats, skillRecords, now }),
      this.random,
    );
  }
}
