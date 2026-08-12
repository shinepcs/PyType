import { SPEED_HISTORY_LIMIT } from "../core/speed-history.js";

export const STORAGE_KEY = "pythonTypingSurvival:v1";

export const CORRUPT_BACKUP_PREFIX = STORAGE_KEY + ":corrupt:";
export const STORAGE_SCHEMA_VERSION = 5;

export const STORAGE_LIMITS = Object.freeze({
  history: 100,
  speedHistory: SPEED_HISTORY_LIMIT,
  recentResultsPerSkill: 20,
  pendingRankingSubmissions: 20,
});

export const RESET_SCOPE = Object.freeze([
  "nickname",
  "settings",
  "progress",
  "history",
  "speedHistory",
  "personalBest",
  "pendingRankingSubmissions",
  "corruptBackups",
]);

const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "profile",
  "settings",
  "progress",
  "history",
  "speedHistory",
  "personalBest",
  "pendingRankingSubmissions",
]);
const PROFILE_KEYS = Object.freeze(["nickname", "createdAt"]);
const SETTINGS_KEYS = Object.freeze(["sound", "reducedMotion", "fontScale", "practiceLayout", "blockTypos"]);
const PRACTICE_LAYOUTS = Object.freeze(["horizontal", "vertical"]);
const PROGRESS_KEYS = Object.freeze(["skills", "level2Prerequisites", "experience"]);
const PERSONAL_BEST_KEYS = Object.freeze(["quick", "daily"]);
const SKILL_KEYS = Object.freeze([
  "attempts",
  "cleanSolves",
  "correctKeystrokes",
  "totalKeystrokes",
  "averageElapsedMs",
  "recentResults",
  "lastSeenAt",
  "dueAt",
  "mastery",
]);

const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9_]{2,12}$/u;
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_-]{0,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isIsoTimestamp(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === "string"
    && value.length >= 20
    && value.length <= 35
    && Number.isFinite(Date.parse(value));
}

function nowAsIso(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isJsonSafe(value, depth = 0) {
  if (depth > 8) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.length <= 200 && value.every((item) => isJsonSafe(item, depth + 1));
  }
  if (!isPlainObject(value) || Object.keys(value).length > 60) return false;
  return Object.entries(value).every(([key, item]) => (
    key !== "__proto__"
    && key !== "constructor"
    && key !== "prototype"
    && key.length <= 80
    && isJsonSafe(item, depth + 1)
  ));
}

export function isValidNickname(value) {
  return typeof value === "string" && NICKNAME_PATTERN.test(value);
}

export function createDefaultStorageData(now = () => new Date()) {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    profile: {
      nickname: null,
      createdAt: nowAsIso(now),
    },
    settings: {
      sound: false,
      reducedMotion: false,
      fontScale: 1,
      practiceLayout: "vertical",
      blockTypos: true,
    },
    progress: {
      skills: {},
      level2Prerequisites: {},
      experience: 0,
    },
    history: [],
    speedHistory: [],
    personalBest: {
      quick: null,
      daily: null,
    },
    pendingRankingSubmissions: [],
  };
}

function normalizeProblemResult(value, errors, path) {
  if (!isPlainObject(value) || !isJsonSafe(value)) {
    errors.push(path + " must be a JSON-safe object");
    return null;
  }

  const numericBounds = {
    elapsedMs: [0, 3_600_000],
    targetMs: [1, 300_000],
    correctKeystrokes: [0, 100_000],
    totalKeystrokes: [0, 100_000],
    errorCount: [0, 100_000],
  };
  for (const [key, bounds] of Object.entries(numericBounds)) {
    if (key in value && !isFiniteInRange(value[key], bounds[0], bounds[1])) {
      errors.push(path + "." + key + " is out of range");
    }
  }
  if ("cleanSolve" in value && typeof value.cleanSolve !== "boolean") {
    errors.push(path + ".cleanSolve must be boolean");
  }
  if ("slow" in value && typeof value.slow !== "boolean") {
    errors.push(path + ".slow must be boolean");
  }
  if ("completedAt" in value && !isIsoTimestamp(value.completedAt)) {
    errors.push(path + ".completedAt must be an ISO timestamp");
  }
  return jsonClone(value);
}

