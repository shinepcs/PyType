import {
  BLANK_TOKEN,
  generateQuestion,
  getRegisteredGeneratorIds,
  hasGenerator,
} from "./generators.js";

export const CONTENT_VERSION = "1.0.0";
export const CURRENT_CONTENT_VERSION = CONTENT_VERSION;

export const REQUIRED_SKILL_IDS = Object.freeze([
  "print",
  "variable",
  "assignment",
  "number",
  "string",
  "boolean",
  "arithmetic",
  "comparison",
  "if",
  "elif",
  "else",
  "for",
  "range",
  "while",
  "break",
  "continue",
  "list",
  "set",
  "array",
  "file",
  "json",
  "append",
  "pop",
  "sort",
  "reverse",
  "len",
  "sum",
  "min",
  "max",
  "random",
  "shuffle",
]);

const ALLOWED_CATEGORIES = new Set([
  "output",
  "variables",
  "values",
  "operators",
  "conditions",
  "loops",
  "flow",
  "collections",
  "builtins",
  "modules",
]);
const ALLOWED_TYPES = new Set(["copy", "fill"]);
const ALLOWED_OUTPUT_MODES = new Set(["exact", "example"]);
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const GENERATOR_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const RUNTIME_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*(?:@[a-f0-9]{8})?$/;
const TAG_PATTERN = /^[a-z][a-z0-9-]*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const SKILL_KEYS = new Set(["id", "category", "label", "description", "order", "enabled"]);
const QUESTION_KEYS = new Set([
  "id",
  "contentVersion",
  "level",
  "type",
  "skill",
  "difficulty",
  "code",
  "output",
  "outputMode",
  "answer",
  "acceptedAnswers",
  "targetSeconds",
  "tags",
  "enabled",
]);
const TEMPLATE_KEYS = new Set([
  "id",
  "contentVersion",
  "level",
  "type",
  "skill",
  "difficulty",
  "generatorId",
  "parameters",
  "variantCount",
  "targetSeconds",
  "tags",
  "enabled",
]);
const RUNTIME_KEYS = new Set([
  "id",
  "instanceId",
  "sourceId",
  "seed",
  "contentVersion",
  "level",
  "type",
  "skill",
  "difficulty",
  "code",
  "output",
  "outputMode",
  "answer",
  "acceptedAnswers",
  "targetSeconds",
  "tags",
]);

