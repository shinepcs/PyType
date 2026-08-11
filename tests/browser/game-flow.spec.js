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

async function preparePage(page, { nickname = null } = {}) {
  await page.clock.install({ time: new Date("2026-08-11T06:00:00.000Z") });
  await page.route("https://*.supabase.co/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ message: "ranking unavailable in offline browser test" }),
  }));
  await page.addInitScript(({ seed, sessionId, nicknameValue }) => {
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
        history: [],
        personalBest: { quick: null, daily: null },
        pendingRankingSubmissions: [],
      }));
    }
  }, { seed: SESSION_SEED, sessionId: SESSION_ID, nicknameValue: nickname });
  await page.goto("./");
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
  await preparePage(page);
  await expect(page.locator("#nickname-dialog")).toBeVisible();
  await page.locator("#nickname-input").fill("코드초보_1");
  await page.locator("#nickname-form button[type=submit]").click();
  await expect(page.locator("#screen-home")).toBeVisible();

  await page.locator("#start-quick").click();
  await expect(page.locator("#ready-count")).toHaveText("3");
  await page.clock.runFor(3_050);
  await expect(page.locator("#typing-input")).toBeEnabled();

  await page.locator("#typing-input").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#pause-button")).toBeFocused();
  await expect(page.locator("#typing-input")).toHaveValue("");

  const encounteredLevels = new Set();
  let solved = 0;
  while (solved < 20 && encounteredLevels.size < 2) {
    encounteredLevels.add(await page.locator("#question-level").textContent());
    const code = await page.locator("#question-code").textContent();
    const answer = await currentAnswer(page);
    if (solved === 0) {
      await page.locator("#typing-input").focus();
      await page.keyboard.insertText("!");
      await expect(page.locator("#feedback-message")).toContainText("TYPO");
      await page.keyboard.press("Backspace");
    }
    await enterAnswer(page, answer);
    await expect(page.locator("#typing-input")).toBeDisabled();
    solved += 1;
    if (encounteredLevels.size < 2 && solved < 20) await advanceToNextQuestion(page, code);
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
  await expect(page.locator("#typing-input")).toBeDisabled();
  await page.clock.fastForward(240_000);
  await expect(page.locator("#screen-result")).toBeVisible();
  await page.clock.runFor(500);
  await expect(page.locator("#result-title")).toHaveText("훈련 완료");
  await expect(page.locator("#result-solved")).not.toHaveText("0");
  await expect(page.locator("#ranking-submit-label")).toContainText(/오프라인|등록 실패/);
  await expect(page.locator("#retry-ranking")).toBeVisible();

  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("pythonTypingSurvival:v1")));
  expect(persisted.profile.nickname).toBe("코드초보_1");
  expect(persisted.history).toHaveLength(1);
  expect(Object.keys(persisted.progress.skills).length).toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator("#nickname-dialog")).not.toBeVisible();
  await expect(page.locator("#header-player")).toHaveText("코드초보_1");
  await page.locator("#open-progress").click();
  await expect(page.locator("#mastery-grid .mastery-card").first()).toBeVisible();
});

test("paste and IME remain scoped to game input and danger reaches game over", async ({ page }) => {
  await preparePage(page, { nickname: "SafePlayer" });
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
});

test("Practice skip updates mastery, Daily repeats its seed, and reduced motion persists", async ({ page }) => {
  await preparePage(page, { nickname: "PracticeQA" });
  await page.locator("#open-practice").click();
  const firstSkill = page.locator("#practice-skills input").first();
  const skillId = await firstSkill.getAttribute("value");
  await firstSkill.check();
  await page.locator("#practice-timed").uncheck();
  await page.locator("#start-practice").click();
  await page.clock.runFor(50);
  await expect(page.locator("#skip-button")).toBeVisible();
  await expect(page.locator("#hud-time")).toHaveText("∞");
  await expect(page.locator(".danger-panel")).toBeHidden();
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
  const firstDailyCode = await page.locator("#question-code").textContent();
  await page.locator("#brand-home").click();
  await expect(page.locator("#screen-home")).toBeVisible();
  await page.locator("#start-daily").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#question-code")).toHaveText(firstDailyCode);
  await page.locator("#brand-home").click();

  await page.locator("#open-settings").click();
  await page.locator("#settings-motion").check();
  await page.locator("#settings-form button[type=submit]").click();
  await expect(page.locator("#settings-message")).toContainText("저장");
  expect(await page.locator("html").getAttribute("data-reduced-motion")).toBe("true");
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
        overlap: Math.max(0, Math.min(code.bottom, input.bottom) - Math.max(code.top, input.top))
          * Math.max(0, Math.min(code.right, input.right) - Math.max(code.left, input.left)),
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.codeLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.codeRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.inputLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.inputRight).toBeLessThanOrEqual(geometry.viewportWidth);
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