function normalizeSkill(value, errors, path) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, SKILL_KEYS)) {
    errors.push(path + " has an invalid shape or unknown fields");
    return null;
  }

  const defaults = {
    attempts: 0,
    cleanSolves: 0,
    correctKeystrokes: 0,
    totalKeystrokes: 0,
    averageElapsedMs: 0,
    recentResults: [],
    lastSeenAt: null,
    dueAt: null,
    mastery: 0,
  };
  const merged = { ...defaults, ...value };
  for (const key of ["attempts", "cleanSolves", "correctKeystrokes", "totalKeystrokes"]) {
    if (!isIntegerInRange(merged[key], 0, 10_000_000)) {
      errors.push(path + "." + key + " must be a non-negative integer");
    }
  }
  if (merged.cleanSolves > merged.attempts) {
    errors.push(path + ".cleanSolves cannot exceed attempts");
  }
  if (merged.correctKeystrokes > merged.totalKeystrokes) {
    errors.push(path + ".correctKeystrokes cannot exceed totalKeystrokes");
  }
  if (!isFiniteInRange(merged.averageElapsedMs, 0, 3_600_000)) {
    errors.push(path + ".averageElapsedMs is out of range");
  }
  if (!isIntegerInRange(merged.mastery, 0, 100)) {
    errors.push(path + ".mastery must be an integer from 0 to 100");
  }
  if (!isIsoTimestamp(merged.lastSeenAt, true) || !isIsoTimestamp(merged.dueAt, true)) {
    errors.push(path + " has an invalid lastSeenAt or dueAt timestamp");
  }
  if (!Array.isArray(merged.recentResults)) {
    errors.push(path + ".recentResults must be an array");
    merged.recentResults = [];
  }
  const recentResults = merged.recentResults
    .slice(-STORAGE_LIMITS.recentResultsPerSkill)
    .map((result, index) => normalizeProblemResult(result, errors, path + ".recentResults[" + index + "]"))
    .filter(Boolean);

  return {
    ...merged,
    recentResults,
  };
}

function normalizeLegacyWpmMetric(value) {
  const record = { ...value };
  if (!("cpm" in record) && Number.isFinite(Number(record.wpm))) {
    record.cpm = Math.round((Number(record.wpm) * 5 + Number.EPSILON) * 100) / 100;
  }
  delete record.wpm;
  return record;
}

function validateSessionRecord(value, errors, path, { preserveScoreProof = false } = {}) {
  if (!isPlainObject(value)) {
    errors.push(path + " must be a JSON-safe object");
    return null;
  }
  // Mastery owns bounded per-question history. Session history stores only the
  // summary, avoiding unbounded Practice results. Pending Quick submissions may
  // retain their <=40 score proof until the idempotent upload succeeds.
  const summary = normalizeLegacyWpmMetric(value);
  delete summary.problemResults;
  if (!preserveScoreProof) delete summary.problemScores;
  if (!isJsonSafe(summary)) {
    errors.push(path + " must be a JSON-safe object");
    return null;
  }
  const integerBounds = {
    score: [0, 10_000_000],
    finalScore: [0, 10_000_000],
    rawScore: [0, 10_000_000],
    // Untimed Practice has no 40-question/combo cap. Ranking validation owns
    // the stricter Quick Play eligibility limits.
    problemsSolved: [0, 100_000],
    bestCombo: [0, 100_000],
    // Local Practice can run without the ranked five-minute time limit.
    survivalMs: [0, 86_400_000],
    correctKeystrokes: [0, 1_000_000],
    totalKeystrokes: [0, 1_000_000],
    activeTypingMs: [0, 86_400_000],
  };
  for (const [key, bounds] of Object.entries(integerBounds)) {
    if (key in summary && !isFiniteInRange(summary[key], bounds[0], bounds[1])) {
      errors.push(path + "." + key + " is out of range");
    }
  }
  for (const key of ["accuracy", "cpm"]) {
    // The 1,250 타/분 ceiling is an online ranking eligibility rule, not the local
    // metric formula. Keep extreme but finite local results persistable.
    const maximum = key === "accuracy" ? 100 : 50_000;
    if (key in summary && !isFiniteInRange(summary[key], 0, maximum)) {
      errors.push(path + "." + key + " is out of range");
    }
  }
  if ("sessionId" in summary && !UUID_PATTERN.test(summary.sessionId)) {
    errors.push(path + ".sessionId must be a UUID");
  }
  return jsonClone(summary);
}

