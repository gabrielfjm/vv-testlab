import { beforeAll, expect, test, vi } from "vitest";
import { STORAGE_KEY, demoState } from "../src/core.js";

const click = (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  // Estado salvo após uma mutação pela ponte: finishedAt vem com data e hora ISO.
  const state = demoState();
  state.mutationHistory = [{
    id: "MUT-001", runId: "MUTATION-20260930-115150", finishedAt: "2026-09-30T11:51:50-03:00",
    tool: "cosmic-ray", duration: 314.8, exitCode: 0, total: 189, killed: 181, survived: 8,
    incompetent: 0, skipped: 0, timeout: 0, noTests: 0, score: 95.77, status: "Concluída"
  }];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  vi.stubGlobal("confirm", () => true);
  await import("../src/app.js");
});

test("a integração Python abre depois de uma mutação registrada com data e hora", () => {
  click(document.querySelector('[data-route="integration"]'));
  expect(document.querySelector("h1").textContent).toContain("Integração com o repositório Python");
  expect(document.querySelector('[data-action="check-bridge"]')).not.toBeNull();
  expect(document.querySelector('[data-action="sync-repository"]')).not.toBeNull();
  expect(document.body.textContent).toContain("30/09/2026");
});
