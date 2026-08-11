import { deriveSeed } from "../utils/random.js";
import { generateQuestion } from "./generators.js";
import {
  CONTENT_VERSION,
  assertValidContentBundle,
  validateContentBundle,
  validateRuntimeQuestion,
} from "./validate-content.js";

export const DEFAULT_CONTENT_BASE_URL = "./data/";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildContentUrl(baseUrl, fileName) {
  if (baseUrl instanceof URL) {
    return new URL(fileName, baseUrl);
  }
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new TypeError("baseUrl must be a non-empty string or URL.");
  }
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${fileName}`;
}

async function fetchJson(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw new Error(`Could not load ${label}. Check the connection and retry.`, { cause: error });
  }

  if (!response || response.ok !== true) {
    const status = response && Number.isInteger(response.status) ? ` (HTTP ${response.status})` : "";
    throw new Error(`Could not load ${label}${status}.`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} is not valid JSON.`, { cause: error });
  }
}

export async function loadContentData({
  baseUrl = DEFAULT_CONTENT_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required to load content.");
  }

  const [skills, questions, templates] = await Promise.all([
    fetchJson(fetchImpl, buildContentUrl(baseUrl, "skills.json"), "skills"),
    fetchJson(fetchImpl, buildContentUrl(baseUrl, "questions.json"), "questions"),
    fetchJson(fetchImpl, buildContentUrl(baseUrl, "question-templates.json"), "question templates"),
  ]);
  return { skills, questions, templates };
}

function toRuntimeStatic(question) {
  return {
    id: question.id,
    instanceId: question.id,
    sourceId: question.id,
    seed: null,
    contentVersion: question.contentVersion,
    level: question.level,
    type: question.type,
    skill: question.skill,
    difficulty: question.difficulty,
    code: question.code,
    output: question.output,
    outputMode: question.outputMode,
    answer: question.answer,
    acceptedAnswers: [...question.acceptedAnswers],
    targetSeconds: question.targetSeconds,
    tags: [...question.tags],
  };
}

function semanticSignature(question) {
  return JSON.stringify([
    question.level,
    question.type,
    question.code,
    question.answer,
    question.acceptedAnswers,
  ]);
}

function freezeRuntimeQuestion(question) {
  Object.freeze(question.acceptedAnswers);
  Object.freeze(question.tags);
  return Object.freeze(question);
}

