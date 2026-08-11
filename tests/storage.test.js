import test from "node:test";
import assert from "node:assert/strict";

import {
  CORRUPT_BACKUP_PREFIX,
  RESET_SCOPE,
  STORAGE_KEY,
  STORAGE_LIMITS,
  LocalStorageRepository,
  createDefaultStorageData,
  validateStorageData,
} from "../js/services/storage.js";

const FIXED_NOW = new Date("2026-08-11T00:00:00.000Z");

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  keys() {
    return [...this.values.keys()];
  }
}

class HistoryQuotaStorage extends MemoryStorage {
  constructor(maxHistory) {
    super();
    this.maxHistory = maxHistory;
  }

  setItem(key, value) {
    if (key === STORAGE_KEY) {
      const parsed = JSON.parse(value);
      if (parsed.history.length > this.maxHistory) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
    }
    super.setItem(key, value);
  }
}

class AlwaysQuotaStorage extends MemoryStorage {
  setItem(key, value) {
    if (key === STORAGE_KEY) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    super.setItem(key, value);
  }
}

function repository(storage) {
  return new LocalStorageRepository({ storage, now: () => FIXED_NOW });
}

function session(index, mode = "quick") {
  return {
    sessionId: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
    gameMode: mode,
    score: index,
    accuracy: 95,
    cpm: 200,
    problemsSolved: 20,
    bestCombo: 10,
    survivalMs: mode === "practice" ? 600_000 : 240_000,
    completedAt: FIXED_NOW.toISOString(),
  };
}

test("default storage state uses the versioned root schema", () => {
  const data = createDefaultStorageData(() => FIXED_NOW);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.profile.nickname, null);
  assert.equal(data.settings.sound, false);
  assert.equal(data.settings.practiceLayout, "vertical");
  assert.deepEqual(data.progress.skills, {});
  assert.deepEqual(data.history, []);
  assert.equal(validateStorageData(data).ok, true);
});

test("unknown root and nested fields are rejected before persistence", () => {
  const rootUnknown = { ...createDefaultStorageData(() => FIXED_NOW), surprise: true };
  assert.equal(validateStorageData(rootUnknown).ok, false);

  const settingsUnknown = createDefaultStorageData(() => FIXED_NOW);
  settingsUnknown.settings.tracking = true;
  assert.equal(validateStorageData(settingsUnknown).ok, false);
});

test("practice layout accepts both orientations and upgrades older v1 settings", () => {
  const vertical = createDefaultStorageData(() => FIXED_NOW);
  vertical.settings.practiceLayout = "vertical";
  assert.equal(validateStorageData(vertical).ok, true);

  const invalid = createDefaultStorageData(() => FIXED_NOW);
  invalid.settings.practiceLayout = "diagonal";
  assert.equal(validateStorageData(invalid).ok, false);

  const olderV1 = createDefaultStorageData(() => FIXED_NOW);
  delete olderV1.settings.practiceLayout;
  const normalized = validateStorageData(olderV1);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.settings.practiceLayout, "vertical");
});

test("schema v0 data migrates explicitly and replaces the legacy key", () => {
  const storage = new MemoryStorage([
    ["pythonTypingSurvival", JSON.stringify({
      nickname: "PyLearner",
      settings: { sound: true },
      sessions: [session(1)],
      skills: {},
    })],
  ]);
  const repo = repository(storage);

  const loaded = repo.load();

  assert.equal(loaded.schemaVersion, 2);
  assert.equal(loaded.profile.nickname, "PyLearner");
  assert.equal(loaded.settings.sound, true);
  assert.equal(loaded.history.length, 1);
  assert.equal(storage.getItem("pythonTypingSurvival"), null);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(repo.getStatus().status, "migrated");
});

test("v1 speed records migrate to equivalent 분당 타수 values", () => {
  const legacy = createDefaultStorageData(() => FIXED_NOW);
  legacy.schemaVersion = 1;
  legacy.history = [{ ...session(1), wpm: 40 }];
  delete legacy.history[0].cpm;
  const repo = repository(new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]));

  const loaded = repo.load();

  assert.equal(loaded.schemaVersion, 2);
  assert.equal(loaded.history[0].cpm, 200);
  assert.equal("wpm" in loaded.history[0], false);
});

test("corrupt JSON is backed up verbatim and recovered to defaults", () => {
  const corrupt = "{not valid json";
  const storage = new MemoryStorage([[STORAGE_KEY, corrupt]]);
  const repo = repository(storage);

  const loaded = repo.load();

  assert.equal(loaded.profile.nickname, null);
  const backupKey = storage.keys().find((key) => key.startsWith(CORRUPT_BACKUP_PREFIX));
  assert.ok(backupKey);
  assert.equal(storage.getItem(backupKey), corrupt);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, 2);
  assert.equal(repo.getStatus().status, "recovered");
});

test("invalid saved ranges recover without interrupting load", () => {
  const invalid = createDefaultStorageData(() => FIXED_NOW);
  invalid.settings.fontScale = 99;
  const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(invalid)]]);

  const loaded = repository(storage).load();

  assert.equal(loaded.settings.fontScale, 1);
  assert.ok(storage.keys().some((key) => key.startsWith(CORRUPT_BACKUP_PREFIX)));
});

