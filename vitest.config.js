import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/ui.spec.js", "tests/ui-integracao.spec.js", "tests/ui-etapas.spec.js"],
    restoreMocks: true
  }
});
