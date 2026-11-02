import { expect, it, vi } from "vitest";

it("the Lambda entry refuses to start without the CloudFront gate configured", async () => {
  vi.stubEnv("ORIGIN_HEADER", "x-kestrel-origin");
  vi.stubEnv("ORIGIN_SECRET", "");
  vi.stubEnv("SITE_ORIGIN", "https://d111.cloudfront.net");
  await expect(import("./lambda.js")).rejects.toThrow(/Refusing to start/);
  vi.unstubAllEnvs();
});
