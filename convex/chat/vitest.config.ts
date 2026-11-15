import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["convex/chat/**/*.test.ts", "keiki/**/*.test.ts"] },
});