test("history and skill recent results retain only documented newest limits", () => {
  const storage = new MemoryStorage();
  const repo = repository(storage);
  const data = repo.load();
  data.history = Array.from({ length: 125 }, (_, index) => session(index + 1));
  data.progress.skills.print = {
    attempts: 25,
    cleanSolves: 20,
    correctKeystrokes: 100,
    totalKeystrokes: 110,
    averageElapsedMs: 5_000,
    recentResults: Array.from({ length: 25 }, (_, index) => ({ questionId: "q" + index })),
    lastSeenAt: FIXED_NOW.toISOString(),
    dueAt: FIXED_NOW.toISOString(),
    mastery: 90,
  };

  const saved = repo.save(data);

  assert.equal(saved.ok, true);
  assert.equal(saved.data.history.length, STORAGE_LIMITS.history);
  assert.equal(saved.data.history[0].score, 26);
  assert.equal(
    saved.data.progress.skills.print.recentResults.length,
    STORAGE_LIMITS.recentResultsPerSkill,
  );
  assert.equal(saved.data.progress.skills.print.recentResults[0].questionId, "q5");
});

test("quota recovery removes oldest history before protected learning data", () => {
  const storage = new HistoryQuotaStorage(20);
  const repo = repository(storage);
  const data = repo.load();
  data.profile.nickname = "Keeper";
  data.settings.reducedMotion = true;
  data.progress.skills.print = {
    attempts: 1,
    cleanSolves: 1,
    correctKeystrokes: 10,
    totalKeystrokes: 10,
    averageElapsedMs: 1_000,
    recentResults: [],
    lastSeenAt: FIXED_NOW.toISOString(),
    dueAt: FIXED_NOW.toISOString(),
    mastery: 100,
  };
  data.history = Array.from({ length: 80 }, (_, index) => session(index + 1));

  const saved = repo.save(data);

  assert.equal(saved.status, "compacted");
  assert.equal(saved.removedHistory, 60);
  assert.equal(saved.data.history.length, 20);
  assert.equal(saved.data.history[0].score, 61);
  assert.equal(saved.data.profile.nickname, "Keeper");
  assert.equal(saved.data.settings.reducedMotion, true);
  assert.equal(saved.data.progress.skills.print.mastery, 100);
});

test("unrecoverable quota failure keeps the full current state in memory", () => {
  const repo = repository(new AlwaysQuotaStorage());
  const data = repo.load();
  data.profile.nickname = "MemoryOnly";
  data.history = Array.from({ length: 80 }, (_, index) => session(index + 1));

  const saved = repo.save(data);

  assert.equal(saved.ok, true);
  assert.equal(saved.persistent, false);
  assert.equal(saved.status, "memory");
  assert.equal(repo.read().profile.nickname, "MemoryOnly");
  assert.equal(repo.read().history.length, 80);
  assert.equal(repo.getStatus().reason, "storage_quota_exceeded");
});

test("untimed Practice history can exceed the ranked five-minute bound", () => {
  const repo = repository(new MemoryStorage());
  const result = repo.recordSession({
    ...session(1, "practice"),
    cpm: 1_500,
    problemsSolved: 100,
    bestCombo: 75,
  });
  assert.equal(result.ok, true);
  assert.equal(repo.read().history[0].survivalMs, 600_000);
  assert.equal(repo.read().history[0].cpm, 1_500);
  assert.equal(repo.read().history[0].problemsSolved, 100);
  assert.equal(repo.read().history[0].bestCombo, 75);
});

test("session history strips unbounded question details after mastery can consume them", () => {
  const repo = repository(new MemoryStorage());
  const result = repo.recordSession({
    ...session(1, "practice"),
    problemScores: [10, 20],
    problemResults: Array.from({ length: 500 }, (_, index) => ({
      questionId: "practice." + index,
      problemScore: 10,
    })),
  });

  assert.equal(result.ok, true);
  assert.equal("problemResults" in repo.read().history[0], false);
  assert.equal("problemScores" in repo.read().history[0], false);
});

test("ranking retry queue is session-idempotent and bounded", () => {
  const repo = repository(new MemoryStorage());
  for (let index = 1; index <= 25; index += 1) {
    assert.equal(repo.enqueueRankingSubmission(session(index)).ok, true);
  }
  assert.equal(repo.enqueueRankingSubmission({
    ...session(25),
    score: 999,
    problemScores: [799],
  }).ok, true);

  const pending = repo.read().pendingRankingSubmissions;
  assert.equal(pending.length, STORAGE_LIMITS.pendingRankingSubmissions);
  assert.equal(pending.filter((entry) => entry.sessionId === session(25).sessionId).length, 1);
  assert.equal(pending.at(-1).score, 999);
  assert.deepEqual(pending.at(-1).problemScores, [799]);
});

test("reset requires confirmation and reports the entire deletion scope", () => {
  const storage = new MemoryStorage();
  const repo = repository(storage);
  assert.equal(repo.setNickname("PythonKing").ok, true);
  storage.setItem(CORRUPT_BACKUP_PREFIX + "old", "old raw value");

  const blocked = repo.reset();
  assert.equal(blocked.status, "confirmation_required");
  assert.deepEqual(blocked.removes, [...RESET_SCOPE]);
  assert.equal(repo.read().profile.nickname, "PythonKing");

  const reset = repo.reset({ confirmed: true });
  assert.equal(reset.ok, true);
  assert.equal(reset.data.profile.nickname, null);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(CORRUPT_BACKUP_PREFIX + "old"), null);
});

test("nickname validation rejects HTML and preserves the prior profile", () => {
  const repo = repository(new MemoryStorage());
  assert.equal(repo.setNickname("Safe_Name").ok, true);
  const rejected = repo.setNickname("<img src=x>");
  assert.equal(rejected.ok, false);
  assert.equal(repo.read().profile.nickname, "Safe_Name");
});
