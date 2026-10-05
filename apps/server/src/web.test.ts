import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { serveWeb } from "./web.js";

describe("serveWeb", () => {
  let app: Hono;

  beforeAll(() => {
    const dist = mkdtempSync(join(tmpdir(), "enzyme-web-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>Enzyme</title>");
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
    app = serveWeb(
      new Hono().get("/api/health", (c) => c.json({ ok: true })),
      dist,
    );
  });

  it("serves the index page and fingerprinted assets", async () => {
    const home = await app.request("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("<title>Enzyme</title>");
    expect(home.headers.get("cache-control")).toBe("no-cache");

    const asset = await app.request("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log(1)");
    expect(asset.headers.get("cache-control")).toContain("immutable");
  });

  it("falls back to the index page for client routes", async () => {
    const res = await app.request("/searches/3");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>Enzyme</title>");
  });

  it("leaves the API alone", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
    expect((await app.request("/api/nope")).status).toBe(404);
    expect((await app.request("/api")).status).toBe(404);
  });
});
