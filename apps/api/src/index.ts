import { buildApp } from "./app.js";
const app = buildApp();
try {
  await app.listen({
    host: "127.0.0.1",
    port: Number(process.env.PORT || 5181),
  });
  console.log("Kestrel API: http://127.0.0.1:5181");
} catch (error) {
  console.error(error);
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
