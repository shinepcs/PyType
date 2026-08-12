import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generateQuestion, getRegisteredGeneratorIds } from "../js/content/generators.js";
import {
  createQuestionRepository,
  loadContentData,
} from "../js/content/question-repository.js";
import {
  REQUIRED_SKILL_IDS,
  validateContentBundle,
  validateQuestion,
} from "../js/content/validate-content.js";
import { createSeededRandom, deriveSeed } from "../js/utils/random.js";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

const bundle = {
  skills: await readJson("../data/skills.json"),
  questions: await readJson("../data/questions.json"),
  templates: await readJson("../data/question-templates.json"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("content bundle validates required coverage", () => {
  const report = validateContentBundle(bundle);
  assert.equal(report.valid, true, report.issues.map((item) => `${item.path}: ${item.message}`).join("\n"));
  assert.equal(report.stats.contentVersion, "1.0.0");
  assert.equal(report.stats.skills, REQUIRED_SKILL_IDS.length);
  assert.equal(report.stats.staticCount, 92);
  assert.equal(report.stats.templateCount, 27);
  assert.equal(report.stats.generatedEquivalentCount, 324);
  assert.equal(report.stats.totalEquivalentCount, 416);
  assert.ok(report.stats.byLevel[1] >= 50);
  assert.ok(report.stats.byLevel[2] >= 50);
  REQUIRED_SKILL_IDS.forEach((skill) => assert.ok(report.stats.bySkill[skill] >= 6, skill));
});

test("all static level contracts, blanks, outputs, and exact copy answers hold", () => {
  for (const question of bundle.questions.questions) {
    assert.deepEqual(validateQuestion(question, {
      skillIds: new Set(REQUIRED_SKILL_IDS),
      contentVersion: "1.0.0",
    }), []);
    if (question.level === 1) {
      assert.equal(question.type, "copy");
      assert.equal(question.answer, question.code);
      assert.equal(question.code.includes("_____"), false);
    } else {
      assert.equal(question.type, "fill");
      assert.equal(question.code.split("_____").length - 1, 1);
      assert.ok(question.output.length > 0);
      assert.ok(question.answer.length > 0);
    }
  }
});

test("every registered template generator is deterministic for representative seeds", () => {
  const usedGeneratorIds = new Set();
  for (const template of bundle.templates.templates) {
    usedGeneratorIds.add(template.generatorId);
    for (const seed of [0, 1, "daily:2026-08-11", "한글-seed", 0xffff_ffff]) {
      assert.deepEqual(generateQuestion(template, seed), generateQuestion(template, seed), `${template.id}:${seed}`);
    }
  }
  usedGeneratorIds.forEach((generatorId) => assert.ok(getRegisteredGeneratorIds().includes(generatorId)));
});

test("repository expands certified template variants into a unique deterministic pool", () => {
  const repository = createQuestionRepository(bundle);
  const first = repository.getAll({ seed: "quick-session-42" });
  const second = repository.getAll({ seed: "quick-session-42" });
  const other = repository.getAll({ seed: "quick-session-43" });

  assert.equal(first.length, 416);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((question) => question.instanceId)).size, first.length);
  assert.notDeepEqual(first.map((question) => question.instanceId), other.map((question) => question.instanceId));
  assert.equal(repository.getAll({ seed: 1, skills: ["range"], levels: [2] }).length, 13);
  assert.equal(repository.getById("print.copy.001").answer, "print(\"Hello, Python!\")");
  assert.equal(repository.getById("missing.question"), null);
});

test("validator rejects duplicate ids and equivalent duplicate content", () => {
  const duplicateIdBundle = clone(bundle);
  duplicateIdBundle.questions.questions[1].id = duplicateIdBundle.questions.questions[0].id;
  let report = validateContentBundle(duplicateIdBundle);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "duplicate-id"));

  const duplicateContentBundle = clone(bundle);
  const source = duplicateContentBundle.questions.questions[0];
  Object.assign(duplicateContentBundle.questions.questions[1], {
    level: source.level,
    type: source.type,
    skill: source.skill,
    difficulty: source.difficulty,
    code: source.code,
    output: source.output,
    outputMode: source.outputMode,
    answer: source.answer,
    acceptedAnswers: source.acceptedAnswers,
    targetSeconds: source.targetSeconds,
    tags: source.tags,
  });
  report = validateContentBundle(duplicateContentBundle);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((item) => item.code === "duplicate-content"));
});

test("validator rejects malformed schema, unknown references, and unsafe formatting", () => {
  const malformed = clone(bundle);
  Object.assign(malformed.questions.questions[1], {
    skill: "mystery",
    code: "_____ + _____\t",
    acceptedAnswers: [],
  });
  malformed.templates.templates[0].generatorId = "notRegistered";
  const report = validateContentBundle(malformed);
  const codes = new Set(report.issues.map((item) => item.code));

  assert.equal(report.valid, false);
  assert.ok(codes.has("unknown-skill"));
  assert.ok(codes.has("blank-count"));
  assert.ok(codes.has("tab"));
  assert.ok(codes.has("trailing-whitespace"));
  assert.ok(codes.has("invalid-answers"));
  assert.ok(codes.has("unknown-generator"));
});

