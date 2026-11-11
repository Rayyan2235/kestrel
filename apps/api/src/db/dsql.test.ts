import { expect, it, vi } from "vitest";
import { DSQL_USER, databaseConfig, dsqlPoolConfig } from "./dsql.js";

const HOST = "abc123.dsql.us-east-1.on.aws";

it("uses DATABASE_URL locally and on Vultr, even when a DSQL endpoint is set", () => {
  expect(databaseConfig({ DATABASE_URL: "postgres://k@127.0.0.1/k", DSQL_ENDPOINT: HOST })).toEqual({ connectionString: "postgres://k@127.0.0.1/k" });
  expect(databaseConfig({ TIGER_DATABASE_URL: "postgres://legacy" })).toEqual({ connectionString: "postgres://legacy" });
  expect(databaseConfig({})).toBeNull();
});

it("on AWS logs in to DSQL as the non-admin role over verified TLS", () => {
  const config = databaseConfig({ DSQL_ENDPOINT: HOST, AWS_REGION: "us-east-1" })!;
  expect(config).toMatchObject({ host: HOST, port: 5432, database: "postgres", user: DSQL_USER, ssl: { rejectUnauthorized: true } });
  expect(DSQL_USER).not.toBe("admin");
  expect(typeof config.password).toBe("function");
  expect(config.connectionString).toBeUndefined();
});

it("signs a fresh token for every new connection, never a stored password", async () => {
  const sign = vi.fn().mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2");
  const password = dsqlPoolConfig(HOST, "us-east-1", sign).password as () => Promise<string>;
  expect(await password()).toBe("token-1");
  expect(await password()).toBe("token-2");
  expect(sign).toHaveBeenCalledTimes(2);
});
