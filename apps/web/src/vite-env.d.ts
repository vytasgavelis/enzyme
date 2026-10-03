/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * "1" runs the UI on the in-browser mock API (`lib/mock-api.ts`) instead of the server:
   * `VITE_MOCK_API=1 pnpm --filter @enzyme/web dev`.
   */
  readonly VITE_MOCK_API?: string;
}
