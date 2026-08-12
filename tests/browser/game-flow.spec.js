import { expect, test } from "@playwright/test";

const SESSION_SEED = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const browserErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([]);
});

async function preparePage(page, { nickname = null, level2Ready = false, history = [] } = {}) {
  await page.clock.install({ time: new Date("2026-08-11T06:00:00.000Z") });
  await page.route("https://*.supabase.co/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ message: "ranking unavailable in offline browser test" }),
  }));
  await page.addInitScript(({ seed, sessionId, nicknameValue, historyValue }) => {
    const ids = [seed, sessionId, "33333333-3333-4333-8333-333333333333"];
    let index = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => ids[index++] ?? ids.at(-1),
    });
    if (nicknameValue) {
      localStorage.setItem("pythonTypingSurvival:v1", JSON.stringify({
        schemaVersion: 1,
        profile: { nickname: nicknameValue, createdAt: "2026-08-11T06:00:00.000Z" },
        settings: { sound: false, reducedMotion: false, fontScale: 1 },
        progress: { skills: {} },
        history: historyValue,
        personalBest: { quick: null, daily: null },
        pendingRankingSubmissions: [],
      }));
    }
  }, { seed: SESSION_SEED, sessionId: SESSION_ID, nicknameValue: nickname, historyValue: history });
  await page.goto("./");
  if (level2Ready) {
    await page.evaluate(async () => {
      const moduleUrl = new URL("./js/content/question-repository.js", document.baseURI).href;
      const { loadQuestionRepository } = await import(moduleUrl);
      const progressionUrl = new URL("./js/core/level2-progression.js", document.baseURI).href;
      const { level2PrerequisiteKey } = await import(progressionUrl);
      const repository = await loadQuestionRepository({ baseUrl: "./data/" });
      const state = JSON.parse(localStorage.getItem("pythonTypingSurvival:v1")) ?? {
        schemaVersion: 1,
        profile: { nickname: null, createdAt: new Date().toISOString() },
        settings: { sound: false, reducedMotion: false, fontScale: 1 },
        progress: { skills: {}, level2Prerequisites: {} },
        history: [],
        personalBest: { quick: null, daily: null },
        pendingRankingSubmissions: [],
      };
      state.progress.level2Prerequisites = Object.fromEntries(
        repository.getAll({ seed: "level2-ready" })
          .filter((question) => question.level === 2)
          .map((question) => [level2PrerequisiteKey(question), 2]),
      );
      localStorage.setItem("pythonTypingSurvival:v1", JSON.stringify(state));
    });
    await page.reload();
  }
}

async function currentAnswer(page) {
  return page.evaluate(async ({ seed }) => {
    const code = document.querySelector("#question-code").textContent;
    const outputPanel = document.querySelector("#output-panel");
    const output = outputPanel.hidden ? undefined : document.querySelector("#question-output").textContent;
    const level = Number(document.querySelector("#question-level").textContent.replace(/\D+/g, ""));
    if (level === 1) return code;
    window.__pytypeTestPool ??= (async () => {
      const moduleUrl = new URL("./js/content/question-repository.js", document.baseURI).href;
      const { loadQuestionRepository } = await import(moduleUrl);
      const repository = await loadQuestionRepository({ baseUrl: "./data/" });
      return repository.getAll({ seed });
    })();
    const pool = await window.__pytypeTestPool;
    const match = pool.find((question) => (
      question.level === level && question.code === code && question.output === output
    ));
    if (!match) throw new Error(`Question not found for ${code}`);
    return match.answer;
  }, { seed: SESSION_SEED });
}

async function enterAnswer(page, answer) {
  await page.locator("#typing-input").focus();
  if (answer.length <= 1) {
    await page.keyboard.insertText(answer);
    return;
  }
  await page.keyboard.insertText(answer[0]);
  await page.clock.runFor(Math.max(300, answer.length * 100));
  await page.keyboard.insertText(answer.slice(1));
}

async function advanceToNextQuestion(page, previousCode) {
  await page.clock.runFor(400);
  await expect(page.locator("#question-code")).not.toHaveText(previousCode);
  await expect(page.locator("#typing-input")).toBeEnabled();
}

