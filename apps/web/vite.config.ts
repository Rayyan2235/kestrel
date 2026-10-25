import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const port = Number(process.env.KESTREL_UI_PORT || 5180);
const apiPort = Number(
  process.env.KESTREL_API_PORT || process.env.PORT || 5181,
);
export default defineConfig({
  // Test servers keep their own dependency cache so they never re-optimise a running preview's.
  cacheDir: process.env.KESTREL_TEST_TOKEN ? "node_modules/.vite-e2e" : undefined,
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
  // The MuJoCo and ONNX Runtime WASM loaders are ES modules already; pre-bundling
  // them only forces a mid-session dependency re-optimisation.
  // three and the add-ons the vendored Microduck rig loads are bundled together
  // so the GLB geometry and the renderer share one three.js instance.
  optimizeDeps: {
    exclude: ["@mujoco/mujoco", "onnxruntime-web"],
    include: [
      "three",
      "three/addons/loaders/GLTFLoader.js",
      "three/addons/loaders/STLLoader.js",
      "three/addons/utils/BufferGeometryUtils.js",
      "three/examples/jsm/geometries/RoundedBoxGeometry.js",
    ],
  },
  server: {
    port,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
  preview: { port, strictPort: true },
});
