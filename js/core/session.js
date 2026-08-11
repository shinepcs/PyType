import { nonNegativeMilliseconds, timestampOf } from "../utils/time.js";
import {
  LEVEL_2_RATIO,
  questionIdentity,
  questionSourceIdentity,
  randomInteger,
} from "./question-selector.js";

export const GAME_MODES = Object.freeze({
  QUICK: "quick",
  DAILY: "daily",
  PRACTICE: "practice",
});

export const MODE_CONFIGS = Object.freeze({
  [GAME_MODES.QUICK]: Object.freeze({
    mode: GAME_MODES.QUICK,
    durationMs: 240_000,
    maxQuestions: 40,
    readyMs: 3_000,
    dangerEnabled: true,
    gameOverEnabled: true,
    ranked: true,
    allowSkip: false,
    maximumManualPauses: 1,
    maximumManualPauseMs: 30_000,
    maximumRankedPauseMs: 30_000,
  }),
  [GAME_MODES.DAILY]: Object.freeze({
    mode: GAME_MODES.DAILY,
    durationMs: null,
    maxQuestions: 30,
    readyMs: 3_000,
    dangerEnabled: true,
    gameOverEnabled: true,
    ranked: false,
    allowSkip: false,
    maximumManualPauses: Number.POSITIVE_INFINITY,
    maximumManualPauseMs: Number.POSITIVE_INFINITY,
    maximumRankedPauseMs: 0,
  }),
  [GAME_MODES.PRACTICE]: Object.freeze({
    mode: GAME_MODES.PRACTICE,
    durationMs: null,
    maxQuestions: Number.POSITIVE_INFINITY,
    readyMs: 0,
    dangerEnabled: true,
    gameOverEnabled: true,
    ranked: false,
    allowSkip: true,
    maximumManualPauses: Number.POSITIVE_INFINITY,
    maximumManualPauseMs: Number.POSITIVE_INFINITY,
    maximumRankedPauseMs: 0,
  }),
});

export function createSessionConfig(mode, overrides = {}) {
  const base = MODE_CONFIGS[mode];
  if (!base) {
    throw new RangeError(`unknown game mode: ${mode}`);
  }
  const config = { ...base, ...overrides, mode };
  config.durationMs = config.durationMs === null || config.durationMs === false
    ? null
    : nonNegativeMilliseconds(config.durationMs);
  config.maxQuestions = config.maxQuestions === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.trunc(Number(config.maxQuestions) || base.maxQuestions));
  config.readyMs = nonNegativeMilliseconds(config.readyMs);
  config.maximumManualPauses = config.maximumManualPauses === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.trunc(Number(config.maximumManualPauses) || 0));
  config.maximumManualPauseMs = config.maximumManualPauseMs === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : nonNegativeMilliseconds(config.maximumManualPauseMs);
  config.maximumRankedPauseMs = nonNegativeMilliseconds(config.maximumRankedPauseMs);
  config.ranked = mode === GAME_MODES.QUICK && Boolean(config.ranked);
  if (!config.ranked) config.durationMs = null;
  config.allowSkip = mode === GAME_MODES.PRACTICE && Boolean(config.allowSkip);
  return Object.freeze(config);
}

export function isRankedMode(modeOrConfig) {
  return typeof modeOrConfig === "string"
    ? modeOrConfig === GAME_MODES.QUICK
    : modeOrConfig?.mode === GAME_MODES.QUICK && modeOrConfig?.ranked === true;
}

export function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("a valid date is required");
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDailySeed(date, contentVersion) {
  const version = String(contentVersion ?? "").trim();
  if (!version) throw new TypeError("contentVersion is required");
  return `daily:${localDateKey(date)}:${version}`;
}

export function selectDailyReviewQuestions(questionStats = {}, maximum = 10, now = Date.now()) {
  const currentTime = timestampOf(now);
  return Object.entries(questionStats)
    .filter(([, result]) => (
      (Number(result?.errorCount) || 0) > 0
      || result?.slow
      || (result?.dueAt && timestampOf(result.dueAt) <= currentTime)
    ))
    .sort(([, left], [, right]) => {
      const leftPriority = ((Number(left.errorCount) || 0) > 0 ? 3 : 0) + (left.slow ? 2 : 0);
      const rightPriority = ((Number(right.errorCount) || 0) > 0 ? 3 : 0) + (right.slow ? 2 : 0);
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      return timestampOf(left.lastSeenAt) - timestampOf(right.lastSeenAt);
    })
    .slice(0, Math.min(10, Math.max(0, Math.trunc(maximum))))
    .map(([questionId]) => questionId);
}

