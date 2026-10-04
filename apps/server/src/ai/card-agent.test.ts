import { describe, expect, it } from "vitest";
import { toModelError } from "./card-agent.js";

describe("toModelError", () => {
  it("tells the reader how to add a missing Google key", () => {
    const err = toModelError(
      new Error(
        "Could not find API key process.env.GOOGLE_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY for model id google/gemma-4-26b-a4b-it",
      ),
    );
    expect(err.status).toBe(503);
    expect(err.message).toBe(
      "The AI model has no API key. Add GOOGLE_GENERATIVE_AI_API_KEY to .env (free key: https://aistudio.google.com/apikey) and restart the server.",
    );
  });

  it("says a key that is set but invalid was rejected, not missing", () => {
    const err = toModelError(new Error("API key not valid. Please pass a valid API key."));
    expect(err.status).toBe(503);
    expect(err.message).toBe(
      "The API key in .env was rejected: API key not valid. Please pass a valid API key.",
    );
  });

  it("keeps the provider's message for other providers", () => {
    const err = toModelError(new Error("Could not find API key OPENROUTER_API_KEY"));
    expect(err.status).toBe(503);
    expect(err.message).toContain("OPENROUTER_API_KEY");
  });
});
