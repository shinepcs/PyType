import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4173/PyType/",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 7_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run serve",
    url: "http://127.0.0.1:4173/PyType/",
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
