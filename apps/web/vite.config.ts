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
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
      },
    },
  };
});