test("new player completes Level 1/2 Quick Play with typo, pause, persistence and time over", async ({ page }) => {
  test.setTimeout(90_000);
  await preparePage(page, { level2Ready: true });
  await expect(page.locator("#nickname-dialog")).toBeVisible();
  await page.locator("#nickname-input").fill("코드초보_1");
  await page.locator("#nickname-form button[type=submit]").click();
  await expect(page.locator("#screen-home")).toBeVisible();

  await page.locator("#start-quick").click();
  await expect(page.locator("#ready-count")).toHaveText("3");
  await page.clock.runFor(3_050);
  await expect(page.locator("#typing-input")).toBeEnabled();
  await expect(page.locator(".code-card")).toBeHidden();
  await expect(page.locator("#typing-feedback")).not.toHaveText("");

  await page.locator("#typing-input").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#pause-button")).toBeFocused();
  await expect(page.locator("#typing-input")).toHaveValue("");

  const encounteredLevels = new Set();
  let verifiedLevel2Timing = false;
  let solved = 0;
  while (solved < 20 && encounteredLevels.size < 2) {
    encounteredLevels.add(await page.locator("#question-level").textContent());
    if ((await page.locator("#question-level").textContent()) === "LEVEL 2") {
      await expect(page.locator("#question-hint")).toBeVisible();
      await expect(page.locator("#question-hint")).toContainText(/힌트 · .*[가-힣]/);
      await expect(page.locator("#typing-feedback")).toHaveText("");
      if (!verifiedLevel2Timing) {
        const frozenTime = await page.locator("#hud-time").textContent();
        await page.clock.runFor(2_000);
        await expect(page.locator("#hud-time")).toHaveText(frozenTime);
        await page.locator("#typing-input").focus();
        await page.keyboard.insertText("!");
        await expect(page.locator("#feedback-message")).toContainText("TIME -2s");
        await page.keyboard.press("Backspace");
        verifiedLevel2Timing = true;
      }
    }
    const code = await page.locator("#question-code").textContent();
    const answer = await currentAnswer(page);
    if (solved === 0) {
      await page.locator("#typing-input").focus();
      await page.keyboard.insertText("!");
      await expect(page.locator("#feedback-message")).toContainText("TYPO BLOCKED");
      await expect(page.locator("#typing-input")).toHaveValue("");
      await page.keyboard.press("Backspace");
    }
    await enterAnswer(page, answer);
    const isLevel2 = (await page.locator("#question-level").textContent()) === "LEVEL 2";
    if (isLevel2) {
      await page.keyboard.press("Enter");
      await expect(page.locator("#feedback-message")).toContainText("정답입니다");
      await expect(page.locator("#typing-input")).toBeDisabled();
      await page.keyboard.press("z");
    } else {
      await expect(page.locator("#typing-input")).toBeDisabled();
    }
    if (solved === 0) {
      await expect(page.locator(".typing-speed small")).toHaveText("분당 타수");
      await expect.poll(async () => Number(await page.locator("#hud-cpm").textContent())).toBeGreaterThan(0);
      const speedDisplay = await page.evaluate(() => {
        const input = document.querySelector("#typing-input").getBoundingClientRect();
        const speed = document.querySelector(".typing-speed").getBoundingClientRect();
        const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const value = document.querySelector("#hud-cpm");
        const valueSize = parseFloat(getComputedStyle(value).fontSize);
        const valueBounds = value.getBoundingClientRect();
        return {
          inputRight: input.right,
          speedLeft: speed.left,
          fontRatio: valueSize / rootSize,
          fits: valueBounds.width <= speed.width,
        };
      });
      expect(speedDisplay.speedLeft).toBeGreaterThan(speedDisplay.inputRight);
      expect(speedDisplay.fontRatio).toBeLessThanOrEqual(3);
      expect(speedDisplay.fits).toBe(true);
    }
    solved += 1;
    if (isLevel2) {
      await expect(page.locator("#question-code")).not.toHaveText(code);
      await expect(page.locator("#typing-input")).toBeEnabled();
    } else if (encounteredLevels.size < 2 && solved < 20) {
      await advanceToNextQuestion(page, code);
    }
  }
  expect(encounteredLevels).toEqual(new Set(["LEVEL 1", "LEVEL 2"]));

  await page.clock.runFor(400);
  await expect(page.locator("#typing-input")).toBeEnabled();
  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-dialog")).toBeVisible();
  const timeBeforePause = await page.locator("#hud-time").textContent();
  await page.clock.runFor(5_000);
  await expect(page.locator("#hud-time")).toHaveText(timeBeforePause);
  await page.locator("#resume-button").click();
  await expect(page.locator("#pause-dialog")).not.toBeVisible();

  const finalAnswer = await currentAnswer(page);
  await enterAnswer(page, finalAnswer);
  if ((await page.locator("#question-level").textContent()) === "LEVEL 2") {
    await page.keyboard.press("Enter");
    await expect(page.locator("#feedback-message")).toContainText("정답입니다");
    await expect(page.locator("#typing-input")).toBeDisabled();
    await page.keyboard.press("z");
  } else {
    await expect(page.locator("#typing-input")).toBeDisabled();
  }
  await page.clock.fastForward(240_000);
  await expect(page.locator("#screen-result")).toBeVisible();
  await page.clock.runFor(500);
  await expect(page.locator("#result-title")).toHaveText("훈련 완료");
  await expect(page.locator("#result-solved")).not.toHaveText("0");
  await expect(page.locator("#result-progress")).toHaveAttribute("data-trend", "first");
  await expect(page.locator("#result-progress-summary")).toContainText("첫 기록");
  await expect(page.locator("#ranking-submit-label")).toContainText(/오프라인|등록 실패/);
  await expect(page.locator("#retry-ranking")).toBeVisible();

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("pythonTypingSurvival:v1")));
  expect(persisted.profile.nickname).toBe("코드초보_1");
  expect(persisted.history).toHaveLength(1);
  expect(persisted.speedHistory).toHaveLength(1);
  expect(Object.keys(persisted.progress.skills).length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator("#nickname-dialog")).not.toBeVisible();
  await expect(page.locator("#header-player")).toHaveText("코드초보_1");
  await page.locator("#open-progress").click();
  await expect(page.locator("#speed-trend-chart")).toBeVisible();
  await expect(page.locator("#mastery-grid .mastery-card").first()).toBeVisible();
});