function normalizePendingSubmission(value, errors, path) {
  const result = validateSessionRecord(value, errors, path, { preserveScoreProof: true });
  if (!result) return null;
  const sessionId = result.sessionId;
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
    errors.push(path + ".sessionId is required");
  }
  return result;
}

function normalizeSpeedHistoryEntry(value, errors, path) {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ["cpm", "completedAt", "gameMode"])
      || !isFiniteInRange(value.cpm, 0, 50_000)
      || !isIsoTimestamp(value.completedAt)
      || !["quick", "daily", "practice"].includes(value.gameMode)) {
    errors.push(path + " is invalid");
    return null;
  }
  return {
    cpm: Math.round((value.cpm + Number.EPSILON) * 100) / 100,
    completedAt: value.completedAt,
    gameMode: value.gameMode,
  };
}

function migrateV0(value, now) {
  const defaults = createDefaultStorageData(now);
  const profile = isPlainObject(value.profile) ? value.profile : {};
  const settings = isPlainObject(value.settings) ? value.settings : {};
  const progress = isPlainObject(value.progress) ? value.progress : {};
  return {
    schemaVersion: 1,
    profile: {
      nickname: profile.nickname ?? value.nickname ?? null,
      createdAt: profile.createdAt ?? value.createdAt ?? defaults.profile.createdAt,
    },
    settings: {
      ...defaults.settings,
      ...settings,
    },
    progress: {
      skills: progress.skills ?? value.skills ?? {},
    },
    history: value.history ?? value.sessions ?? [],
    personalBest: {
      ...defaults.personalBest,
      ...(isPlainObject(value.personalBest) ? value.personalBest : {}),
    },
    pendingRankingSubmissions: value.pendingRankingSubmissions ?? [],
  };
}

function migrateV1(value) {
  const migrateRecord = (record) => (
    isPlainObject(record) ? normalizeLegacyWpmMetric(record) : record
  );
  const personalBest = isPlainObject(value.personalBest) ? value.personalBest : {};
  return {
    ...value,
    schemaVersion: 2,
    history: Array.isArray(value.history) ? value.history.map(migrateRecord) : [],
    personalBest: {
      ...personalBest,
      quick: migrateRecord(personalBest.quick ?? null),
      daily: migrateRecord(personalBest.daily ?? null),
    },
    pendingRankingSubmissions: Array.isArray(value.pendingRankingSubmissions)
      ? value.pendingRankingSubmissions.map(migrateRecord)
      : [],
  };
}

function migrateV2(value) {
  const speedHistory = (Array.isArray(value.history) ? value.history : [])
    .filter((record) => (
      Number.isFinite(Number(record?.cpm))
      && isIsoTimestamp(record?.completedAt)
      && ["quick", "daily", "practice"].includes(record?.gameMode)
    ))
    .map((record) => ({
      cpm: Math.round((Number(record.cpm) + Number.EPSILON) * 100) / 100,
      completedAt: record.completedAt,
      gameMode: record.gameMode,
    }))
    .slice(-SPEED_HISTORY_LIMIT);
  return { ...value, schemaVersion: 3, speedHistory };
}

function migrateV3(value) {
  const settings = isPlainObject(value.settings) ? value.settings : {};
  return {
    ...value,
    schemaVersion: 4,
    settings: {
      ...settings,
      blockTypos: settings.blockTypos ?? true,
    },
  };
}

function migrateV4(value) {
  const progress = isPlainObject(value.progress) ? value.progress : {};
  return {
    ...value,
    schemaVersion: 5,
    progress: {
      ...progress,
      experience: progress.experience ?? 0,
    },
  };
}

export const STORAGE_MIGRATIONS = Object.freeze({
  0: migrateV0,
  1: migrateV1,
  2: migrateV2,
  3: migrateV3,
  4: migrateV4,
});

export function migrateStorageData(input, now = () => new Date()) {
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["root must be an object"] };
  }
  let current = jsonClone(input);
  let version = Number.isInteger(current.schemaVersion) ? current.schemaVersion : 0;
  let migrated = false;

  while (version < STORAGE_SCHEMA_VERSION) {
    const migration = STORAGE_MIGRATIONS[version];
    if (typeof migration !== "function") {
      return { ok: false, errors: ["unsupported schema version " + version] };
    }
    current = migration(current, now);
    version = current.schemaVersion;
    migrated = true;
  }
  if (version !== STORAGE_SCHEMA_VERSION) {
    return { ok: false, errors: ["unsupported schema version " + version] };
  }
  return { ok: true, value: current, migrated };
}

