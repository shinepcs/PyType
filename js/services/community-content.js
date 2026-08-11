import { validateQuestion } from "../content/validate-content.js";
import { SupabaseClientError, toSafeNetworkError } from "./supabase-client.js";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

function failure(error) {
  const safe = toSafeNetworkError(error);
  return Object.freeze({
    ok: false,
    status: safe.code === "offline" || safe.code === "not_configured" ? "offline" : "error",
    error: safe,
  });
}

function toQuestion(row, contentVersion, skillIds) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const question = {
    id: row.question_id,
    contentVersion,
    level: Number(row.level),
    type: row.type,
    skill: row.skill,
    difficulty: Number(row.difficulty),
    code: row.code,
    output: row.output ?? "",
    outputMode: row.output_mode,
    answer: row.answer,
    acceptedAnswers: row.accepted_answers,
    targetSeconds: Number(row.target_seconds),
    tags: row.tags,
    enabled: true,
  };
  const issues = validateQuestion(question, { skillIds, contentVersion });
  return issues.length === 0 ? Object.freeze(question) : null;
}

function toRpcPayload(question) {
  return {
    level: question.level,
    type: question.type,
    skill: question.skill,
    difficulty: question.difficulty,
    code: question.code,
    output: question.output,
    outputMode: question.outputMode,
    answer: question.answer,
    acceptedAnswers: question.acceptedAnswers,
    targetSeconds: question.targetSeconds,
    tags: question.tags,
  };
}

export class CommunityContentService {
  constructor({ client = null } = {}) {
    this.client = client;
  }

  isAvailable() {
    return Boolean(this.client)
      && (typeof this.client.isConfigured !== "function" || this.client.isConfigured());
  }

  async getQuestions({ contentVersion, skillIds } = {}) {
    if (typeof contentVersion !== "string" || !(skillIds instanceof Set)) {
      return Object.freeze({ ok: false, status: "invalid", errors: ["query_invalid"] });
    }
    if (!this.isAvailable()) return failure(new SupabaseClientError("not_configured"));
    try {
      const response = await this.client.rpc("get_shared_questions", {
        p_content_version: contentVersion,
      });
      if (!Array.isArray(response)) return failure(new SupabaseClientError("invalid_response"));
      const questions = response.map((row) => toQuestion(row, contentVersion, skillIds));
      if (!questions.every(Boolean)) return failure(new SupabaseClientError("invalid_response"));
      return Object.freeze({
        ok: true,
        status: questions.length === 0 ? "empty" : "ready",
        questions,
      });
    } catch (error) {
      return failure(error);
    }
  }

  async saveQuestion({ questionId = null, question, contentVersion, skillIds } = {}) {
    const candidate = { ...question, id: questionId ?? "community.pending", contentVersion, enabled: true };
    const issues = validateQuestion(candidate, { skillIds, contentVersion });
    if (questionId !== null && !ID_PATTERN.test(questionId)) {
      issues.push({ code: "id-invalid", path: "question.id", message: "Invalid question id." });
    }
    if (issues.length > 0) {
      return Object.freeze({ ok: false, status: "invalid", errors: issues.map((issue) => issue.code) });
    }
    if (!this.isAvailable()) return failure(new SupabaseClientError("not_configured"));
    try {
      await this.client.ensureAnonymousSession();
      const response = await this.client.rpc("submit_shared_question", {
        p_content_version: contentVersion,
        p_question_id: questionId,
        p_question: toRpcPayload(candidate),
      }, { authenticated: true });
      const savedId = Array.isArray(response) ? response[0]?.question_id : null;
      if (!ID_PATTERN.test(savedId ?? "")) return failure(new SupabaseClientError("invalid_response"));
      return Object.freeze({ ok: true, status: "saved", questionId: savedId });
    } catch (error) {
      return failure(error);
    }
  }
}

export function createCommunityContentService(options) {
  return new CommunityContentService(options);
}
