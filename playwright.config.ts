import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  // CI runs rescue-navigation in its own job (.github/workflows/ci.yml).
  testIgnore: process.env.KESTREL_E2E_SKIP_RESCUE ? ["**/rescue-navigation.spec.ts"] : [],
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:5180", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
