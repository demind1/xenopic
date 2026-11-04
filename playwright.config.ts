import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.e2e.ts",
  timeout: 180000,
  workers: 1,
  use: { headless: true },
  reporter: "list",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "browser",
      testMatch: "browser.e2e.ts",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath:
            process.env.NIGHTFRAME_CHROMIUM ||
            (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
          args: ["--no-sandbox"],
        },
      },
    },
    { name: "desktop", testMatch: "desktop.e2e.ts" },
  ],
});
