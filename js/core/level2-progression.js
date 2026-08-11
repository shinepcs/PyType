import { hashSeed } from "../utils/random.js";

export const LEVEL_2_REQUIRED_COPY_SOLVES = 2;
export const LEVEL_2_PREVIEW_PREFIX = "preview.";

export function level2PrerequisiteKey(question) {
  const signature = `${String(question?.code ?? "")}\u0000${String(question?.answer ?? "")}`;
  return `l2.${hashSeed(signature).toString(16).padStart(8, "0")}`;
}

export function createLevel2PrerequisiteQuestion(question, completedCopies = 0) {
  if (question?.level !== 2 || Number(completedCopies) >= LEVEL_2_REQUIRED_COPY_SOLVES) return question;
  const sourceId = level2PrerequisiteKey(question);
  const fullCode = question.code.replace("_____", question.answer);
  return Object.freeze({
    ...question,
    id: `${LEVEL_2_PREVIEW_PREFIX}${question.id}`,
    instanceId: `${LEVEL_2_PREVIEW_PREFIX}${question.instanceId ?? question.id}`,
    sourceId: `${LEVEL_2_PREVIEW_PREFIX}${sourceId}`,
    level: 1,
    type: "copy",
    code: fullCode,
    output: "",
    outputMode: "exact",
    answer: fullCode,
    acceptedAnswers: Object.freeze([fullCode]),
    tags: Object.freeze([...(question.tags ?? []), "level2-preview"]),
  });
}

export function recordLevel2Prerequisite(result, progress = {}) {
  const questionId = String(result?.questionId ?? "");
  if (!questionId.startsWith(LEVEL_2_PREVIEW_PREFIX)) return { ...progress };
  const sourceId = questionId.slice(LEVEL_2_PREVIEW_PREFIX.length);
  return {
    ...progress,
    [sourceId]: Math.min(
      LEVEL_2_REQUIRED_COPY_SOLVES,
      Number(progress[sourceId] ?? 0) + 1,
    ),
  };
}
