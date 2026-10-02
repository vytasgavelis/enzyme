import type { AppType } from "@enzyme/server";
import { hc } from "hono/client";

/**
 * Typed RPC client. Paths, params, request bodies and response shapes are all
 * inferred from the server's route definitions — change a route, the UI fails to compile.
 */
export const api = hc<AppType>("/");