test("paste and IME remain scoped to game input and danger reaches game over", async ({ page }) => {
  await preparePage(page, {
    nickname: "SafePlayer",
    history: [{
      sessionId: "44444444-4444-4444-8444-444444444444",
      gameMode: "quick",
      sessionVariant: "quick",
      endedNormally: true,
      score: 500,
      accuracy: 95,
      cpm: 125,
      problemsSolved: 10,
      averageProblemMs: 8_000,
      completedAt: "2026-08-10T06:00:00.000Z",
    }],
  });
  await page.locator("#start-quick").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#typing-input")).toBeEnabled();

  const paste = await page.locator("#typing-input").evaluate((input) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    return { dispatchResult: input.dispatchEvent(event), value: input.value };
  });
  expect(paste.dispatchResult).toBe(false);
  expect(paste.value).toBe("");

  await page.locator("#typing-input").evaluate((input) => {
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한" }));
  });
  await expect(page.locator("#feedback-message")).toContainText("TYPO");
  await page.locator("#typing-input").focus();
  await page.keyboard.press("Backspace");

  await page.clock.fastForward(60_000);
  await expect(page.locator("#screen-result")).toBeVisible();
  await expect(page.locator("#result-title")).toHaveText("위험도 한계 도달");
  await expect(page.locator("#result-progress")).toHaveAttribute("data-trend", "declined");
  await expect(page.locator("#result-progress-summary")).toContainText("직전 기록보다");
  await expect(page.locator("#result-comparison-grid .comparison-card").first()).toContainText("이전 500");
});