export function quickLevelConstraint(issuedCount, level2IssuedCount) {
  const ordinal = Math.max(1, Math.trunc(Number(issuedCount) || 0) + 1);
  const level2Count = Math.max(0, Math.trunc(Number(level2IssuedCount) || 0));
  if (ordinal === 1) return 1;
  const minimum = Math.ceil(ordinal * LEVEL_2_RATIO.minimum);
  const maximum = Math.floor(ordinal * LEVEL_2_RATIO.maximum);
  if (level2Count < minimum) return 2;
  if (level2Count >= maximum) return 1;
  return null;
}

export function insertDailyReviewQuestions(baseQuestions, reviewQuestions, maximum = 10) {
  if (!Array.isArray(baseQuestions)) throw new TypeError("baseQuestions must be an array");
  if (!Array.isArray(reviewQuestions)) throw new TypeError("reviewQuestions must be an array");
  const plan = [...baseQuestions];
  const limit = Math.min(10, Math.max(0, Math.trunc(Number(maximum) || 0)));
  const reviews = [];
  const seenSources = new Set();
  for (const question of reviewQuestions) {
    const sourceId = questionSourceIdentity(question);
    if (!sourceId || seenSources.has(sourceId)) continue;
    seenSources.add(sourceId);
    reviews.push(question);
    if (reviews.length >= limit) break;
  }
  for (let index = 0; index < reviews.length && plan.length > 0; index += 1) {
    const review = reviews[index];
    const preferred = Math.floor(((index + 1) * plan.length) / (reviews.length + 1));
    const positions = Array.from({ length: plan.length }, (_, offset) => (
      (preferred + Math.ceil(offset / 2) * (offset % 2 === 0 ? -1 : 1) + plan.length) % plan.length
    ));
    const position = positions.find((candidate) => {
      const sourceId = questionIdentity(review);
      return questionIdentity(plan[candidate - 1]) !== sourceId
        && questionIdentity(plan[candidate + 1]) !== sourceId;
    });
    if (position !== undefined) plan[position] = review;
  }
  return plan;
}

export class SessionQueue {
  constructor({
    selector,
    random,
    mode = GAME_MODES.QUICK,
    maxQuestions,
    skills,
    questionStats = {},
    skillRecords = {},
    plannedQuestions = null,
    now = () => Date.now(),
  }) {
    if (!selector || typeof selector.select !== "function") {
      throw new TypeError("selector with select() is required");
    }
    if (!random) {
      throw new TypeError("SessionQueue requires the same seeded random contract");
    }
    this.selector = selector;
    this.random = random;
    this.config = createSessionConfig(mode, maxQuestions === undefined ? {} : { maxQuestions });
    this.skills = skills;
    this.questionStats = questionStats;
    this.skillRecords = skillRecords;
    this.plannedQuestions = Array.isArray(plannedQuestions) ? [...plannedQuestions] : null;
    this.plannedIndex = 0;
    this.now = typeof now === "function" ? now : () => timestampOf(now);

    this.issuedCount = 0;
    this.previousQuestion = null;
    this.pendingRepeats = [];
    this.repeatCounts = new Map();
    this.history = [];
    this.lastSelectionWasRepeat = false;
    this.level2IssuedCount = 0;
    this.seenSkills = new Set();
  }

  get exhausted() {
    return this.issuedCount >= this.config.maxQuestions;
  }

