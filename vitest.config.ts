import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Unit tests only — Playwright E2E lives in tests/e2e and runs
    // separately via `npm run test:e2e`.
    include: ["tests/unit/**/*.test.ts"],
    env: {
      // Unit tests never touch a real database; this placeholder only stops
      // the Prisma client constructor from complaining on import.
      DATABASE_URL: "postgresql://unit:unit@localhost:5432/unit-tests-no-db",
    },
  },
});