function invalidItemIndexes(issues, collectionPath) {
  const escaped = collectionPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\[(\\d+)\\]`);
  return new Set(issues.flatMap((issue) => {
    const match = pattern.exec(issue.path);
    return match ? [Number(match[1])] : [];
  }));
}

function assertRecoverableDocumentShape(bundle) {
  const documents = [
    [bundle?.skills, "skills", "skills"],
    [bundle?.questions, "questions", "questions"],
    [bundle?.templates, "templates", "question templates"],
  ];
  for (const [document, collectionKey, label] of documents) {
    if (!document || typeof document !== "object" || Array.isArray(document)
        || document.contentVersion !== CONTENT_VERSION
        || !Array.isArray(document[collectionKey])) {
      throw new Error(`${label} document has an incompatible structure or content version.`);
    }
  }
}

function excludeInvalidContent(bundle, report) {
  const invalidSkills = invalidItemIndexes(report.issues, "skillsDocument.skills");
  const invalidQuestions = invalidItemIndexes(report.issues, "questionsDocument.questions");
  const invalidTemplates = invalidItemIndexes(report.issues, "templatesDocument.templates");
  bundle.skills.skills = bundle.skills.skills.filter((_, index) => !invalidSkills.has(index));
  const skillIds = new Set(bundle.skills.skills.map((skill) => skill.id));
  bundle.questions.questions = bundle.questions.questions.filter((question, index) => (
    !invalidQuestions.has(index) && skillIds.has(question.skill)
  ));
  bundle.templates.templates = bundle.templates.templates.filter((template, index) => (
    !invalidTemplates.has(index) && skillIds.has(template.skill)
  ));
  if (bundle.skills.skills.length === 0
      || bundle.questions.questions.length + bundle.templates.templates.length === 0) {
    throw new Error("No valid learning content remains after validation.");
  }
  const remaining = validateContentBundle(bundle);
  const coverageIssueCodes = new Set([
    "insufficient-content",
    "insufficient-level-content",
    "insufficient-skill-content",
  ]);
  const structuralIssues = remaining.issues.filter((issue) => !coverageIssueCodes.has(issue.code));
  const everySkillPlayable = bundle.skills.skills
    .filter((skill) => skill.enabled === true)
    .every((skill) => (remaining.stats.bySkill[skill.id] ?? 0) >= 2);
  if (structuralIssues.length > 0
      || remaining.stats.totalEquivalentCount < 120
      || remaining.stats.byLevel[1] < 50
      || remaining.stats.byLevel[2] < 50
      || !everySkillPlayable) {
    throw new Error("Valid content remaining after recovery does not meet the playable MVP minimum.");
  }
  return bundle;
}

export class QuestionRepository {
  constructor(bundle, { validate = true, strict = true, onIssues } = {}) {
    let copiedBundle = cloneJson(bundle);
    let report = null;
    if (validate) {
      if (!strict) assertRecoverableDocumentShape(copiedBundle);
      report = strict ? assertValidContentBundle(copiedBundle) : validateContentBundle(copiedBundle);
      if (!strict && !report.valid) {
        copiedBundle = excludeInvalidContent(copiedBundle, report);
        if (typeof onIssues === "function") onIssues(cloneJson(report.issues));
      }
    }
    this.contentVersion = copiedBundle.skills.contentVersion ?? CONTENT_VERSION;
    this.report = report;
    this.skills = copiedBundle.skills.skills.filter((skill) => skill.enabled === true);
    this.questions = copiedBundle.questions.questions.filter((question) => question.enabled === true);
    this.templates = copiedBundle.templates.templates.filter((template) => template.enabled === true);
    this.skillMap = new Map(this.skills.map((skill) => [skill.id, skill]));
    this.questionMap = new Map(this.questions.map((question) => [question.id, question]));
    this.templateMap = new Map(this.templates.map((template) => [template.id, template]));
  }

  getSkills() {
    return this.skills.map((skill) => Object.freeze({ ...skill }));
  }

  getSkill(skillId) {
    const skill = this.skillMap.get(skillId);
    return skill ? Object.freeze({ ...skill }) : null;
  }

  getSource(sourceId) {
    const source = this.questionMap.get(sourceId) ?? this.templateMap.get(sourceId);
    return source ? cloneJson(source) : null;
  }

  getStaticSources() {
    return this.questions.map((question) => cloneJson(question));
  }

  createTemplateInstance(templateOrId, seed = "default") {
    const template = typeof templateOrId === "string" ? this.templateMap.get(templateOrId) : templateOrId;
    if (!template) {
      throw new RangeError(`Unknown template: ${String(templateOrId)}`);
    }
    const instance = generateQuestion(template, seed);
    const issues = validateRuntimeQuestion(instance, {
      skillIds: new Set(this.skillMap.keys()),
      contentVersion: this.contentVersion,
    });
    if (issues.length > 0) {
      throw new Error(`Generated question failed validation: ${issues[0].path} ${issues[0].message}`);
    }
    return freezeRuntimeQuestion(instance);
  }

  expandTemplate(templateOrId, seed = "default", count) {
    const template = typeof templateOrId === "string" ? this.templateMap.get(templateOrId) : templateOrId;
    if (!template) {
      throw new RangeError(`Unknown template: ${String(templateOrId)}`);
    }
    const desiredCount = count ?? template.variantCount;
    if (!Number.isInteger(desiredCount) || desiredCount < 1 || desiredCount > template.variantCount) {
      throw new RangeError(`count must be between 1 and ${template.variantCount}.`);
    }

    const instances = new Map();
    const maximumAttempts = Math.max(512, desiredCount * 64);
    for (let attempt = 0; attempt < maximumAttempts && instances.size < desiredCount; attempt += 1) {
      const instanceSeed = deriveSeed(seed, template.id, attempt);
      const instance = this.createTemplateInstance(template, instanceSeed);
      instances.set(semanticSignature(instance), instance);
    }
    if (instances.size !== desiredCount) {
      throw new Error(`Template ${template.id} produced ${instances.size}/${desiredCount} unique instances.`);
    }
    return [...instances.values()];
  }

  getById(id, { seed = "default" } = {}) {
    const staticQuestion = this.questionMap.get(id);
    if (staticQuestion) {
      return freezeRuntimeQuestion(toRuntimeStatic(staticQuestion));
    }
    if (this.templateMap.has(id)) {
      return this.createTemplateInstance(id, seed);
    }
    return null;
  }

  getAll({
    seed = "default",
    skills,
    levels,
    includeStatic = true,
    includeTemplates = true,
    templateInstancesPerTemplate,
  } = {}) {
    const skillFilter = skills ? new Set(skills) : null;
    const levelFilter = levels ? new Set(levels) : null;
    const accepts = (question) =>
      (!skillFilter || skillFilter.has(question.skill)) &&
      (!levelFilter || levelFilter.has(question.level));

    const result = [];
    if (includeStatic) {
      this.questions.filter(accepts).forEach((question) => {
        result.push(freezeRuntimeQuestion(toRuntimeStatic(question)));
      });
    }
    if (includeTemplates) {
      this.templates.filter(accepts).forEach((template) => {
        const count = templateInstancesPerTemplate === undefined
          ? template.variantCount
          : Math.min(template.variantCount, templateInstancesPerTemplate);
        result.push(...this.expandTemplate(template, seed, count));
      });
    }
    return result;
  }

  getStats() {
    return this.report ? cloneJson(this.report.stats) : null;
  }

  getIssues() {
    return this.report?.valid === false ? cloneJson(this.report.issues) : [];
  }
}

export function createQuestionRepository(bundle, options) {
  return new QuestionRepository(bundle, options);
}

export async function loadQuestionRepository(options = {}) {
  const bundle = await loadContentData(options);
  return new QuestionRepository(bundle, {
    validate: options.validate !== false,
    strict: options.strict !== false,
    onIssues: options.onIssues,
  });
}

export const loadContent = loadQuestionRepository;