export function validateStorageData(input) {
  const errors = [];
  if (!isPlainObject(input) || !hasOnlyKeys(input, ROOT_KEYS)) {
    return { ok: false, errors: ["root has an invalid shape or unknown fields"] };
  }
  if (input.schemaVersion !== STORAGE_SCHEMA_VERSION) {
    errors.push("schemaVersion must be " + STORAGE_SCHEMA_VERSION);
  }

  if (!isPlainObject(input.profile) || !hasOnlyKeys(input.profile, PROFILE_KEYS)) {
    errors.push("profile has an invalid shape or unknown fields");
  }
  const nickname = input.profile?.nickname;
  if (nickname !== null && !isValidNickname(nickname)) {
    errors.push("profile.nickname is invalid");
  }
  if (!isIsoTimestamp(input.profile?.createdAt)) {
    errors.push("profile.createdAt must be an ISO timestamp");
  }

  if (!isPlainObject(input.settings) || !hasOnlyKeys(input.settings, SETTINGS_KEYS)) {
    errors.push("settings has an invalid shape or unknown fields");
  }
  if (typeof input.settings?.sound !== "boolean" || typeof input.settings?.reducedMotion !== "boolean" || typeof input.settings?.blockTypos !== "boolean") {
    errors.push("settings sound, reducedMotion, and blockTypos must be boolean");
  }
  if (!isFiniteInRange(input.settings?.fontScale, 0.75, 1.5)) {
    errors.push("settings.fontScale must be between 0.75 and 1.5");
  }
  if (input.settings?.practiceLayout !== undefined
      && !PRACTICE_LAYOUTS.includes(input.settings.practiceLayout)) {
    errors.push("settings.practiceLayout must be horizontal or vertical");
  }

  if (!isPlainObject(input.progress) || !hasOnlyKeys(input.progress, PROGRESS_KEYS)
      || !isPlainObject(input.progress?.skills)
      || !isIntegerInRange(input.progress?.experience ?? 0, 0, 100000000)
      || (input.progress.level2Prerequisites !== undefined
        && !isPlainObject(input.progress.level2Prerequisites))) {
    errors.push("progress must contain valid skills, experience, and prerequisite data");
  }
  const skills = {};
  for (const [skillId, skill] of Object.entries(input.progress?.skills ?? {})) {
    if (!SKILL_ID_PATTERN.test(skillId)) {
      errors.push("progress.skills has an invalid skill id");
      continue;
    }
    const normalized = normalizeSkill(skill, errors, "progress.skills." + skillId);
    if (normalized) skills[skillId] = normalized;
  }
  const level2Prerequisites = {};
  const prerequisiteEntries = Object.entries(input.progress?.level2Prerequisites ?? {});
  if (prerequisiteEntries.length > 500) errors.push("progress.level2Prerequisites exceeds 500 entries");
  for (const [questionId, count] of prerequisiteEntries.slice(0, 500)) {
    if (questionId.length < 1 || questionId.length > 120 || !isIntegerInRange(count, 0, 2)) {
      errors.push("progress.level2Prerequisites has an invalid entry");
      continue;
    }
    level2Prerequisites[questionId] = count;
  }

  if (!Array.isArray(input.history)) {
    errors.push("history must be an array");
  }
  const history = (Array.isArray(input.history) ? input.history : [])
    .slice(-STORAGE_LIMITS.history)
    .map((entry, index) => validateSessionRecord(entry, errors, "history[" + index + "]"))
    .filter(Boolean);

  if (!Array.isArray(input.speedHistory)) {
    errors.push("speedHistory must be an array");
  }
  const speedHistory = (Array.isArray(input.speedHistory) ? input.speedHistory : [])
    .slice(-STORAGE_LIMITS.speedHistory)
    .map((entry, index) => normalizeSpeedHistoryEntry(entry, errors, "speedHistory[" + index + "]"))
    .filter(Boolean);

  if (!isPlainObject(input.personalBest) || !hasOnlyKeys(input.personalBest, PERSONAL_BEST_KEYS)) {
    errors.push("personalBest has an invalid shape or unknown fields");
  }
  const personalBest = { quick: null, daily: null };
  for (const mode of PERSONAL_BEST_KEYS) {
    const entry = input.personalBest?.[mode];
    if (entry !== null) {
      personalBest[mode] = validateSessionRecord(entry, errors, "personalBest." + mode);
    }
  }

  if (!Array.isArray(input.pendingRankingSubmissions)) {
    errors.push("pendingRankingSubmissions must be an array");
  }
  const pendingRankingSubmissions = (Array.isArray(input.pendingRankingSubmissions)
    ? input.pendingRankingSubmissions
    : [])
    .slice(-STORAGE_LIMITS.pendingRankingSubmissions)
    .map((entry, index) => normalizePendingSubmission(
      entry,
      errors,
      "pendingRankingSubmissions[" + index + "]",
    ))
    .filter(Boolean);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      profile: {
        nickname,
        createdAt: input.profile.createdAt,
      },
      settings: {
        sound: input.settings.sound,
        reducedMotion: input.settings.reducedMotion,
        fontScale: input.settings.fontScale,
        practiceLayout: input.settings.practiceLayout ?? "vertical",
        blockTypos: input.settings.blockTypos,
      },
      progress: {
        skills,
        level2Prerequisites,
        experience: input.progress.experience ?? 0,
      },
      history,
      speedHistory,
      personalBest,
      pendingRankingSubmissions,
    },
  };
}

