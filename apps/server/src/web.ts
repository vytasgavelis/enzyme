import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const isApi = (path: string) => path === "/api" || path.startsWith("/api/");

/**
 * Serves the built web app (`apps/web/dist`) from the API process, for deployment. Files are
 * served as they are; any other non-API path gets `index.html` so client routes load on refresh.
 * Unknown `/api` paths still 404. In development Vite serves the web app instead.
 */
export function serveWeb<T extends Hono>(app: T, distDir: string): T {
  const indexHtml = readFileSync(join(distDir, "index.html"), "utf8");
  const files = serveStatic({ root: distDir });
  app.use("*", (c, next) => {
    if (isApi(c.req.path)) return next();
    // Vite fingerprints everything under /assets, so those never change
    c.header(
      "Cache-Control",
      c.req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    );
    return files(c, next);
  });
  app.get("*", (c) => {
    if (isApi(c.req.path)) return c.notFound();
    return c.html(indexHtml);
  });
  return app;
}
