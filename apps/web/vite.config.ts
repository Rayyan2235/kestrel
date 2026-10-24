import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const port = Number(process.env.KESTREL_UI_PORT || 5180);
const apiPort = Number(
  process.env.KESTREL_API_PORT || process.env.PORT || 5181,
);
export default defineConfig({
  plugins: [
    react(),
    {
      name: "test-server-identity",
      configureServer(server) {
        const token = process.env.KESTREL_TEST_TOKEN;
        if (token)
          server.middlewares.use((req, res, next) => {
            if (req.url !== `/__kestrel_test__/${token}`) return next();
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ token, root: server.config.root }));
          });
      },
    },
  ],
  server: {
    port,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  preview: { port, strictPort: true },
});