test("Practice skip updates mastery, Daily repeats its seed, and reduced motion persists", async ({ page }) => {
  await preparePage(page, { nickname: "PracticeQA" });
  await page.locator("#open-practice").click();
  const firstSkill = page.locator("#practice-skills input").first();
  const skillId = await firstSkill.getAttribute("value");
  await firstSkill.check();
  await page.locator("#start-practice").click();
  await page.clock.runFor(50);
  await expect(page.locator("#skip-button")).toBeVisible();
  await expect(page.locator("#hud-time")).toHaveText("∞");
  await expect(page.locator(".danger-panel")).toBeHidden();
  await expect(page.locator("#practice-rivals")).toBeVisible();
  await expect(page.locator("#practice-rival-state")).toContainText(/계속|불러오지/);
  await expect(page.locator("#practice-rival-target")).toContainText("랭킹에 제출되지 않습니다");
  await expect(page.locator("#hud-problem")).toHaveText("1 / 30");
  await page.locator("#skip-button").click();
  await expect(page.locator("#feedback-message")).toContainText("SKIPPED");
  await page.clock.runFor(400);
  await expect(page.locator("#typing-input")).toBeEnabled();
  await expect(page.locator("#hud-problem")).toHaveText("2 / 30");
  await page.locator("#brand-home").click();
  await expect(page.locator("#screen-home")).toBeVisible();
  const masteryAttempts = await page.evaluate((id) => {
    const data = JSON.parse(localStorage.getItem("pythonTypingSurvival:v1"));
    return data.progress.skills[id]?.attempts ?? 0;
  }, skillId);
  expect(masteryAttempts).toBe(1);

  await page.locator("#start-daily").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#hud-time")).toHaveText("∞");
  const firstDailyCode = await page.locator("#question-code").textContent();
  await page.locator("#brand-home").click();
  await expect(page.locator("#screen-home")).toBeVisible();
  await page.locator("#start-daily").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#question-code")).toHaveText(firstDailyCode);
  await page.locator("#brand-home").click();

  await page.locator("#open-settings").click();
  await expect(page.locator("#settings-block-typos")).toBeChecked();
  await page.locator("#settings-block-typos").uncheck();
  await page.locator("#settings-motion").check();
  await page.locator("#settings-form button[type=submit]").click();
  await expect(page.locator("#settings-message")).toContainText("저장");
  expect(await page.locator("html").getAttribute("data-reduced-motion")).toBe("true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pythonTypingSurvival:v1")).settings.blockTypos)).toBe(false);
});

test("anonymous question editor validates input without an admin email", async ({ page }) => {
  await preparePage(page, { nickname: "EditorQA" });
  await page.locator("#open-questions").click();
  await expect(page.locator("#screen-questions")).toBeVisible();
  await expect(page.locator("#question-editor-form input[type=email]")).toHaveCount(0);
  await expect(page.locator("#question-source option").first()).toContainText("새 공유 문제");

  await page.locator("#question-level-input").selectOption("2");
  await page.locator("#question-code-input").fill("print(1)");
  await page.locator("#question-answer-input").fill("1");
  await page.locator("#question-output-input").fill("1");
  await page.locator("#question-editor-form button[type=submit]").click();
  await expect(page.locator("#question-editor-message")).toContainText("형식을 확인");

  await page.locator("#question-level-input").selectOption("1");
  await page.locator("#question-code-input").fill("print(123)");
  await page.locator("#question-editor-form button[type=submit]").click();
  await expect(page.locator("#question-editor-message")).toContainText(/저장하지 못|오프라인/);
});

test("Sample Logic starts a short executable non-ranked Practice pool", async ({ page }) => {
  await preparePage(page, { nickname: "SampleQA" });
  await page.locator("#start-samples").click();
  await expect(page.locator("#game-mode-label")).toHaveText("SAMPLE LOGIC");
  await page.clock.runFor(3_050);
  await expect(page.locator("#typing-input")).toBeEnabled();
  const code = await page.locator("#question-code").textContent();
  expect([
    "numbers = [2, 4, 6]",
    "score = 82",
    "squares = []",
    "name = \"python\"",
    "count = 3",
    "numbers = [1, 2, 3, 4]",
    "items = [\"a\", \"b\", \"c\"]",
    "scores = [81, 100, 62, 100, 90]",
    "tags = [\"py\", \"list\", \"py\", \"set\"]",
    "a = {\"A1\", \"A2\"}",
    "need = {\"read\", \"export\"}",
    "left = {\"a\", \"b\"}",
    "colors = {\"red\", \"blue\"}",
    "seen = {\"a\", \"b\"}",
  ].some((prefix) => code.startsWith(prefix))).toBe(true);
  await expect(page.locator("#skip-button")).toBeVisible();
});

