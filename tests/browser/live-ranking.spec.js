import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const LIVE_ENABLED = process.env.PYTYPE_LIVE_SUPABASE === "1";
const TARGET_URL = process.env.PYTYPE_BASE_URL || "./";
const SEED = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";

test.skip(!LIVE_ENABLED, "Set PYTYPE_LIVE_SUPABASE=1 for the isolated live ranking round trip.");

test.afterEach(async ({ page }, testInfo) => {
  const cleanup = await page.evaluate(() => {
    try {
      const session = JSON.parse(localStorage.getItem("pythonTypingSurvival:supabase-auth:v1"));
      return session?.userId ? { userId: session.userId } : null;
    } catch {
      return null;
    }
  }).catch(() => null);
  if (cleanup) {
    await writeFile(testInfo.outputPath("live-cleanup.json"), JSON.stringify(cleanup), "utf8");
  }
});
test("browser Quick Play submits and reads Global, Today and My Best", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.clock.install({ time: new Date("2026-08-11T07:00:00.000Z") });
  await page.addInitScript(({ seed, sessionId }) => {
    const ids = [seed, sessionId, "66666666-6666-4666-8666-666666666666"];
    let index = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      configurable: true,
      value: () => ids[index++] ?? ids.at(-1),
    });
    localStorage.setItem("pythonTypingSurvival:v1", JSON.stringify({
      schemaVersion: 1,
      profile: { nickname: "CodexQA", createdAt: "2026-08-11T07:00:00.000Z" },
      settings: { sound: false, reducedMotion: true, fontScale: 1 },
      progress: { skills: {} },
      history: [],
      personalBest: { quick: null, daily: null },
      pendingRankingSubmissions: [],
    }));
  }, { seed: SEED, sessionId: SESSION_ID });

  await page.goto(TARGET_URL);
  await expect(page.locator("#network-label")).toHaveText("RANKING ONLINE", { timeout: 15_000 });
  await page.locator("#start-quick").click();
  await page.clock.runFor(3_050);
  await expect(page.locator("#typing-input")).toBeEnabled();

  const answer = await page.locator("#question-code").textContent();
  await page.locator("#typing-input").focus();
  await page.keyboard.insertText(answer[0]);
  await page.clock.runFor(Math.max(1_200, answer.length * 100));
  await page.keyboard.insertText(answer.slice(1));
  await expect(page.locator("#typing-input")).toBeDisabled();

  await page.clock.fastForward(240_000);
  await expect(page.locator("#screen-result")).toBeVisible();
  await expect(page.locator("#ranking-submit-label")).toContainText("온라인", { timeout: 15_000 });
  await expect(page.locator("#ranking-submit-label")).toContainText("#1");

  await page.locator("#result-ranking").click();
  await expect(page.locator("#ranking-body")).toContainText("CodexQA", { timeout: 15_000 });
  await page.locator("#rank-tab-today").click();
  await expect(page.locator("#ranking-body")).toContainText("CodexQA", { timeout: 15_000 });
  await page.locator("#rank-tab-mine").click();
  await expect(page.locator("#ranking-body")).toContainText("CodexQA", { timeout: 15_000 });
  expect(browserErrors).toEqual([]);
});
