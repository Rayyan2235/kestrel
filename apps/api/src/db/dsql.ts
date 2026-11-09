import { DsqlSigner } from "@aws-sdk/dsql-signer";
import type pg from "pg";

// Where the API's database connection comes from.
// - Locally and on Vultr: DATABASE_URL, the migrated schema. TIGER_DATABASE_URL
//   is the legacy hypertable, still read until moved.
// - On AWS: Aurora DSQL, which has no passwords. Each new connection presents a
//   short-lived token signed with the Lambda role (dsql:DbConnect, granted in
//   infra/kestrel_infra/stack.py). pg calls `password` for every new
//   connection, so a pooled connection never reuses an expired token.

/** The non-admin DSQL role the API logs in as, created once by the owner (infra/README.md). */
export const DSQL_USER = "kestrel_api";

type Sign = () => Promise<string>;

export function dsqlPoolConfig(host: string, region: string, sign?: Sign): pg.PoolConfig {
  const token = sign ?? (() => new DsqlSigner({ hostname: host, region }).getDbConnectAuthToken());
  return { host, port: 5432, database: "postgres", user: DSQL_USER, password: token, ssl: { rejectUnauthorized: true } };
}

export function databaseConfig(env: NodeJS.ProcessEnv = process.env): pg.PoolConfig | null {
  const url = env.DATABASE_URL || env.TIGER_DATABASE_URL;
  if (url) return { connectionString: url };
  if (env.DSQL_ENDPOINT) return dsqlPoolConfig(env.DSQL_ENDPOINT, env.AWS_REGION || "us-east-1");
  return null;
}