test("Beginner Guide presents one of 50 practical long-form programs in a focused workspace", async ({ page }) => {
  await preparePage(page, { nickname: "BeginnerQA" });
  await page.locator("#open-settings").click();
  await page.locator("#settings-block-typos").uncheck();
  await page.locator("#settings-form button[type=submit]").click();
  await page.locator("#brand-home").click();
  await page.locator("#start-beginner").click();
  await expect(page.locator("#game-mode-label")).toContainText("50 PRACTICAL SNIPPETS");
  await page.clock.runFor(3_050);
  const code = await page.locator("#question-code").textContent();
  expect(code.startsWith("# ")).toBe(true);
  expect(code.split("\n").length).toBeGreaterThanOrEqual(4);
  expect(code.split("\n").length).toBeLessThanOrEqual(12);
  await expect(page.locator("#hud-problem")).toHaveText("1 / 50");
  await expect(page.locator(".code-card")).toBeVisible();
  await expect(page.locator("#battle-lane")).toBeHidden();
  await expect(page.locator("#practice-rivals")).toBeHidden();
  await expect(page.locator("#game-online-players")).toBeHidden();
  await expect(page.locator("#typing-feedback")).toHaveText("");
  await expect(page.locator("#skip-button")).toBeVisible();
  await expect(page.locator("#screen-game")).toHaveAttribute("data-practice-layout", "vertical");
  await expect(page.locator("#practice-layout-vertical")).toHaveAttribute("aria-pressed", "true");
  const verticalGeometry = await page.evaluate(() => {
    const referenceCard = document.querySelector(".code-card").getBoundingClientRect();
    const typingCard = document.querySelector(".typing-card").getBoundingClientRect();
    const reference = document.querySelector("#question-code");
    const input = document.querySelector("#typing-feedback");
    const referenceStyle = getComputedStyle(reference);
    const referenceTextStyle = getComputedStyle(reference.querySelector("code"));
    const inputStyle = getComputedStyle(input);
    return {
      referenceBottom: referenceCard.bottom,
      typingTop: typingCard.top,
      referenceHeight: reference.getBoundingClientRect().height,
      inputHeight: input.getBoundingClientRect().height,
      referenceContentHeight: reference.clientHeight
        - Number.parseFloat(referenceStyle.paddingTop)
        - Number.parseFloat(referenceStyle.paddingBottom),
      inputContentHeight: input.clientHeight
        - Number.parseFloat(inputStyle.paddingTop)
        - Number.parseFloat(inputStyle.paddingBottom),
      expectedThreeLineHeight: Number.parseFloat(referenceStyle.lineHeight) * 3,
      referenceFontSize: referenceTextStyle.fontSize,
      inputFontSize: inputStyle.fontSize,
      referenceLineHeight: referenceStyle.lineHeight,
      inputLineHeight: inputStyle.lineHeight,
      referenceWidth: reference.getBoundingClientRect().width,
      inputWidth: input.getBoundingClientRect().width,
    };
  });
  expect(verticalGeometry.typingTop).toBeGreaterThanOrEqual(verticalGeometry.referenceBottom);
  expect(Math.abs(verticalGeometry.referenceContentHeight - verticalGeometry.expectedThreeLineHeight)).toBeLessThan(1);
  expect(Math.abs(verticalGeometry.inputContentHeight - verticalGeometry.expectedThreeLineHeight)).toBeLessThan(1);
  expect(Math.abs(verticalGeometry.referenceHeight - verticalGeometry.inputHeight)).toBeLessThan(1);
  expect(verticalGeometry.referenceFontSize).toBe(verticalGeometry.inputFontSize);
  expect(verticalGeometry.referenceLineHeight).toBe(verticalGeometry.inputLineHeight);
  expect(Math.abs(verticalGeometry.referenceWidth - verticalGeometry.inputWidth)).toBeLessThan(2);

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const responsiveVertical = await page.evaluate(() => {
      const reference = document.querySelector("#question-code");
      const input = document.querySelector("#typing-feedback");
      const style = getComputedStyle(reference);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        referenceRight: reference.getBoundingClientRect().right,
        inputRight: input.getBoundingClientRect().right,
        referenceRows: (reference.clientHeight
          - Number.parseFloat(style.paddingTop)
          - Number.parseFloat(style.paddingBottom)) / Number.parseFloat(style.lineHeight),
      };
    });
    expect(responsiveVertical.documentWidth).toBeLessThanOrEqual(responsiveVertical.viewportWidth);
    expect(responsiveVertical.referenceRight).toBeLessThanOrEqual(responsiveVertical.viewportWidth);
    expect(responsiveVertical.inputRight).toBeLessThanOrEqual(responsiveVertical.viewportWidth);
    expect(responsiveVertical.referenceRows).toBeCloseTo(3, 1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  const fourthLineStart = code.split("\n").slice(0, 3).join("\n") + "\n";
  await page.locator("#typing-input").focus();
  await page.keyboard.insertText(fourthLineStart);
  await page.clock.runFor(20);
  const synchronizedScroll = await page.evaluate(() => {
    const reference = document.querySelector("#question-code");
    const input = document.querySelector("#typing-feedback");
    const cursor = reference.querySelector(".cursor");
    const style = getComputedStyle(reference);
    return {
      referenceScrollTop: reference.scrollTop,
      inputScrollTop: input.scrollTop,
      cursorRow: (cursor.getBoundingClientRect().top
        - reference.getBoundingClientRect().top
        - Number.parseFloat(style.paddingTop)) / Number.parseFloat(style.lineHeight),
    };
  });
  expect(synchronizedScroll.referenceScrollTop).toBeGreaterThan(0);
  expect(Math.abs(synchronizedScroll.referenceScrollTop - synchronizedScroll.inputScrollTop)).toBeLessThan(1);
  expect(synchronizedScroll.cursorRow).toBeGreaterThan(0.8);
  expect(synchronizedScroll.cursorRow).toBeLessThan(1.2);

  for (let index = 0; index < fourthLineStart.length; index += 1) {
    await page.keyboard.press("Backspace");
  }
  await expect(page.locator("#typing-input")).toHaveValue("");

  await page.locator("#practice-layout-horizontal").click();
  expect(await page.evaluate(() => (
    JSON.parse(localStorage.getItem("pythonTypingSurvival:v1")).settings.practiceLayout
  ))).toBe("horizontal");
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
    { width: 1815, height: 1020 },
  ]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const reference = document.querySelector(".code-card").getBoundingClientRect();
      const typing = document.querySelector(".typing-card").getBoundingClientRect();
      const codeDisplay = document.querySelector("#question-code").getBoundingClientRect();
      const inputElement = document.querySelector("#typing-input");
      const input = inputElement.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        referenceLeft: reference.left,
        referenceRight: reference.right,
        referenceBottom: reference.bottom,
        typingLeft: typing.left,
        typingRight: typing.right,
        typingTop: typing.top,
        codeWidth: codeDisplay.width,
        inputWidth: input.width,
        inputHeight: input.height,
        codeStartY: codeDisplay.top,
        inputStartY: input.top,
        referenceFontSize: getComputedStyle(document.querySelector("#question-code code")).fontSize,
        inputFontSize: getComputedStyle(inputElement).fontSize,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.referenceLeft).toBeGreaterThanOrEqual(0);
    expect(layout.referenceRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.typingLeft).toBeGreaterThanOrEqual(0);
    expect(layout.typingRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(Math.abs(layout.codeWidth - layout.inputWidth)).toBeLessThan(2);
    expect(layout.inputHeight).toBeGreaterThan(280);
    expect(layout.referenceFontSize).toBe(layout.inputFontSize);
    if (viewport.width <= 900) {
      expect(layout.typingTop).toBeGreaterThanOrEqual(layout.referenceBottom);
    } else {
      expect(layout.typingLeft).toBeGreaterThanOrEqual(layout.referenceRight);
      expect(
        Math.abs(layout.codeStartY - layout.inputStartY),
        `원문과 입력 첫 줄의 Y축 시작점이 달라졌습니다: ${JSON.stringify(layout)}`,
      ).toBeLessThan(1);
    }
  }
  const answer = await currentAnswer(page);
  const wrongAnswer = `${answer.slice(0, -1)}${answer.endsWith("x") ? "y" : "x"}`;
  await page.locator("#typing-input").focus();
  await page.keyboard.insertText(wrongAnswer);
  await expect(page.locator("#typing-feedback")).toBeHidden();
  await expect(page.locator("#question-code .correct").first()).toBeVisible();
  await expect(page.locator("#question-code .incorrect")).toHaveCount(1);
  await expect(page.locator("#question-code")).toHaveText(answer);
  await page.keyboard.press("Enter");
  await expect(page.locator("#typing-input")).toBeDisabled();
  await expect(page.locator("#feedback-message")).toContainText("오답으로 기록");
  await advanceToNextQuestion(page, code);
});

