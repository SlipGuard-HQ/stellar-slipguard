import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const sdkEntry = fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@slipguard/sdk": sdkEntry,
    },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