  next(overrides = {}) {
    if (this.exhausted) return null;
    const ordinal = this.issuedCount + 1;
    const previousId = questionIdentity(this.previousQuestion);
    const constrainedLevel = this.config.mode === GAME_MODES.QUICK
      ? quickLevelConstraint(this.issuedCount, this.level2IssuedCount)
      : null;
    const dueIndex = this.pendingRepeats.findIndex((entry) => (
      entry.dueIssueNumber <= ordinal
      && questionIdentity(entry.question) !== previousId
    ));

    let question;
    let isRepeat = false;
    if (dueIndex >= 0) {
      const repeat = this.pendingRepeats[dueIndex];
      question = repeat.question;
      if (constrainedLevel && question.level !== constrainedLevel) {
        const equivalent = this.selector.select({
          skills: [repeat.question.skill],
          level: constrainedLevel,
          previousQuestion: this.previousQuestion,
          questionStats: overrides.questionStats ?? this.questionStats,
          skillRecords: overrides.skillRecords ?? this.skillRecords,
          seenSkills: this.seenSkills,
          now: overrides.now ?? this.now(),
        });
        if (equivalent?.level === constrainedLevel) question = equivalent;
      }
      if (question) {
        this.pendingRepeats.splice(dueIndex, 1);
        isRepeat = true;
      }
    } else if (this.plannedQuestions && this.plannedIndex < this.plannedQuestions.length) {
      const nextIndex = this.plannedQuestions.findIndex((candidate, index) => (
        index >= this.plannedIndex && questionIdentity(candidate) !== previousId
      ));
      if (nextIndex >= 0) {
        [this.plannedQuestions[this.plannedIndex], this.plannedQuestions[nextIndex]] = [
          this.plannedQuestions[nextIndex],
          this.plannedQuestions[this.plannedIndex],
        ];
        question = this.plannedQuestions[this.plannedIndex];
        this.plannedIndex += 1;
      }
    } else {
      // Keep a normal draw from occupying the slot immediately before its own
      // scheduled repeat. That would force either an immediate duplicate or an
      // eighth intervening question for a delay of seven.
      const imminentRepeatIds = this.pendingRepeats
        .filter((entry) => entry.dueIssueNumber <= ordinal + 1)
        .map((entry) => questionIdentity(entry.question));
      question = this.selector.select({
        skills: overrides.skills ?? this.skills,
        level: constrainedLevel ?? overrides.level,
        level2Ratio: overrides.level2Ratio,
        previousQuestion: this.previousQuestion,
        questionStats: overrides.questionStats ?? this.questionStats,
        skillRecords: overrides.skillRecords ?? this.skillRecords,
        seenSkills: this.seenSkills,
        now: overrides.now ?? this.now(),
        excludeIds: [...(overrides.excludeIds ?? []), ...imminentRepeatIds],
      });
    }

    if (!question || questionIdentity(question) === previousId) {
      return null;
    }
    this.issuedCount = ordinal;
    this.previousQuestion = question;
    if (question.level === 2) this.level2IssuedCount += 1;
    this.seenSkills.add(question.skill);
    this.lastSelectionWasRepeat = isRepeat;
    this.history.push(Object.freeze({ ordinal, question, isRepeat }));
    return question;
  }

  recordResult(question, result) {
    if (!question || !result || (!(Number(result.errorCount) > 0) && !result.slow)) {
      return null;
    }
    const sourceId = questionSourceIdentity(question);
    const repeatCount = this.repeatCounts.get(sourceId) ?? 0;
    if (repeatCount >= 2) return null;
    if (this.pendingRepeats.some((entry) => entry.sourceId === sourceId)) {
      return null;
    }

    const delay = randomInteger(this.random, 3, 7);
    const entry = Object.freeze({
      question,
      sourceId,
      delay,
      dueIssueNumber: this.issuedCount + delay + 1,
      repeatNumber: repeatCount + 1,
    });
    this.repeatCounts.set(sourceId, repeatCount + 1);
    this.pendingRepeats.push(entry);
    this.pendingRepeats.sort((left, right) => left.dueIssueNumber - right.dueIssueNumber);
    return entry;
  }

  snapshot() {
    return Object.freeze({
      issuedCount: this.issuedCount,
      maxQuestions: this.config.maxQuestions,
      exhausted: this.exhausted,
      pendingRepeats: Object.freeze([...this.pendingRepeats]),
      repeatCounts: Object.freeze(Object.fromEntries(this.repeatCounts)),
      level2IssuedCount: this.level2IssuedCount,
      history: Object.freeze([...this.history]),
    });
  }
}
