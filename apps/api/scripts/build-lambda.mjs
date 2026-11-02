// Bundles src/lambda.ts for the Node 22 Lambda runtime (arm64; the bundle has
// no native code) into dist-lambda/lambda.mjs, which infra/app.py deploys.
import { build } from "esbuild";

await build({
  entryPoints: ["src/lambda.ts"],
  outfile: "dist-lambda/lambda.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // pg's optional native binding is never used.
  external: ["pg-native"],
  // CommonJS dependencies call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: "none",
  logLevel: "warning",
});