export class ContentValidationError extends Error {
  constructor(issues) {
    const preview = issues
      .slice(0, 5)
      .map((item) => `${item.path}: ${item.message}`)
      .join("; ");
    super(`Content validation failed with ${issues.length} issue(s). ${preview}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

function addIssue(issues, path, code, message) {
  issues.push({ path, code, message });
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function checkUnknownKeys(value, allowedKeys, path, issues) {
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addIssue(issues, `${path}.${key}`, "unknown-field", `Unknown field "${key}".`);
    }
  }
}

function requirePlainObject(value, path, issues) {
  if (!isPlainObject(value)) {
    addIssue(issues, path, "invalid-type", "Expected an object.");
    return false;
  }
  return true;
}

function requireString(value, path, issues, { allowEmpty = false, maximum = Infinity } = {}) {
  if (typeof value !== "string") {
    addIssue(issues, path, "invalid-type", "Expected a string.");
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, "empty-string", "String must not be empty.");
  }
  if (value.length > maximum) {
    addIssue(issues, path, "too-long", `String must be at most ${maximum} characters.`);
  }
  return true;
}

function validateTextFormatting(value, path, issues, { allowEmpty = false, maximum = Infinity } = {}) {
  if (!requireString(value, path, issues, { allowEmpty, maximum })) {
    return;
  }
  if (value.includes("\r")) {
    addIssue(issues, path, "carriage-return", "Use LF line endings; carriage returns are not allowed.");
  }
  if (value.includes("\t")) {
    addIssue(issues, path, "tab", "Tabs are not allowed; use four spaces for indentation.");
  }
  if (value.startsWith("\n") || value.endsWith("\n")) {
    addIssue(issues, path, "outer-newline", "Leading and trailing newlines are not allowed.");
  }
  value.split("\n").forEach((line, index) => {
    if (line !== line.trimEnd()) {
      addIssue(issues, `${path}:line${index + 1}`, "trailing-whitespace", "Trailing whitespace is not allowed.");
    }
  });
}

function validateIdentifier(value, path, issues) {
  if (requireString(value, path, issues) && !IDENTIFIER_PATTERN.test(value)) {
    addIssue(issues, path, "invalid-identifier", "Use lowercase letters, digits, dots, or hyphens in a stable id.");
  }
}

function validateVersion(value, path, issues) {
  if (requireString(value, path, issues, { maximum: 20 }) && !VERSION_PATTERN.test(value)) {
    addIssue(issues, path, "invalid-version", "Expected a semantic version such as 1.0.0.");
  }
}

function validateIntegerRange(value, minimum, maximum, path, issues) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    addIssue(issues, path, "out-of-range", `Expected an integer from ${minimum} to ${maximum}.`);
  }
}

function validateTags(tags, path, issues) {
  if (!Array.isArray(tags) || tags.length === 0) {
    addIssue(issues, path, "invalid-tags", "Expected a non-empty tags array.");
    return;
  }
  const seen = new Set();
  tags.forEach((tag, index) => {
    const tagPath = `${path}[${index}]`;
    if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) {
      addIssue(issues, tagPath, "invalid-tag", "Tags use lowercase letters, digits, and hyphens.");
    } else if (seen.has(tag)) {
      addIssue(issues, tagPath, "duplicate-tag", `Duplicate tag "${tag}".`);
    }
    seen.add(tag);
  });
}

function validateAcceptedAnswers(answers, answer, type, path, issues) {
  if (!Array.isArray(answers) || answers.length === 0) {
    addIssue(issues, path, "invalid-answers", "acceptedAnswers must be a non-empty array.");
    return;
  }
  const seen = new Set();
  answers.forEach((candidate, index) => {
    const candidatePath = `${path}[${index}]`;
    validateTextFormatting(candidate, candidatePath, issues, { maximum: type === "fill" ? 30 : 100 });
    if (typeof candidate === "string" && seen.has(candidate)) {
      addIssue(issues, candidatePath, "duplicate-answer", "acceptedAnswers must be unique.");
    }
    seen.add(candidate);
  });
  if (!answers.includes(answer)) {
    addIssue(issues, path, "missing-primary-answer", "acceptedAnswers must include answer.");
  }
  if (type === "copy" && (answers.length !== 1 || answers[0] !== answer)) {
    addIssue(issues, path, "loose-copy-answer", "Copy questions accept only their exact code.");
  }
}

function validateProblemFields(problem, path, issues, { skillIds, expectedVersion }) {
  validateVersion(problem.contentVersion, `${path}.contentVersion`, issues);
  if (expectedVersion && problem.contentVersion !== expectedVersion) {
    addIssue(issues, `${path}.contentVersion`, "version-mismatch", `Expected contentVersion ${expectedVersion}.`);
  }

  validateIntegerRange(problem.level, 1, 2, `${path}.level`, issues);
  if (!ALLOWED_TYPES.has(problem.type)) {
    addIssue(issues, `${path}.type`, "unknown-type", `Unknown question type "${String(problem.type)}".`);
  }
  if ((problem.level === 1 && problem.type !== "copy") || (problem.level === 2 && problem.type !== "fill")) {
    addIssue(issues, `${path}.type`, "level-type-mismatch", "Level 1 must be copy and Level 2 must be fill.");
  }

  validateIdentifier(problem.skill, `${path}.skill`, issues);
  if (skillIds && !skillIds.has(problem.skill)) {
    addIssue(issues, `${path}.skill`, "unknown-skill", `Unknown skill "${String(problem.skill)}".`);
  }
  validateIntegerRange(problem.difficulty, 1, 3, `${path}.difficulty`, issues);
  validateIntegerRange(problem.targetSeconds, 5, 15, `${path}.targetSeconds`, issues);
  validateTags(problem.tags, `${path}.tags`, issues);

  validateTextFormatting(problem.code, `${path}.code`, issues, { maximum: problem.type === "copy" ? 100 : 240 });
  validateTextFormatting(problem.output, `${path}.output`, issues, { allowEmpty: problem.type === "copy", maximum: 500 });
  if (!ALLOWED_OUTPUT_MODES.has(problem.outputMode)) {
    addIssue(issues, `${path}.outputMode`, "invalid-output-mode", "outputMode must be exact or example.");
  }

  validateTextFormatting(problem.answer, `${path}.answer`, issues, { maximum: problem.type === "fill" ? 30 : 100 });
  validateAcceptedAnswers(problem.acceptedAnswers, problem.answer, problem.type, `${path}.acceptedAnswers`, issues);

  if (typeof problem.code === "string") {
    const blankCount = problem.code.split(BLANK_TOKEN).length - 1;
    if (problem.type === "fill" && blankCount !== 1) {
      addIssue(issues, `${path}.code`, "blank-count", `Fill questions require exactly one ${BLANK_TOKEN} token.`);
    }
    if (problem.type === "copy" && blankCount !== 0) {
      addIssue(issues, `${path}.code`, "copy-has-blank", "Copy questions must not contain a blank token.");
    }
    if (problem.type === "copy") {
      const lineCount = problem.code.split("\n").length;
      if (lineCount < 1 || lineCount > 3) {
        addIssue(issues, `${path}.code`, "copy-line-count", "Copy questions must contain 1 to 3 lines.");
      }
      if (problem.answer !== problem.code) {
        addIssue(issues, `${path}.answer`, "copy-answer-mismatch", "Copy answer must exactly match code after LF normalization.");
      }
    }
  }
}

export function validateSkill(skill, { path = "skill" } = {}) {
  const issues = [];
  if (!requirePlainObject(skill, path, issues)) {
    return issues;
  }
  checkUnknownKeys(skill, SKILL_KEYS, path, issues);
  validateIdentifier(skill.id, `${path}.id`, issues);
  if (!ALLOWED_CATEGORIES.has(skill.category)) {
    addIssue(issues, `${path}.category`, "unknown-category", `Unknown category "${String(skill.category)}".`);
  }
  requireString(skill.label, `${path}.label`, issues, { maximum: 40 });
  requireString(skill.description, `${path}.description`, issues, { maximum: 160 });
  validateIntegerRange(skill.order, 1, 999, `${path}.order`, issues);
  if (typeof skill.enabled !== "boolean") {
    addIssue(issues, `${path}.enabled`, "invalid-type", "enabled must be boolean.");
  }
  return issues;
}

export function validateQuestion(question, options = {}) {
  const { path = "question", skillIds, contentVersion = CONTENT_VERSION } = options;
  const issues = [];
  if (!requirePlainObject(question, path, issues)) {
    return issues;
  }
  checkUnknownKeys(question, QUESTION_KEYS, path, issues);
  validateIdentifier(question.id, `${path}.id`, issues);
  validateProblemFields(question, path, issues, { skillIds, expectedVersion: contentVersion });
  if (typeof question.enabled !== "boolean") {
    addIssue(issues, `${path}.enabled`, "invalid-type", "enabled must be boolean.");
  }
  return issues;
}

function validateVariantParameters(template, path, issues) {
  const parameters = template.parameters;
  if (!requirePlainObject(parameters, `${path}.parameters`, issues)) {
    return;
  }

  const parameterKeysByGenerator = {
    interpolateCopy: new Set(["code", "output", "outputMode", "cases"]),
    interpolateFill: new Set(["code", "output", "outputMode", "answer", "acceptedAnswers", "cases"]),
    printLiteralCopy: new Set(["values"]),
    rangeFillAscending: new Set(["startMin", "startMax", "lengthMin", "lengthMax"]),
    variantCopy: new Set(["variants"]),
    variantFill: new Set(["variants"]),
  };
  const allowedParameterKeys = parameterKeysByGenerator[template.generatorId];
  if (allowedParameterKeys) {
    checkUnknownKeys(parameters, allowedParameterKeys, `${path}.parameters`, issues);
  }

  if (template.generatorId === "variantCopy" || template.generatorId === "variantFill") {
    if (!Array.isArray(parameters.variants) || parameters.variants.length === 0) {
      addIssue(issues, `${path}.parameters.variants`, "invalid-variants", "variants must be a non-empty array.");
      return;
    }
    if (Number.isInteger(template.variantCount) && parameters.variants.length !== template.variantCount) {
      addIssue(issues, `${path}.variantCount`, "variant-count-mismatch", "variantCount must equal parameters.variants.length.");
    }
  }

  if (template.generatorId === "printLiteralCopy") {
    if (!Array.isArray(parameters.values) || parameters.values.length < template.variantCount) {
      addIssue(issues, `${path}.parameters.values`, "insufficient-values", "values must provide at least variantCount entries.");
    } else if (new Set(parameters.values).size !== parameters.values.length || parameters.values.some((value) => typeof value !== "string")) {
      addIssue(issues, `${path}.parameters.values`, "invalid-values", "values must be unique strings.");
    }
  }

  if (template.generatorId === "rangeFillAscending") {
    const names = ["startMin", "startMax", "lengthMin", "lengthMax"];
    if (names.some((name) => !Number.isSafeInteger(parameters[name]))) {
      addIssue(issues, `${path}.parameters`, "invalid-range-parameters", "All range parameters must be safe integers.");
    } else {
      const possible = (parameters.startMax - parameters.startMin + 1) * (parameters.lengthMax - parameters.lengthMin + 1);
      if (parameters.startMax < parameters.startMin || parameters.lengthMin < 1 || parameters.lengthMax < parameters.lengthMin || possible < template.variantCount) {
        addIssue(issues, `${path}.parameters`, "insufficient-range-variants", "Range parameters cannot produce variantCount unique questions.");
      }
    }
  }

  if (template.generatorId === "interpolateCopy" || template.generatorId === "interpolateFill") {
    if (!Array.isArray(parameters.cases) || parameters.cases.length !== template.variantCount) {
      addIssue(issues, `${path}.parameters.cases`, "variant-count-mismatch", "cases must be an array with exactly variantCount entries.");
    } else if (new Set(parameters.cases.map((item) => JSON.stringify(item))).size !== parameters.cases.length) {
      addIssue(issues, `${path}.parameters.cases`, "duplicate-case", "Interpolation cases must be unique.");
    }
    for (const name of ["code", "output"]) {
      if (typeof parameters[name] !== "string") {
        addIssue(issues, `${path}.parameters.${name}`, "invalid-pattern", `${name} must be a string pattern.`);
      }
    }
    if (template.generatorId === "interpolateFill" && typeof parameters.answer !== "string") {
      addIssue(issues, `${path}.parameters.answer`, "invalid-pattern", "answer must be a string pattern.");
    }
  }
}

export function validateTemplate(template, options = {}) {
  const { path = "template", skillIds, contentVersion = CONTENT_VERSION } = options;
  const issues = [];
  if (!requirePlainObject(template, path, issues)) {
    return issues;
  }
  checkUnknownKeys(template, TEMPLATE_KEYS, path, issues);
  validateIdentifier(template.id, `${path}.id`, issues);
  validateVersion(template.contentVersion, `${path}.contentVersion`, issues);
  if (template.contentVersion !== contentVersion) {
    addIssue(issues, `${path}.contentVersion`, "version-mismatch", `Expected contentVersion ${contentVersion}.`);
  }
  validateIntegerRange(template.level, 1, 2, `${path}.level`, issues);
  if (!ALLOWED_TYPES.has(template.type)) {
    addIssue(issues, `${path}.type`, "unknown-type", `Unknown template type "${String(template.type)}".`);
  }
  if ((template.level === 1 && template.type !== "copy") || (template.level === 2 && template.type !== "fill")) {
    addIssue(issues, `${path}.type`, "level-type-mismatch", "Level 1 must be copy and Level 2 must be fill.");
  }
  validateIdentifier(template.skill, `${path}.skill`, issues);
  if (skillIds && !skillIds.has(template.skill)) {
    addIssue(issues, `${path}.skill`, "unknown-skill", `Unknown skill "${String(template.skill)}".`);
  }
  validateIntegerRange(template.difficulty, 1, 3, `${path}.difficulty`, issues);
  validateIntegerRange(template.targetSeconds, 5, 15, `${path}.targetSeconds`, issues);
  validateIntegerRange(template.variantCount, 1, 50, `${path}.variantCount`, issues);
  validateTags(template.tags, `${path}.tags`, issues);
  if (requireString(template.generatorId, `${path}.generatorId`, issues) && !GENERATOR_ID_PATTERN.test(template.generatorId)) {
    addIssue(issues, `${path}.generatorId`, "invalid-generator-id", "generatorId must be an alphanumeric registered function name.");
  }
  if (!hasGenerator(template.generatorId)) {
    addIssue(issues, `${path}.generatorId`, "unknown-generator", `Unknown generatorId "${String(template.generatorId)}".`);
  }
  if (typeof template.enabled !== "boolean") {
    addIssue(issues, `${path}.enabled`, "invalid-type", "enabled must be boolean.");
  }
  validateVariantParameters(template, path, issues);
  return issues;
}

export function validateRuntimeQuestion(question, options = {}) {
  const { path = "runtimeQuestion", skillIds, contentVersion = CONTENT_VERSION } = options;
  const issues = [];
  if (!requirePlainObject(question, path, issues)) {
    return issues;
  }
  checkUnknownKeys(question, RUNTIME_KEYS, path, issues);
  if (requireString(question.instanceId, `${path}.instanceId`, issues) && !RUNTIME_ID_PATTERN.test(question.instanceId)) {
    addIssue(issues, `${path}.instanceId`, "invalid-runtime-id", "instanceId must be a stable source id with an optional seed hash.");
  }
  validateIdentifier(question.sourceId, `${path}.sourceId`, issues);
  if (question.id !== undefined && question.id !== question.instanceId) {
    addIssue(issues, `${path}.id`, "runtime-id-mismatch", "Runtime id must equal instanceId when present.");
  }
  if (!["string", "number", "boolean"].includes(typeof question.seed) && question.seed !== null) {
    addIssue(issues, `${path}.seed`, "invalid-seed", "Runtime seed must be a JSON scalar.");
  }
  validateProblemFields(question, path, issues, { skillIds, expectedVersion: contentVersion });
  return issues;
}

function extractDocument(document, collectionKey, path, issues) {
  if (!requirePlainObject(document, path, issues)) {
    return { contentVersion: undefined, items: [] };
  }
  checkUnknownKeys(document, new Set(["contentVersion", collectionKey]), path, issues);
  validateVersion(document.contentVersion, `${path}.contentVersion`, issues);
  if (!Array.isArray(document[collectionKey])) {
    addIssue(issues, `${path}.${collectionKey}`, "invalid-type", `Expected ${collectionKey} to be an array.`);
    return { contentVersion: document.contentVersion, items: [] };
  }
  return { contentVersion: document.contentVersion, items: document[collectionKey] };
}

function semanticSignature(problem) {
  return JSON.stringify([
    problem.level,
    problem.type,
    problem.code,
    problem.answer,
    problem.acceptedAnswers,
  ]);
}

function collectTemplateVariants(template, skillIds, contentVersion, issues, path) {
  const variants = new Map();
  const maximumAttempts = Math.max(512, template.variantCount * 64);

  for (let attempt = 0; attempt < maximumAttempts && variants.size < template.variantCount; attempt += 1) {
    const seed = `${template.id}:coverage:${attempt}`;
    try {
      const first = generateQuestion(template, seed);
      const second = generateQuestion(template, seed);
      if (JSON.stringify(first) !== JSON.stringify(second)) {
        addIssue(issues, path, "nondeterministic-generator", `Generator ${template.generatorId} changed output for seed ${seed}.`);
        break;
      }
      const runtimeIssues = validateRuntimeQuestion(first, {
        path: `${path}.generated[${attempt}]`,
        skillIds,
        contentVersion,
      });
      if (runtimeIssues.length > 0) {
        issues.push(...runtimeIssues);
        break;
      }
      variants.set(semanticSignature(first), first);
    } catch (error) {
      addIssue(issues, path, "generator-error", `Generator ${template.generatorId} failed: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }

  if (variants.size < template.variantCount) {
    addIssue(issues, `${path}.variantCount`, "unreachable-variants", `Declared ${template.variantCount} variants but verified only ${variants.size}.`);
  }
  return [...variants.values()];
}

function createStats(skillIds) {
  return {
    contentVersion: CONTENT_VERSION,
    skills: skillIds.size,
    staticCount: 0,
    templateCount: 0,
    generatedEquivalentCount: 0,
    totalEquivalentCount: 0,
    byLevel: { 1: 0, 2: 0 },
    bySkill: Object.fromEntries([...skillIds].map((skill) => [skill, 0])),
    registeredGenerators: getRegisteredGeneratorIds(),
  };
}

export function validateContentBundle(bundle) {
  const issues = [];
  if (!requirePlainObject(bundle, "bundle", issues)) {
    return { valid: false, issues, stats: createStats(new Set()) };
  }

  const skillDocument = extractDocument(bundle.skills, "skills", "skillsDocument", issues);
  const questionDocument = extractDocument(bundle.questions, "questions", "questionsDocument", issues);
  const templateDocument = extractDocument(bundle.templates, "templates", "templatesDocument", issues);
  const versions = [skillDocument.contentVersion, questionDocument.contentVersion, templateDocument.contentVersion];
  versions.forEach((version, index) => {
    if (version !== CONTENT_VERSION) {
      addIssue(issues, ["skillsDocument", "questionsDocument", "templatesDocument"][index] + ".contentVersion", "version-mismatch", `Expected ${CONTENT_VERSION}.`);
    }
  });

  const idOwners = new Map();
  const recordId = (id, path) => {
    if (typeof id !== "string") {
      return;
    }
    if (idOwners.has(id)) {
      addIssue(issues, `${path}.id`, "duplicate-id", `Duplicate id "${id}"; first used at ${idOwners.get(id)}.`);
    } else {
      idOwners.set(id, path);
    }
  };

  const skillIds = new Set();
  const enabledSkillIds = new Set();
  skillDocument.items.forEach((skill, index) => {
    const path = `skillsDocument.skills[${index}]`;
    issues.push(...validateSkill(skill, { path }));
    recordId(skill?.id, path);
    if (typeof skill?.id === "string") {
      skillIds.add(skill.id);
      if (skill.enabled === true) {
        enabledSkillIds.add(skill.id);
      }
    }
  });

  REQUIRED_SKILL_IDS.forEach((skillId) => {
    if (!enabledSkillIds.has(skillId)) {
      addIssue(issues, "skillsDocument.skills", "missing-required-skill", `Required enabled skill "${skillId}" is missing.`);
    }
  });

  const stats = createStats(enabledSkillIds);
  stats.contentVersion = CONTENT_VERSION;
  const signatures = new Map();
  const recordSignature = (problem, path) => {
    const signature = semanticSignature(problem);
    if (signatures.has(signature)) {
      addIssue(issues, path, "duplicate-content", `Equivalent problem already exists at ${signatures.get(signature)}.`);
    } else {
      signatures.set(signature, path);
    }
  };
  const addCoverage = (problem, amount = 1) => {
    if (problem.enabled === false || !enabledSkillIds.has(problem.skill) || ![1, 2].includes(problem.level)) {
      return;
    }
    stats.byLevel[problem.level] += amount;
    stats.bySkill[problem.skill] = (stats.bySkill[problem.skill] ?? 0) + amount;
    stats.totalEquivalentCount += amount;
  };

  questionDocument.items.forEach((question, index) => {
    const path = `questionsDocument.questions[${index}]`;
    issues.push(...validateQuestion(question, { path, skillIds, contentVersion: CONTENT_VERSION }));
    recordId(question?.id, path);
    if (question?.enabled === true) {
      stats.staticCount += 1;
      addCoverage(question);
      if (isPlainObject(question)) {
        recordSignature(question, path);
      }
    }
  });

  templateDocument.items.forEach((template, index) => {
    const path = `templatesDocument.templates[${index}]`;
    const templateIssues = validateTemplate(template, { path, skillIds, contentVersion: CONTENT_VERSION });
    issues.push(...templateIssues);
    recordId(template?.id, path);
    if (template?.enabled !== true || templateIssues.length > 0) {
      return;
    }

    stats.templateCount += 1;
    const variants = collectTemplateVariants(template, skillIds, CONTENT_VERSION, issues, path);
    stats.generatedEquivalentCount += variants.length;
    variants.forEach((variant, variantIndex) => {
      addCoverage(variant);
      recordSignature(variant, `${path}.verifiedVariant[${variantIndex}]`);
    });
  });

  if (stats.totalEquivalentCount < 120) {
    addIssue(issues, "bundle", "insufficient-content", `Expected at least 120 verified equivalents; found ${stats.totalEquivalentCount}.`);
  }
  for (const level of [1, 2]) {
    if (stats.byLevel[level] < 50) {
      addIssue(issues, "bundle", "insufficient-level-content", `Level ${level} requires at least 50 equivalents; found ${stats.byLevel[level]}.`);
    }
  }
  REQUIRED_SKILL_IDS.forEach((skillId) => {
    if ((stats.bySkill[skillId] ?? 0) < 6) {
      addIssue(issues, "bundle", "insufficient-skill-content", `Skill ${skillId} requires at least 6 equivalents; found ${stats.bySkill[skillId] ?? 0}.`);
    }
  });

  return { valid: issues.length === 0, issues, stats };
}

export function assertValidContentBundle(bundle) {
  const report = validateContentBundle(bundle);
  if (!report.valid) {
    throw new ContentValidationError(report.issues);
  }
  return report;
}

export function formatContentIssues(issues) {
  return issues.map((item) => `${item.path} [${item.code}] ${item.message}`).join("\n");
}
