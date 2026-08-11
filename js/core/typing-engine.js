import { nonNegativeMilliseconds, timestampOf } from "../utils/time.js";

const BLOCKED_SOURCES = new Set(["paste", "drop", "autocomplete", "drag"]);
const BLOCKED_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromDrop",
  "insertFromYank",
  "insertReplacementText",
]);

export function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

export function isBlockedInputSource(source) {
  return BLOCKED_SOURCES.has(String(source ?? "").toLowerCase());
}

export function isBlockedInputType(inputType) {
  return BLOCKED_INPUT_TYPES.has(String(inputType ?? ""));
}

function normalizeAnswers(answer, acceptedAnswers) {
  if (typeof answer !== "string") {
    throw new TypeError("answer must be a string");
  }
  const primary = normalizeLineEndings(answer);
  const supplied = acceptedAnswers === undefined ? [primary] : acceptedAnswers;
  if (!Array.isArray(supplied) || supplied.length === 0) {
    throw new TypeError("acceptedAnswers must be a non-empty array");
  }
  const answers = [...new Set([primary, ...supplied.map((item) => {
    if (typeof item !== "string") {
      throw new TypeError("every accepted answer must be a string");
    }
    return normalizeLineEndings(item);
  })])];
  return { primary, answers };
}

function longestMatchingPrefix(left, right) {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function frozenEvent(overrides = {}) {
  return Object.freeze({
    accepted: false,
    blocked: false,
    ignored: false,
    inserted: "",
    attempts: 0,
    correctAttempts: 0,
    errors: 0,
    firstError: false,
    comboBroken: false,
    completed: false,
    input: "",
    comparisons: Object.freeze([]),
    ...overrides,
  });
}

export class TypingEngine {
  constructor(answer, {
    acceptedAnswers,
    allowTab = true,
    tabSize = 4,
    autoComplete = true,
  } = {}) {
    const normalized = normalizeAnswers(answer, acceptedAnswers);
    this.answer = normalized.primary;
    this.acceptedAnswers = Object.freeze(normalized.answers);
    this.allowTab = Boolean(allowTab);
    this.tabSize = Math.max(1, Math.trunc(Number(tabSize) || 4));
    this.autoComplete = Boolean(autoComplete);

    this.input = "";
    this.correctKeystrokes = 0;
    this.totalKeystrokes = 0;
    this.errorCount = 0;
    this.cleanSolve = true;
    this.firstInputAt = null;
    this.completedAt = null;
    this.lockedAt = null;
    this.accumulatedPausedMs = 0;
    this.pauseStartedAt = null;
    this.isComposing = false;
    this.completed = false;
    this.locked = false;
  }

  get targetLength() {
    return this.answer.length;
  }

  get accuracy() {
    if (this.totalKeystrokes === 0) return 0;
    return this.correctKeystrokes / this.totalKeystrokes * 100;
  }

  get paused() {
    return this.pauseStartedAt !== null;
  }

  shouldSubmitIncorrectOnEnter() {
    if (this.locked || this.paused || this.isComposing || this.completed || this.input.length === 0) {
      return false;
    }
    const lineBreaks = (value) => [...value].filter((character) => character === "\n").length;
    return lineBreaks(this.input) >= lineBreaks(this.answer);
  }

  compositionStart() {
    this.isComposing = true;
    return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
  }

  compositionEnd(text, timestamp) {
    this.isComposing = false;
    return this.insert(text, timestamp, { source: "composition" });
  }

  handleKey(eventOrKey, timestamp) {
    const event = typeof eventOrKey === "string" ? { key: eventOrKey } : (eventOrKey ?? {});
    const { key = "" } = event;
    if (event.isComposing || this.isComposing || event.keyCode === 229) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }
    if (key === "Backspace") {
      return this.backspace(timestamp);
    }
    if (key === "Enter") {
      return this.insert("\n", timestamp);
    }
    if (key === "Tab") {
      if (!this.allowTab) {
        return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
      }
      return this.insert(" ".repeat(this.tabSize), timestamp);
    }
    if (typeof key === "string" && key.length === 1) {
      return this.insert(key, timestamp);
    }
    return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
  }

  handleBeforeInput(event = {}, timestamp) {
    if (event.isComposing || this.isComposing) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }
    if (isBlockedInputType(event.inputType)) {
      return frozenEvent({ blocked: true, input: this.input, completed: this.completed });
    }
    if (event.inputType === "deleteContentBackward") {
      return this.backspace(timestamp);
    }
    if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
      return this.insert("\n", timestamp);
    }
    if (event.inputType === "insertText") {
      return this.insert(event.data ?? "", timestamp);
    }
    return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
  }

  insert(value, timestamp, { source = "keyboard" } = {}) {
    if (isBlockedInputSource(source)) {
      return frozenEvent({ blocked: true, input: this.input, completed: this.completed });
    }
    if (this.locked || this.paused || this.isComposing) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }

    let text = normalizeLineEndings(value);
    if (text.includes("\t")) {
      if (!this.allowTab) {
        return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
      }
      text = text.replaceAll("\t", " ".repeat(this.tabSize));
    }
    if (text.length === 0) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }

    const now = timestampOf(timestamp);
    if (this.firstInputAt === null) {
      this.firstInputAt = now;
    }

    let inserted = "";
    let correctAttempts = 0;
    let errors = 0;
    const comparisons = [];
    const wasClean = this.cleanSolve;

    for (const character of text) {
      if (this.completed) break;
      const position = this.input.length;
      const viableAnswers = this.acceptedAnswers.filter((candidate) => candidate.startsWith(this.input));
      const expected = viableAnswers[0]?.[position] ?? this.answer[position] ?? "";
      // An existing wrong character remains editable in the input. Later attempts
      // are still judged against their own current position, as required by PRD 8.1.
      const correct = this.acceptedAnswers.some((candidate) => candidate[position] === character);

      this.input += character;
      inserted += character;
      this.totalKeystrokes += 1;
      if (correct) {
        this.correctKeystrokes += 1;
        correctAttempts += 1;
      } else {
        this.errorCount += 1;
        errors += 1;
        this.cleanSolve = false;
      }
      comparisons.push(Object.freeze({ position, expected, actual: character, correct }));

      if (this.autoComplete && this.acceptedAnswers.includes(this.input)) {
        this.completed = true;
        this.completedAt = now;
        this.lockedAt = now;
        this.locked = true;
      }
    }

    return frozenEvent({
      accepted: inserted.length > 0,
      inserted,
      attempts: inserted.length,
      correctAttempts,
      errors,
      firstError: wasClean && !this.cleanSolve,
      comboBroken: wasClean && !this.cleanSolve,
      completed: this.completed,
      input: this.input,
      comparisons: Object.freeze(comparisons),
    });
  }

  backspace(timestamp) {
    if (this.locked || this.paused || this.isComposing || this.input.length === 0) {
      return frozenEvent({ ignored: true, input: this.input, completed: this.completed });
    }
    const removed = this.input.at(-1);
    this.input = this.input.slice(0, -1);
    return frozenEvent({
      accepted: true,
      input: this.input,
      removed,
      completed: false,
      timestamp: timestampOf(timestamp),
    });
  }

  pause(timestamp) {
    if (this.locked || this.paused) return false;
    this.pauseStartedAt = timestampOf(timestamp);
    return true;
  }

  resume(timestamp) {
    if (!this.paused) return false;
    const now = Math.max(this.pauseStartedAt, timestampOf(timestamp));
    if (this.firstInputAt !== null) {
      this.accumulatedPausedMs += now - Math.max(this.pauseStartedAt, this.firstInputAt);
    }
    this.pauseStartedAt = null;
    return true;
  }

  lock(timestamp) {
    if (this.locked) return false;
    const now = timestampOf(timestamp);
    this.lockedAt = now;
    this.locked = true;
    return true;
  }

  complete(timestamp) {
    if (this.locked || !this.acceptedAnswers.includes(this.input)) return false;
    const now = timestampOf(timestamp);
    this.completed = true;
    this.completedAt = now;
    this.lockedAt = now;
    this.locked = true;
    return true;
  }

  getActiveTypingMs(timestamp = this.completedAt ?? this.lockedAt ?? this.firstInputAt ?? 0) {
    if (this.firstInputAt === null) return 0;
    const requestedEnd = timestampOf(timestamp);
    const terminalAt = this.completedAt ?? this.lockedAt;
    const cappedEnd = terminalAt === null ? requestedEnd : Math.min(requestedEnd, terminalAt);
    const end = Math.max(this.firstInputAt, cappedEnd);
    const ongoingPause = this.pauseStartedAt === null
      ? 0
      : Math.max(0, end - this.pauseStartedAt);
    return nonNegativeMilliseconds(
      end - this.firstInputAt - this.accumulatedPausedMs - ongoingPause,
    );
  }

  getCharacterStates() {
    let reference = this.answer;
    let bestPrefix = -1;
    for (const candidate of this.acceptedAnswers) {
      const prefix = longestMatchingPrefix(this.input, candidate);
      if (candidate === this.input) {
        reference = candidate;
        break;
      }
      if (prefix > bestPrefix) {
        bestPrefix = prefix;
        reference = candidate;
      }
    }

    return Object.freeze([...this.input].map((actual, position) => Object.freeze({
      position,
      expected: reference[position] ?? "",
      actual,
      correct: actual === reference[position],
    })));
  }

  snapshot(timestamp) {
    return Object.freeze({
      answer: this.answer,
      acceptedAnswers: this.acceptedAnswers,
      input: this.input,
      characterStates: this.getCharacterStates(),
      correctKeystrokes: this.correctKeystrokes,
      totalKeystrokes: this.totalKeystrokes,
      errorCount: this.errorCount,
      cleanSolve: this.cleanSolve,
      completed: this.completed,
      locked: this.locked,
      paused: this.paused,
      firstInputAt: this.firstInputAt,
      completedAt: this.completedAt,
      activeTypingMs: this.getActiveTypingMs(timestamp),
    });
  }
}

export function createTypingEngine(question, options = {}) {
  if (!question || typeof question.answer !== "string") {
    throw new TypeError("question with an answer is required");
  }
  return new TypingEngine(question.answer, {
    acceptedAnswers: question.acceptedAnswers,
    allowTab: question.level === 1,
    autoComplete: question.level !== 2,
    ...options,
  });
}