test("production repository excludes an invalid item while strict validation still fails", () => {
  const malformed = clone(bundle);
  const invalidId = malformed.questions.questions[0].id;
  malformed.questions.questions[0].targetSeconds = 99;
  assert.throws(() => createQuestionRepository(malformed));
  let recordedIssues = [];
  const repository = createQuestionRepository(malformed, {
    strict: false,
    onIssues: (issues) => { recordedIssues = issues; },
  });
  assert.ok(recordedIssues.some((issue) => issue.path.startsWith("questionsDocument.questions[0]")));
  assert.equal(repository.getAll({ seed: "production-salvage" }).some((item) => item.sourceId === invalidId), false);
  assert.equal(repository.getAll({ seed: "production-salvage" }).length, 415);
});

test("production recovery rejects structural, version, or unplayable bulk corruption", () => {
  const wrongVersion = clone(bundle);
  wrongVersion.skills.contentVersion = "0.9.0";
  assert.throws(() => createQuestionRepository(wrongVersion, { strict: false }), /content version/u);

  const noPlayableSources = clone(bundle);
  noPlayableSources.questions.questions = [];
  noPlayableSources.templates.templates = [];
  assert.throws(() => createQuestionRepository(noPlayableSources, { strict: false }), /No valid learning content/u);

  const noLevel2 = clone(bundle);
  for (const question of noLevel2.questions.questions) {
    if (question.level === 2) question.targetSeconds = 99;
  }
  for (const template of noLevel2.templates.templates) {
    if (template.level === 2) template.targetSeconds = 99;
  }
  assert.throws(() => createQuestionRepository(noLevel2, { strict: false }), /playable MVP minimum/u);

  const singlePrintSource = clone(bundle);
  let keptPrintSource = false;
  for (const source of [...singlePrintSource.questions.questions, ...singlePrintSource.templates.templates]) {
    if (source.skill !== "print") continue;
    if (!keptPrintSource) {
      keptPrintSource = true;
    } else {
      source.targetSeconds = 99;
    }
  }
  assert.throws(() => createQuestionRepository(singlePrintSource, { strict: false }), /playable MVP minimum/u);
});

test("relative content loader requests GitHub Pages-safe data paths", async () => {
  const calls = [];
  const documents = new Map([
    ["./data/skills.json", bundle.skills],
    ["./data/questions.json", bundle.questions],
    ["./data/question-templates.json", bundle.templates],
  ]);
  const fetchImpl = async (url) => {
    const key = String(url);
    calls.push(key);
    return {
      ok: documents.has(key),
      status: documents.has(key) ? 200 : 404,
      json: async () => clone(documents.get(key)),
    };
  };

  const loaded = await loadContentData({ fetchImpl });
  assert.deepEqual(loaded, bundle);
  assert.deepEqual(calls.sort(), [...documents.keys()].sort());
});

test("seeded random utilities repeat sequences and derive independent stable seeds", () => {
  const first = createSeededRandom("session");
  const second = createSeededRandom("session");
  assert.deepEqual(
    Array.from({ length: 8 }, () => first()),
    Array.from({ length: 8 }, () => second()),
  );
  assert.equal(deriveSeed("session", "range", 3), deriveSeed("session", "range", 3));
  assert.notEqual(deriveSeed("session", "range", 3), deriveSeed("session", "range", 4));
});

test("content JSON contains data only and no dynamic execution payloads", () => {
  const raw = JSON.stringify(bundle);
  assert.equal(/\beval\s*\(/u.test(raw), false);
  assert.equal(/new\s+Function\b/u.test(raw), false);
  assert.equal(/<script\b/iu.test(raw), false);
});

function parseSimplePythonList(text) {
  return JSON.parse(
    text
      .replaceAll("'", "\"")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g, "null"),
  );
}

test("all random example outputs are possible for their declared operation", () => {
  const repository = createQuestionRepository(bundle);
  const examples = repository.getAll({ seed: "example-audit" }).filter((question) => question.outputMode === "example");
  assert.equal(examples.length, 28);

  for (const question of examples) {
    const completedCode = question.type === "fill"
      ? question.code.replace("_____", question.answer)
      : question.code;
    if (question.skill === "random") {
      const match = completedCode.match(/random\.randint\((-?\d+), (-?\d+)\)/u);
      assert.ok(match, question.instanceId);
      const output = Number(question.output);
      assert.ok(Number.isInteger(output));
      assert.ok(output >= Number(match[1]) && output <= Number(match[2]), question.instanceId);
    } else {
      assert.equal(question.skill, "shuffle");
      const sourceMatch = completedCode.match(/(?:items|letters) = (\[[^\n]+\])/u);
      assert.ok(sourceMatch, question.instanceId);
      const source = parseSimplePythonList(sourceMatch[1]).map((value) => JSON.stringify(value)).sort();
      const example = parseSimplePythonList(question.output).map((value) => JSON.stringify(value)).sort();
      assert.deepEqual(example, source, question.instanceId);
    }
  }
});
