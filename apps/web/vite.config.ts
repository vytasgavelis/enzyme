import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = path.resolve(import.meta.dirname, "../..");

export default defineConfig(({ mode }) => {
  // Single source of truth: the repo-root .env (PORT is the API port, shared with apps/server)
  const env = loadEnv(mode, repoRoot, "");
  const apiPort = env.PORT ?? "3210";

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      strictPort: true,
      // e.g. WEB_HOST=0.0.0.0 to reach the dev server from outside a VM
      host: env.WEB_HOST ?? "localhost",
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
