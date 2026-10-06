import { defineConfig, devices } from "@playwright/test";

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
    ...iphone,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}),
      args: process.env.CI || process.getuid?.() === 0 ? ["--no-sandbox"] : [],
    },
  },
});
