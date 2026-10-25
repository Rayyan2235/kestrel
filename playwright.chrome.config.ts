// Tester config: same projects as playwright.config.ts, but uses the installed
// Chrome (bundled chromium is not installed here) and its own dev server port,
// so it never tests another worktree's server.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const PORT = 5181;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  projects: (base.projects ?? []).map((p) => ({
    ...p,
    use: { ...p.use, channel: "chrome" },
  })),
  webServer: {
    command: `pnpm --filter @kestrel/web exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
