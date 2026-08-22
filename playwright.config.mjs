import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./outputs/playwright",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: [
    ["line"],
    ["html", { outputFolder: "outputs/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:41793",
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 41793",
    url: "http://127.0.0.1:41793/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
