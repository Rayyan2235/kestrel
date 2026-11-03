import { defineConfig, devices } from "@playwright/test";

// KESTREL_BASE_URL points the specs at a deployed site (the post-deploy gate in
// .github/workflows/deploy.yml); then no local dev server starts.
const remote = process.env.KESTREL_BASE_URL;
export default defineConfig({
  testDir: "./tests",
  // CI runs rescue-navigation in its own job (.github/workflows/ci.yml).
  testIgnore: process.env.KESTREL_E2E_SKIP_RESCUE ? ["**/rescue-navigation.spec.ts"] : [],
  fullyParallel: true,
  use: { baseURL: remote ?? "http://127.0.0.1:5180", trace: "retain-on-failure" },
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
  webServer: remote
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://127.0.0.1:5180",
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