test("Python operators render as separate characters without font ligatures", async ({ page }) => {
  await preparePage(page, { nickname: "LigatureQA" });
  await page.locator("#start-samples").click();
  await page.clock.runFor(3_050);

  for (const selector of ["#question-code", "#typing-feedback", "#typing-input"]) {
    const fontStyle = await page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        ligatures: style.fontVariantLigatures,
        features: style.fontFeatureSettings,
      };
    });
    expect(fontStyle.ligatures).toBe("none");
    expect(fontStyle.features).toContain('"liga" 0');
    expect(fontStyle.features).toContain('"calt" 0');
  }
});

test("desktop game shows rivals around YOU, online players on the right, and a named overtake effect", async ({ page }) => {
  await preparePage(page, { nickname: "RaceQA" });
  await page.locator("#start-samples").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#game-online-players")).toBeVisible();

  const competition = await page.evaluate(async () => {
    const moduleUrl = new URL("./js/ui/render-competition.js", document.baseURI).href;
    const { renderBattleCompetition, triggerOvertakeEffect } = await import(moduleUrl);
    renderBattleCompetition({
      score: 100,
      competitors: [
        { playerName: "BehindQA", score: 300 },
        { playerName: "AheadQA", score: 1_000 },
      ],
    });
    const movingRival = document.querySelector('.rival-unit[data-player-name="AheadQA"]');
    const earlyLeft = parseFloat(movingRival.style.left);
    renderBattleCompetition({
      score: 900,
      competitors: [
        { playerName: "BehindQA", score: 300 },
        { playerName: "AheadQA", score: 1_000 },
      ],
    });
    const caughtUpRival = document.querySelector('.rival-unit[data-player-name="AheadQA"]');
    triggerOvertakeEffect([{ playerName: "BehindQA", score: 300 }]);
    const main = document.querySelector(".game-main-column").getBoundingClientRect();
    const online = document.querySelector("#game-online-players").getBoundingClientRect();
    const you = document.querySelector(".player-unit").getBoundingClientRect();
    const behind = document.querySelector('.rival-unit[data-relation="behind"]').getBoundingClientRect();
    const ahead = document.querySelector('.rival-unit[data-relation="ahead"]').getBoundingClientRect();
    const rivalName = document.querySelector('.rival-unit[data-relation="behind"] strong');
    const rivalUnit = document.querySelector('.rival-unit[data-relation="behind"]');
    const rivalLabel = rivalName.getBoundingClientRect();
    const rivalShape = rivalUnit.getBoundingClientRect();
    const lane = document.querySelector("#battle-lane").getBoundingClientRect();
    return {
      behindName: document.querySelector('.rival-unit[data-relation="behind"] strong').textContent,
      aheadName: document.querySelector('.rival-unit[data-relation="ahead"] strong').textContent,
      effectVisible: !document.querySelector("#overtake-effect").hidden,
      effectName: document.querySelector("#overtake-player").textContent,
      mainRight: main.right,
      onlineLeft: online.left,
      youLeft: you.left,
      behindLeft: behind.left,
      aheadLeft: ahead.left,
      rivalMovedOnSameNode: caughtUpRival === movingRival && parseFloat(caughtUpRival.style.left) < earlyLeft,
      rivalLabelCenterDelta: Math.abs((rivalLabel.left + rivalLabel.width / 2) - (rivalShape.left + rivalShape.width / 2)),
      rivalLabelFitsLane: rivalLabel.top >= lane.top && rivalLabel.bottom <= lane.bottom,
      rivalNameFontRatio: parseFloat(getComputedStyle(rivalName).fontSize)
        / parseFloat(getComputedStyle(document.documentElement).fontSize),
    };
  });
  expect(competition.behindName).toBe("BehindQA");
  expect(competition.aheadName).toBe("AheadQA");
  expect(competition.effectVisible).toBe(true);
  expect(competition.effectName).toBe("BehindQA");
  expect(competition.onlineLeft).toBeGreaterThanOrEqual(competition.mainRight);
  expect(competition.behindLeft).toBeLessThan(competition.youLeft);
  expect(competition.aheadLeft).toBeGreaterThan(competition.youLeft);
  expect(competition.rivalMovedOnSameNode).toBe(true);
  expect(competition.rivalLabelCenterDelta).toBeLessThan(2);
  expect(competition.rivalLabelFitsLane).toBe(true);
  expect(competition.rivalNameFontRatio).toBeCloseTo(1.59, 2);
});