function isQuotaError(error) {
  return error?.name === "QuotaExceededError"
    || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error?.code === 22
    || error?.code === 1014;
}

function resolveBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function listStorageKeys(storage) {
  try {
    if (Number.isInteger(storage?.length) && typeof storage.key === "function") {
      return Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key) => typeof key === "string");
    }
    if (typeof storage?.keys === "function") {
      return [...storage.keys()].filter((key) => typeof key === "string");
    }
  } catch {
    return [];
  }
  return [];
}

function comparePersonalBest(left, right) {
  if (!left) return -1;
  if (!right) return 1;
  const comparisons = [
    [left.score ?? left.finalScore ?? 0, right.score ?? right.finalScore ?? 0],
    [left.accuracy ?? 0, right.accuracy ?? 0],
    [left.problemsSolved ?? 0, right.problemsSolved ?? 0],
    [left.bestCombo ?? 0, right.bestCombo ?? 0],
    [left.cpm ?? 0, right.cpm ?? 0],
  ];
  for (const [a, b] of comparisons) {
    if (a !== b) return a > b ? 1 : -1;
  }
  return 0;
}

export class LocalStorageRepository {
  constructor({
    storage = resolveBrowserStorage(),
    key = STORAGE_KEY,
    legacyKeys = ["pythonTypingSurvival"],
    now = () => new Date(),
    onStatus = null,
  } = {}) {
    this.storage = storage;
    this.key = key;
    this.legacyKeys = legacyKeys.filter((legacyKey) => legacyKey !== key);
    this.now = now;
    this.onStatus = typeof onStatus === "function" ? onStatus : null;
    this.memory = createDefaultStorageData(now);
    this.loaded = false;
    this.persistent = Boolean(storage);
    this.lastStatus = {
      status: this.persistent ? "ready" : "memory",
      persistent: this.persistent,
    };
    this.memoryCorruptBackups = [];
  }

  emitStatus(status, details = {}) {
    this.lastStatus = { status, persistent: this.persistent, ...details };
    this.onStatus?.(this.getStatus());
  }

  getStatus() {
    return { ...this.lastStatus };
  }

  backupCorruptValue(raw) {
    const timestamp = nowAsIso(this.now).replaceAll(":", "-");
    const backupKey = CORRUPT_BACKUP_PREFIX + timestamp;
    this.memoryCorruptBackups.push({ key: backupKey, raw });
    try {
      this.storage?.setItem(backupKey, raw);
      return backupKey;
    } catch {
      return null;
    }
  }

  readRawValue() {
    const current = this.storage?.getItem(this.key);
    if (current !== null && current !== undefined) {
      return { raw: current, sourceKey: this.key };
    }
    for (const legacyKey of this.legacyKeys) {
      const raw = this.storage?.getItem(legacyKey);
      if (raw !== null && raw !== undefined) return { raw, sourceKey: legacyKey };
    }
    return { raw: null, sourceKey: this.key };
  }

