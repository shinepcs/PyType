const GUIDE_CONTENT_VERSION = "1.0.0";
const REQUIRED_SAMPLE_COUNT = 50;
const ID_PATTERN = /^beginner\.practical\.\d{3}$/;
const SKILL_PATTERN = /^[a-z][a-z0-9-]*$/;

function assertText(value, label, { minimum = 1, maximum = 1_000 } = {}) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw new TypeError(`${label} must be ${minimum}..${maximum} characters.`);
  }
}

export function validateBeginnerGuideDocument(document) {
  const issues = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return ["document must be an object"];
  }
  if (document.contentVersion !== GUIDE_CONTENT_VERSION) issues.push("contentVersion must be 1.0.0");
  if (!Array.isArray(document.samples) || document.samples.length !== REQUIRED_SAMPLE_COUNT) {
    issues.push(`samples must contain exactly ${REQUIRED_SAMPLE_COUNT} items`);
    return issues;
  }

  const ids = new Set();
  document.samples.forEach((sample, index) => {
    const path = `samples[${index}]`;
    try {
      assertText(sample?.id, `${path}.id`, { maximum: 40 });
      assertText(sample?.title, `${path}.title`, { minimum: 2, maximum: 40 });
      assertText(sample?.skill, `${path}.skill`, { maximum: 30 });
      assertText(sample?.code, `${path}.code`, { minimum: 40, maximum: 1_000 });
    } catch (error) {
      issues.push(error.message);
      return;
    }
    if (!ID_PATTERN.test(sample.id)) issues.push(`${path}.id has an invalid format`);
    if (ids.has(sample.id)) issues.push(`${path}.id is duplicated`);
    ids.add(sample.id);
    if (!SKILL_PATTERN.test(sample.skill)) issues.push(`${path}.skill has an invalid format`);
    const lines = sample.code.split("\n");
    if (lines.length < 4 || lines.length > 12) issues.push(`${path}.code must contain 4..12 lines`);
    if (!sample.code.startsWith("# ")) issues.push(`${path}.code must start with a Korean guide comment`);
    if (!/^# .*[가-힣]/u.test(lines[0])) issues.push(`${path}.code guide comment must contain Korean text`);
    if (/\t|\r/u.test(sample.code)) issues.push(`${path}.code contains a tab or CR`);
    if (/[ \t]+$/mu.test(sample.code)) issues.push(`${path}.code contains trailing whitespace`);
    if (sample.code.includes("_____")) issues.push(`${path}.code contains a blank token`);
  });
  return issues;
}

function toRuntimeQuestion(sample, contentVersion) {
  const targetSeconds = Math.min(120, Math.max(20, Math.ceil(sample.code.length / 3)));
  return Object.freeze({
    id: sample.id,
    instanceId: sample.id,
    sourceId: sample.id,
    seed: null,
    contentVersion,
    level: 1,
    type: "copy",
    skill: sample.skill,
    difficulty: 2,
    code: sample.code,
    output: "",
    outputMode: "exact",
    answer: sample.code,
    acceptedAnswers: Object.freeze([sample.code]),
    targetSeconds,
    tags: Object.freeze(["beginner-guide", "practical"]),
    guideTitle: sample.title,
  });
}

export async function loadBeginnerGuideQuestions({
  baseUrl = "./data/",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  const prefix = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const response = await fetchImpl(`${prefix}beginner-guide.json`, { headers: { Accept: "application/json" } });
  if (!response?.ok) throw new Error(`Could not load Beginner Guide (HTTP ${response?.status ?? "unknown"}).`);
  const document = await response.json();
  const issues = validateBeginnerGuideDocument(document);
  if (issues.length > 0) throw new Error(`Beginner Guide validation failed: ${issues[0]}`);
  return Object.freeze(document.samples.map((sample) => toRuntimeQuestion(sample, document.contentVersion)));
}

export const BEGINNER_GUIDE_SAMPLE_COUNT = REQUIRED_SAMPLE_COUNT;
