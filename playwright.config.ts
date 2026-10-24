import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
const port = Number(process.env.KESTREL_TEST_PORT || 5180);
const baseURL = `http://127.0.0.1:${port}`;
const token = randomUUID();
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: { baseURL, trace: "retain-on-failure" },
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
    command: "pnpm --filter @kestrel/web dev",
    cwd: import.meta.dirname,
    env: { KESTREL_UI_PORT: String(port), KESTREL_TEST_TOKEN: token },
    url: `${baseURL}/__kestrel_test__/${token}`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
