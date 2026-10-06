import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "operation.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    ...(process.env["PLAYWRIGHT_CHROMIUM_PATH"]
      ? {
          launchOptions: {
            executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"],
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
          },
        }
      : {}),
  },
  webServer: {
    command: "npx vite --config e2e/fixture.config.ts --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/operacao",
    reuseExistingServer: false,
  },
});
