import { beforeAll, expect, test, vi } from "vitest";

const click = (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const change = (element) => element.dispatchEvent(new Event("change", { bubbles: true }));
const input = (element) => element.dispatchEvent(new Event("input", { bubbles: true }));
const submit = (form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  vi.stubGlobal("confirm", () => true);
  await import("../src/app.js");
});

test("modais, CRUD, filtros e links da matriz funcionam em conjunto", () => {
  click(document.querySelector('[data-route="requirements"]'));
  // Libera uma das três vagas do escopo antes de testar a criação.
  click(document.querySelector('[data-action="edit-requirement"][data-id="REQ-003"]'));
  click(document.querySelector('.modal [data-action="delete-item"]'));
  click(document.querySelector('[data-action="open-requirement"]'));
  expect(document.querySelector(".modal")).not.toBeNull();
  click(document.querySelector('.modal [data-action="close-modal"]'));
  expect(document.querySelector(".modal")).toBeNull();

  click(document.querySelector('[data-action="open-requirement"]'));
  const createForm = document.querySelector("#entity-form");
  createForm.elements.title.value = "Requisito criado no teste de interface";
  createForm.elements.description.value = "Comportamento verificável para validar o CRUD.";
  submit(createForm);
  expect(document.body.textContent).toContain("Registro salvo com sucesso");
  click(document.querySelector('[data-action="open-requirement"]'));
  expect(document.querySelector(".modal")).toBeNull();
  expect(document.body.textContent).toContain("O escopo já contém as três funcionalidades principais");

  click(document.querySelector('[data-route="requirements"]'));
  const search = document.querySelector('[data-filter-controls="requirement-list"] [data-filter-key="query"]');
  search.value = "requisito criado";
  input(search);
  const visibleRequirements = [...document.querySelectorAll("#requirement-list .filter-item")].filter((item) => !item.hidden);
  expect(visibleRequirements).toHaveLength(1);
  const priority = document.querySelector('[data-filter-controls="requirement-list"] [data-filter-key="priority"]');
  priority.value = "Alta";
  change(priority);
  expect([...document.querySelectorAll("#requirement-list .filter-item")].filter((item) => !item.hidden)).toHaveLength(0);
  click(document.querySelector('[data-action="clear-filters"][data-scope="requirement-list"]'));

  click(document.querySelector('[data-route="execution"]'));
  click(document.querySelector('[data-action="edit-execution"]'));
  expect(document.querySelector(".modal-head h2").textContent).toBe("Editar execução");
  const executionForm = document.querySelector("#entity-form");
  executionForm.elements.actual.value = "Evidência atualizada pelo CRUD.";
  submit(executionForm);
  expect(document.body.textContent).toContain("Evidência atualizada pelo CRUD.");

  click(document.querySelector('[data-action="edit-metric"]'));
  expect(document.querySelector(".modal-head h2").textContent).toBe("Editar métrica");
  const metricForm = document.querySelector("#entity-form");
  metricForm.elements.statementCoverage.value = "91";
  submit(metricForm);
  expect(document.body.textContent).toContain("91%");

  click(document.querySelector('[data-route="traceability"]'));
  const traceSearch = document.querySelector('[data-filter-controls="trace-table"] [data-filter-key="query"]');
  traceSearch.value = "CT-002";
  input(traceSearch);
  const visibleRows = [...document.querySelectorAll("#trace-table .filter-item")].filter((item) => !item.hidden);
  expect(visibleRows).toHaveLength(1);
  click(visibleRows[0].querySelector('[data-action="edit-case"]'));
  expect(document.querySelector(".modal-head h2").textContent).toBe("Editar caso");

  click(document.querySelector(".modal-body"));
  expect(document.querySelector(".modal")).not.toBeNull();
  click(document.querySelector("[data-modal-backdrop]"));
  expect(document.querySelector(".modal")).toBeNull();

  // Exclusão pelo modal encerra o ciclo CRUD.
  click(document.querySelector('[data-route="requirements"]'));
  const createdCard = [...document.querySelectorAll("#requirement-list .filter-item")].find((item) => item.textContent.includes("Requisito criado no teste de interface"));
  click(createdCard.querySelector('[data-action="edit-requirement"]'));
  click(document.querySelector('.modal [data-action="delete-item"]'));
  expect(document.body.textContent).not.toContain("Requisito criado no teste de interface");

  click(document.querySelector('[data-route="integration"]'));
  expect(document.body.textContent).toContain("Integração com o repositório Python");
  expect(document.body.textContent).toContain('@pytest.mark.vv_case("CT-001")');
});
