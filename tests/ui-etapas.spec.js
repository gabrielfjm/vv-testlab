import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, test, vi } from "vitest";
import { STORAGE_KEY } from "../src/core.js";

const click = (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const change = (element) => element.dispatchEvent(new Event("change", { bubbles: true }));
const visible = (selector) => [...document.querySelectorAll(selector)].filter((item) => !item.hidden);

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  const backup = readFileSync(resolve(process.cwd(), "output/hotel-vvtestlab-backup.json"), "utf-8");
  localStorage.setItem(STORAGE_KEY, backup);
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("scrollTo", () => {});
  await import("../src/app.js");
});

test("abre na caracterização do projeto, com links e métricas, e segue para a visão geral", () => {
  const content = document.querySelector(".content");
  expect(content.querySelector(".home-hero h1").textContent).toBe("Hotel Management System");
  const links = [...content.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
  expect(links).toContain("https://github.com/CrystalWang1225/Hotel_Management_System");
  expect(links).toContain("https://github.com/gabrielfjm/Hotel_Management_System");
  expect([...content.querySelectorAll(".inst-band img")].map((img) => img.getAttribute("src"))).toEqual(["instituicoes/pucpr.svg", "instituicoes/capes.png"]);
  expect(content.querySelector(".inst-ack").textContent).toContain("Código de Financiamento 001");
  expect(document.querySelectorAll(".sidebar-inst img")).toHaveLength(2);
  const text = content.textContent;
  for (const metric of ["428", "354 de código", "Módulos", "12", "13 funções + 6 métodos"]) expect(text).toContain(metric);
  expect(content.querySelectorAll("table tbody tr")).toHaveLength(9);
  expect(content.querySelector(".bar-row.in-scope").textContent).toContain("reserve");
  click(content.querySelector(".shot-grid .shot"));
  expect(document.querySelector(".lightbox img").getAttribute("src")).toMatch(/^caracterizacao\//);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(document.querySelector(".lightbox")).toBeNull();
  click(content.querySelector('.presenter-btn.next[data-route="dashboard"]'));
  expect(document.querySelector('.nav-item.active').textContent).toContain("Visão geral dos testes");
});

test("a página final explica a ferramenta, a integração e cada item do menu", () => {
  click(document.querySelector('.nav-item[data-route="sobre"]'));
  const content = document.querySelector(".content");
  expect(content.querySelector(".about-hero h1").textContent).toBe("V&V TestLab");
  for (const endpoint of ["GET /health", "POST /run", "POST /mutation", "POST /graphs"]) expect(content.textContent).toContain(endpoint);
  // Todo item do menu (menos a própria página) tem um cartão no guia.
  const guided = [...content.querySelectorAll(".guide-card[data-route]")].map((card) => card.dataset.route);
  const menu = [...document.querySelectorAll(".nav-item")].map((item) => item.dataset.route).filter((key) => key !== "sobre");
  expect(guided.sort()).toEqual(menu.sort());
  expect(content.querySelectorAll(".faq details")).toHaveLength(6);
  click(content.querySelector('.presenter-btn.next[data-route="obrigado"]'));
  const thanks = document.querySelector(".content");
  expect(thanks.querySelector(".thanks-hero h1").textContent).toBe("Obrigado!");
  expect(thanks.querySelector(".thanks-numbers").textContent).toContain("95%");
  expect([...thanks.querySelectorAll(".person-avatar img")].map((img) => img.getAttribute("src"))).toEqual(["creditos/leo-natan-paschoal.jpg", "creditos/gabriel-felipe-jess-meira.jpg"]);
  const links = [...thanks.querySelectorAll(".person-links a")].map((link) => link.getAttribute("href"));
  expect(links).toEqual(["http://lattes.cnpq.br/0701955386251459", "https://www.linkedin.com/in/leo-natan-paschoal/", "https://gabrielfjm.com.br", "https://www.linkedin.com/in/gabrielfjm/"]);
  expect([...thanks.querySelectorAll(".thanks-logos img")].map((img) => img.getAttribute("alt"))).toEqual(["Pontifícia Universidade Católica do Paraná", "Coordenação de Aperfeiçoamento de Pessoal de Nível Superior"]);
  // Última página do roteiro: o botão final volta ao início.
  expect(thanks.querySelector(".presenter-btn.restart").dataset.route).toBe("home");
  click(document.querySelector('.nav-item[data-route="dashboard"]'));
});

test("a visão geral resume as três etapas", () => {
  const text = document.querySelector(".content").textContent;
  expect(text).toContain("os mesmos casos nas 3 etapas");
  expect(text).toContain("95%");
  expect(document.querySelectorAll(".stage-card")).toHaveLength(3);
});

test("teste funcional: filtro, código, assertivas e tabela de resultados", () => {
  click(document.querySelector('[data-route="funcional"]'));
  expect(document.querySelector(".how-panel summary").textContent).toContain("Como a etapa funcional foi feita");
  expect(visible("#funcional-list .filter-item")).toHaveLength(15);
  // Quadro das classes de equivalência: todas as 22 classes, cada uma com pelo menos um caso.
  const board = document.querySelector(".ce-board");
  expect(board.querySelectorAll(".ce-chip")).toHaveLength(22);
  expect([...board.querySelectorAll(".ce-chip")].every((item) => item.querySelector(".ce-case"))).toBe(true);
  expect([...board.querySelectorAll(".ce-point span")].map((item) => item.textContent)).toEqual(["CT-009", "CT-001", "CT-002", "CT-010", "CT-011"]);
  expect(document.querySelector('#funcional-list [data-id="CT-009"]').textContent).toContain("Reserva aceita com 0 hóspedes");
  const original = document.querySelector('[data-filter-controls="funcional-list"] [data-filter-key="original"]');
  original.value = "Falhou";
  change(original);
  expect(visible("#funcional-list .filter-item").length).toBeGreaterThan(0);
  expect(visible("#funcional-list .filter-item").every((row) => row.dataset.original === "Falhou")).toBe(true);

  click(document.querySelector('#funcional-list [data-id="CT-009"]'));
  const modal = document.querySelector(".modal-wide");
  expect(modal.textContent).toContain("Assertivas do pytest");
  expect(modal.textContent).toContain("Cenário, passo a passo");
  expect(modal.querySelector(".explain-item.bad").textContent).toContain("DEF-03");
  expect(modal.textContent).toContain("DEF-03");
  expect(modal.querySelector(".code-view").textContent).toContain("def test_CT_009");
  expect(modal.querySelectorAll(".io-table tbody tr")).toHaveLength(2);
  // O filtro continua aplicado depois de abrir o detalhe.
  expect(original.value).toBe("Falhou");
  click(modal.querySelector('[data-action="close-detail"]'));
  expect(document.querySelector(".modal-wide")).toBeNull();
});

test("defeitos: linha do tempo e detalhe com onde acontecia e quando foi corrigido", () => {
  click(document.querySelector('.nav-item[data-route="defects"]'));
  const timeline = document.querySelector(".defects-timeline");
  expect(timeline.textContent).toContain("Etapa 1 · Teste funcional");
  expect(timeline.textContent).toContain("Etapa 3 · Teste de mutação");
  expect(timeline.querySelectorAll(".dt-step.found .tag-link")).toHaveLength(10);
  click(document.querySelector('#defect-table tr[data-id="DEF-01"]'));
  const modal = document.querySelector(".modal-wide");
  expect(modal.querySelector("h2").textContent).toContain("DEF-01");
  expect(modal.querySelectorAll(".timeline li")).toHaveLength(4);
  expect(modal.querySelector('.commit-link[href$="2d1b2cd"], .commit-link').getAttribute("href")).toContain("/commit/");
  expect([...modal.querySelectorAll(".code-view .code-line.marked")].map((line) => line.textContent).join("\n")).toContain("c1 <= d1");
  expect(modal.textContent).toContain("_periodos_conflitam");
  // Do defeito para o caso que o revelou.
  click(modal.querySelector('.link-btn[data-action="open-test"]'));
  expect(document.querySelector(".modal-wide h2").textContent).toContain("CT-003");
  click(document.querySelector('.modal-wide .tag-link[data-action="open-defect-detail"]'));
  expect(document.querySelector(".modal-wide h2").textContent).toContain("DEF-01");
  click(document.querySelector('.modal-wide [data-action="close-detail"]'));
});

test("teste estrutural: detalhe mostra o grafo coberto pelo caso", () => {
  click(document.querySelector('[data-route="estrutural"]'));
  expect(visible("#estrutural-list .filter-item")).toHaveLength(5);
  click(document.querySelector('#estrutural-list [data-id="CT-012"]'));
  expect(document.querySelector(".modal-wide .amp-card").textContent).toContain("DEF-15");
  const modal = document.querySelector(".modal-wide");
  expect(modal.querySelector(".cfg-svg")).not.toBeNull();
  expect(modal.querySelectorAll(".cfg-node.covered").length).toBeGreaterThan(0);
  // Nós com texto simples; ao clicar, aparecem a explicação e o trecho do código.
  expect(modal.querySelector(".cfg-svg").textContent).toContain("O usuário está logado?");
  const decision = modal.querySelector('.cfg-node.type-decision[data-action="detail-node"]');
  click(decision);
  // O painel abre ao lado sem redesenhar o modal (o grafo não perde a posição).
  expect(document.querySelector(".node-drawer .code-view")).not.toBeNull();
  expect(document.querySelector(".modal-wide")).toBe(modal);
  expect(decision.classList.contains("selected")).toBe(true);
  click(document.querySelector('.node-drawer [data-action="close-node-drawer"]'));
  expect(document.querySelector(".node-drawer")).toBeNull();
  const tab = [...document.querySelectorAll('.modal-wide [data-action="detail-graph"]')].find((item) => !item.classList.contains("active"));
  click(tab);
  expect(document.querySelector(".graph-tab.active").dataset.id).toBe(tab.dataset.id);
});

test("teste de mutação: cálculo, mutantes e ligação com o teste que mata", () => {
  click(document.querySelector('[data-route="mutacao"]'));
  const text = document.querySelector(".content").textContent;
  expect(text).toContain("134 ÷ (141 − 7)");
  expect(document.querySelectorAll("#mutation-list .filter-item")).toHaveLength(141);
  const final = document.querySelector('[data-filter-controls="mutation-list"] [data-filter-key="final"]');
  final.value = "Sobrevivente";
  change(final);
  expect(visible("#mutation-list .filter-item")).toHaveLength(7);

  expect(document.querySelectorAll('[data-filter-group="mutation-list"] .filter-item')).toHaveLength(15);
  click(document.querySelector('[data-action="open-test"][data-id="CT-002"]'));
  const modal = document.querySelector(".modal-wide");
  expect(modal.textContent).toContain("Mutantes relacionados a este teste");
  expect(modal.querySelectorAll(".mutant-table tbody tr").length).toBeGreaterThan(0);
  click(modal.querySelector('[data-action="open-mutant"]'));
  expect(document.querySelector(".modal-wide").textContent).toContain("Sobrevivente");
  expect(document.querySelector(".modal-wide .diff-block")).not.toBeNull();
});