test("360px, 768px and 1280px layouts keep code and input inside the viewport", async ({ page }) => {
  await preparePage(page, { nickname: "LongPlayer12" });
  await page.locator("#start-quick").click();
  await page.clock.runFor(3_050);

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1280, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const code = document.querySelector("#question-code").getBoundingClientRect();
      const input = document.querySelector("#typing-input").getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        codeLeft: code.left,
        codeRight: code.right,
        inputLeft: input.left,
        inputRight: input.right,
        codeBottom: code.bottom,
        inputTop: input.top,
        overlap: Math.max(0, Math.min(code.bottom, input.bottom) - Math.max(code.top, input.top))
          * Math.max(0, Math.min(code.right, input.right) - Math.max(code.left, input.left)),
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.codeLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.codeRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.inputLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.inputRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.inputTop).toBeGreaterThanOrEqual(geometry.codeBottom);
    expect(geometry.overlap).toBe(0);
    await page.screenshot({ path: `test-results/layout-${viewport.width}.png`, fullPage: true });
  }
});

test("content load failure stays retryable and does not reveal a broken Home screen", async ({ page }) => {
  await page.route("https://*.supabase.co/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}",
  }));
  let failQuestions = true;
  await page.route("**/data/questions.json", (route) => {
    if (failQuestions) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{" });
    }
    return route.continue();
  });
  await page.goto("./");
  await expect(page.locator("#screen-error")).toBeVisible();
  await expect(page.locator("#screen-home")).toBeHidden();
  await expect(page.locator("#nickname-dialog")).not.toBeVisible();
  failQuestions = false;
  await page.locator("#retry-app").click();
  await expect(page.locator("#screen-home")).toBeVisible();
  await expect(page.locator("#nickname-dialog")).toBeVisible();
});

test("development server exposes only deployable public files", async ({ request }) => {
  for (const privatePath of ["supabase_token.txt", "supabase_db_pass.txt", "package.json", "supabase/schema.sql"]) {
    const response = await request.get(`./${privatePath}`);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("sbp_");
    expect(await response.text()).not.toContain("postgres");
  }
  expect((await request.get("./js%2f..%2fsupabase_token.txt")).status()).toBe(404);
  await expect((await request.get("./js/app.js")).status()).toBe(200);
  await expect((await request.get("./data/questions.json")).status()).toBe(200);
});