  load() {
    if (this.loaded) return jsonClone(this.memory);
    this.loaded = true;
    if (!this.storage) {
      this.persistent = false;
      this.emitStatus("memory", { reason: "storage_unavailable" });
      return jsonClone(this.memory);
    }

    let rawEntry;
    try {
      rawEntry = this.readRawValue();
    } catch {
      this.persistent = false;
      this.emitStatus("memory", { reason: "storage_read_failed" });
      return jsonClone(this.memory);
    }
    if (rawEntry.raw === null) {
      this.emitStatus("ready");
      return jsonClone(this.memory);
    }

    let parsed;
    try {
      parsed = JSON.parse(rawEntry.raw);
    } catch {
      const backupKey = this.backupCorruptValue(rawEntry.raw);
      this.save(this.memory);
      this.emitStatus("recovered", { reason: "invalid_json", backupKey });
      return jsonClone(this.memory);
    }

    const migration = migrateStorageData(parsed, this.now);
    const validation = migration.ok ? validateStorageData(migration.value) : migration;
    if (!validation.ok) {
      const backupKey = this.backupCorruptValue(rawEntry.raw);
      this.save(this.memory);
      this.emitStatus("recovered", {
        reason: "invalid_data",
        backupKey,
        errors: [...validation.errors],
      });
      return jsonClone(this.memory);
    }

    this.memory = validation.value;
    if (migration.migrated || rawEntry.sourceKey !== this.key) {
      const saved = this.save(this.memory);
      if (saved.ok && saved.persistent && rawEntry.sourceKey !== this.key) {
        try {
          this.storage.removeItem(rawEntry.sourceKey);
        } catch {
          // The migrated v1 value is already safe; stale legacy cleanup is best effort.
        }
      }
      this.emitStatus("migrated", { fromKey: rawEntry.sourceKey });
    } else {
      this.emitStatus("ready");
    }
    return jsonClone(this.memory);
  }

  read() {
    return this.load();
  }

  trySetItem(candidate) {
    this.storage.setItem(this.key, JSON.stringify(candidate));
  }

  save(nextData) {
    const validation = validateStorageData(nextData);
    if (!validation.ok) {
      return {
        ok: false,
        persistent: this.persistent,
        status: "invalid",
        errors: [...validation.errors],
      };
    }
    const canonical = validation.value;
    this.memory = canonical;
    this.loaded = true;

    if (!this.storage || !this.persistent) {
      this.persistent = false;
      this.emitStatus("memory", { reason: "storage_unavailable" });
      return { ok: true, persistent: false, status: "memory", data: jsonClone(canonical) };
    }

    try {
      this.trySetItem(canonical);
      this.emitStatus("saved");
      return { ok: true, persistent: true, status: "saved", data: jsonClone(canonical) };
    } catch (error) {
      if (!isQuotaError(error)) {
        this.persistent = false;
        this.emitStatus("memory", { reason: "storage_write_failed" });
        return { ok: true, persistent: false, status: "memory", data: jsonClone(canonical) };
      }
    }

    const originalHistoryLength = canonical.history.length;
    for (const keep of [50, 20, 0]) {
      if (keep >= originalHistoryLength) continue;
      const compacted = {
        ...canonical,
        history: keep === 0 ? [] : canonical.history.slice(-keep),
      };
      try {
        this.trySetItem(compacted);
        this.memory = compacted;
        this.emitStatus("compacted", {
          removedHistory: originalHistoryLength - compacted.history.length,
        });
        return {
          ok: true,
          persistent: true,
          status: "compacted",
          removedHistory: originalHistoryLength - compacted.history.length,
          data: jsonClone(compacted),
        };
      } catch (error) {
        if (!isQuotaError(error)) {
          break;
        }
      }
    }

    const originalSpeedHistoryLength = canonical.speedHistory.length;
    for (const keep of [1_000, 500, 100]) {
      if (keep >= originalSpeedHistoryLength) continue;
      const compacted = {
        ...canonical,
        history: [],
        speedHistory: canonical.speedHistory.slice(-keep),
      };
      try {
        this.trySetItem(compacted);
        this.memory = compacted;
        this.emitStatus("compacted", {
          removedSpeedHistory: originalSpeedHistoryLength - compacted.speedHistory.length,
        });
        return {
          ok: true,
          persistent: true,
          status: "compacted",
          removedSpeedHistory: originalSpeedHistoryLength - compacted.speedHistory.length,
          data: jsonClone(compacted),
        };
      } catch (error) {
        if (!isQuotaError(error)) break;
      }
    }

    this.memory = canonical;
    this.persistent = false;
    this.emitStatus("memory", { reason: "storage_quota_exceeded" });
    return { ok: true, persistent: false, status: "memory", data: jsonClone(canonical) };
  }

