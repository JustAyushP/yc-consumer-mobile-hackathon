import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["convex/game/**/*.test.ts", "convex/ravo/**/*.test.ts"] },
});
