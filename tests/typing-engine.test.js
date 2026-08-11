import test from "node:test";
import assert from "node:assert/strict";

import {
  createTypingEngine,
  isBlockedInputType,
  normalizeLineEndings,
  TypingEngine,
} from "../js/core/typing-engine.js";

test("empty input has zero attempts and cannot complete a non-empty answer", () => {
  const engine = new TypingEngine("print(1)");
  assert.equal(engine.snapshot(0).totalKeystrokes, 0);
  assert.equal(engine.snapshot(0).correctKeystrokes, 0);
  assert.equal(engine.snapshot(0).completed, false);
  assert.equal(engine.insert("", 10).ignored, true);
});

test("CRLF is normalized and Level 1 tab becomes exactly four attempts", () => {
  assert.equal(normalizeLineEndings("a\r\nb\rc"), "a\nb\nc");
  const engine = new TypingEngine("if True:\r\n    print(1)");
  engine.insert("if True:\r\n", 0);
  const tab = engine.handleKey("Tab", 50);
  engine.insert("print(1)", 100);
  assert.equal(tab.inserted, "    ");
  assert.equal(tab.attempts, 4);
  assert.equal(tab.correctAttempts, 4);
  assert.equal(engine.input, "if True:\n    print(1)");
  assert.equal(engine.completed, true);
});

test("a corrected first typo permanently reduces accuracy and cleanSolve", () => {
  const engine = new TypingEngine("abc");
  const typo = engine.handleKey("x", 0);
  assert.equal(typo.firstError, true);
  assert.equal(typo.comboBroken, true);
  engine.handleKey("Backspace", 10);
  engine.insert("abc", 1_000);
  const state = engine.snapshot(1_000);
  assert.equal(state.completed, true);
  assert.equal(state.cleanSolve, false);
  assert.equal(state.errorCount, 1);
  assert.equal(state.correctKeystrokes, 3);
  assert.equal(state.totalKeystrokes, 4);
  assert.equal(engine.accuracy, 75);
  assert.equal(state.activeTypingMs, 1_000);
});

test("repeated mistakes at the same position are all retained", () => {
  const engine = new TypingEngine("a");
  for (const key of ["x", "Backspace", "y", "Backspace", "a"]) {
    engine.handleKey(key, 0);
  }
  assert.equal(engine.errorCount, 2);
  assert.equal(engine.totalKeystrokes, 3);
  assert.equal(engine.correctKeystrokes, 1);
  assert.equal(engine.completed, true);
});

test("quote type and other Python formatting remain exact", () => {
  const engine = new TypingEngine('print("hi")');
  engine.insert("print('hi')", 0);
  assert.equal(engine.completed, false);
  assert.equal(engine.errorCount, 2);
  assert.equal(engine.getCharacterStates().filter((item) => !item.correct).length, 2);
});

test("accepted alternatives complete only on an exact whole answer", () => {
  const engine = new TypingEngine("True", { acceptedAnswers: ["True", "1 == 1"] });
  engine.insert("1 == 1", 20);
  assert.equal(engine.completed, true);
  assert.equal(engine.errorCount, 0);
});

test("IME interim keys are ignored and composition end is one committed text path", () => {
  const engine = new TypingEngine("abc");
  engine.compositionStart();
  assert.equal(engine.handleKey({ key: "Process", isComposing: true }, 10).ignored, true);
  assert.equal(engine.totalKeystrokes, 0);
  const committed = engine.compositionEnd("한", 20);
  assert.equal(committed.attempts, 1);
  assert.equal(committed.errors, 1);
  assert.equal(engine.input, "한");
});

test("paste, drop, and replacement input are blocked without changing metrics", () => {
  const engine = new TypingEngine("abc");
  assert.equal(engine.insert("abc", 0, { source: "paste" }).blocked, true);
  assert.equal(engine.handleBeforeInput({ inputType: "insertFromDrop", data: "abc" }, 0).blocked, true);
  assert.equal(isBlockedInputType("insertReplacementText"), true);
  assert.equal(engine.totalKeystrokes, 0);
  assert.equal(engine.input, "");
});

test("navigation/function keys and Backspace do not enter the accuracy denominator", () => {
  const engine = new TypingEngine("a");
  engine.handleKey("ArrowLeft", 0);
  engine.handleKey("F1", 0);
  engine.handleKey("Backspace", 0);
  engine.handleKey({ key: "a", ctrlKey: true }, 0);
  assert.equal(engine.totalKeystrokes, 0);
});

test("active typing time excludes pause and completion locks event leakage", () => {
  const engine = new TypingEngine("ab");
  engine.handleKey("a", 100);
  engine.pause(200);
  assert.equal(engine.handleKey("b", 5_000).ignored, true);
  engine.resume(1_200);
  engine.handleKey("b", 1_300);
  assert.equal(engine.getActiveTypingMs(), 200);
  const late = engine.handleKey("x", 1_301);
  assert.equal(late.ignored, true);
  assert.equal(engine.input, "ab");
  assert.equal(engine.snapshot(99_999).activeTypingMs, 200, "locked time cannot grow later");
});

test("createTypingEngine enables Tab only for Level 1", () => {
  const copy = createTypingEngine({ level: 1, answer: "    x", acceptedAnswers: ["    x"] });
  const fill = createTypingEngine({ level: 2, answer: "range", acceptedAnswers: ["range"] });
  assert.equal(copy.handleKey("Tab", 0).attempts, 4);
  assert.equal(fill.handleKey("Tab", 0).ignored, true);
});