  update(updater) {
    const current = this.read();
    const draft = jsonClone(current);
    const returned = updater(draft);
    return this.save(returned === undefined ? draft : returned);
  }

  setNickname(nickname) {
    const normalized = typeof nickname === "string" ? nickname.trim() : "";
    if (!isValidNickname(normalized)) {
      return { ok: false, status: "invalid", errors: ["nickname is invalid"] };
    }
    return this.update((state) => {
      state.profile.nickname = normalized;
    });
  }

  setSettings(partialSettings) {
    if (!isPlainObject(partialSettings) || !hasOnlyKeys(partialSettings, SETTINGS_KEYS)) {
      return { ok: false, status: "invalid", errors: ["settings are invalid"] };
    }
    return this.update((state) => {
      state.settings = { ...state.settings, ...partialSettings };
    });
  }

  setSkillProgress(skillId, skillProgress) {
    if (!SKILL_ID_PATTERN.test(skillId)) {
      return { ok: false, status: "invalid", errors: ["skill id is invalid"] };
    }
    return this.update((state) => {
      state.progress.skills[skillId] = skillProgress;
    });
  }

  recordSession(session, { updatePersonalBest = true } = {}) {
    if (!isPlainObject(session)) {
      return { ok: false, status: "invalid", errors: ["session must be an object"] };
    }
    return this.update((state) => {
      state.history.push(jsonClone(session));
      if (session.endedNormally !== false && Number.isFinite(Number(session.cpm))
          && isIsoTimestamp(session.completedAt)
          && ["quick", "daily", "practice"].includes(session.gameMode ?? session.mode)) {
        state.speedHistory.push({
          cpm: Number(session.cpm),
          completedAt: session.completedAt,
          gameMode: session.gameMode ?? session.mode,
        });
      }
      const mode = session.gameMode ?? session.mode;
      if (updatePersonalBest && (mode === "quick" || mode === "daily")) {
        if (comparePersonalBest(session, state.personalBest[mode]) > 0) {
          state.personalBest[mode] = jsonClone(session);
        }
      }
    });
  }

  enqueueRankingSubmission(submission) {
    return this.update((state) => {
      state.pendingRankingSubmissions = state.pendingRankingSubmissions
        .filter((item) => item.sessionId !== submission.sessionId);
      state.pendingRankingSubmissions.push(jsonClone(submission));
    });
  }

  removePendingRankingSubmission(sessionId) {
    return this.update((state) => {
      state.pendingRankingSubmissions = state.pendingRankingSubmissions
        .filter((item) => item.sessionId !== sessionId);
    });
  }

  reset({ confirmed = false } = {}) {
    if (!confirmed) {
      return {
        ok: false,
        status: "confirmation_required",
        removes: [...RESET_SCOPE],
      };
    }
    const defaults = createDefaultStorageData(this.now);
    this.memory = defaults;
    this.loaded = true;
    if (!this.storage) {
      this.persistent = false;
      this.emitStatus("reset_memory");
      return { ok: true, persistent: false, status: "reset", data: jsonClone(defaults) };
    }
    try {
      const keysToRemove = new Set([
        this.key,
        ...this.legacyKeys,
        ...listStorageKeys(this.storage)
          .filter((key) => key.startsWith(CORRUPT_BACKUP_PREFIX)),
      ]);
      for (const key of keysToRemove) this.storage.removeItem(key);
      this.memoryCorruptBackups = [];
      this.persistent = true;
      this.emitStatus("reset");
      return { ok: true, persistent: true, status: "reset", data: jsonClone(defaults) };
    } catch {
      this.persistent = false;
      this.emitStatus("reset_memory", { reason: "storage_remove_failed" });
      return { ok: true, persistent: false, status: "reset", data: jsonClone(defaults) };
    }
  }
}

export function createStorageRepository(options) {
  return new LocalStorageRepository(options);
}
