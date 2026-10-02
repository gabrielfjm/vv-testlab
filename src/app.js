import "./styles.css";
import {
  STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  MAX_PRIMARY_FEATURES,
  applyGraphAnalysis,
  applyMutationSync,
  applyRepositorySync,
  buildBoundaryCases,
  cascadeDelete,
  casesToCsv,
  dashboardMetrics,
  defectCoversCase,
  deletionImpact,
  demoState,
  nextId,
  referenceErrors,
  reportToMarkdown,
  structuralCoverageForCase,
  structuralSummary,
  traceabilityRows,
  validateImportedState
} from "./core.js";

const app = document.querySelector("#app");
let state = loadState();
let route = "home";
let modal = null;
let bridgeStatus = { state: "unknown", message: "Conexão ainda não verificada." };
let selectedGraphId = "";
let selectedGraphCaseId = "";
let graphViewMode = "all";
let graphSelection = null;
let detail = null;
let detailGraphId = "";
let nodeDrawer = null; // { graphId, nodeId, context: "detail" | "page" }

const phaseOrder = ["Funcional", "Estrutural", "Baseado em defeitos"];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (saved && !localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, saved);
    const loaded = saved ? validateImportedState(JSON.parse(saved)) : demoState();
    return hydrateState(loaded);
  } catch {
    return demoState();
  }
}

function hydrateState(loaded) {
  return {
    ...loaded,
    project: { localRepository: "", bridgeUrl: "http://127.0.0.1:8765", autoCreateDefects: "Sim", mutationTool: "auto", cosmicRayConfig: "cosmic-ray.toml", cosmicRaySelector: "", mutationPython: "", coverageSource: ".", coverageFunctions: "", pytestArgs: "tests", ...loaded.project },
    requirements: loaded.requirements.map((item) => ({ method: "", ...item })),
    testCases: loaded.testCases.map((item) => ({
      graphId: "",
      relatedCaseIds: [],
      targetNodeIds: [],
      targetEdgeIds: [],
      targetPathIds: [],
      ...item
    })),
    syncHistory: loaded.syncHistory || [],
    mutationHistory: loaded.mutationHistory || [],
    controlFlowGraphs: loaded.controlFlowGraphs || [],
    structuralCoverage: loaded.structuralCoverage || [],
    graphAnalysis: loaded.graphAnalysis || null,
    testCatalog: loaded.testCatalog || null
  };
}

function saveState(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (message) toast(message);
}

function e(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  const paths = {
    mark: '<path d="M5 12.5 10 17l9-11"/><path d="M4 4h10"/><path d="M4 8h7"/>',
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    requirement: '<path d="M6 3h12l3 3v15H6z"/><path d="M18 3v4h3M9 11h9M9 15h9M9 7h4"/>',
    cases: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    trace: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 11 10-5M7 13l10 5"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    bug: '<path d="M8 2l1.5 2M16 2l-1.5 2M9 9h6M4 13h3M17 13h3M5 7l2 2M19 7l-2 2M5 19l2-2M19 19l-2-2"/><rect x="7" y="4" width="10" height="16" rx="5"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 3v13M7 11l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 16V3M7 8l5-5 5 5M5 21h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-5"/>',
    warning: '<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
    spark: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>'
    ,graph: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 5h10M6 7l5 10M18 7l-5 10"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 22v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C5.7 2 4.6 2.3 4.6 2.3a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 9.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V22"/>',
    fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v1a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 11v6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    lattes: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

const navGroups = [
  ["Projeto", [["home", "home", "O projeto"], ["dashboard", "dashboard", "Visão geral dos testes"]]],
  ["Etapas de teste", [
    ["funcional", "cases", "Teste funcional"],
    ["estrutural", "graph", "Teste estrutural"],
    ["mutacao", "bug", "Teste de mutação"]
  ]],
  ["Gestão", [
    ["requirements", "requirement", "Requisitos"],
    ["cases", "cases", "Cenários e casos"],
    ["structural", "graph", "Grafos estruturais"],
    ["traceability", "trace", "Rastreabilidade"],
    ["execution", "play", "Execução e métricas"],
    ["integration", "link", "Integração Python"],
    ["defects", "bug", "Defeitos"],
    ["data", "data", "Dados e exportação"]
  ]],
  ["Encerramento", [["sobre", "info", "Como a ferramenta funciona"], ["obrigado", "spark", "Agradecimentos"]]]
];

/** Vínculo do trabalho: o mestrado na PUCPR e a bolsa da CAPES (logos em public/instituicoes/). */
const INSTITUTIONS = [
  { key: "pucpr", short: "PUCPR", name: "Pontifícia Universidade Católica do Paraná", url: "https://www.pucpr.br", color: "instituicoes/pucpr.svg", white: "instituicoes/pucpr-branca.svg" },
  { key: "capes", short: "CAPES", name: "Coordenação de Aperfeiçoamento de Pessoal de Nível Superior", url: "https://www.gov.br/capes", color: "instituicoes/capes.png", white: "instituicoes/capes-branca.png" }
];

function navCount(key) {
  return ({ funcional: stageTests("funcional").length, estrutural: stageTests("estrutural").length, mutacao: stageTests("mutacao").length, requirements: state.requirements.length, cases: state.testCases.length, structural: state.controlFlowGraphs.length, integration: state.syncHistory.length + state.mutationHistory.length, defects: state.defects.filter((x) => x.status !== "Fechado").length })[key];
}

function shell(content) {
  const currentPhase = state.project.currentPhase || "Funcional";
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">${icon("mark")}</div><div><div class="brand-name">V&amp;V TestLab</div><span class="brand-sub">Verificação &amp; Validação</span></div></div>
      <nav class="nav-list" aria-label="Navegação principal">
        ${navGroups.map(([group, items]) => `<div class="nav-label">${group}</div>${items.map(([key, ico, label]) => `<button class="nav-item ${route === key ? "active" : ""}" data-route="${key}">${icon(ico)}<span>${label}</span>${navCount(key) !== undefined ? `<span class="nav-badge">${navCount(key)}</span>` : ""}</button>`).join("")}`).join("")}
      </nav>
      <div class="sidebar-footer"><div class="phase-label">Etapa atual</div><div class="phase-value"><span class="phase-dot"></span>${e(currentPhase)}</div>
        <div class="sidebar-inst"><div class="phase-label">Mestrado PUCPR · bolsa CAPES</div><div class="inst-logos">${INSTITUTIONS.map((inst) => `<a href="${inst.url}" target="_blank" rel="noopener noreferrer" title="${inst.name}"><img src="${inst.white}" alt="${inst.short}" class="inst-${inst.key}"></a>`).join('<span class="inst-sep"></span>')}</div></div>
      </div>
    </aside>
    <main class="workspace">
      <header class="topbar"><div><div class="project-kicker">Projeto ativo</div><div class="project-title">${e(state.project.name)}</div></div>
        <div class="top-actions"><button class="btn" data-action="open-project">${icon("settings")}<span>Configurar</span></button><button class="btn btn-primary" data-action="open-case">${icon("plus")}<span>Novo caso</span></button></div>
      </header>
      <div class="content">${content}</div>
    </main>
    <div id="modal-root">${renderModal()}</div><div class="toast-zone" id="toast-zone"></div>
  </div>`;
}

function pageHead(eyebrow, title, subtitle, actions = "") {
  return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${actions ? `<div>${actions}</div>` : ""}</div>`;
}

function badge(value) {
  const map = {
    Aprovado: "green", Válida: "green", Válido: "green", Fechado: "green", Pronto: "purple",
    Concluída: "green",
    Falhou: "red", Inválida: "red", Inválido: "red", Aberto: "red", Alta: "red",
    Bloqueado: "amber", "Em análise": "amber", Média: "amber", "Em correção": "amber",
    "Concluída com falhas": "amber",
    Baixa: "gray", Rascunho: "gray", "Não executado": "gray"
  };
  return `<span class="badge badge-${map[value] || "gray"}">${e(value)}</span>`;
}

function filterToolbar(scope, placeholder, filters = [], extra = "") {
  return `<div class="toolbar filter-toolbar" data-filter-controls="${scope}">
    <div class="search">${icon("search")}<input data-filter-key="query" placeholder="${e(placeholder)}" aria-label="${e(placeholder)}"></div>
    <div class="filter-group">${filters.map(({ key, label, options }) => `<select data-filter-key="${key}" aria-label="${e(label)}"><option value="">${e(label)}</option>${options.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const text = typeof option === "string" ? option : option.label;
      return `<option value="${e(value)}">${e(text)}</option>`;
    }).join("")}</select>`).join("")}<button class="btn btn-small btn-ghost" type="button" data-action="clear-filters" data-scope="${scope}">Limpar filtros</button>${extra}</div>
  </div>`;
}

const STAGES = {
  funcional: { label: "Teste funcional", eyebrow: "Etapa 1 · caixa-preta", techniques: ["CE", "AVL"], phase: "Funcional", ico: "cases" },
  estrutural: { label: "Teste estrutural", eyebrow: "Etapa 2 · caixa-branca", techniques: ["Estrutural"], phase: "Estrutural", ico: "graph" },
  mutacao: { label: "Teste de mutação", eyebrow: "Etapa 3 · baseado em defeitos", techniques: ["Mutação"], phase: "Baseado em defeitos", ico: "bug" }
};

const pct = (value) => `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function stageTests(stage) {
  // Os mesmos casos aparecem em várias etapas (stages); sem essa lista, vale a etapa única (stage).
  const fromCatalog = (state.testCatalog?.tests || []).filter((item) => (item.stages || [item.stage]).includes(stage));
  if (fromCatalog.length) return fromCatalog;
  return state.testCases.filter((item) => STAGES[stage].techniques.includes(item.technique)).map((testCase) => fallbackTest(testCase, stage));
}

/** Sem catálogo importado, monta a ficha a partir dos casos e execuções cadastrados. */
function fallbackTest(testCase, stage) {
  const runs = state.executions.filter((item) => item.testCaseId === testCase.id);
  const toRun = (execution) => execution
    ? { result: execution.result === "Aprovado" ? "Passou" : execution.result === "Falhou" ? "Falhou" : "Não executado", obtained: execution.actual, note: execution.result === "Aprovado" ? "" : execution.actual, runId: execution.sourceRunId || execution.id }
    : { result: "Não executado", obtained: "—", note: "", runId: "" };
  const defect = state.defects.find((item) => defectCoversCase(item, testCase.id));
  return {
    id: testCase.id, stage, requirementId: testCase.requirementId, technique: testCase.technique, validity: testCase.validity,
    title: testCase.title, input: testCase.input, expected: testCase.expected,
    description: [testCase.precondition, ...(testCase.steps || [])].filter(Boolean).join(" "),
    classes: [testCase.classId], defect: defect?.id || "", defectTitle: defect?.title || "",
    code: "", assertions: [], comments: [], helpers: [], mutantsKilled: [], survivorsKilled: [],
    original: toRun(runs[0]), corrected: toRun(runs.length > 1 ? runs.at(-1) : null)
  };
}

/** Resultado no código original visto em cada etapa: na funcional, sem as ampliações. */
function originalFor(test, stage) {
  return stage === "funcional" && test.originalStage1 ? test.originalStage1 : test.original;
}

function amplifications(test, stage) {
  return (test.parts || []).filter((part) => part.stage !== "funcional" && (!stage || part.stage === stage));
}

function stageStats(stage) {
  const tests = stageTests(stage);
  const count = (key, result) => tests.filter((item) => (key === "original" ? originalFor(item, stage) : item[key])?.result === result).length;
  const fromParts = tests.some((item) => item.parts);
  const revealed = fromParts
    ? [...new Set(tests.flatMap((item) => (item.parts || []).filter((part) => part.stage === stage && part.defect).map((part) => part.defect)))]
    : [...new Set(tests.filter((item) => item.original?.result === "Falhou" && item.defect).map((item) => item.defect))];
  const amplified = tests.filter((item) => amplifications(item, stage).length);
  return { tests, total: tests.length, originalPassed: count("original", "Passou"), originalFailed: count("original", "Falhou"), correctedPassed: count("corrected", "Passou"), revealed, amplified };
}

/** Linhas da evolução por etapa: do catálogo (evidências) ou, sem ele, das métricas cadastradas. */
function evolutionRows() {
  const evolution = state.testCatalog?.evolution;
  if (evolution?.length) {
    return evolution.map((item) => ({ stage: item.etapa, code: item.sut === "original" ? "Original" : "Corrigido", cases: item.casos, tests: item.testes, passed: item.passaram, failed: item.xfail + item.falharam, statements: item.pct_comandos, statementsText: item.comandos, branches: item.pct_desvios, branchesText: item.desvios, mutation: item.mutacao, score: item.escore_pct }));
  }
  return state.metrics.map((item) => ({ stage: item.phase, code: "—", cases: item.suiteSize, passed: "—", failed: "—", statements: item.statementCoverage, statementsText: "", branches: item.branchCoverage, branchesText: "", mutation: item.mutantsTotal ? `${item.mutantsKilled}/${item.mutantsTotal}` : "—", score: item.mutantsTotal ? Math.round((item.mutantsKilled / item.mutantsTotal) * 1000) / 10 : null }));
}

function mutationData() {
  const catalog = state.testCatalog?.mutation;
  if (catalog) return catalog;
  const runs = state.mutationHistory.map((item, index) => ({ id: index ? "final" : "inicial", suite: item.runId, total: item.total, killed: item.killed, survived: item.survived, score: item.score, duration: item.duration }));
  return { tool: runs.length ? state.mutationHistory.at(-1).tool : "—", functions: [], runs, mutants: [], equivalent: 0, adjustedScore: runs.at(-1)?.score || 0 };
}

// ------------------------------------------------------------ página inicial: caracterização do sistema

/** Ordem da apresentação: o projeto → visão geral dos testes → as três etapas. */
const PRESENTATION = [["home", "O projeto"], ["dashboard", "Visão geral dos testes"], ["funcional", "Teste funcional"], ["estrutural", "Teste estrutural"], ["mutacao", "Teste de mutação"], ["sobre", "Como a ferramenta funciona"], ["obrigado", "Agradecimentos"]];

function presenterNav() {
  const index = PRESENTATION.findIndex(([key]) => key === route);
  if (index < 0) return "";
  const prev = PRESENTATION[index - 1];
  const next = PRESENTATION[index + 1];
  return `<nav class="presenter-nav" aria-label="Ordem da apresentação">
    ${prev ? `<button class="presenter-btn" data-route="${prev[0]}"><small>← Anterior</small><strong>${prev[1]}</strong></button>` : "<span></span>"}
    <div class="presenter-dots">${PRESENTATION.map(([key, label]) => `<button class="presenter-dot ${key === route ? "active" : ""}" data-route="${key}" title="${label}" aria-label="${label}"></button>`).join("")}</div>
    ${next ? `<button class="presenter-btn next" data-route="${next[0]}"><small>Próximo →</small><strong>${next[1]}</strong></button>` : `<button class="presenter-btn next restart" data-route="${PRESENTATION[0][0]}"><small>Fim · voltar ao início ↺</small><strong>${PRESENTATION[0][1]}</strong></button>`}
  </nav>`;
}

const extLink = (href, label, cls = "btn") => `<a class="${cls}" href="${e(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;

function browserShot(file, caption) {
  return `<figure class="shot" data-action="zoom-image" data-src="caracterizacao/${e(file)}" data-caption="${e(caption)}" title="Clique para ampliar"><div class="shot-bar"><i></i><i></i><i></i><span>127.0.0.1:5000</span></div><img src="caracterizacao/${e(file)}" alt="${e(caption)}" loading="lazy"><figcaption>${e(caption)}</figcaption></figure>`;
}

function homeSection(number, title, text) {
  return `<div class="home-section-title"><span>${number}</span><div><h2>${title}</h2><p>${text}</p></div></div>`;
}

/** Caracterização do sistema testado (Fase 1): contexto, funcionalidades, métricas, arquitetura e repositórios. */
function homePage() {
  const c = state.testCatalog?.characterization;
  if (!c) {
    const p = state.project;
    return `${pageHead("O projeto", e(p.name), e(p.purpose || ""), p.repository ? extLink(p.repository, `${icon("github")}<span>Repositório</span>`) : "")}
      <div class="metric-grid">${metricCard("LOC", e(p.loc || "—"), "linhas de código", "chart", "#6756e8", "#efedff")}${metricCard("Funções e métodos", e(p.functions || "—"), "no código", "cases", "#1f9d8a", "#e6f7f3")}${metricCard("Classes", e(p.codeClasses || "—"), "no código", "layers", "#df8b2d", "#fff3df")}${metricCard("Módulos", e(p.modules || "—"), "arquivos Python", "data", "#d95555", "#fdecec")}</div>`;
  }
  const m = c.metricas;
  const g = c.git;
  const fork = c.links.fork;
  const shortDate = (iso) => iso.split("-").reverse().join("/");
  const modules = Object.entries(m.por_modulo).sort((a, b) => b[1].sloc - a[1].sloc);
  const maxSloc = Math.max(...modules.map(([, item]) => item.sloc));
  const topFunctions = m.funcoesComplexidade.slice(0, 6);
  const maxCc = topFunctions[0]?.cc || 1;
  const statusClass = { recorte: "purple", complementar: "amber", "pré-condição": "green", documentado: "gray" };
  const stageKeys = ["funcional", "estrutural", "mutacao"];
  const bar = (label, value, max, extra = "") => `<div class="bar-row ${extra}"><span class="mono">${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%"></div></div><strong>${value}</strong></div>`;
  return `<section class="home-hero">
      <div class="hero-text">
        <div class="hero-eyebrow">Projeto técnico · Teste de software de terceiros</div>
        <h1>${e(c.nome)}</h1>
        <p class="hero-lead">${e(c.resumo)}</p>
        <div class="hero-chips">${c.tecnologias.map(([name]) => `<span>${e(name)}</span>`).join("")}</div>
        <div class="hero-actions">
          ${extLink(c.links.original, `${icon("github")}<span>Repositório original</span>`, "btn hero-btn")}
          ${extLink(fork, `${icon("fork")}<span>Meu fork com os testes</span>`, "btn hero-btn hero-btn-primary")}
        </div>
        <div class="hero-meta">
          <span>${icon("github")}<a href="${e(c.links.original)}" target="_blank" rel="noopener noreferrer">${e(c.links.original.replace("https://", ""))}</a></span>
          <span>${icon("fork")}<a href="${e(fork)}" target="_blank" rel="noopener noreferrer">${e(fork.replace("https://", ""))}</a></span>
        </div>
      </div>
      <div class="hero-visual">${browserShot(c.telas[0][0], c.telas[0][1])}</div>
    </section>
    ${c.instituicional ? `<section class="inst-band" aria-label="Vínculo institucional">
      <div class="inst-text"><span class="inst-kicker">Vínculo institucional</span><strong>${e(c.instituicional.curso)}</strong><p>${e(c.instituicional.texto)}</p></div>
      <div class="inst-band-logos">${INSTITUTIONS.map((inst) => `<a href="${inst.url}" target="_blank" rel="noopener noreferrer" title="${inst.name}"><img src="${inst.color}" alt="${inst.name}" class="inst-${inst.key}"></a>`).join('<span class="inst-sep"></span>')}</div>
      <p class="inst-ack">${e(c.instituicional.agradecimento)}</p>
    </section>` : ""}

    ${homeSection(1, "Contexto de desenvolvimento", "De onde vem o sistema e por que ele serve para o trabalho.")}
    <div class="grid-equal home-grid">
      <section class="panel"><div class="panel-body context-list"><dl>
        <dt>Autoria</dt><dd>${e(c.contexto.autoria)}</dd>
        <dt>Origem</dt><dd>${e(c.contexto.origem)} · ${e(c.contexto.orientacao)}</dd>
        <dt>Histórico</dt><dd>${g.upstreamCommits} commits, de ${shortDate(g.upstreamPeriodo[0])} a ${shortDate(g.upstreamPeriodo[1])}</dd>
        <dt>Propósito</dt><dd><q>${e(c.contexto.proposito)}</q><div class="sub-cell">README do projeto (tradução)</div></dd>
        <dt>Público</dt><dd>${e(c.contexto.publico)}</dd>
        <dt>Testes</dt><dd>${e(c.contexto.licao)}</dd>
      </dl></div></section>
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Atende aos critérios da Fase 1</h2><div class="panel-subtitle">Escolha e caracterização do software</div></div></div>
        <div class="panel-body check-list">${c.adequacao.map(([title, text]) => `<div class="check-item">${icon("shield")}<div><strong>${e(title)}</strong><p>${e(text)}</p></div></div>`).join("")}</div></section>
    </div>

    ${homeSection(2, "Funcionalidades", "Os nove requisitos funcionais do sistema e o papel de cada um no estudo. A coluna \"No estudo\" responde: o que o trabalho fez com esta funcionalidade?")}
    <div class="status-legend">
      <div><span class="badge badge-purple">recorte</span><p><b>Testada a fundo</b> nas 3 etapas (funcional, estrutural e mutação). É a reserva, de onde saíram REQ-01, REQ-02 e REQ-03.</p></div>
      <div><span class="badge badge-green">pré-condição</span><p><b>Não testada sozinha</b>, mas faz parte da reserva: estar logado ou não é uma das entradas testadas.</p></div>
      <div><span class="badge badge-amber">complementar</span><p><b>Testes extras</b> fora das métricas de cobertura e mutação. Também acharam defeitos, documentados no relatório.</p></div>
      <div><span class="badge badge-gray">documentado</span><p><b>Só descrita</b> no relatório, sem testes: não tem regra a verificar além de gravar dados, ou repete regras da reserva.</p></div>
    </div>
    <section class="panel panel-flush"><div class="table-wrap"><table><thead><tr><th>RF</th><th>Funcionalidade</th><th>Rota</th><th>No estudo</th></tr></thead><tbody>
      ${c.funcionalidades.map(([id, name, path, status, note]) => `<tr class="${status === "recorte" ? "rf-scope" : ""}"><td class="id-cell">${e(id)}</td><td class="main-cell">${e(name)}</td><td class="mono">${e(path)}</td><td><span class="badge badge-${statusClass[status] || "gray"}">${e(status)}</span>${note ? `<div class="sub-cell">${e(note)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div></section>

    ${homeSection(3, "Métricas de código", `Medidas no código original (tag <code>upstream-71b396b</code>) com radon ${e(m.ferramentas.radon.split("==")[1])} e pygount ${e(m.ferramentas.pygount.split("==")[1])}, só sobre <code>app.py</code> e o pacote <code>hotel/</code>.`)}
    <div class="metric-grid metric-grid-5">
      ${metricCard("LOC", m.loc_fisico, `linhas físicas · ${m.sloc} de código (SLOC)`, "chart", "#6756e8", "#efedff")}
      ${metricCard("Módulos", m.num_modulos, "arquivos Python", "data", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Classes", m.classes, "6 formulários + 6 modelos", "layers", "#df8b2d", "#fff3df")}
      ${metricCard("Funções e métodos", m.funcoes_mais_metodos, `${m.funcoes} funções + ${m.metodos} métodos`, "cases", "#d95555", "#fdecec")}
      ${metricCard("Complexidade", `${String(m.complexidade_ciclomatica_media).replace(".", ",")} <small>média</small>`, `máxima ${m.complexidade_ciclomatica_max} (função reserve)`, "graph", "#3a7bd5", "#e8f0fc")}
    </div>
    <div class="grid-equal home-grid">
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Linhas de código por módulo</h2><div class="panel-subtitle">SLOC (radon raw) · views.py concentra as rotas e as regras de negócio</div></div></div>
        <div class="panel-body bars">${modules.map(([name, item]) => bar(e(name), item.sloc, maxSloc)).join("")}</div></section>
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Funções mais complexas</h2><div class="panel-subtitle">Complexidade ciclomática (radon cc) · em destaque, as do recorte testado</div></div></div>
        <div class="panel-body bars">${topFunctions.map((f) => bar(`${e(f.name)}${f.inScope ? " <em>recorte</em>" : ""}`, f.cc, maxCc, f.inScope ? "in-scope" : "")).join("")}</div></section>
    </div>

    ${homeSection(4, "Arquitetura e dados", "Aplicação Flask monolítica: rotas em views.py, modelos em models.py e formulários em forms.py, sobre um banco SQLite.")}
    <div class="grid-2 home-grid">
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Diagrama entidade-relacionamento</h2><div class="panel-subtitle">Do repositório original (Image/ER.png) · clique para ampliar</div></div></div>
        <div class="panel-body"><div class="er-link" data-action="zoom-image" data-src="caracterizacao/${e(c.diagramaER)}" data-caption="Diagrama entidade-relacionamento (repositório original)"><img src="caracterizacao/${e(c.diagramaER)}" alt="Diagrama entidade-relacionamento do Hotel Management System" loading="lazy"></div></div></section>
      <div class="home-stack">
        <section class="panel"><div class="panel-head"><h2 class="panel-title">Tecnologias</h2></div>
          <div class="panel-body tech-list">${c.tecnologias.map(([name, role]) => `<div><strong>${e(name)}</strong><span>${e(role)}</span></div>`).join("")}</div></section>
        <section class="panel"><div class="panel-head"><h2 class="panel-title">${c.tabelas.length} tabelas no banco</h2></div>
          <div class="panel-body tech-list">${c.tabelas.map(([name, role]) => `<div><strong class="mono">${e(name)}</strong><span>${e(role)}</span></div>`).join("")}</div></section>
      </div>
    </div>

    ${homeSection(5, "O sistema em execução", "Instalado e executado localmente antes de qualquer teste, como pede a etapa funcional. Clique em uma tela para ampliar.")}
    <div class="shot-grid"><div class="shot-col">${c.telas.slice(0, -1).map(([file, caption]) => browserShot(file, caption)).join("")}</div>${browserShot(...c.telas.at(-1))}</div>

    ${homeSection(6, "Repositórios", "O código original de terceiros e o fork onde ficam os testes, as correções e as evidências.")}
    <div class="grid-equal home-grid">
      <section class="panel repo-card"><div class="repo-head">${icon("github")}<div><span>Repositório original</span><strong>CrystalWang1225/Hotel_Management_System</strong></div></div>
        <dl><dt>Versão testada</dt><dd>commit <code>${e(g.upstreamCommit.slice(0, 7))}</code></dd><dt>Commits</dt><dd>${g.upstreamCommits} (${shortDate(g.upstreamPeriodo[0])} a ${shortDate(g.upstreamPeriodo[1])})</dd><dt>Testes automatizados</dt><dd>nenhum</dd></dl>
        <ul class="repo-tree">${c.original.map(([path, text]) => `<li><code>${e(path)}</code><span>${e(text)}</span></li>`).join("")}</ul>
        <div class="repo-actions">${extLink(c.links.original, `${icon("external")}<span>Abrir no GitHub</span>`)}${extLink(`${c.links.original}/commit/${g.upstreamCommit}`, "<span>Commit testado</span>", "btn btn-ghost")}</div>
      </section>
      <section class="panel repo-card repo-fork"><div class="repo-head">${icon("fork")}<div><span>Meu fork</span><strong>gabrielfjm/Hotel_Management_System</strong></div></div>
        <dl><dt>Commits</dt><dd>${g.forkCommits} no total · <b>${g.forkNovosCommits} nossos</b></dd><dt>Último commit</dt><dd><code>${e(g.forkUltimo.hash)}</code> ${e(g.forkUltimo.mensagem)} <span class="sub-cell">(${shortDate(g.forkUltimo.data)})</span></dd><dt>Tags</dt><dd>${g.tags.map((tag) => `<span class="tag">${e(tag)}</span>`).join(" ")}</dd></dl>
        <ul class="repo-tree">${c.fork.map(([path, text]) => `<li><code>${e(path)}</code><span>${e(text)}</span></li>`).join("")}</ul>
        <div class="repo-actions">${extLink(fork, `${icon("external")}<span>Abrir o fork</span>`, "btn btn-primary")}${extLink(`${fork}/blob/main/README_TESTES.md`, "<span>Guia dos testes</span>")}${extLink(`${fork}/blob/main/docs/relatorio-tecnico.pdf`, "<span>Relatório (PDF)</span>")}${extLink(`${fork}/compare/sut-original...sut-corrigido`, "<span>Correções</span>")}</div>
      </section>
    </div>

    ${homeSection(7, "O que foi testado", "Três requisitos da reserva de quartos, com as três técnicas na ordem exigida.")}
    <div class="scope-grid home-scope">${state.requirements.map((req) => `<div class="scope-item"><span class="req-index">${e(req.id)}</span><strong>${e(req.title)}</strong><span class="sub-cell">${e(req.description)}</span></div>`).join("")}</div>
    <div class="flow">${c.etapas.map(([name, text, tool], index) => `<button class="flow-step" data-route="${stageKeys[index]}"><span class="flow-num">${index + 1}</span><strong>${e(name)}</strong><p>${e(text)}</p><span class="flow-foot"><span class="tag">${e(tool)}</span><span class="sub-cell">${stageTests(stageKeys[index]).length} casos</span></span></button>${index < c.etapas.length - 1 ? `<span class="flow-arrow">${icon("arrow")}</span>` : ""}`).join("")}</div>`;
}

// ------------------------------------------------------------ página "Como a ferramenta funciona"

/** Guia do menu: [rota, ícone, nome, o que mostra, o que dá para fazer]. */
const MENU_GUIDE = [
  ["Projeto", "a história do trabalho", [
    ["home", "home", "O projeto", "O sistema que foi testado: o que ele faz, de onde vem, funcionalidades, métricas de código, arquitetura, telas e os links do GitHub.", "ampliar as telas do sistema e abrir o repositório original e o fork no GitHub. É a abertura da apresentação."],
    ["dashboard", "dashboard", "Visão geral dos testes", "As três etapas em números: casos, defeitos, cobertura e escore de mutação, com a tabela de evolução da suíte.", "Clique no cartão de uma etapa para abrir a página dela."]
  ]],
  ["Etapas de teste", "o resultado de cada técnica", [
    ["funcional", "cases", "Teste funcional", "Os 15 casos derivados da especificação, sem olhar o código (classes de equivalência e valor limite), com o resultado no código original e no corrigido.", "Filtre por requisito, técnica ou resultado. Clique num caso para ver o cenário passo a passo, as assertivas e o código pytest."],
    ["estrutural", "graph", "Teste estrutural", "Os casos reaproveitados para percorrer o código, a cobertura de comandos e desvios antes e depois da etapa e as ampliações feitas.", "Clique num caso para ver o grafo de fluxo com o caminho que ele percorreu; clique num nó para ler o trecho do código."],
    ["mutacao", "bug", "Teste de mutação", "O cálculo do escore (mutantes mortos ÷ gerados), as duas rodadas do Cosmic Ray e a lista dos mutantes.", "Filtre os sobreviventes. Clique num mutante para ver a mudança no código e qual teste o matou."]
  ]],
  ["Gestão", "o cadastro por trás das páginas", [
    ["requirements", "requirement", "Requisitos", "As três funcionalidades testadas, cada uma com o nome da função correspondente no código.", "Editar um requisito. A ferramenta não deixa criar um quarto: o recorte do trabalho é de três."],
    ["cases", "cases", "Cenários e casos", "As classes de equivalência (válidas e inválidas) e a tabela de casos com entrada, classe e resultado esperado.", "Criar classe ou caso e usar o gerador de valor limite, que monta os pontos mín−1, mín, mín+1, máx−1, máx e máx+1."],
    ["structural", "graph", "Grafos estruturais", "Os grafos de fluxo das funções do recorte (nós, arestas e caminhos simples) e o quanto cada caso percorreu.", "Escolher a função e o caso. Com a ponte ligada, \"Analisar código\" redesenha os grafos a partir do código-fonte."],
    ["traceability", "trace", "Rastreabilidade", "A matriz que liga requisito → classe → caso → execução → defeito, nos dois sentidos.", "Filtrar lacunas (requisito sem caso, caso sem execução) e clicar em qualquer item para abri-lo."],
    ["execution", "play", "Execução e métricas", "Cada execução dos testes (manual ou vinda do pytest) e as métricas de cada etapa: tamanho da suíte, cobertura e mutação.", "Registrar uma execução ou uma métrica à mão."],
    ["integration", "link", "Integração Python", "A conexão com o repositório do hotel: estado da ponte, comando para ligá-la e o histórico de sincronizações e de mutação.", "Verificar ponte, Executar e sincronizar (pytest + cobertura) e Executar mutação. Só funciona com a ferramenta rodando no computador."],
    ["defects", "bug", "Defeitos", "Os defeitos encontrados, com severidade, status, o caso que revelou cada um e a proposta de correção.", "Registrar ou editar defeito. O número ao lado do menu conta só os abertos: está em 0 porque todos foram corrigidos."],
    ["data", "data", "Dados e exportação", "As saídas e cópias do projeto.", "Gerar o relatório em PDF ou Markdown, exportar backup JSON e casos em CSV, importar backup e recarregar o estudo oficial."]
  ]],
  ["Encerramento", "o fim da apresentação", [
    ["obrigado", "spark", "Agradecimentos", "O encerramento: os números do trabalho, o professor da disciplina, o autor e o apoio da PUCPR e da CAPES.", "abrir o Lattes e o LinkedIn do professor e do autor, e os links da ferramenta, do fork e do relatório."]
  ]]
];

/** Pessoas do encerramento. O Lattes do professor é o link permanente da lista de docentes do PPGIa. */
const CREDITS = [
  { role: "Professor da disciplina", initials: "LP", photo: "creditos/leo-natan-paschoal.jpg", name: "Prof. Dr. Leo Natan Paschoal", detail: "Verificação e Validação de Software · PPGIa · PUCPR", links: [["lattes", "Currículo Lattes", "http://lattes.cnpq.br/0701955386251459"], ["linkedin", "LinkedIn", "https://www.linkedin.com/in/leo-natan-paschoal/"]] },
  { role: "Desenvolvido por", initials: "GM", photo: "creditos/gabriel-felipe-jess-meira.jpg", name: "Gabriel Felipe Jess Meira", detail: "Mestrando · PUCPR · Bolsista CAPES", links: [["globe", "Currículo", "https://gabrielfjm.com.br"], ["linkedin", "LinkedIn", "https://www.linkedin.com/in/gabrielfjm/"]], author: true }
];

function thanksPage() {
  const evolution = evolutionRows();
  const last = evolution.at(-1) || {};
  const finalRun = mutationData().runs.at(-1);
  const cases = new Set(Object.keys(STAGES).flatMap((stage) => stageTests(stage).map((test) => test.id))).size;
  const c = state.testCatalog?.characterization;
  const numbers = [[cases, "casos de teste", "os mesmos nas 3 etapas"], [state.defects.length, "defeitos corrigidos", "encontrados pelos testes"], [pct(last.branches), "dos desvios", "cobertura estrutural"], [pct1(mutationScores().final?.adjusted), "escore de mutação", `${finalRun?.killed || 0} ÷ (${finalRun?.total || 0} − ${mutationScores().equivalent} equivalentes)`]];
  return `<section class="thanks-hero">
      <div class="thanks-glow" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="hero-eyebrow">Encerramento · Verificação e Validação de Software</div>
      <h1>Obrigado!</h1>
      <p class="thanks-lead">Teste de software de terceiros: <strong>Hotel Management System</strong>, do funcional ao teste de mutação.</p>
      <div class="thanks-numbers">${numbers.map(([value, label, sub]) => `<div><strong>${value}</strong><span>${label}</span><small>${sub}</small></div>`).join("")}</div>
    </section>

    <div class="thanks-people">${CREDITS.map((person) => `<section class="person-card ${person.author ? "author" : ""}">
      <span class="person-role">${person.role}</span>
      <div class="person-main"><span class="person-avatar">${person.initials}${person.photo ? `<img src="${person.photo}" alt="Foto de ${person.name}" onerror="this.remove()">` : ""}</span><div><h2>${person.name}</h2><p>${person.detail}</p></div></div>
      <div class="person-links">${person.links.map(([ico, label, url]) => extLink(url, `${icon(ico)}<span>${label}</span>`, "btn")).join("")}</div>
    </section>`).join("")}</div>

    <section class="thanks-inst">
      <span class="inst-kicker">Com o apoio de</span>
      <div class="inst-band-logos thanks-logos">${INSTITUTIONS.map((inst) => `<a href="${inst.url}" target="_blank" rel="noopener noreferrer" title="${inst.name}"><img src="${inst.color}" alt="${inst.name}" class="inst-${inst.key}"></a>`).join('<span class="inst-sep"></span>')}</div>
      <p class="thanks-message">Agradeço ao Prof. Leo Natan Paschoal pela disciplina e pelas orientações, à Pontifícia Universidade Católica do Paraná pela formação e à CAPES pela bolsa que torna este mestrado possível.</p>
      ${c?.instituicional ? `<p class="inst-ack">${e(c.instituicional.agradecimento)}</p>` : ""}
    </section>

    <section class="thanks-end">
      <h2>Perguntas?</h2>
      <p>Tudo o que foi apresentado está publicado e pode ser conferido:</p>
      <div class="about-links">${extLink("https://gabrielfjm.github.io/vv-testlab/", `${icon("dashboard")}<span>Ferramenta online</span>`, "btn btn-primary")}${extLink("https://github.com/gabrielfjm/Hotel_Management_System", `${icon("fork")}<span>Fork com os testes</span>`)}${extLink("https://github.com/gabrielfjm/Hotel_Management_System/blob/main/docs/relatorio-tecnico.pdf", `${icon("requirement")}<span>Relatório técnico</span>`)}${extLink("https://github.com/gabrielfjm/vv-testlab", `${icon("github")}<span>Código da ferramenta</span>`)}</div>
    </section>`;
}

function aboutPage() {
  const node = (ico, title, text, extra = "") => `<div class="lane-node ${extra}"><span class="metric-icon">${icon(ico)}</span><strong>${title}</strong><small>${text}</small></div>`;
  const arrow = (both = false) => `<span class="lane-arrow ${both ? "both" : ""}">${icon("arrow")}</span>`;
  const step = (n, button, endpoint, text) => `<li><span class="flow-num">${n}</span><div><strong>${button}</strong>${endpoint ? `<code>${endpoint}</code>` : ""}<p>${text}</p></div></li>`;
  const chain = [["REQ-01", "Requisito", "Reservar quartos"], ["CE-12", "Classe inválida", "menos de 1 hóspede"], ["CT-009", "Caso de teste", "reserva com 0 hóspedes"], ["Execução", "pytest", "falhou no código original"], ["DEF-03", "Defeito", "corrigido no fork"]];
  const faq = [
    ["A ferramenta testa o sistema sozinha?", "Não. Quem testa é o pytest, no repositório do hotel. A ferramenta organiza o trabalho, manda o pytest rodar pela ponte e mostra os resultados ligados aos casos."],
    ["Por que existe a tal \"ponte\"?", "Por segurança, um site não consegue abrir pastas nem executar programas no computador. A ponte é um programa Python pequeno que roda na sua máquina e faz isso no lugar do navegador, aceitando conexões só do próprio computador."],
    ["Os números foram digitados à mão?", "Não. Eles vêm das evidências geradas pelo pytest, coverage.py e Cosmic Ray (pasta evidencias/ do fork), que um script transforma no estudo publicado."],
    ["Por que a Integração Python não funciona no site online?", "O site está no GitHub Pages, e a ponte só existe no computador que tem o repositório do hotel. Online você vê os resultados; com a ferramenta rodando no computador, dá para executar tudo de novo."],
    ["Se eu mudar algo no site, todo mundo vê?", "Não. As mudanças ficam só no seu navegador. Para voltar ao estudo oficial, use Dados e exportação → Carregar estudo oficial."],
    ["Como o pytest sabe a qual caso um teste pertence?", "Pelo identificador CT-xxx no nome da função (por exemplo, test_CT_009_...) ou pelo marcador @pytest.mark.vv_case(\"CT-009\"). O plugin da ferramenta escreve esse número no relatório JUnit, e a ferramenta liga o resultado ao caso."]
  ];
  return `<section class="about-hero">
      <div>
        <div class="eyebrow">Como a ferramenta funciona</div>
        <h1>V&amp;V TestLab</h1>
        <p class="subtitle">Uma ferramenta web, feita para este trabalho, que organiza o projeto de testes em um só lugar: os requisitos, os casos, as execuções do pytest, a cobertura, os mutantes e os defeitos, todos ligados entre si.</p>
      </div>
      <div class="about-cards">
        <div><span>O que é</span><strong>Um painel de gestão dos testes</strong><p>Mostra o que foi testado, como e com qual resultado, do requisito até o defeito.</p></div>
        <div><span>Para que serve</span><strong>Rastrear e explicar</strong><p>Cada resultado aponta para o caso, a classe e o requisito que o originaram.</p></div>
        <div><span>O que ela não é</span><strong>Não substitui o pytest</strong><p>Os testes vivem no repositório do hotel; a ferramenta executa e lê os resultados deles.</p></div>
      </div>
    </section>

    ${homeSection(1, "Como as peças se conectam", "A ferramenta tem dois modos: ao vivo, ligada ao repositório pelo seu computador, e publicada, lendo o estudo pronto.")}
    <section class="panel lanes">
      <div class="lane"><div class="lane-title"><span class="badge badge-green">Ao vivo</span><small>no computador que tem o repositório</small></div>
        <div class="lane-row">${node("cases", "Repositório do hotel", "tests/ com os casos em pytest")}${arrow(true)}${node("link", "Ponte local", "vv_bridge.py · 127.0.0.1:8765", "accent")}${arrow(true)}${node("dashboard", "V&amp;V TestLab", "no navegador (npm run dev)")}</div></div>
      <div class="lane"><div class="lane-title"><span class="badge badge-purple">Publicado</span><small>este site, no GitHub Pages</small></div>
        <div class="lane-row">${node("data", "Evidências", "evidencias/ do fork (pytest, cobertura, mutação)")}${arrow()}${node("settings", "Script", "gerar_catalogo_testes.py junta tudo")}${arrow()}${node("requirement", "estudo-hotel.json", "o estudo completo, num arquivo", "accent")}${arrow()}${node("github", "GitHub Pages", "carrega o estudo ao abrir")}</div></div>
    </section>

    ${homeSection(2, "A integração, passo a passo", "O que acontece quando cada botão da página Integração Python é usado. Entre parênteses, o pedido que a ferramenta faz à ponte.")}
    <div class="grid-2 home-grid">
      <section class="panel"><div class="panel-body"><ol class="steps">
        ${step(0, "Ligar a ponte", "", "Na pasta do fork, <code>.\\iniciar-integracao.ps1</code> liga a ponte no código corrigido; com <code>-Versao original</code>, no código original, para os defeitos aparecerem como falhas.")}
        ${step(1, "Verificar ponte", "GET /health", "Confirma que a ponte está ligada e informa o Python usado e se pytest, cobertura e Cosmic Ray estão instalados.")}
        ${step(2, "Executar e sincronizar", "POST /run", "A ponte roda o pytest com cobertura. O plugin grava o CT-xxx de cada teste no relatório JUnit. A ferramenta cria uma execução para cada caso, atualiza a rastreabilidade, abre um defeito para cada falha (se configurado) e guarda a cobertura como métrica da etapa atual. Testes sem CT aparecem como \"não vinculados\".")}
        ${step(3, "Executar mutação", "POST /mutation", "A ponte roda o Cosmic Ray (cerca de 4 minutos para os 141 mutantes), conta mortos e sobreviventes e devolve o escore, que vira uma métrica da etapa baseada em defeitos.")}
        ${step(4, "Analisar código", "POST /graphs", "Em Grafos estruturais: a ponte lê o código das funções dos requisitos, sem executá-lo, e devolve os grafos de fluxo (nós, arestas e caminhos).")}
      </ol></div></section>
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Segurança da ponte</h2><div class="panel-subtitle">Por que ela pode rodar no computador sem risco</div></div></div>
        <div class="panel-body check-list">
          <div class="check-item">${icon("shield")}<div><strong>Só do próprio computador</strong><p>Aceita conexões apenas em 127.0.0.1; ninguém de fora consegue acessá-la.</p></div></div>
          <div class="check-item">${icon("shield")}<div><strong>Uma pasta fixa</strong><p>O repositório é definido quando a ponte liga; a página não consegue apontar para outra pasta.</p></div></div>
          <div class="check-item">${icon("shield")}<div><strong>Comandos controlados</strong><p>Executa só o pytest, o Cosmic Ray e a análise de código, sem passar pelo shell do sistema e com tempo limite (30 min para o pytest, 2 h para a mutação).</p></div></div>
          <div class="check-item">${icon("shield")}<div><strong>Nada sai da máquina</strong><p>O código e os resultados não são enviados para nenhum serviço externo.</p></div></div>
        </div></section>
    </div>

    ${homeSection(3, "A rastreabilidade, com um exemplo real", "Tudo na ferramenta tem um identificador, e cada um aponta para o anterior. É assim que um defeito volta até o requisito que o originou.")}
    <section class="panel"><div class="panel-body"><div class="chain">${chain.map(([id, kind, text], index) => `<div class="chain-item"><span>${kind}</span><strong>${id}</strong><small>${text}</small></div>${index < chain.length - 1 ? `<span class="chain-arrow">${icon("arrow")}</span>` : ""}`).join("")}</div>
      <p class="chain-note">Leitura: o requisito <b>Reservar quartos</b> tem a classe inválida <b>menos de 1 hóspede</b>; o caso <b>CT-009</b> testa essa classe; no código original ele falhou (a reserva foi aceita) e revelou o <b>DEF-03</b>, corrigido no fork. Abra o CT-009 em <button class="link-btn" data-route="funcional">Teste funcional</button> para ver tudo isso na prática.</p></div></section>

    ${homeSection(4, "Cada item do menu", "O que cada página mostra e o que dá para fazer nela. Clique em um cartão para abrir a página.")}
    ${MENU_GUIDE.map(([group, note, items]) => `<div class="guide-group"><div class="guide-label">${group} <small>${note}</small></div><div class="guide-grid">${items.map(([key, ico, label, shows, does]) => `<button class="guide-card" data-route="${key}"><div class="guide-head"><span class="metric-icon">${icon(ico)}</span><strong>${label}</strong><span class="guide-go">${icon("arrow")}</span></div><p>${shows}</p><p class="guide-do"><b>Você pode:</b> ${does}</p></button>`).join("")}</div></div>`).join("")}
    <div class="guide-group"><div class="guide-label">Barra do topo <small>em todas as páginas</small></div><div class="guide-grid">
      <button class="guide-card" data-action="open-project"><div class="guide-head"><span class="metric-icon">${icon("settings")}</span><strong>Configurar</strong><span class="guide-go">${icon("arrow")}</span></div><p>Nome do projeto, repositório, meta de cobertura, etapa atual e os ajustes da ponte (caminho, endereço, ferramenta de mutação).</p><p class="guide-do"><b>Você pode:</b> mudar a etapa atual, que define onde a cobertura importada é registrada.</p></button>
      <button class="guide-card" data-action="open-case"><div class="guide-head"><span class="metric-icon">${icon("plus")}</span><strong>Novo caso</strong><span class="guide-go">${icon("arrow")}</span></div><p>Atalho para cadastrar um caso de teste de qualquer página.</p><p class="guide-do"><b>Você pode:</b> informar requisito, classe, entrada, passos e resultado esperado.</p></button>
    </div></div>

    ${homeSection(5, "Onde ficam os dados", "A ferramenta não tem servidor nem banco de dados.")}
    <div class="scope-grid home-scope">
      <div class="scope-item"><span class="req-index">No navegador</span><strong>Salvo no próprio navegador</strong><span class="sub-cell">Tudo fica guardado no armazenamento local do navegador de quem abre o site. Nada é enviado para servidor.</span></div>
      <div class="scope-item"><span class="req-index">Ao abrir</span><strong>Estudo oficial carregado sozinho</strong><span class="sub-cell">Se existir um estudo publicado mais novo que o salvo no navegador, ele é carregado automaticamente.</span></div>
      <div class="scope-item"><span class="req-index">Cópias</span><strong>Backup, CSV e PDF</strong><span class="sub-cell">Em Dados e exportação: backup JSON (restaura tudo), CSV dos casos (abre no Excel) e o relatório em PDF.</span></div>
    </div>

    ${homeSection(6, "Perguntas frequentes", "As dúvidas mais comuns sobre a ferramenta, em poucas palavras.")}
    <section class="panel faq">${faq.map(([question, answer], index) => `<details ${index === 0 ? "open" : ""}><summary>${question}</summary><p>${answer}</p></details>`).join("")}</section>

    <section class="panel about-tech"><div class="panel-body"><span class="inst-kicker">Feita com</span><div class="hero-chips">${["JavaScript + Vite", "jsPDF (relatório)", "Python (ponte e plugin pytest)", "pytest", "coverage.py", "Cosmic Ray", "GitHub Pages + Actions"].map((item) => `<span>${item}</span>`).join("")}</div>
      <div class="about-links">${extLink("https://github.com/gabrielfjm/vv-testlab", `${icon("github")}<span>Código da ferramenta</span>`)}${extLink("https://github.com/gabrielfjm/Hotel_Management_System", `${icon("fork")}<span>Fork com os testes</span>`)}</div></div></section>`;
}

const pct1 = (value) => `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/**
 * Escore de mutação pela fórmula da disciplina: mortos ÷ (gerados − equivalentes) × 100.
 * Os equivalentes são uma propriedade do mutante, então valem para as duas rodadas.
 * O "bruto" (mortos ÷ gerados) é o que o Cosmic Ray informa.
 */
function mutationScores() {
  const mutation = mutationData();
  const equivalent = Number(mutation.equivalent || 0);
  const score = (run) => run ? {
    killed: run.killed, total: run.total, equivalent,
    adjusted: run.total - equivalent > 0 ? Math.round((run.killed / (run.total - equivalent)) * 1000) / 10 : 0,
    raw: Math.round((run.killed / run.total) * 1000) / 10
  } : null;
  return { equivalent, initial: score(mutation.runs[0]), final: score(mutation.runs.at(-1)) };
}

function dashboardPage() {
  const stats = Object.fromEntries(Object.keys(STAGES).map((stage) => [stage, stageStats(stage)]));
  const total = Object.values(stats).reduce((sum, item) => sum + item.total, 0);
  const evolution = evolutionRows();
  const first = evolution[0] || {};
  const structural = evolution.find((item) => /estrutural/i.test(item.stage)) || {};
  const last = evolution.at(-1) || {};
  const mutation = mutationData();
  const scores = mutationScores();
  const initialRun = mutation.runs[0];
  const finalRun = mutation.runs.at(-1);
  const closed = state.defects.filter((item) => item.status === "Fechado").length;
  const uniqueCases = new Set(Object.values(stats).flatMap((item) => item.tests.map((test) => test.id))).size;
  const ampCount = (state.testCatalog?.tests || []).reduce((sum, test) => sum + amplifications(test).length, 0);
  const stageCard = (stage, lines) => `<button class="stage-card" data-route="${stage}"><div class="stage-card-head"><span class="metric-icon">${icon(STAGES[stage].ico)}</span><div><div class="phase-number">${STAGES[stage].eyebrow}</div><h3>${STAGES[stage].label}</h3></div></div><dl>${lines.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}</dl><span class="stage-card-link">Abrir etapa →</span></button>`;
  return `${pageHead("Visão geral", e(state.project.name), "Resumo das três etapas: quantos testes, o que encontraram e quanto do código exercitaram.")}
    <div class="metric-grid">
      ${metricCard("Casos de teste", uniqueCases, ampCount ? `os mesmos casos nas 3 etapas · ${ampCount} ampliações` : `${stats.funcional.total} funcionais · ${stats.estrutural.total} estruturais · ${stats.mutacao.total} de mutação`, "cases", "#6756e8", "#efedff")}
      ${metricCard("Defeitos encontrados", state.defects.length, `${closed} corrigidos antes da mutação`, "bug", "#d95555", "#fdecec")}
      ${metricCard("Cobertura final", pct(last.statements), `comandos · ${pct(last.branches)} dos desvios`, "chart", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Escore de mutação", pct1(scores.final?.adjusted), scores.final ? `${scores.final.killed} ÷ (${scores.final.total} − ${scores.equivalent} equivalentes) · bruto ${pct1(scores.final.raw)}` : "—", "shield", "#df8b2d", "#fff3df")}
    </div>
    <div class="stage-cards">
      ${stageCard("funcional", [["Casos", `${stats.funcional.total} (${stats.funcional.tests.filter((t) => t.technique === "CE").length} CE · ${stats.funcional.tests.filter((t) => t.technique === "AVL").length} AVL)`], ["No código original", `${stats.funcional.originalPassed} passaram · <b class="txt-red">${stats.funcional.originalFailed} falharam</b>`], ["Defeitos revelados", stats.funcional.revealed.length], ["Cobertura", `${pct(first.statements)} comandos · ${pct(first.branches)} desvios`]])}
      ${stageCard("estrutural", [[ampCount ? "Casos reaproveitados" : "Casos acrescentados", ampCount ? `${stats.estrutural.total} (${stats.estrutural.amplified.length} ampliados)` : `+${stats.estrutural.total}`], ["Cobertura", `${pct(structural.statements)} comandos · ${pct(structural.branches)} desvios`], ["Defeitos novos", stats.estrutural.revealed.length ? stats.estrutural.revealed.join(", ") : "0"], ["Grafos de fluxo", `${state.controlFlowGraphs.length} funções analisadas`]])}
      ${stageCard("mutacao", [[ampCount ? "Casos" : "Casos acrescentados", ampCount ? `os mesmos ${stats.mutacao.total} (${stats.mutacao.amplified.length} ampliados)` : `+${stats.mutacao.total}`], ["Mutantes", `${finalRun?.total || 0} gerados (${mutation.tool})`], ["Escore (sem equivalentes)", scores.initial && initialRun !== finalRun ? `${pct1(scores.initial.adjusted)} → <b>${pct1(scores.final.adjusted)}</b>` : pct1(scores.final?.adjusted)], ["Sobreviventes", `${finalRun?.survived || 0}${mutation.equivalent ? " (todos equivalentes)" : ""}`]])}
    </div>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Evolução da suíte</h2><div class="panel-subtitle">${ampCount ? "Os mesmos casos em todas as etapas; as etapas 2 e 3 ampliam alguns deles. A correção acontece antes da mutação" : "Cada etapa só acrescenta casos; a correção acontece antes da mutação"}</div></div></div><div class="table-wrap"><table><thead><tr><th>Etapa</th><th>Código</th><th>Casos</th><th>Passaram</th><th>Falharam</th><th>Comandos</th><th>Desvios</th><th>Mutação</th></tr></thead><tbody>${evolution.map((item) => `<tr><td class="main-cell">${e(item.stage)}</td><td>${e(item.code)}</td><td><strong>${e(item.cases)}</strong>${item.tests && item.tests !== item.cases ? `<div class="sub-cell">${e(item.tests)} testes pytest</div>` : ""}</td><td>${e(item.passed)}</td><td>${Number(item.failed) ? `<b class="txt-red">${e(item.failed)}</b><div class="sub-cell">defeitos confirmados</div>` : e(item.failed)}</td><td>${pct(item.statements)}${item.statementsText ? `<div class="sub-cell">${e(item.statementsText)}</div>` : ""}</td><td>${pct(item.branches)}${item.branchesText ? `<div class="sub-cell">${e(item.branchesText)}</div>` : ""}</td><td>${item.score != null ? `<strong>${pct(item.score)}</strong><div class="sub-cell">${e(item.mutation)}</div>` : "—"}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Escopo testado</h2><div class="panel-subtitle">As três funcionalidades do recorte</div></div><button class="btn btn-small btn-ghost" data-route="requirements">Ver requisitos</button></div><div class="panel-body"><div class="scope-grid">${state.requirements.map((req) => {
      const count = (stage) => stageTests(stage).filter((item) => item.requirementId === req.id).length;
      return `<div class="scope-item"><span class="req-index">${e(req.id)}</span><strong>${e(req.title)}</strong><span class="sub-cell">${count("funcional")} funcionais · ${count("estrutural")} estruturais · ${count("mutacao")} de mutação</span></div>`;
    }).join("")}</div></div></section>`;
}

function resultBadge(result) {
  const cls = { Passou: "green", Falhou: "red", Morto: "green", Sobrevivente: "red", Equivalente: "gray", "Não equivalente": "amber" }[result] || "gray";
  return `<span class="badge badge-${cls}">${e(result || "—")}</span>`;
}

function stagePage(stage) {
  const info = STAGES[stage];
  const subtitle = {
    funcional: "Casos derivados da especificação por classes de equivalência (CE) e análise do valor limite (AVL), sem olhar o código. Clique em um teste para ver código, assertivas e resultados.",
    estrutural: "Casos funcionais reaproveitados para percorrer os grafos de fluxo, ampliados onde a cobertura de comandos e desvios mostrou lacunas. Clique em um caso para ver o grafo, as ampliações e o código.",
    mutacao: "Os mesmos casos rodando contra cada mutante do Cosmic Ray no código corrigido; alguns foram ampliados para matar os sobreviventes. Clique em um caso ou mutante para ver os detalhes."
  }[stage];
  const tests = stageTests(stage);
  return `${pageHead(info.eyebrow, info.label, subtitle)}
    ${stage === "mutacao" ? mutationOverview() : stageOverview(stage)}
    ${stage === "funcional" ? equivalenceBoard() : ""}
    ${stage === "estrutural" ? coverageGapsPanel() : ""}
    ${stageGuide(stage)}
    ${stage === "mutacao" ? mutationListing(tests) : testListing(stage, tests)}`;
}

/** Cada lacuna de cobertura da etapa funcional: onde estava, por que ficou de fora e como foi fechada (ou por que é inviável). */
function coverageGapsPanel() {
  const gaps = state.testCatalog?.coverageGaps;
  if (!gaps) return "";
  const { before, after, corrected } = gaps;
  const where = (item) => [...item.lines.map((line) => `linha ${line}`), ...item.branches.map(([from, to]) => `desvio ${from}→${to}`)].map((text) => `<code>${text}</code>`).join("");
  return `<section class="panel gaps-panel"><div class="panel-head"><div><h2 class="panel-title">Lacunas de cobertura e como foram fechadas</h2><div class="panel-subtitle">O que a etapa funcional deixou sem executar na função ${e(gaps.function)} do código original, por que ficou de fora e qual ampliação cobriu. "Desvio 189→241" = da linha 189 o programa pula para a 241.</div></div></div>
    <div class="panel-body">
      <div class="gap-progress">
        <div><span>Comandos (linhas)</span><strong>${before.comandos_cobertos}/${before.comandos} → ${after.comandos_cobertos}/${after.comandos}</strong><small>${pct1(before.pct_comandos)} → ${pct1(after.pct_comandos)} no código original</small></div>
        <div><span>Desvios (saídas de if/for)</span><strong>${before.desvios_cobertos}/${before.desvios} → ${after.desvios_cobertos}/${after.desvios}</strong><small>${pct1(before.pct_desvios)} → ${pct1(after.pct_desvios)}; o que falta é inviável (L4), então a meta de 100% dos viáveis foi atingida</small></div>
        <div><span>Depois da correção</span><strong>${corrected.comandos_cobertos}/${corrected.comandos} e ${corrected.desvios_cobertos}/${corrected.desvios}</strong><small>${pct1(corrected.pct_comandos)} dos comandos e ${pct1(corrected.pct_desvios)} dos desvios no código corrigido</small></div>
      </div>
      <div class="gap-list">${gaps.items.map((item) => `<article class="gap-card ${item.feasible ? "" : "infeasible"}">
        <div class="gap-head"><span class="gap-id">${e(item.id)}</span><strong>${e(item.title)}</strong>${item.feasible ? `<span class="badge badge-green">Coberto</span>` : `<span class="badge badge-gray">Inviável</span>`}<span class="gap-where">${where(item)}</span></div>
        <div class="gap-body"><div><h4>Por que ficou de fora</h4><p>${e(item.why)}</p></div><div><h4>${item.feasible ? "Como foi coberto" : "Por que nenhum teste cobre"}</h4><p>${e(item.how)}</p></div></div>
        ${item.caseId || item.defect ? `<div class="gap-actions">${item.caseId ? `<button class="btn btn-small" data-action="open-test" data-id="${e(item.caseId)}">${icon("cases")}<span>Abrir a ampliação do ${e(item.caseId)}</span></button>` : ""}${item.defect && defectInfo(item.defect) ? `<button class="btn btn-small" data-action="open-defect-detail" data-id="${e(item.defect)}">${icon("bug")}<span>Ver o ${e(item.defect)}</span></button>` : ""}</div>` : ""}
        <details class="gap-code"><summary>Ver o trecho no código original</summary>${item.snippets.map((snippet) => codeView(snippet.lines.join("\n"), snippet.start, new Set(item.marked))).join("")}</details>
      </article>`).join("")}</div>
    </div></section>`;
}

/** Quadro das classes de equivalência: o conceito, um exemplo na reta (hóspedes) e todas as classes com seus casos. */
function equivalenceBoard() {
  const classes = state.classes;
  if (!classes.length) return "";
  const tests = stageTests("funcional");
  const casesOf = (classId) => tests.filter((test) => (test.classes || []).includes(classId)).map((test) => test.id);
  const caseButton = (id) => `<button class="ce-case" data-action="open-test" data-id="${e(id)}" title="${e(findTest(id)?.title || "")}">${e(id)}</button>`;
  const chip = (cls) => `<div class="ce-chip ${cls.type === "Válida" ? "ok" : "bad"}"><span class="ce-id">${e(cls.id)}</span><span class="ce-name">${e(cls.name)}</span><span class="ce-cases">${casesOf(cls.id).map(caseButton).join("") || "—"}</span></div>`;
  const conditions = [...new Map(classes.map((cls) => [`${cls.requirementId}|${cls.condition}`, { req: cls.requirementId, condition: cls.condition }])).values()];
  const valid = classes.filter((cls) => cls.type === "Válida").length;
  const name = (id) => classes.find((cls) => cls.id === id)?.name || "";
  // Exemplo: número de hóspedes com os quartos 101 (2 pessoas) e 102 (3 pessoas): capacidade somada = 5.
  const example = ["CE-11", "CE-12", "CE-13", "CE-14"].every((id) => classes.some((cls) => cls.id === id)) ? `
    <div class="ce-example">
      <div class="ce-example-head"><strong>Exemplo: o número de hóspedes</strong><span>Reserva dos quartos 101 (cabem 2) e 102 (cabem 3): no total cabem <b>5</b> pessoas.</span></div>
      <div class="ce-line">
        <div class="seg bad"><span class="seg-id">CE-12 · inválida</span><span class="seg-name">${e(name("CE-12"))}</span><span class="seg-vals">…, −1, 0</span></div>
        <div class="seg ok wide"><span class="seg-id">CE-11 · válida</span><span class="seg-name">de 1 até 5</span><span class="seg-vals">1 · 2 · 3 · 4 · 5</span></div>
        <div class="seg bad"><span class="seg-id">CE-13 · inválida</span><span class="seg-name">${e(name("CE-13"))}</span><span class="seg-vals">6, 7, …</span></div>
        <div class="seg bad text"><span class="seg-id">CE-14 · inválida</span><span class="seg-name">${e(name("CE-14"))}</span><span class="seg-vals">"dois"</span></div>
      </div>
      <div class="ce-points">
        ${[["0", "CT-009", "recusar", "bad"], ["1", "CT-001", "aceitar", "ok"], ["5", "CT-002", "aceitar", "ok"], ["6", "CT-010", "recusar", "bad"], ["\"dois\"", "CT-011", "recusar", "bad"]].map(([value, id, result, kind]) => `<button class="ce-point ${kind}" data-action="open-test" data-id="${id}"><strong>${value}</strong><span>${id}</span><small>deve ${result}</small></button>`).join("")}
      </div>
      <p class="ce-example-note">Testar 2 ou 3 hóspedes daria o mesmo resultado: os dois estão na mesma classe. Por isso basta <b>um valor de cada classe</b>, e os valores escolhidos ficam <b>nas bordas</b> (0 e 1, 5 e 6), onde os erros costumam aparecer. Foi assim que o CT-009 revelou o DEF-03: o sistema aceitava 0 hóspedes.</p>
    </div>` : "";
  return `<section class="panel ce-board">
    <div class="panel-head"><div><h2 class="panel-title">Classes de equivalência: como os casos foram pensados</h2><div class="panel-subtitle">${classes.length} classes (${valid} válidas e ${classes.length - valid} inválidas) em ${conditions.length} condições de entrada, cobertas por ${tests.length} casos</div></div></div>
    <div class="panel-body">
      <div class="ce-concepts">
        <div><span class="ce-step">1</span><strong>O que é uma classe</strong><p>Um grupo de valores de entrada que o sistema deve tratar <b>do mesmo jeito</b>. Se um valor do grupo funciona, os outros também deveriam.</p></div>
        <div><span class="ce-step">2</span><strong>Válida ou inválida</strong><p><b class="txt-ok">Válida</b>: o sistema deve aceitar. <b class="txt-red">Inválida</b>: o sistema deve recusar com mensagem, sem gravar nada.</p></div>
        <div><span class="ce-step">3</span><strong>Como viram casos</strong><p>Um caso válido cobre várias classes válidas de uma vez (o CT-001 cobre 10). Cada classe inválida tem <b>um caso só dela</b>, com todo o resto válido: assim a recusa tem um único motivo.</p></div>
        <div><span class="ce-step">4</span><strong>E o valor limite?</strong><p>Complementa as classes: em vez de um valor qualquer, o caso usa o valor <b>na fronteira</b> entre duas classes, onde os erros costumam estar.</p></div>
      </div>
      ${example}
      <details class="ce-all" open><summary>Todas as classes, por condição de entrada <small>clique em um caso para abrir</small></summary>
        <div class="table-wrap"><table class="ce-table"><thead><tr><th>Requisito</th><th>Condição de entrada</th><th>Classes válidas</th><th>Classes inválidas</th></tr></thead><tbody>
          ${conditions.map(({ req, condition }) => {
            const group = classes.filter((cls) => cls.requirementId === req && cls.condition === condition);
            const list = (type) => group.filter((cls) => cls.type === type).map(chip).join("") || `<span class="sub-cell">—</span>`;
            return `<tr><td class="id-cell">${e(req)}<div class="sub-cell">${e(state.requirements.find((item) => item.id === req)?.title || "")}</div></td><td class="main-cell">${e(condition)}</td><td>${list("Válida")}</td><td>${list("Inválida")}</td></tr>`;
          }).join("")}
        </tbody></table></div>
      </details>
    </div>
  </section>`;
}

/** Passo a passo de como a etapa foi conduzida (texto do catálogo do estudo). */
function stageGuide(stage) {
  const guide = state.testCatalog?.guide?.stages?.[stage];
  if (!guide) return "";
  return `<details class="panel how-panel"><summary>${icon("info")}<span>${e(guide.titulo)} <small>passo a passo</small></span></summary>
    <ol class="how-steps">${guide.passos.map((passo) => `<li>${e(passo)}</li>`).join("")}</ol></details>`;
}

function explanationBlock(test, classes) {
  const x = test.explanation;
  if (!x) return `<section class="detail-section"><h3>O que este teste faz</h3><p>${e(test.description)}</p>${classes ? `<div class="class-chips"><span class="detail-hint">Classes de equivalência:</span>${classes}</div>` : ""}</section>`;
  const failed = test.original?.result === "Falhou";
  const item = (titulo, conteudo, extra = "") => `<div class="explain-item ${extra}"><h4>${titulo}</h4>${conteudo}</div>`;
  return `<section class="detail-section explain">
    <div class="explain-summary">${icon("spark")}<div><span>Em uma frase</span><strong>${e(x.resumo)}</strong></div></div>
    <div class="explain-grid">
      ${item("Por que este teste existe", `<p>${e(x.porque)}</p>${classes ? `<div class="class-chips">${classes}</div>` : ""}`)}
      ${item("Cenário, passo a passo", `<ol>${x.passos.map((passo) => `<li>${e(passo)}</li>`).join("")}</ol>`)}
      ${item("O que o teste confere", `<p>${e(x.verifica)}</p>`)}
      ${x.mutante ? item("Como ele mata o mutante", `<p>${e(x.mutante)}</p>`, "warn") : ""}
      ${item("O que aconteceu no código original", `<p>${e(x.original)}</p>`, failed ? "bad" : "")}
      ${item("No código corrigido", `<p>${e(x.corrigido)}</p>`, "good")}
    </div>
  </section>`;
}

function stageOverview(stage) {
  const stats = stageStats(stage);
  const evolution = evolutionRows();
  const first = evolution[0] || {};
  const structural = evolution.find((item) => /estrutural/i.test(item.stage)) || {};
  if (stage === "funcional") {
    const ce = stats.tests.filter((item) => item.technique === "CE").length;
    return `<div class="metric-grid">
      ${metricCard("Casos funcionais", stats.total, `${ce} classes de equivalência · ${stats.total - ce} valor limite`, "cases", "#6756e8", "#efedff")}
      ${metricCard("No código original", `${stats.originalPassed} <small>passaram</small> · <span class="txt-red">${stats.originalFailed}</span> <small>falharam</small>`, "cada falha confirma um defeito", "warning", "#d95555", "#fdecec")}
      ${metricCard("Defeitos revelados", stats.revealed.length, `no corrigido: ${stats.correctedPassed}/${stats.total} passaram`, "bug", "#df8b2d", "#fff3df")}
      ${metricCard("Cobertura alcançada", pct(first.statements), `comandos · ${pct(first.branches)} dos desvios`, "chart", "#1f9d8a", "#e6f7f3")}
    </div>`;
  }
  const summary = structuralSummary(state);
  return `<div class="metric-grid">
      ${metricCard(stats.amplified.length || stats.tests.some((item) => item.parts) ? "Casos reaproveitados" : "Casos estruturais", stats.total, stats.tests.some((item) => item.parts) ? `${stats.amplified.length} ampliados · ${summary.graphs} grafos de fluxo` : `grafos: ${summary.graphs} funções · ${summary.nodes} nós · ${summary.edges} arestas`, "graph", "#6756e8", "#efedff")}
      ${metricCard("Cobertura de comandos", `${pct(first.statements)} → ${pct(structural.statements)}`, structural.statementsText ? `${structural.statementsText} comandos do recorte` : "antes → depois da etapa", "chart", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Cobertura de desvios", `${pct(first.branches)} → ${pct(structural.branches)}`, structural.branchesText ? `${structural.branchesText} desvios (o restante é inviável)` : "antes → depois da etapa", "trace", "#df8b2d", "#fff3df")}
      ${metricCard("Defeitos novos", stats.revealed.length, stats.revealed.join(", ") || "nenhum", "bug", "#d95555", "#fdecec")}
    </div>`;
}

function stageFilters(stage) {
  return [
    { key: "requirement", label: "Todos os requisitos", options: state.requirements.map((item) => ({ value: item.id, label: `${item.id} — ${item.title}` })) },
    ...(stage === "funcional" ? [
      { key: "technique", label: "CE e AVL", options: [{ value: "CE", label: "Classes de equivalência (CE)" }, { value: "AVL", label: "Valor limite (AVL)" }] },
      { key: "validity", label: "Válidos e inválidos", options: ["Válido", "Inválido"] }
    ] : []),
    { key: "original", label: "Resultado no original", options: ["Passou", "Falhou"] },
    { key: "defect", label: "Com e sem defeito", options: [{ value: "sim", label: "Revelou defeito" }, { value: "nao", label: "Sem defeito" }] }
  ];
}

function testListing(stage, tests) {
  const scope = `${stage}-list`;
  return `${filterToolbar(scope, "Buscar por ID, nome, entrada ou resultado...", stageFilters(stage))}
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">${stage === "estrutural" && tests.some((item) => item.parts) ? "Casos funcionais reaproveitados" : "Testes da etapa"}</h2><div class="panel-subtitle">Clique em uma linha para abrir o detalhe</div></div><span class="tag">${tests.length} casos</span></div>
      <div class="table-wrap filter-scope" id="${scope}">${tests.length ? `<table class="click-table"><thead><tr><th>ID</th><th>Teste</th><th>Entrada</th><th>Resultado esperado</th><th>Obtido no original</th>${stage === "estrutural" ? "<th>Caminho no grafo</th><th>Ampliação nesta etapa</th>" : ""}<th>Original</th><th>Corrigido</th><th>Defeito</th></tr></thead><tbody>${tests.map((test) => testRow(stage, test)).join("")}</tbody></table>` : emptyState("Nenhum teste nesta etapa", "Importe o backup do estudo em Dados e exportação.")}<div class="filter-empty" hidden>Nenhum teste corresponde aos filtros.</div></div>
    </section>`;
}

function obtainedShort(run) {
  if (!run || run.result === "Não executado") return "Não executado";
  return run.result === "Passou" ? "Igual ao esperado" : run.obtained || "Falhou";
}

function testRow(stage, test) {
  const original = originalFor(test, stage);
  const revealed = original?.result === "Falhou" && test.defect;
  const query = [test.id, test.title, test.function, test.input, test.expected, test.defect, test.defectTitle, ...(test.classes || [])].filter(Boolean).join(" ").toLowerCase();
  return `<tr class="filter-item clickable" data-action="open-test" data-id="${e(test.id)}" data-query="${e(query)}" data-requirement="${e(test.requirementId)}" data-technique="${e(test.technique)}" data-validity="${e(test.validity)}" data-original="${e(original?.result)}" data-defect="${revealed ? "sim" : "nao"}">
    <td class="id-cell">${e(test.id)}<div class="sub-cell">${e(test.requirementId)} · ${e(test.technique)}</div></td>
    <td class="main-cell">${e(test.title)}${test.function ? `<div class="sub-cell mono">${e(test.function)}</div>` : ""}</td>
    <td>${e(test.input)}</td><td>${e(test.expected)}</td>
    <td class="${original?.result === "Falhou" ? "txt-red" : ""}">${e(obtainedShort(original))}</td>
    ${stage === "estrutural" ? `<td class="sub-cell">${e(test.structuralPath || test.explanation?.cobre || (test.comments || []).join(" ") || "—")}</td><td>${amplifications(test, "estrutural").map((part) => `<span class="tag">Ampliado</span><div class="sub-cell">${e(part.explanation?.titulo || part.function)}</div>`).join("") || `<span class="sub-cell">Reaproveitado sem mudança</span>`}</td>` : ""}
    <td>${resultBadge(original?.result)}</td><td>${resultBadge(test.corrected?.result)}</td>
    <td>${test.defect ? `<span class="tag ${revealed ? "tag-red" : ""}">${e(test.defect)}</span>` : "—"}</td>
  </tr>`;
}

function mutationOverview() {
  const mutation = mutationData();
  const initialRun = mutation.runs[0];
  const finalRun = mutation.runs.at(-1);
  if (!finalRun) return `<section class="panel"><div class="panel-body">${emptyState("Nenhuma execução de mutação", "Execute a mutação pela Integração Python ou importe o backup do estudo.")}</div></section>`;
  const amplifiedTests = stageTests("mutacao").filter((item) => amplifications(item, "mutacao").length);
  const added = (amplifiedTests.length ? amplifiedTests : stageTests("mutacao")).map((item) => item.id).join(", ");
  const scores = mutationScores();
  const calc = (score, label, run, extra = "") => `<div class="calc-card ${extra}"><span class="calc-label">${label}</span><strong>${pct1(score.adjusted)}</strong><div class="formula">${score.killed} ÷ (${score.total} − ${score.equivalent}) × 100</div><small>${e(run.suite || "")}${run.survived ? ` · ${run.survived} sobreviventes` : ""}</small><div class="calc-raw">Sem descontar os equivalentes: ${score.killed} ÷ ${score.total} = ${pct1(score.raw)}</div></div>`;
  return `<div class="metric-grid">
      ${metricCard("Mutantes gerados", finalRun.total, `${mutation.functions.length ? `${mutation.functions.length} funções · ` : ""}${e(mutation.tool)}`, "bug", "#6756e8", "#efedff")}
      ${metricCard("Mortos", finalRun.killed, "algum teste falhou com o mutante", "shield", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Sobreviventes", finalRun.survived, mutation.equivalent ? `todos os ${mutation.equivalent} são equivalentes` : "nenhum teste detectou", "warning", "#d95555", "#fdecec")}
      ${metricCard("Escore de mutação", pct1(scores.final.adjusted), `${finalRun.killed} ÷ (${finalRun.total} − ${scores.equivalent}) · bruto ${pct1(scores.final.raw)}`, "chart", "#df8b2d", "#fff3df")}
    </div>
    <section class="panel calc-panel"><div class="panel-head"><div><h2 class="panel-title">Cálculo do escore de mutação</h2><div class="panel-subtitle">Os equivalentes saem do denominador: são mutantes que não mudam o comportamento do programa, então nenhum teste consegue matá-los.</div></div></div>
      <div class="score-formula" aria-label="Escore de mutação igual a mutantes mortos dividido por total de mutantes gerados menos mutantes equivalentes, vezes 100">
        <span>Escore de mutação (%) =</span>
        <span class="frac"><span>Mutantes mortos</span><span>Total de mutantes gerados − Mutantes equivalentes</span></span>
        <span>× 100</span>
      </div>
      <div class="calc-grid">
        ${scores.initial && initialRun !== finalRun ? `${calc(scores.initial, "Rodada inicial", initialRun)}<div class="calc-arrow">→<span>${amplifiedTests.length ? `ampliação de ${amplifiedTests.length} casos` : `+${stageTests("mutacao").length} casos`}<br>${e(added)}</span></div>` : ""}
        ${calc(scores.final, "Rodada final", finalRun, "highlight")}
      </div>
      <div class="equiv-note">${icon("info")}<div><strong>Como os ${scores.equivalent} equivalentes foram identificados:</strong> depois da rodada inicial, cada um dos ${initialRun?.survived || 0} sobreviventes foi analisado. ${initialRun?.survived - scores.equivalent || 0} mostravam cenários que faltavam nos testes e foram mortos ampliando casos; ${scores.equivalent} não alteram o resultado do programa (S8 a S14). Filtre por "Equivalente" na lista de mutantes abaixo para ver a justificativa de cada um.</div></div>
    </section>`;
}

function mutationListing(tests) {
  const mutation = mutationData();
  const scope = "mutation-list";
  const families = [...new Set(mutation.mutants.map((item) => item.operatorFamily))].sort();
  return `${filterToolbar(scope, "Buscar por teste, mutante, função, operador ou código...", [
      { key: "function", label: "Todas as funções", options: [...new Set(mutation.mutants.map((item) => item.function))] },
      { key: "final", label: "Resultado final", options: ["Morto", "Sobrevivente"] },
      { key: "initial", label: "Resultado inicial", options: ["Morto", "Sobrevivente"] },
      { key: "classification", label: "Classificação", options: ["Equivalente", "Não equivalente"] },
      { key: "family", label: "Todos os operadores", options: families }
    ])}
    <section class="panel panel-flush filter-scope" data-filter-group="${scope}"><div class="panel-head"><div><h2 class="panel-title">Casos de teste da etapa</h2><div class="panel-subtitle">${tests.some((item) => item.parts) ? "Os mesmos 15 casos rodam contra cada mutante; os ampliados ganharam o cenário que matava os sobreviventes" : "Criados para matar os sobreviventes não equivalentes da rodada inicial"}</div></div><span class="tag">${tests.length} casos</span></div>
      <div class="table-wrap">${tests.length ? `<table class="click-table"><thead><tr><th>ID</th><th>Teste</th><th>Ampliação nesta etapa</th><th>Mutantes que matou</th><th>Sobreviventes que matou</th><th>Resultado</th></tr></thead><tbody>${tests.map((test) => {
        const killed = (test.survivorsKilled || []).map((id) => mutation.mutants.find((item) => item.id === id)).filter(Boolean);
        return `<tr class="filter-item clickable" data-action="open-test" data-id="${e(test.id)}" data-query="${e([test.id, test.title, test.function, test.input, ...killed.flatMap((m) => [m.id, m.survivorTag, m.function, m.operator])].join(" ").toLowerCase())}"><td class="id-cell">${e(test.id)}</td><td class="main-cell">${e(test.title)}<div class="sub-cell mono">${e(test.function || "")}</div></td><td>${amplifications(test, "mutacao").map((part) => `<span class="tag">Ampliado</span><div class="sub-cell">${e(part.explanation?.titulo || part.function)}</div>`).join("") || "—"}</td><td><strong>${(test.mutantsKilled || []).length}</strong></td><td>${killed.map((m) => `<span class="tag">${e(m.id)} · ${e(m.survivorTag)}</span><div class="sub-cell mono">${e(m.function)}:${e(m.line)}</div>`).join("") || "—"}</td><td>${resultBadge(test.corrected?.result)}</td></tr>`;
      }).join("")}</tbody></table>` : emptyState("Nenhum caso de mutação", "Importe o backup do estudo.")}</div><div class="filter-empty" hidden>Nenhum teste corresponde à busca.</div></section>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Todos os mutantes</h2><div class="panel-subtitle">Resultado de cada mutante nas duas rodadas e o teste que o matou</div></div><span class="tag">${mutation.mutants.length} mutantes</span></div>
      <div class="table-wrap filter-scope" id="${scope}">${mutation.mutants.length ? `<table class="click-table"><thead><tr><th>Mutante</th><th>Função (linha)</th><th>Mutação</th><th>Inicial</th><th>Final</th><th>Morto por</th><th>Classificação</th></tr></thead><tbody>${mutation.mutants.map(mutantRow).join("")}</tbody></table>` : emptyState("Lista de mutantes indisponível", "Importe o backup do estudo para ver cada mutante.")}<div class="filter-empty" hidden>Nenhum mutante corresponde aos filtros.</div></div>
    </section>`;
}

function mutantRow(m) {
  const query = [m.id, m.survivorTag, m.function, m.operator, m.operatorFamily, m.original, m.mutated, m.killedBy, m.classification].join(" ").toLowerCase();
  return `<tr class="filter-item clickable ${m.final === "Sobrevivente" ? "row-survivor" : ""}" data-action="open-mutant" data-id="${e(m.id)}" data-query="${e(query)}" data-function="${e(m.function)}" data-final="${e(m.final)}" data-initial="${e(m.initial)}" data-classification="${e(m.classification)}" data-family="${e(m.operatorFamily)}">
    <td class="id-cell">${e(m.id)}${m.survivorTag ? `<div class="sub-cell">${e(m.survivorTag)}</div>` : ""}</td>
    <td class="mono">${e(m.function)}<div class="sub-cell">linha ${e(m.line)}</div></td>
    <td><div class="diff-mini"><div class="del">${e(m.original)}</div><div class="add">${e(m.mutated)}</div></div><div class="sub-cell">${e(m.operatorFamily)}</div></td>
    <td>${resultBadge(m.initial)}</td><td>${resultBadge(m.final)}</td>
    <td>${m.killedBy ? `<span class="tag">${e(m.killedBy)}</span>` : "—"}</td>
    <td>${m.classification ? resultBadge(m.classification) : "—"}</td>
  </tr>`;
}

// ------------------------------------------------------------ detalhe (modal amplo)

const PY_TOKEN = /(#.*$)|(b?"(?:\\.|[^"\\])*"|b?'(?:\\.|[^'\\])*')|(@[\w.]+)|\b(def|return|assert|with|as|for|in|if|else|elif|not|and|or|is|import|from|None|True|False|lambda)\b|\b(\d+(?:\.\d+)?)\b/g;

function highlightPython(line) {
  let html = "";
  let last = 0;
  for (const match of line.matchAll(PY_TOKEN)) {
    html += e(line.slice(last, match.index));
    const cls = match[1] ? "c" : match[2] ? "s" : match[3] ? "d" : match[4] ? "k" : "n";
    html += `<span class="py-${cls}">${e(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return html + e(line.slice(last));
}

function codeView(code, startLine = 1, marked = new Set()) {
  return `<pre class="code-view">${String(code).split("\n").map((line, index) => {
    const number = startLine + index;
    return `<span class="code-line ${marked.has(number) ? "marked" : ""}"><span class="ln">${number}</span>${highlightPython(line) || " "}</span>`;
  }).join("")}</pre>`;
}

function explainAssertion(text) {
  const t = text.replace(/\s+#.*$/, "").trim();
  let m;
  const destinations = { "/rooms": "é aceita e redireciona para /rooms (lista de quartos)", "/reserve": "é recusada e volta ao formulário /reserve", "/available": "é recusada e volta ao formulário /available", "/": "redireciona para a página inicial (/), pois não há sessão" };
  if ((m = t.match(/^assert path\((.+)\) == "([^"]*)"$/))) {
    const call = m[1];
    const subject = call.startsWith("booking") ? "A reserva (POST /reserve)"
      : call.startsWith("availability") ? "A consulta de disponibilidade (POST /available)"
        : call.startsWith("client.get") ? `O acesso a ${call.match(/"([^"]+)"/)?.[1] || "rota"}`
          : call.startsWith("client.post") ? "O POST de exclusão" : "A resposta";
    const target = call.startsWith("client") && m[2] !== "/" ? `redireciona para ${m[2]}` : destinations[m[2]] || `redireciona para ${m[2]}`;
    return `${subject} ${target}.`;
  }
  if ((m = t.match(/^assert (\w+)\.query\.count\(\) == (\d+)$/))) return `A tabela ${m[1]} tem ${m[2]} registro(s)${m[2] === "0" ? ": nada foi gravado" : ""}.`;
  if ((m = t.match(/\.costs == ([\d\s+*()]+)$/))) {
    let value = m[1].trim();
    try { value = /[+*]/.test(value) ? `${value} = ${Function(`return (${value})`)()}` : value; } catch { /* mantém o texto */ }
    return `O custo gravado da reserva é R$ ${value}.`;
  }
  if ((m = t.match(/\.num_guests == (\d+)$/))) return `A reserva foi gravada com ${m[1]} hóspede(s).`;
  if ((m = t.match(/^assert listed_rooms\((\w+)\) == \[(.*)\]$/))) return `A página /rooms ${m[1] === "other" ? "do outro usuário " : ""}mostra os quartos ${m[2]}.`;
  if ((m = t.match(/^assert sorted\(b\.room_id .*== \[(.*)\]$/))) return `Os quartos vinculados à reserva são ${m[1]}.`;
  if (/^assert \[\(b\.brid, b\.room_id\)/.test(t)) return "Há um único vínculo: a reserva criada com o quarto pedido.";
  if ((m = t.match(/\.days == (\d+)$/))) return `A estadia gravada tem ${m[1]} diária(s).`;
  if (/is not None$/.test(t)) return "A reserva continua gravada (não foi excluída).";
  if ((m = t.match(/status_code == (\d+)/))) return `A resposta HTTP tem status ${m[1]} (OK).`;
  if ((m = t.match(/^assert b["'](.+)["'] in response\.data$/))) return `A página exibida contém ${m[1]}.`;
  return "";
}

function renderDetail(keepScroll = false) {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  const scroll = root.querySelector(".modal")?.scrollTop || 0;
  root.innerHTML = renderModal();
  if (keepScroll && root.querySelector(".modal")) root.querySelector(".modal").scrollTop = scroll;
  if (!detail) closeNodeDrawer();
}

function detailModal() {
  const content = detail.kind === "mutant" ? mutantDetail(detail.id) : detail.kind === "defect" ? defectDetail(detail.id) : testDetail(detail.id);
  if (!content) return "";
  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal modal-wide" role="dialog" aria-modal="true" aria-label="${e(content.title)}">
    <div class="modal-head"><div><div class="eyebrow">${content.kicker}</div><h2>${content.title}</h2><p>${content.subtitle}</p></div><button type="button" class="icon-btn" data-action="close-detail" title="Fechar">${icon("close")}</button></div>
    <div class="modal-body detail-body">${content.body}</div></section></div>`;
}

function findTest(id) {
  for (const stage of Object.keys(STAGES)) {
    const test = stageTests(stage).find((item) => item.id === id);
    if (test) return test;
  }
  return null;
}

function runCell(label, run) {
  return `<div class="result-card result-${run?.result === "Passou" ? "pass" : run?.result === "Falhou" ? "fail" : "none"}"><span>${label}</span>${resultBadge(run?.result || "Não executado")}${run?.runId ? `<small>${e(run.runId)}</small>` : ""}</div>`;
}

function testDetail(id) {
  const test = findTest(id);
  if (!test) return null;
  const req = state.requirements.find((item) => item.id === test.requirementId);
  const marked = new Set((test.assertions || []).map((item) => item.line));
  const mutation = mutationData();
  const classes = (test.classes || []).map((classId) => {
    const cls = state.classes.find((item) => item.id === classId);
    return `<span class="tag ${cls?.type === "Inválida" ? "tag-red" : ""}" title="${e(cls?.condition || "")}">${e(classId)}${cls ? ` · ${e(cls.name)}` : ""}</span>`;
  }).join("");
  const ioRow = (label, run) => {
    const failed = run?.result !== "Passou";
    const note = failed ? String(run?.note || "—").split(" | ")[0] : test.defect && run?.note ? run.note : "—";
    return `<tr><td>${e(label)}<div style="margin-top:6px">${resultBadge(run?.result || "Não executado")}</div></td><td>${e(test.input)}</td><td>${e(test.expected)}</td><td class="${run?.result === "Falhou" ? "txt-red" : ""}">${e(run?.obtained || "—")}</td><td>${e(note)}${failed && run?.evidence ? `<code class="evidence">${e(run.evidence)}</code>` : ""}</td></tr>`;
  };
  const assertionsBlock = (test.assertions || []).length ? `<section class="detail-section"><h3>Assertivas do pytest</h3><p class="detail-hint">O que o teste exige para passar. Se qualquer linha abaixo for falsa, o pytest marca o teste como falho.</p><div class="assert-list">${test.assertions.map((item) => {
    const explanation = explainAssertion(item.text);
    return `<div class="assert-item"><span class="ln">L${e(item.line)}</span><div><code>${highlightPython(item.text)}</code>${explanation ? `<span>${e(explanation)}</span>` : ""}</div></div>`;
  }).join("")}</div></section>` : "";
  const codeBlock = test.code ? `<section class="detail-section"><h3>Código do teste <span class="mono sub">${e(test.file)}:${e(test.line)}</span></h3>${codeView(test.code, test.line, marked)}<p class="detail-hint">Linhas destacadas = assertivas.</p>${helpersBlock(test)}</section>` : `<section class="detail-section"><div class="callout">${icon("info")}<div>Código não disponível. Importe o backup do estudo (com o catálogo de testes) em Dados e exportação.</div></div></section>`;
  const related = [...new Set([...(test.survivorsKilled || []), ...(test.mutantsKilled || [])])]
    .map((mid) => mutation.mutants.find((item) => item.id === mid)).filter(Boolean)
    .sort((a, b) => Number(Boolean(b.survivorTag)) - Number(Boolean(a.survivorTag)) || a.line - b.line);
  const context = detail?.context && STAGES[detail.context] ? detail.context : test.stage;
  const mutantTable = related.length ? `<div class="table-wrap"><table class="click-table mutant-table"><thead><tr><th>Mutante</th><th>Onde</th><th>O que mudou no código</th><th>Rodada inicial</th><th>Rodada final</th>${context === "mutacao" ? "<th>Por que sobrevivia</th>" : ""}</tr></thead><tbody>${related.map((m) => `<tr class="clickable" data-action="open-mutant" data-id="${e(m.id)}"><td class="id-cell">${e(m.id)}${m.survivorTag ? `<div class="sub-cell">${e(m.survivorTag)}</div>` : ""}</td><td class="mono">${e(m.function)}<div class="sub-cell">linha ${e(m.line)}</div></td><td><div class="diff-mini"><div class="del">${e(m.original)}</div><div class="add">${e(m.mutated)}</div></div><div class="sub-cell">${e(m.operatorFamily)}</div></td><td>${resultBadge(m.initial)}</td><td>${resultBadge(m.final)}${m.killedBy ? `<div class="sub-cell">por ${e(m.killedBy)}</div>` : ""}</td>${context === "mutacao" ? `<td class="sub-cell">${e(m.justification || "—")}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : "";
  const mutationBlock = !related.length ? "" : context === "mutacao"
    ? `<section class="detail-section"><h3>Mutantes relacionados a este teste <span class="mono sub">${related.length}</span></h3><p class="detail-hint">Mutantes que este caso matou na rodada final. Os marcados com S sobreviveram à rodada inicial${amplifications(test, "mutacao").length ? " e foram mortos pela ampliação deste caso" : ""}. Clique em uma linha para ver o mutante.</p>${mutantTable}</section>`
    : `<section class="detail-section"><details class="helpers mutant-details"><summary>Mutantes que este teste matou na rodada final (${related.length})</summary><p class="detail-hint" style="margin-top:8px">Com pytest -x, cada mutante é creditado ao primeiro teste que falhou. Clique em uma linha para ver o mutante.</p>${mutantTable}</details></section>`;
  const killedCount = (test.mutantsKilled || []).length;
  return {
    kicker: `${STAGES[context].label} · ${e(test.requirementId)} ${e(req?.title || "")}`,
    title: `${e(test.id)} · ${e(test.title)}`,
    subtitle: test.function ? `<span class="mono">${e(test.function)}</span>` : e(test.input),
    body: `<div class="detail-badges"><span class="tag">${e(test.technique)}</span>${test.validity ? `<span class="badge badge-${test.validity === "Válido" ? "green" : "red"}">Cenário ${e(test.validity.toLowerCase())}</span>` : ""}${test.defect ? (defectInfo(test.defect) ? `<button class="tag tag-red tag-link" data-action="open-defect-detail" data-id="${e(test.defect)}" title="Ver onde o defeito acontecia e quando foi corrigido">${e(test.defect)} · ${e(test.defectTitle)} →</button>` : `<span class="tag tag-red">${e(test.defect)} · ${e(test.defectTitle)}</span>`) : ""}</div>
      ${explanationBlock(test, classes)}
      <div class="result-cards">${runCell("Código original", test.original)}${runCell("Código corrigido", test.corrected)}${killedCount ? `<div class="result-card result-none"><span>Mutação (rodada final)</span><strong>${killedCount}</strong><small>mutantes mortos primeiro por este teste</small></div>` : ""}</div>
      <section class="detail-section"><h3>Entrada, resultado esperado e resultado obtido</h3><div class="table-wrap"><table class="io-table"><thead><tr><th>Versão do código</th><th>Entrada</th><th>Resultado esperado</th><th>Resultado obtido</th><th>Observações</th></tr></thead><tbody>${ioRow("Original", test.original)}${ioRow("Corrigido", test.corrected)}</tbody></table></div></section>
      ${amplificationBlock(test)}
      ${(test.stages || [test.stage]).includes("estrutural") ? graphBlock(test) : ""}
      ${assertionsBlock}
      ${mutationBlock}
      ${codeBlock}`
  };
}

const STAGE_PART = { estrutural: "Ampliação da etapa estrutural", mutacao: "Ampliação da etapa de mutação" };

/** Cenários acrescentados ao caso nas etapas 2 e 3 (outra função pytest com o mesmo número de caso). */
function amplificationBlock(test) {
  const parts = amplifications(test);
  if (!parts.length) return "";
  return `<section class="detail-section"><h3>Ampliações deste caso <span class="mono sub">${parts.length}</span></h3><p class="detail-hint">Nenhum caso novo foi criado nas etapas 2 e 3: quando faltou um cenário, este mesmo caso foi ampliado com uma nova função pytest (mesmo número ${e(test.id)}).</p>
    ${parts.map((part) => {
      const x = part.explanation || {};
      const marked = new Set((part.assertions || []).map((item) => item.line));
      return `<div class="amp-card"><div class="amp-head"><span class="badge badge-purple">${e(STAGE_PART[part.stage] || part.stage)}</span>${part.defect ? `<span class="tag tag-red">revela ${e(part.defect)}</span>` : ""}<h4>${e(x.titulo || part.function)}</h4></div>
        <div class="explain-grid">
          ${x.porque ? `<div class="explain-item"><h4>Por que foi ampliado</h4><p>${e(x.porque)}</p></div>` : ""}
          ${x.passos ? `<div class="explain-item"><h4>Cenário, passo a passo</h4><ol>${x.passos.map((passo) => `<li>${e(passo)}</li>`).join("")}</ol></div>` : ""}
          ${x.verifica ? `<div class="explain-item"><h4>O que confere</h4><p>${e(x.verifica)}</p></div>` : ""}
          ${x.mutante ? `<div class="explain-item warn"><h4>Como mata o mutante</h4><p>${e(x.mutante)}</p></div>` : ""}
          ${x.original ? `<div class="explain-item ${part.defect ? "bad" : ""}"><h4>No código original</h4><p>${e(x.original)}</p></div>` : ""}
          ${x.corrigido ? `<div class="explain-item good"><h4>No código corrigido</h4><p>${e(x.corrigido)}</p></div>` : ""}
        </div>
        <details class="helpers"><summary>Código da ampliação <span class="mono">${e(part.file)}:${e(part.line)}</span></summary>${codeView(part.code, part.line, marked)}</details></div>`;
    }).join("")}</section>`;
}

function helpersBlock(test) {
  const helpers = state.testCatalog?.helpers || {};
  const used = (test.helpers || []).filter((name) => helpers[name]);
  const base = state.testCatalog?.guide?.base;
  const reading = base ? `<details class="helpers"><summary>Como ler o código destes testes (base comum)</summary><ul class="how-steps">${base.itens.map((item) => `<li>${e(item)}</li>`).join("")}</ul></details>` : "";
  if (!used.length) return reading;
  return `${reading}<details class="helpers"><summary>Funções auxiliares usadas (tests/conftest.py): ${used.map((name) => `<code>${e(name)}</code>`).join(", ")}</summary>${used.map((name) => codeView(helpers[name])).join("")}</details>`;
}

function graphBlock(test) {
  const graphs = state.controlFlowGraphs || [];
  if (!graphs.length) return `<section class="detail-section"><h3>Grafos de fluxo</h3><div class="callout">${icon("info")}<div>Nenhum grafo analisado. Use Grafos estruturais → Analisar código.</div></div></section>`;
  const items = graphs.map((graph) => ({ graph, coverage: structuralCoverageForCase(state, graph, test.id) }));
  const ratio = (item) => item.coverage.coveredNodeIds.length / Math.max(1, item.graph.nodes.length);
  // Abre no grafo da funcionalidade do caso; sem cobertura nele, no grafo mais percorrido.
  const own = items.find((item) => item.graph.requirementId === test.requirementId && item.coverage.coveredNodeIds.length);
  const best = own || [...items].sort((a, b) => ratio(b) - ratio(a))[0];
  const current = items.find((item) => item.graph.id === detailGraphId) || best;
  const { graph, coverage } = current;
  const savedSelection = graphSelection;
  const savedMode = graphViewMode;
  graphSelection = nodeDrawer?.context === "detail" && nodeDrawer.graphId === graph.id ? { kind: "node", id: nodeDrawer.nodeId } : null;
  graphViewMode = "coverage";
  const svg = controlFlowSvg(graph, {
    targetNodes: new Set(), targetEdges: new Set(), targetPaths: new Set(),
    coveredNodes: new Set(coverage.coveredNodeIds), coveredEdges: new Set(coverage.coveredEdgeIds), coveredPaths: new Set(coverage.coveredPathIds),
    selectedPathNodes: new Set(), selectedPathEdges: new Set()
  }).replaceAll('data-action="select-graph-element" data-kind="node"', 'data-action="detail-node"')
    .replaceAll('data-action="select-graph-element"', "");
  graphSelection = savedSelection;
  graphViewMode = savedMode;
  const req = state.requirements.find((item) => item.id === graph.requirementId);
  return `<section class="detail-section"><h3>Grafo de fluxo percorrido por este teste</h3><p class="detail-hint">Nós e arestas em verde foram executados por ${e(test.id)} (no código corrigido). <strong>Clique em um nó</strong> para abrir, ao lado, o que ele faz e o trecho do código. Escolha a função:</p>
    <div class="graph-tabs">${items.map((item) => `<button class="graph-tab ${item.graph.id === graph.id ? "active" : ""}" data-action="detail-graph" data-id="${e(item.graph.id)}"><strong>${e(item.graph.method.split(".").pop())}</strong><span>${item.coverage.coveredNodeIds.length}/${item.graph.nodes.length} nós</span></button>`).join("")}</div>
    <div class="detail-graph"><div class="graph-legend"><span><i class="legend-swatch covered"></i>Executado por ${e(test.id)}</span><span><i class="legend-swatch default"></i>Não executado</span><span>${e(graph.id)} · ${e(req?.title || graph.requirementId)} · ${e(graph.file)}:${e(graph.line)}-${e(graph.endLine)}</span></div><div class="cfg-scroll">${svg}</div>
      <div class="graph-coverage-strip detail-strip"><div><strong>${e(graph.method)}</strong><span>Complexidade ciclomática ${e(graph.metrics?.cyclomaticComplexity || 1)}</span></div><div class="coverage-chip"><strong>${coverage.coveredNodeIds.length}/${graph.nodes.length}</strong><span>nós</span></div><div class="coverage-chip"><strong>${coverage.coveredEdgeIds.length}/${graph.edges.length}</strong><span>arestas</span></div><div class="coverage-chip"><strong>${coverage.coveredPathIds.length}/${graph.paths.length}</strong><span>caminhos</span></div><div class="coverage-chip"><strong>${coverage.coveredLines.length}</strong><span>linhas</span></div></div></div>
  </section>`;
}

/** Painel lateral com a explicação e o código de um nó; não redesenha a página nem mexe na rolagem. */
function showNodeDrawer(graphId, nodeId, context) {
  const graph = (state.controlFlowGraphs || []).find((item) => item.id === graphId);
  const node = graph?.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  nodeDrawer = { graphId, nodeId, context };
  const testId = context === "detail" ? detail?.id : selectedGraphCaseId;
  const coverage = testId ? structuralCoverageForCase(state, graph, testId) : null;
  let root = document.getElementById("node-drawer");
  if (!root) {
    root = document.createElement("div");
    root.id = "node-drawer";
    document.body.append(root);
  }
  root.innerHTML = nodeDrawerHtml(graph, node, testId, coverage);
  // Abrir o painel estreita o modal; a rolagem é compensada para o nó clicado não sair do lugar.
  const anchor = document.querySelector(`svg[data-graph="${graphId}"] .cfg-node[data-id="${nodeId}"]`);
  const before = anchor?.getBoundingClientRect().top;
  document.body.classList.add("node-drawer-open");
  document.body.classList.toggle("node-drawer-detail", context === "detail");
  const scroller = anchor?.closest(".modal");
  if (scroller && before != null) scroller.scrollTop += anchor.getBoundingClientRect().top - before;
  document.querySelectorAll(`svg[data-graph="${graphId}"] .cfg-node`).forEach((element) => element.classList.toggle("selected", element.dataset.id === nodeId));
  if (context === "page") graphSelection = { kind: "node", id: nodeId };
}

function closeNodeDrawer() {
  if (!nodeDrawer) return;
  document.querySelectorAll(`svg[data-graph="${nodeDrawer.graphId}"] .cfg-node.selected`).forEach((element) => element.classList.remove("selected"));
  if (nodeDrawer.context === "page" && graphSelection?.kind === "node") graphSelection = null;
  nodeDrawer = null;
  const root = document.getElementById("node-drawer");
  if (root) root.innerHTML = "";
  document.body.classList.remove("node-drawer-open", "node-drawer-detail");
}

function nodeDrawerHtml(graph, node, testId, coverage) {
  const plain = nodeText(graph, node);
  const executed = coverage?.coveredNodeIds.includes(node.id);
  const source = state.testCatalog?.graphSources?.[graph.id];
  const first = Number(node.line);
  const last = ["decision", "loop"].includes(node.type) ? first : Number(node.endLine || node.line);
  const marked = ["entry", "exit"].includes(node.type) ? new Set() : new Set(Array.from({ length: last - first + 1 }, (_, index) => first + index));
  const exits = graph.edges.filter((edge) => edge.from === node.id).map((edge) => {
    const to = graph.nodes.find((item) => item.id === edge.to);
    return `<button class="drawer-exit" data-action="drawer-node" data-graph="${e(graph.id)}" data-id="${e(to.id)}"><span class="tag">${e(EDGE_TEXT[edge.label] || edge.label || "Segue")}</span><span>→ ${e(to.id)} · ${e(nodeText(graph, to)?.short || to.label)}</span></button>`;
  }).join("");
  return `<aside class="node-drawer" role="dialog" aria-label="Nó ${e(node.id)}">
    <div class="node-drawer-head"><div><span class="inspector-kicker">${e(NODE_KIND[node.type] || node.type)} · ${e(node.id)} · linha ${e(node.line)}</span><h3>${e(plain?.short || node.label)}</h3><span class="sub-cell mono">${e(graph.method)}</span></div><button type="button" class="icon-btn" data-action="close-node-drawer" title="Fechar (Esc)">${icon("close")}</button></div>
    <div class="node-drawer-body">
      ${testId ? (executed ? `<span class="badge badge-green">Executado por ${e(testId)}</span>` : `<span class="badge badge-gray">Não executado por ${e(testId)}</span>`) : ""}
      <p class="drawer-text">${e(plain?.text || node.label)}</p>
      <h4>Trecho do código</h4>
      ${nodeCode(graph, node, 4) || `<p class="detail-hint">Nó de ${node.type === "entry" ? "início" : "fim"} da função: não corresponde a uma linha específica.</p>`}
      ${source ? `<details class="helpers"><summary>Ver a função inteira (${e(graph.method.split(".").pop())})</summary>${codeView(source.lines.join("\n"), source.start, marked)}</details>` : ""}
      ${exits ? `<h4>Para onde o fluxo segue</h4><div class="drawer-exits">${exits}</div>` : ""}
    </div>
  </aside>`;
}

function diffBlock(m) {
  return `<div class="diff-block"><div class="del"><span>−</span>${e(m.original)}</div><div class="add"><span>+</span>${e(m.mutated)}</div></div>`;
}

// ------------------------------------------------------------ detalhe de um defeito: onde acontecia e quando foi corrigido

const defectInfo = (id) => state.testCatalog?.defects?.[id] || null;

/** Texto do relatório com `código` e **negrito** (o resto é escapado). */
function richText(text) {
  return e(text).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function commitLink(commit, label = commit.hash) {
  const fork = state.testCatalog?.characterization?.links?.fork || "https://github.com/gabrielfjm/Hotel_Management_System";
  return `<a class="commit-link" href="${e(fork)}/commit/${e(commit.full)}" target="_blank" rel="noopener noreferrer"><code>${e(label)}</code></a>`;
}

const STAGE_NAME = { funcional: "Etapa 1 · Teste funcional", estrutural: "Etapa 2 · Teste estrutural" };

function defectDetail(id) {
  const defect = state.defects.find((item) => item.id === id);
  const info = defectInfo(id);
  if (!defect || !info) return null;
  const test = findTest(info.revealed.caseId);
  // Revelado pela parte funcional do caso: usa a descrição em linguagem simples do próprio caso.
  const plainScenario = info.revealed.stage === "funcional" && test;
  const block = (lines, start, marked) => codeView(lines.join("\n"), start, new Set(marked));
  const event = (kind, title, when, text) => `<li class="tl-${kind}"><span class="tl-dot"></span><div><strong>${title}</strong><span class="tl-when">${when}</span><p>${text}</p></div></li>`;
  return {
    kicker: `Defeito · revelado pelo ${e(info.revealed.caseId)} · corrigido em ${info.fixedBy.map((commit) => e(commit.hash)).join(" e ")}`,
    title: `${e(defect.id)} · ${e(defect.title)}`,
    subtitle: "Onde o erro estava no código original, como ficou depois da correção e quando cada coisa aconteceu.",
    body: `<div class="detail-badges">${badge(defect.severity)}<span class="badge badge-green">Corrigido</span><span class="tag">Função ${e(info.function)}</span></div>
      <section class="detail-section explain"><div class="explain-summary">${icon("bug")}<div><span>O que acontecia</span><strong>${e(defect.description)}</strong></div></div></section>

      <section class="detail-section"><h3>Linha do tempo</h3><ol class="timeline">
        ${event("found", `Revelado na ${STAGE_NAME[info.revealed.stage] || info.revealed.stage}`, `${e(info.revealed.commit.date)} · commit ${commitLink(info.revealed.commit)}`, `O caso <button class="link-btn" data-action="open-test" data-id="${e(info.revealed.caseId)}">${e(info.revealed.caseId)}${test ? ` · ${e(test.title)}` : ""}</button> falhou no código original. O teste foi marcado como falha esperada, para provar que o defeito existia.`)}
        ${info.fixedBy.map((commit) => event("fixed", "Corrigido no fork", `${e(commit.date)} · commit ${commitLink(commit)}`, `“${e(commit.message)}”. ${e(defect.correction.replace(/\s*\(commit [0-9a-f]+\)\.?$/, "."))}`)).join("")}
        ${event("ok", "Confirmado", "na suíte do código corrigido", `O mesmo ${e(info.revealed.caseId)} agora passa no código corrigido, sem nenhuma mudança no teste.`)}
        ${event("mut", "Depois, o teste de mutação", `${e(info.mutationAfter.date)} · commit ${commitLink(info.mutationAfter)}`, "A mutação só começou com todos os defeitos corrigidos: os mutantes são gerados a partir do código já sem erros.")}
      </ol></section>

      <section class="detail-section"><h3>O cenário que revelou o defeito</h3><div class="table-wrap"><table class="io-table scenario-table"><thead><tr><th>Entrada</th><th>Resultado esperado</th><th>Obtido no original</th><th>Obtido no corrigido</th></tr></thead><tbody><tr>${plainScenario ? `<td>${e(test.input)}</td><td>${e(test.expected)}</td><td class="txt-red">${e(test.original?.obtained)}</td>` : `<td>${richText(info.input)}</td><td>${richText(info.expected)}</td><td class="txt-red">${richText(info.obtained)}</td>`}<td>Igual ao esperado</td></tr></tbody></table></div>${plainScenario ? "" : `<p class="detail-hint" style="margin-top:8px">Cenário da ampliação do ${e(info.revealed.caseId)} feita na etapa estrutural.</p>`}</section>

      <section class="detail-section"><h3>Onde acontecia <span class="mono sub">hotel/views.py original · ${e(info.function)}, linha${info.original.marked.length > 1 ? "s" : ""} ${e(info.where.split(";").find((part) => part.includes(`\`${info.function}\``))?.split("`").at(-1).trim() || info.original.marked.join(", "))}</span></h3>
        <p class="detail-hint">Trecho do código original (tag sut-original). As linhas destacadas são as que causam o erro.</p>
        ${block(info.original.lines, info.original.start, info.original.marked)}
        <div class="cause-box"><span>Causa no código</span><p>${richText(info.cause)}</p></div></section>

      <section class="detail-section"><h3>Como ficou depois da correção <span class="mono sub">hotel/views.py corrigido</span></h3>
        <p class="detail-hint">Trecho do código corrigido. A linha destacada é o comentário que identifica a correção deste defeito.</p>
        ${info.corrected.map((item) => `<div class="fix-block"><span class="fix-label">${e(item.function)} · linha ${e(item.start)}</span>${block(item.lines, item.start, item.marked)}</div>`).join("")}
        <div class="cause-box fix"><span>Correção</span><p>${richText(info.fix)}</p></div></section>`
  };
}

function mutantDetail(id) {
  const m = mutationData().mutants.find((item) => item.id === id);
  if (!m) return null;
  const killer = (testId) => testId ? `<button class="trace-link" data-action="open-test" data-id="${e(testId)}"><span class="tag">${e(testId)}</span> ${e(findTest(testId)?.title || "")}</button>` : "—";
  const mutation = mutationData();
  return {
    kicker: `Mutante${m.survivorTag ? ` · sobrevivente ${e(m.survivorTag)} da rodada inicial` : ""}`,
    title: `${e(m.id)} · ${e(m.function)}, linha ${e(m.line)}`,
    subtitle: `${e(m.operatorFamily)} · <span class="mono">${e(m.operator)}</span> (ocorrência ${e(m.occurrence)})`,
    body: `<section class="detail-section"><h3>O que foi alterado no código</h3><p class="detail-hint">O Cosmic Ray trocou a linha original (−) pela mutada (+) em hotel/views.py e rodou a suíte inteira. Se algum teste falha, o mutante está morto.</p>${diffBlock(m)}</section>
      <section class="detail-section"><h3>Resultado nas duas rodadas</h3><div class="table-wrap"><table class="io-table"><thead><tr><th>Rodada</th><th>Suíte</th><th>Resultado</th><th>Morto por</th></tr></thead><tbody>
        <tr><td>Inicial</td><td>${e(mutation.runs[0]?.suite || "")}</td><td>${resultBadge(m.initial)}</td><td>${killer(m.initialKilledBy)}</td></tr>
        <tr><td>Final</td><td>${e(mutation.runs.at(-1)?.suite || "")}</td><td>${resultBadge(m.final)}</td><td>${killer(m.killedBy)}</td></tr>
      </tbody></table></div>${m.error ? `<p class="detail-hint" style="margin-top:10px">Erro que o teste acusou:</p><code class="evidence">${e(m.error)}</code>` : ""}</section>
      ${m.classification ? `<section class="detail-section"><h3>Análise do sobrevivente</h3><div class="classification ${m.classification === "Equivalente" ? "eq" : "neq"}">${resultBadge(m.classification)}<p>${e(m.justification)}</p></div></section>` : ""}`
  };
}

function metricCard(label, value, detail, ico, accent, soft) {
  return `<div class="metric-card" style="--accent:${accent};--accent-soft:${soft}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(ico)}</span></div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></div>`;
}

function progress(label, value, color) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return `<div class="progress-row"><div class="progress-meta"><span>${label}</span><strong>${safe}%</strong></div><div class="progress-track"><div class="progress-bar" style="width:${safe}%;--bar:${color}"></div></div></div>`;
}

function traceAlerts() {
  const noCases = state.requirements.filter((r) => !state.testCases.some((c) => c.requirementId === r.id));
  const notExecuted = state.testCases.filter((c) => !state.executions.some((x) => x.testCaseId === c.id));
  const failuresNoDefect = state.executions.filter((x) => x.result === "Falhou" && !state.defects.some((d) => defectCoversCase(d, x.testCaseId)));
  const alerts = [
    [noCases.length, "requisito(s) ainda sem caso de teste", "requirement"],
    [notExecuted.length, "caso(s) ainda não executado(s)", "play"],
    [failuresNoDefect.length, "falha(s) sem defeito registrado", "bug"]
  ];
  if (alerts.every(([count]) => !count)) return `<div class="callout">${icon("shield")}<div><strong>Rastreabilidade completa.</strong><br>Não há lacunas detectadas no fluxo atual.</div></div>`;
  return `<div class="requirement-cards">${alerts.filter(([count]) => count).map(([count, text, ico]) => `<div class="requirement-card"><div class="metric-icon">${icon(ico)}</div><div><div class="req-title">${count} ${text}</div><div class="req-desc">Abra a matriz para identificar os itens.</div></div></div>`).join("")}</div>`;
}

function requirementsPage() {
  const limitReached = state.requirements.length >= MAX_PRIMARY_FEATURES;
  return `${pageHead("Escopo funcional", "Três funcionalidades principais", "Defina somente as três funcionalidades ou métodos centrais que serão testados nas três etapas.", `<button class="btn btn-primary ${limitReached ? "btn-limit" : ""}" data-action="open-requirement" aria-disabled="${limitReached}">${icon(limitReached ? "shield" : "plus")}${limitReached ? `Escopo completo (${state.requirements.length}/${MAX_PRIMARY_FEATURES})` : `Adicionar funcionalidade (${state.requirements.length}/${MAX_PRIMARY_FEATURES})`}</button>`)}
    <div class="callout scope-callout">${icon("info")}<div><strong>Recorte obrigatório do projeto:</strong> classes de equivalência, valores-limite, testes estruturais e mutantes serão criados apenas para estas três funcionalidades. Edite os exemplos abaixo para representar o software escolhido.</div></div>
    ${filterToolbar("requirement-list", "Buscar por ID, título ou descrição...", [
      { key: "priority", label: "Todas as prioridades", options: ["Alta", "Média", "Baixa"] },
      { key: "status", label: "Todos os status", options: ["Em análise", "Aprovado", "Rascunho"] }
    ])}
    <section class="panel"><div class="panel-body"><div class="requirement-cards filter-scope" id="requirement-list">
      ${state.requirements.length ? state.requirements.map(requirementCard).join("") : emptyState("Nenhum requisito cadastrado", "Comece descrevendo uma funcionalidade observável do software.")}
    </div><div class="filter-empty" hidden>Nenhum requisito corresponde aos filtros.</div></div></section>`;
}

function requirementCard(req) {
  const classCount = state.classes.filter((x) => x.requirementId === req.id).length;
  const caseCount = state.testCases.filter((x) => x.requirementId === req.id).length;
  return `<article class="requirement-card filter-item" data-query="${e(`${req.id} ${req.title} ${req.method || ""} ${req.description}`.toLowerCase())}" data-priority="${e(req.priority)}" data-status="${e(req.status)}">
    <div class="req-index">${e(req.id)}</div><div><div class="req-title">${e(req.title)}</div>${req.method ? `<div class="method-ref">${e(req.method)}</div>` : ""}<div class="req-desc">${e(req.description)}</div><div class="req-links"><span class="tag">${classCount} classes</span><span class="tag">${caseCount} casos</span>${badge(req.status)}</div></div>
    <div><button class="icon-btn" title="Editar" data-action="edit-requirement" data-id="${req.id}">${icon("edit")}</button></div>
  </article>`;
}

function casesPage() {
  return `${pageHead("Teste funcional", "Cenários e casos de teste", "Classes de equivalência e análise de valor limite ligadas aos requisitos.", `<button class="btn" data-action="open-class">${icon("plus")}Nova classe</button> <button class="btn btn-primary" data-action="open-generator">${icon("spark")}Gerar por limites</button>`)}
    <div class="phase-cards">
      <div class="phase-card current"><div class="phase-number">Artefato 01</div><h3>Classes de equivalência</h3><p>Partições válidas e inválidas do domínio de entrada.</p><span class="tag">${state.classes.length} cadastradas</span></div>
      <div class="phase-card"><div class="phase-number">Artefato 02</div><h3>Valores-limite</h3><p>Casos nos pontos abaixo, sobre e acima dos limites.</p><span class="tag">${state.testCases.filter((x) => x.technique === "AVL").length} casos AVL</span></div>
      <div class="phase-card"><div class="phase-number">Artefato 03</div><h3>Casos executáveis</h3><p>Pré-condição, passos, dados e resultado esperado.</p><span class="tag">${state.testCases.length} casos totais</span></div>
    </div>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Tabela de casos de teste</h2><div class="panel-subtitle">Formato solicitado com cenário válido e inválido</div></div><button class="btn btn-small" data-action="export-csv">${icon("download")}CSV</button></div>
      <div style="padding:14px 16px 0">${filterToolbar("case-table", "Buscar por ID, entrada, requisito ou cenário...", [
        { key: "validity", label: "Todos os cenários", options: ["Válido", "Inválido"] },
        { key: "technique", label: "Todas as técnicas", options: ["CE", "AVL", "Estrutural", "Mutação"] },
        { key: "requirement", label: "Todos os requisitos", options: state.requirements.map((r) => ({ value: r.id, label: `${r.id} — ${r.title}` })) }
      ], `<button class="btn btn-small btn-primary" data-action="open-case">${icon("plus")}Adicionar</button>`)}</div>
      <div class="table-wrap filter-scope" id="case-table">${caseTable()}<div class="filter-empty" hidden>Nenhum caso corresponde aos filtros.</div></div>
    </section>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Classes de equivalência</h2><div class="panel-subtitle">Partições que originam os casos</div></div></div><div style="padding:14px 16px 0">${filterToolbar("class-table", "Buscar por ID, classe ou condição...", [
      { key: "type", label: "Todos os tipos", options: ["Válida", "Inválida"] },
      { key: "requirement", label: "Todos os requisitos", options: state.requirements.map((r) => ({ value: r.id, label: `${r.id} — ${r.title}` })) }
    ])}</div><div class="table-wrap filter-scope" id="class-table">${classTable()}<div class="filter-empty" hidden>Nenhuma classe corresponde aos filtros.</div></div></section>`;
}

function caseTable() {
  if (!state.testCases.length) return emptyState("Nenhum caso de teste", "Cadastre manualmente ou use o gerador por limites.");
  const techniqueName = { CE: "Classe de equivalência", AVL: "Valor limite", Estrutural: "Estrutural", "Mutação": "Mutação" };
  return `<table class="click-table"><thead><tr><th>ID do caso</th><th>Condição de entrada</th><th>Classe referida / cenário</th><th>Técnica e por quê</th><th>Cenário válido</th><th>Cenários inválidos</th><th>Esperado</th><th></th></tr></thead><tbody>
    ${state.testCases.map((tc) => {
      const cls = state.classes.find((x) => x.id === tc.classId);
      const req = state.requirements.find((x) => x.id === tc.requirementId);
      // O "por que este teste existe" do estudo explica a técnica: o limite usado (AVL) ou a classe testada (CE).
      const why = findTest(tc.id)?.explanation?.porque || "";
      const opens = findTest(tc.id) ? `data-action="open-test" data-id="${e(tc.id)}"` : "";
      return `<tr class="filter-item ${opens ? "clickable" : ""}" ${opens} data-query="${e(`${tc.id} ${tc.input} ${tc.title} ${cls?.name || ""} ${req?.title || ""} ${why}`.toLowerCase())}" data-validity="${e(tc.validity)}" data-technique="${e(tc.technique)}" data-requirement="${e(tc.requirementId)}"><td class="id-cell">${e(tc.id)}</td><td class="main-cell">${e(tc.input)}<div class="sub-cell">${e(tc.precondition)}</div></td><td><strong>${e(cls?.name || "Sem classe")}</strong><div class="sub-cell">${e(cls?.condition || "—")} · ${e(req?.id || "—")}</div></td><td class="why-cell"><span class="tech-badge tech-${e(tc.technique)}">${e(techniqueName[tc.technique] || tc.technique)}</span>${why ? `<div class="sub-cell">${e(why)}</div>` : ""}</td><td>${tc.validity === "Válido" ? `<strong>${e(tc.title)}</strong><div class="sub-cell">${e(tc.steps.join(" → "))}</div>` : "—"}</td><td>${tc.validity === "Inválido" ? `<strong>${e(tc.title)}</strong><div class="sub-cell">${e(tc.steps.join(" → "))}</div>` : "—"}</td><td>${e(tc.expected)}</td><td class="actions-cell"><button class="icon-btn" title="Editar" data-action="edit-case" data-id="${tc.id}">${icon("edit")}</button></td></tr>`;
    }).join("")}
  </tbody></table>`;
}

function classTable() {
  if (!state.classes.length) return emptyState("Nenhuma classe", "Crie partições válidas e inválidas para as entradas.");
  return `<table><thead><tr><th>ID</th><th>Requisito</th><th>Classe</th><th>Condição</th><th>Tipo</th><th>Limites</th><th></th></tr></thead><tbody>${state.classes.map((cls) => {
    const req = state.requirements.find((x) => x.id === cls.requirementId);
    return `<tr class="filter-item" data-query="${e(`${cls.id} ${cls.name} ${cls.condition} ${req?.title || ""}`.toLowerCase())}" data-type="${e(cls.type)}" data-requirement="${e(cls.requirementId)}"><td class="id-cell">${e(cls.id)}</td><td>${e(req?.id || "—")}</td><td class="main-cell">${e(cls.name)}</td><td>${e(cls.condition)}</td><td>${badge(cls.type)}</td><td>${cls.min != null || cls.max != null ? `${cls.min ?? "−∞"} a ${cls.max ?? "+∞"}` : "—"}</td><td class="actions-cell"><button class="icon-btn" data-action="edit-class" data-id="${cls.id}">${icon("edit")}</button></td></tr>`;
  }).join("")}</tbody></table>`;
}

function structuralPage() {
  const graphs = state.controlFlowGraphs || [];
  if (!graphs.some((graph) => graph.id === selectedGraphId)) selectedGraphId = graphs[0]?.id || "";
  const graph = graphs.find((item) => item.id === selectedGraphId) || null;
  const graphCases = graph ? state.testCases.filter((item) => item.requirementId === graph.requirementId) : [];
  if (!graphCases.some((item) => item.id === selectedGraphCaseId)) selectedGraphCaseId = graphCases[0]?.id || "";
  const testCase = graphCases.find((item) => item.id === selectedGraphCaseId) || null;
  const coverage = graph && testCase ? structuralCoverageForCase(state, graph, testCase.id) : null;
  const summary = structuralSummary(state);
  const analysis = state.graphAnalysis;
  const unresolved = analysis?.unresolved || [];
  const warnings = analysis?.warnings || [];

  return `${pageHead("Teste estrutural", "Grafos de fluxo do código", "Visualize automaticamente nós, arestas e caminhos simples livres de laço e acompanhe sua cobertura por caso funcional, estrutural ou de mutação.", `<button class="btn" data-route="integration">${icon("link")}Configurar ponte</button> <button class="btn btn-primary" data-action="analyze-graphs">${icon("spark")}Analisar código</button>`) }
    <div class="callout scope-callout">${icon("info")}<div><strong>Critério confirmado na descrição do projeto:</strong> a etapa estrutural deve reaproveitar os testes funcionais e adicionar casos para atingir cobertura de nós, arcos e caminhos. A análise usa a AST do Python e não importa nem executa o código do repositório.</div></div>
    <div class="metric-grid">
      ${metricCard("Grafos analisados", summary.graphs, `${analysis?.filesScanned || 0} arquivos examinados`, "graph", "#6756e8", "#efedff")}
      ${metricCard("Nós", summary.nodes, `${summary.coveredCases} casos com contexto`, "trace", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Arestas", summary.edges, "cobertura inferida por teste", "link", "#df8b2d", "#fff3df")}
      ${metricCard("Caminhos simples", summary.paths, "livres de laço", "cases", "#d95555", "#fdecec")}
    </div>
    ${unresolved.length || warnings.length ? `<div class="callout integrity-warning">${icon("warning")}<div><strong>A análise requer atenção.</strong><br>${[
      ...unresolved.map((item) => `${item.requirementId}: ${item.reason}${item.method ? ` (${item.method})` : ""}`),
      ...warnings.map((item) => item.message)
    ].map(e).join("; ")}</div></div>` : ""}
    ${graph ? structuralExplorer(graph, testCase, coverage) : `<section class="panel"><div class="panel-body">${emptyState("Nenhum grafo analisado", "Preencha Método/função nos três requisitos, inicie a ponte local e clique em Analisar código.")}</div></section>`}
    ${graphs.length ? structuralCatalog(graphs) : ""}`;
}

function structuralExplorer(graph, testCase, coverage) {
  const req = state.requirements.find((item) => item.id === graph.requirementId);
  const graphCases = state.testCases.filter((item) => item.requirementId === graph.requirementId);
  const targetNodes = new Set(testCase?.targetNodeIds || []);
  const targetEdges = new Set(testCase?.targetEdgeIds || []);
  const targetPaths = new Set(testCase?.targetPathIds || []);
  const coveredNodes = new Set(coverage?.coveredNodeIds || []);
  const coveredEdges = new Set(coverage?.coveredEdgeIds || []);
  const coveredPaths = new Set(coverage?.coveredPathIds || []);
  const selectedPath = graphSelection?.kind === "path" ? graph.paths.find((item) => item.id === graphSelection.id) : null;
  const selectedPathNodes = new Set(selectedPath?.nodeIds || []);
  const selectedPathEdges = new Set(selectedPath?.edgeIds || []);

  return `<section class="panel graph-panel">
    <div class="panel-head"><div><h2 class="panel-title">${e(graph.id)} · ${e(req?.title || graph.requirementId)}</h2><div class="panel-subtitle">${e(graph.method)} · ${e(graph.file)}:${e(graph.line)}-${e(graph.endLine)}</div></div><div class="graph-actions"><span class="tag">Complexidade ${e(graph.metrics?.cyclomaticComplexity || 1)}</span><button class="btn btn-small btn-danger" data-action="delete-graph" data-id="${e(graph.id)}">${icon("trash")}Excluir grafo</button></div></div>
    <div class="graph-controls">
      <div class="field"><label>Função / grafo</label><select data-graph-control="graph">${state.controlFlowGraphs.map((item) => `<option value="${e(item.id)}" ${item.id === graph.id ? "selected" : ""}>${e(`${item.id} · ${item.method}`)}</option>`).join("")}</select></div>
      <div class="field"><label>Visualizar para o caso</label><select data-graph-control="case"><option value="">Sem caso (grafo completo)</option>${graphCases.map((item) => `<option value="${e(item.id)}" ${item.id === testCase?.id ? "selected" : ""}>${e(`${item.id} · ${item.technique} · ${item.title}`)}</option>`).join("")}</select></div>
      <div class="field"><label>Camada visual</label><select data-graph-control="mode"><option value="all" ${graphViewMode === "all" ? "selected" : ""}>Cobertura + planejamento</option><option value="coverage" ${graphViewMode === "coverage" ? "selected" : ""}>Somente cobertura executada</option><option value="targets" ${graphViewMode === "targets" ? "selected" : ""}>Somente alvos planejados</option></select></div>
    </div>
    <div class="graph-legend"><span><i class="legend-swatch default"></i>Não marcado</span><span><i class="legend-swatch target"></i>Alvo planejado</span><span><i class="legend-swatch covered"></i>Executado pelo teste</span><span><i class="legend-swatch selected"></i>Caminho selecionado</span></div>
    <div class="graph-workspace">
      <div class="cfg-scroll">${controlFlowSvg(graph, { targetNodes, targetEdges, targetPaths, coveredNodes, coveredEdges, coveredPaths, selectedPathNodes, selectedPathEdges })}</div>
      ${graphInspector(graph, testCase, coverage)}
    </div>
    <div class="graph-coverage-strip">
      <div><strong>${testCase ? `${e(testCase.id)} · ${e(testCase.technique)}` : "Grafo sem filtro de caso"}</strong><span>${testCase ? e(testCase.title) : "Selecione um caso para destacar sua cobertura e seus alvos."}</span></div>
      <div class="coverage-chip"><strong>${coveredNodes.size}/${graph.nodes.length}</strong><span>nós</span></div>
      <div class="coverage-chip"><strong>${coveredEdges.size}/${graph.edges.length}</strong><span>arestas*</span></div>
      <div class="coverage-chip"><strong>${coveredPaths.size}/${graph.paths.length}</strong><span>caminhos</span></div>
      <div class="coverage-chip"><strong>${targetNodes.size + targetEdges.size + targetPaths.size}</strong><span>alvos</span></div>
    </div>
    <div class="graph-note">* A cobertura de arestas por teste é inferida quando os dois nós da aresta aparecem no mesmo contexto do coverage.py. A cobertura global de desvios continua sendo a medida oficial do pytest-cov.</div>
    ${structuralPathsTable(graph, targetPaths, coveredPaths)}
  </section>
  <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Casos ligados a ${e(graph.id)}</h2><div class="panel-subtitle">Funcionais, estruturais e de mutação compartilham o grafo da mesma funcionalidade</div></div><button class="btn btn-small btn-primary" data-action="open-case">${icon("plus")}Novo caso</button></div>
    <div style="padding:14px 16px 0">${filterToolbar("structural-case-table", "Buscar caso, técnica, vínculo ou cobertura...", [
      { key: "technique", label: "Todas as técnicas", options: ["CE", "AVL", "Estrutural", "Mutação"] },
      { key: "coverage", label: "Toda cobertura", options: [{ value: "covered", label: "Com dados por teste" }, { value: "unmeasured", label: "Sem dados por teste" }] }
    ])}</div><div class="table-wrap filter-scope" id="structural-case-table">${structuralCasesTable(graph, graphCases)}<div class="filter-empty" hidden>Nenhum caso corresponde aos filtros.</div></div>
  </section>`;
}

function graphNodeDepths(graph) {
  const entry = graph.nodes.find((node) => node.type === "entry")?.id || graph.nodes[0]?.id;
  const depth = new Map(entry ? [[entry, 0]] : []);
  const queue = entry ? [entry] : [];
  while (queue.length) {
    const current = queue.shift();
    const nextDepth = (depth.get(current) || 0) + 1;
    for (const edge of graph.edges.filter((item) => item.from === current && item.kind !== "loop")) {
      if (!depth.has(edge.to)) {
        depth.set(edge.to, nextDepth);
        queue.push(edge.to);
      }
    }
  }
  let fallback = Math.max(0, ...depth.values()) + 1;
  for (const node of graph.nodes) if (!depth.has(node.id)) depth.set(node.id, fallback++);
  return depth;
}

function svgTextLines(value, width = 25) {
  const words = String(value || "").split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width && current) {
      lines.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, 2);
  if (lines.length > 2) visible[1] = `${visible[1].slice(0, Math.max(3, width - 3))}...`;
  return visible;
}

const EDGE_TEXT = { Verdadeiro: "Sim", Falso: "Não", Iterar: "Para cada item", Encerrar: "Acabaram os itens", "Próxima iteração": "Próximo item", Retorno: "Sai da função" };
const NODE_KIND = { entry: "Início da função", exit: "Fim da função", decision: "Decisão (if)", loop: "Repetição (for)", statement: "Comando", return: "Retorno (return)", raise: "Erro (raise)" };

function nodeText(graph, node) {
  return state.testCatalog?.graphText?.[graph.id]?.[node.id] || null;
}

/** Trecho do código-fonte de um nó, com as linhas do nó destacadas e duas de contexto. */
function nodeCode(graph, node, context = 2) {
  const source = state.testCatalog?.graphSources?.[graph.id];
  if (!source || ["entry", "exit"].includes(node.type)) return "";
  const first = Number(node.line);
  const last = ["decision", "loop"].includes(node.type) ? first : Number(node.endLine || node.line);
  const end = source.start + source.lines.length - 1;
  const from = Math.max(source.start, first - context);
  const to = Math.min(end, last + context);
  const marked = new Set(Array.from({ length: last - first + 1 }, (_, index) => first + index));
  return codeView(source.lines.slice(from - source.start, to - source.start + 1).join("\n"), from, marked);
}

function controlFlowSvg(graph, marks) {
  const depths = graphNodeDepths(graph);
  const levels = new Map();
  graph.nodes.forEach((node) => {
    const level = depths.get(node.id) || 0;
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  });
  const width = 960;
  const maxDepth = Math.max(0, ...depths.values());
  const height = Math.max(470, 110 + maxDepth * 118);
  const positions = new Map();
  for (const [level, nodes] of [...levels.entries()].sort((a, b) => a[0] - b[0])) {
    nodes.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
    nodes.forEach((node, index) => positions.set(node.id, {
      x: ((index + 1) * width) / (nodes.length + 1),
      y: 58 + level * 118
    }));
  }
  const selectedNode = graphSelection?.kind === "node" ? graphSelection.id : "";
  const selectedEdge = graphSelection?.kind === "edge" ? graphSelection.id : "";
  const edgeSvg = graph.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return "";
    const covered = marks.coveredEdges.has(edge.id);
    const targeted = marks.targetEdges.has(edge.id) || [...marks.targetPaths].some((pathId) => graph.paths.find((path) => path.id === pathId)?.edgeIds.includes(edge.id));
    const selected = selectedEdge === edge.id || marks.selectedPathEdges.has(edge.id);
    const visibleCovered = graphViewMode !== "targets" && covered;
    const visibleTargeted = graphViewMode !== "coverage" && targeted;
    const classes = ["cfg-edge", visibleCovered && "covered", visibleTargeted && "targeted", selected && "selected", edge.kind === "loop" && "loop"].filter(Boolean).join(" ");
    const startY = from.y + 32;
    const endY = to.y - 32;
    const path = to.y <= from.y
      ? `M ${from.x + 82} ${from.y} C ${width - 20} ${from.y}, ${width - 20} ${to.y}, ${to.x + 82} ${to.y}`
      : `M ${from.x} ${startY} C ${from.x} ${(startY + endY) / 2}, ${to.x} ${(startY + endY) / 2}, ${to.x} ${endY}`;
    const labelX = to.y <= from.y ? width - 95 : (from.x + to.x) / 2 + 7;
    const labelY = to.y <= from.y ? (from.y + to.y) / 2 : (startY + endY) / 2 - 4;
    return `<g class="${classes}" data-action="select-graph-element" data-kind="edge" data-id="${e(edge.id)}" role="button" tabindex="0"><path d="${path}"/><title>${e(`${edge.id} ${edge.label || "Fluxo"}`)}</title>${edge.label ? `<text x="${labelX}" y="${labelY}">${e(EDGE_TEXT[edge.label] || edge.label)}</text>` : ""}</g>`;
  }).join("");
  const nodeSvg = graph.nodes.map((node) => {
    const pos = positions.get(node.id);
    const covered = marks.coveredNodes.has(node.id);
    const targeted = marks.targetNodes.has(node.id) || [...marks.targetPaths].some((pathId) => graph.paths.find((path) => path.id === pathId)?.nodeIds.includes(node.id));
    const selected = selectedNode === node.id || marks.selectedPathNodes.has(node.id);
    const visibleCovered = graphViewMode !== "targets" && covered;
    const visibleTargeted = graphViewMode !== "coverage" && targeted;
    const classes = ["cfg-node", `type-${node.type}`, visibleCovered && "covered", visibleTargeted && "targeted", selected && "selected"].filter(Boolean).join(" ");
    const plain = nodeText(graph, node);
    const lines = svgTextLines(plain?.short || node.label);
    const shape = ["decision", "loop"].includes(node.type)
      ? `<polygon points="${pos.x},${pos.y - 38} ${pos.x + 96},${pos.y} ${pos.x},${pos.y + 38} ${pos.x - 96},${pos.y}"/>`
      : `<rect x="${pos.x - 91}" y="${pos.y - 32}" width="182" height="64" rx="${["entry", "exit"].includes(node.type) ? 30 : 10}"/>`;
    return `<g class="${classes}" data-action="select-graph-element" data-kind="node" data-id="${e(node.id)}" role="button" tabindex="0">${shape}<text class="node-id" x="${pos.x}" y="${pos.y - 9}">${e(node.id)} · linha ${e(node.line || "-")}</text>${lines.map((line, index) => `<text class="node-label" x="${pos.x}" y="${pos.y + 8 + index * 13}">${e(line)}</text>`).join("")}<title>${e(`${node.id} · ${plain?.text || node.label} · linha ${node.line}`)}</title></g>`;
  }).join("");
  return `<svg class="cfg-svg" data-graph="${e(graph.id)}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafo de fluxo de controle de ${e(graph.method)}"><defs><marker id="cfg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${edgeSvg}${nodeSvg}</svg>`;
}

function graphInspector(graph, testCase, coverage) {
  const kind = graphSelection?.kind;
  const item = kind === "node" ? graph.nodes.find((node) => node.id === graphSelection.id)
    : kind === "edge" ? graph.edges.find((edge) => edge.id === graphSelection.id)
      : kind === "path" ? graph.paths.find((path) => path.id === graphSelection.id) : null;
  if (!item) return `<aside class="graph-inspector"><div class="inspector-kicker">INSPECTOR</div><h3>Selecione um elemento</h3><p>Clique em um nó, aresta ou caminho para ver seus detalhes e os casos ligados.</p><div class="inspector-summary"><strong>${graph.nodes.length}</strong> nós<br><strong>${graph.edges.length}</strong> arestas<br><strong>${graph.paths.length}</strong> caminhos</div></aside>`;
  const covered = kind === "node" ? coverage?.coveredNodeIds.includes(item.id)
    : kind === "edge" ? coverage?.coveredEdgeIds.includes(item.id) : coverage?.coveredPathIds.includes(item.id);
  const targetedCases = state.testCases.filter((candidate) => {
    const ids = kind === "node" ? candidate.targetNodeIds : kind === "edge" ? candidate.targetEdgeIds : candidate.targetPathIds;
    return candidate.graphId === graph.id && (ids || []).includes(item.id);
  });
  const detail = kind === "node"
    ? `<dl><dt>Tipo</dt><dd>${e(NODE_KIND[item.type] || item.type)}</dd><dt>Linha</dt><dd>${e(item.line)}</dd><dt>O que faz</dt><dd>${e(nodeText(graph, item)?.text || item.label)}</dd></dl>${nodeCode(graph, item)}`
    : kind === "edge"
      ? `<dl><dt>Origem</dt><dd>${e(item.from)}</dd><dt>Destino</dt><dd>${e(item.to)}</dd><dt>Condição</dt><dd>${e(EDGE_TEXT[item.label] || item.label || "Segue direto")}</dd><dt>Tipo</dt><dd>${e(item.kind)}</dd></dl>`
      : `<dl><dt>Classificação</dt><dd>${e(item.kind)}</dd><dt>Nós</dt><dd>${e(item.nodeIds.join(" → "))}</dd><dt>Arestas</dt><dd>${e(item.edgeIds.join(", "))}</dd></dl>`;
  return `<aside class="graph-inspector"><div class="inspector-kicker">${e(kind === "node" ? "NÓ" : kind === "edge" ? "ARESTA" : "CAMINHO")}</div><h3>${e(item.id)}${kind === "node" && nodeText(graph, item) ? ` · ${e(nodeText(graph, item).short)}` : ""}</h3>${covered ? `<span class="badge badge-green">Executado pelo caso</span>` : badge("Não executado")}${detail}<h4>Casos que planejam cobrir</h4>${targetedCases.length ? targetedCases.map((candidate) => `<button class="trace-link inspector-case" data-action="edit-case" data-id="${e(candidate.id)}"><strong>${e(candidate.id)}</strong>${e(candidate.title)}</button>`).join("") : `<p>Nenhum alvo explícito. Edite um caso para planejar este elemento.</p>`}${testCase ? `<div class="inspector-run">Visualização atual: <strong>${e(testCase.id)}</strong>${coverage?.record ? `<br>Execução: ${e(coverage.record.runId)}` : "<br>Sem contexto de cobertura."}</div>` : ""}</aside>`;
}

function structuralPathsTable(graph, targetPaths, coveredPaths) {
  return `<div class="path-section"><div class="path-title"><strong>Caminhos simples livres de laço</strong><span>Clique em um caminho para destacá-lo no grafo.</span></div><div class="path-list">${graph.paths.map((path) => `<button class="path-card ${graphSelection?.kind === "path" && graphSelection.id === path.id ? "active" : ""}" data-action="select-graph-element" data-kind="path" data-id="${e(path.id)}"><strong>${e(path.id)}</strong><span>${e(path.nodeIds.join(" → "))}</span>${coveredPaths.has(path.id) ? badge("Aprovado") : targetPaths.has(path.id) ? `<span class="badge badge-purple">Planejado</span>` : badge("Não executado")}</button>`).join("")}</div></div>`;
}

function structuralCasesTable(graph, cases) {
  if (!cases.length) return emptyState("Nenhum caso ligado", "Crie um caso para a funcionalidade deste grafo.");
  return `<table><thead><tr><th>Caso</th><th>Técnica</th><th>Última execução</th><th>Nós</th><th>Arestas*</th><th>Caminhos</th><th>Alvos</th><th>Casos relacionados</th><th></th></tr></thead><tbody>${cases.map((testCase) => {
    const coverage = structuralCoverageForCase(state, graph, testCase.id);
    const execution = [...state.executions].reverse().find((item) => item.testCaseId === testCase.id);
    const hasCoverage = Boolean(coverage.record);
    const targetCount = (testCase.targetNodeIds || []).length + (testCase.targetEdgeIds || []).length + (testCase.targetPathIds || []).length;
    const related = (testCase.relatedCaseIds || []).join(", ") || "Mesmo requisito";
    const query = `${testCase.id} ${testCase.title} ${testCase.technique} ${related} ${coverage.record?.runId || ""}`.toLowerCase();
    return `<tr class="filter-item" data-query="${e(query)}" data-technique="${e(testCase.technique)}" data-coverage="${hasCoverage ? "covered" : "unmeasured"}"><td class="main-cell">${e(testCase.title)}<div class="sub-cell">${e(testCase.id)}</div></td><td><span class="tag">${e(testCase.technique)}</span></td><td>${execution ? badge(execution.result) : badge("Não executado")}</td><td><strong>${coverage.coveredNodeIds.length}/${graph.nodes.length}</strong></td><td>${coverage.coveredEdgeIds.length}/${graph.edges.length}</td><td>${coverage.coveredPathIds.length}/${graph.paths.length}</td><td>${targetCount || "—"}</td><td>${e(related)}</td><td class="actions-cell"><button class="icon-btn" data-action="view-case-graph" data-id="${e(testCase.id)}" title="Visualizar no grafo">${icon("graph")}</button><button class="icon-btn" data-action="edit-case" data-id="${e(testCase.id)}" title="Editar caso">${icon("edit")}</button></td></tr>`;
  }).join("")}</tbody></table>`;
}

function structuralCatalog(graphs) {
  return `<section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Catálogo de grafos analisados</h2><div class="panel-subtitle">Um grafo por funcionalidade principal</div></div></div><div style="padding:14px 16px 0">${filterToolbar("graph-catalog", "Buscar por grafo, requisito, método ou arquivo...", [
    { key: "requirement", label: "Todos os requisitos", options: state.requirements.map((item) => ({ value: item.id, label: `${item.id} — ${item.title}` })) }
  ])}</div><div class="table-wrap filter-scope" id="graph-catalog"><table><thead><tr><th>Grafo</th><th>Requisito</th><th>Método/função</th><th>Arquivo</th><th>Nós</th><th>Arestas</th><th>Caminhos</th><th>Complexidade</th><th>Analisado em</th></tr></thead><tbody>${graphs.map((graph) => `<tr class="filter-item graph-catalog-row" data-action="select-graph" data-id="${e(graph.id)}" data-query="${e(`${graph.id} ${graph.requirementId} ${graph.method} ${graph.file}`.toLowerCase())}" data-requirement="${e(graph.requirementId)}"><td class="id-cell">${e(graph.id)}</td><td>${e(graph.requirementId)}</td><td class="main-cell">${e(graph.method)}</td><td>${e(graph.file)}:${e(graph.line)}</td><td>${graph.nodes.length}</td><td>${graph.edges.length}</td><td>${graph.paths.length}${graph.metrics?.pathsTruncated ? "+" : ""}</td><td>${e(graph.metrics?.cyclomaticComplexity || 1)}</td><td>${e(graph.analyzedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(graph.analyzedAt)) : "—")}</td></tr>`).join("")}</tbody></table><div class="filter-empty" hidden>Nenhum grafo corresponde aos filtros.</div></div></section>`;
}

function traceabilityPage() {
  const rows = traceabilityRows(state);
  const complete = rows.filter((row) => row.testCase && row.graph && row.execution).length;
  const integrity = referenceErrors(state);
  return `${pageHead("Cobertura bidirecional", "Matriz de rastreabilidade", "Do requisito ao defeito — e do defeito de volta à necessidade que originou o teste.", `<button class="btn" data-action="export-json">${icon("download")}Backup JSON</button>`)}
    <div class="metric-grid">
      ${metricCard("Linhas rastreadas", rows.length, `${complete} com execução`, "link", "#6756e8", "#efedff")}
      ${metricCard("Requisitos", state.requirements.length, `${state.classes.length} classes associadas`, "requirement", "#1f9d8a", "#e6f7f3")}
      ${metricCard("Grafos e casos", state.controlFlowGraphs.length, `${state.testCases.length} casos · ${state.structuralCoverage.length} contextos`, "graph", "#df8b2d", "#fff3df")}
      ${metricCard("Defeitos", state.defects.length, `${state.defects.filter((x) => x.status === "Fechado").length} fechados`, "bug", "#d95555", "#fdecec")}
    </div>
    ${integrity.length ? `<div class="callout integrity-warning">${icon("warning")}<div><strong>${integrity.length} inconsistência(s) referencial(is)</strong><br>${integrity.map(e).join("; ")}</div></div>` : ""}
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">REQ → Classe → Caso → Grafo → Execução → Defeito</h2><div class="panel-subtitle">Células vazias revelam lacunas funcionais, estruturais ou de execução</div></div></div>
      <div style="padding:14px 16px 0">${filterToolbar("trace-table", "Buscar em toda a cadeia de rastreabilidade...", [
        { key: "requirement", label: "Todos os requisitos", options: state.requirements.map((r) => ({ value: r.id, label: `${r.id} — ${r.title}` })) },
        { key: "result", label: "Todos os resultados", options: ["Aprovado", "Falhou", "Bloqueado", "Não executado"] },
        { key: "link", label: "Todos os vínculos", options: [{ value: "complete", label: "Cadeia executada" }, { value: "gap", label: "Com lacunas" }, { value: "defect", label: "Com defeito" }] }
      ])}</div><div class="table-wrap filter-scope" id="trace-table"><div class="trace-grid trace-header"><div>Requisito</div><div>Classe</div><div>Caso de teste</div><div>Grafo estrutural</div><div>Última execução</div><div>Defeito</div></div>
      ${rows.map((row) => {
        const result = row.execution?.result || "Não executado";
        const link = row.defects.length ? "defect" : row.testCase && row.graph && row.execution ? "complete" : "gap";
        const query = [row.requirement?.id, row.requirement?.title, row.testClass?.id, row.testClass?.name, row.testCase?.id, row.testCase?.title, row.graph?.id, row.graph?.method, row.execution?.id, ...row.defects.flatMap((d) => [d.id, d.title])].filter(Boolean).join(" ").toLowerCase();
        return `<div class="trace-grid trace-row filter-item" data-query="${e(query)}" data-requirement="${e(row.requirement.id)}" data-result="${e(result)}" data-link="${link}"><div data-label="Requisito">${traceCell(row.requirement)}</div><div data-label="Classe">${traceCell(row.testClass)}</div><div data-label="Caso de teste">${traceCell(row.testCase)}</div><div data-label="Grafo estrutural">${graphTraceCell(row.graph, row.testCase)}</div><div data-label="Última execução">${row.execution ? `<button class="trace-link" data-action="edit-execution" data-id="${e(row.execution.id)}"><span class="trace-item"><small>${e(row.execution.id)}</small>${badge(row.execution.result)}</span></button>` : `<span class="missing">Não executado</span>`}</div><div data-label="Defeito">${row.defects.length ? row.defects.map((d) => `<button class="trace-link" data-action="edit-defect" data-id="${e(d.id)}"><span class="trace-item"><small>${e(d.id)}</small>${e(d.title)}</span></button>`).join("") : `<span class="missing">Sem defeito</span>`}</div></div>`;
      }).join("")}<div class="filter-empty" hidden>Nenhuma cadeia corresponde aos filtros.</div></div>
    </section>`;
}

function graphTraceCell(graph, testCase) {
  if (!graph) return `<span class="missing">Grafo não analisado</span>`;
  const coverage = testCase ? structuralCoverageForCase(state, graph, testCase.id) : null;
  return `<button class="trace-link" data-action="select-graph" data-id="${e(graph.id)}"><span class="trace-item"><small>${e(graph.id)}</small>${e(graph.method)}${testCase ? `<span class="sub-cell" style="display:block">${coverage?.coveredNodeIds.length || 0}/${graph.nodes.length} nós pelo caso</span>` : ""}</span></button>`;
}

function traceCell(item) {
  if (!item) return `<span class="missing">Vínculo ausente</span>`;
  const action = item.id.startsWith("REQ-") ? "edit-requirement" : item.id.startsWith("CE-") ? "edit-class" : "edit-case";
  return `<button class="trace-link" data-action="${action}" data-id="${e(item.id)}"><span class="trace-item"><small>${e(item.id)}</small>${e(item.title || item.name)}</span></button>`;
}

function executionPage() {
  return `${pageHead("Evolução incremental", "Execução e métricas", "Registre os resultados do pytest, coverage.py e mutmut/cosmic-ray a cada etapa.", `<button class="btn" data-action="open-metric">${icon("chart")}Registrar métrica</button> <button class="btn btn-primary" data-action="open-execution">${icon("play")}Nova execução</button>`)}
    <div class="phase-cards">${phaseOrder.map((phase, index) => `<div class="phase-card ${state.project.currentPhase === phase ? "current" : ""}"><div class="phase-number">Etapa ${index + 1}</div><h3>${phase}</h3><p>${["Classes de equivalência e análise do valor limite sem atenção ao código.", "Cobertura de nós/arcos e inclusão de casos para alcançar a meta.", "Mutação e novos casos para eliminar mutantes sobreviventes."][index]}</p><span class="tag">${["pytest", "coverage.py", "mutmut / cosmic-ray"][index]}</span></div>`).join("")}</div>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Evolução da cobertura</h2><div class="panel-subtitle">Tabela pronta para alimentar o relatório final</div></div></div><div style="padding:14px 16px 0">${filterToolbar("metrics-table", "Buscar métrica por etapa ou data...", [{ key: "phase", label: "Todas as etapas", options: phaseOrder }])}</div><div class="table-wrap filter-scope" id="metrics-table">${metricsTable()}<div class="filter-empty" hidden>Nenhuma métrica corresponde aos filtros.</div></div></section>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Histórico de execuções</h2><div class="panel-subtitle">Resultado real de cada caso</div></div></div><div style="padding:14px 16px 0">${filterToolbar("execution-table", "Buscar por ID, caso, ambiente ou evidência...", [
      { key: "result", label: "Todos os resultados", options: ["Aprovado", "Falhou", "Bloqueado"] },
      { key: "case", label: "Todos os casos", options: state.testCases.map((c) => ({ value: c.id, label: `${c.id} — ${c.title}` })) }
    ])}</div><div class="filter-scope" id="execution-table">${executionTable([...state.executions].reverse())}<div class="filter-empty" hidden>Nenhuma execução corresponde aos filtros.</div></div></section>`;
}

function metricsTable() {
  if (!state.metrics.length) return emptyState("Nenhuma métrica", "Registre o tamanho da suíte e a cobertura obtida em cada etapa.");
  return `<table><thead><tr><th>Etapa</th><th>Data</th><th>Tamanho da suíte</th><th>Instruções</th><th>Desvios</th><th>Mutantes mortos/total</th><th>Escore</th><th></th></tr></thead><tbody>${state.metrics.map((m) => {
    return `<tr class="filter-item" data-query="${e(`${m.id} ${m.phase} ${m.date} ${m.source || ""}`.toLowerCase())}" data-phase="${e(m.phase)}"><td class="main-cell">${e(m.phase)}<div class="sub-cell">${e(m.id)}${m.source ? ` · ${e(m.source)}` : ""}</div></td><td>${formatDate(m.date)}</td><td>${e(m.suiteSize)}</td><td><strong>${pct(m.statementCoverage)}</strong></td><td>${pct(m.branchCoverage)}</td><td>${m.mutantsTotal ? `${e(m.mutantsKilled)} / ${e(m.mutantsTotal)}` : "—"}</td><td>${m.mutantsTotal ? pct(Math.round((Number(m.mutantsKilled) / Number(m.mutantsTotal)) * 1000) / 10) : "—"}</td><td><button class="icon-btn" title="Editar métrica" data-action="edit-metric" data-id="${m.id}">${icon("edit")}</button></td></tr>`;
  }).join("")}</tbody></table>`;
}

function executionTable(items, compact = false) {
  if (!items.length) return emptyState("Nenhuma execução", "Execute um caso e registre o resultado observado.");
  return `<div class="table-wrap"><table><thead><tr><th>Execução</th><th>Caso</th>${compact ? "" : "<th>Ambiente</th>"}<th>Data</th><th>Resultado</th>${compact ? "" : "<th>Origem</th><th>Obtido</th><th></th>"}</tr></thead><tbody>${items.map((x) => {
    const tc = state.testCases.find((item) => item.id === x.testCaseId);
    return `<tr class="${compact ? "" : "filter-item"}" ${compact ? "" : `data-query="${e(`${x.id} ${tc?.title || ""} ${x.environment} ${x.actual} ${x.source || ""} ${x.sourceRunId || ""}`.toLowerCase())}" data-result="${e(x.result)}" data-case="${e(x.testCaseId)}"`}><td class="id-cell">${e(x.id)}</td><td class="main-cell">${e(tc?.title || x.testCaseId)}<div class="sub-cell">${e(x.testCaseId)}</div></td>${compact ? "" : `<td>${e(x.environment)}</td>`}<td>${formatDate(x.date)}</td><td>${badge(x.result)}</td>${compact ? "" : `<td>${x.source === "pytest" ? `<span class="tag">pytest</span><div class="sub-cell">${e(x.sourceRunId)}</div>` : `<span class="tag">manual</span>`}</td><td>${e(x.actual)}</td><td><button class="icon-btn" title="Editar execução" data-action="edit-execution" data-id="${x.id}">${icon("edit")}</button></td>`}</tr>`;
  }).join("")}</tbody></table></div>`;
}

function integrationPage() {
  const latest = state.syncHistory.at(-1);
  const latestMutation = state.mutationHistory.at(-1);
  const repo = state.project.localRepository || "C:\\caminho\\para\\seu-repositorio";
  const bridgeUrl = state.project.bridgeUrl || "http://127.0.0.1:8765";
  let bridgePort = "8765";
  try { bridgePort = new URL(bridgeUrl).port || "8765"; } catch { /* URL validada no formulário */ }
  const statusClass = bridgeStatus.state === "online" ? "green" : bridgeStatus.state === "running" ? "amber" : bridgeStatus.state === "offline" ? "red" : "gray";
  const mutationArgs = ` --mutation-tool ${state.project.mutationTool || "auto"} --cosmic-ray-config "${state.project.cosmicRayConfig || "cosmic-ray.toml"}"${state.project.cosmicRaySelector ? ` --cosmic-ray-selector "${state.project.cosmicRaySelector}"` : ""}${state.project.mutationPython ? ` --mutation-python "${state.project.mutationPython}"` : ""}`;
  const coverageFunctions = state.project.coverageFunctions?.trim() ? ` --cov-functions ${state.project.coverageFunctions.trim()}` : "";
  const command = `python integration/vv_bridge.py --repo "${repo}" --port ${bridgePort} --cov-source ${state.project.coverageSource || "."}${coverageFunctions}${mutationArgs} --pytest-args ${state.project.pytestArgs || "tests"}`;
  return `${pageHead("Automação local", "Integração com o repositório Python", "Execute pytest, coverage e teste de mutação no repositório autorizado.", `<button class="btn" data-action="check-bridge">${icon("link")}Verificar ponte</button> <button class="btn" data-action="run-mutation">${icon("bug")}Executar mutação</button> <button class="btn btn-primary" data-action="sync-repository">${icon("play")}Executar e sincronizar</button>`)}
    <div class="integration-status status-${statusClass}"><div class="status-light"></div><div><strong>${bridgeStatus.state === "online" ? "Ponte conectada" : bridgeStatus.state === "running" ? "Execução em andamento" : bridgeStatus.state === "offline" ? "Ponte indisponível" : "Aguardando conexão"}</strong><span>${e(bridgeStatus.message)}</span></div><code>${e(bridgeUrl)}</code></div>
    <div class="grid-equal">
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">1. Preparar o ambiente</h2><div class="panel-subtitle">Execute usando o Python do seu repositório</div></div></div><div class="panel-body">
        <p class="subtitle" style="margin-top:0">Instale pytest e pytest-cov no ambiente da aplicação. Cosmic Ray pode usar outro Python, indicado em Configurar:</p><pre class="code-block"><code>python -m pip install pytest pytest-cov
python -m pip install cosmic-ray</code></pre>
        <p class="subtitle">Na pasta do V&amp;V TestLab, inicie a ponte apontando para o repositório:</p><pre class="code-block"><code>${e(command)}</code></pre>
        <button class="btn btn-small" data-action="open-project">${icon("settings")}Configurar caminho e URL</button>
      </div></section>
      <section class="panel"><div class="panel-head"><div><h2 class="panel-title">2. Vincular os testes</h2><div class="panel-subtitle">Um marcador informa qual caso está sendo automatizado</div></div></div><div class="panel-body">
        <pre class="code-block"><code>import pytest

@pytest.mark.vv_case("CT-001")
def test_idade_minima():
    assert cadastrar(idade=18).sucesso</code></pre>
        <div class="callout">${icon("info")}<div>Alternativa sem marcador: inclua o ID no nome, por exemplo <code>test_CT_001_idade_minima</code>. O marcador é mais seguro.</div></div>
      </div></section>
    </div>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Mapeamento dos casos</h2><div class="panel-subtitle">Última execução encontrada para cada ID rastreável</div></div></div><div class="table-wrap"><table><thead><tr><th>Caso</th><th>Marcador pytest</th><th>Última execução</th><th>Resultado</th><th>Origem</th></tr></thead><tbody>
      ${state.testCases.map((tc) => {
        const execution = [...state.executions].reverse().find((item) => item.testCaseId === tc.id);
        return `<tr><td class="main-cell">${e(tc.title)}<div class="sub-cell">${e(tc.id)}</div></td><td><code class="inline-code">@pytest.mark.vv_case("${e(tc.id)}")</code></td><td>${execution ? `${e(execution.id)} · ${formatDate(execution.date)}` : "—"}</td><td>${execution ? badge(execution.result) : badge("Não executado")}</td><td>${execution?.source === "pytest" ? `<span class="tag">pytest automático</span>` : execution ? `<span class="tag">manual</span>` : "—"}</td></tr>`;
      }).join("")}
    </tbody></table></div></section>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Histórico de sincronizações</h2><div class="panel-subtitle">Auditoria das execuções importadas do repositório</div></div></div><div style="padding:14px 16px 0">${filterToolbar("sync-table", "Buscar por sincronização ou execução pytest...", [{ key: "status", label: "Todos os resultados", options: ["Concluída", "Concluída com falhas"] }])}</div><div class="table-wrap filter-scope" id="sync-table">${syncHistoryTable()}<div class="filter-empty" hidden>Nenhuma sincronização corresponde aos filtros.</div></div></section>
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Teste baseado em mutação</h2><div class="panel-subtitle">Mutmut ou Cosmic Ray, conforme a configuração da ponte</div></div><button class="btn btn-small btn-primary" data-action="run-mutation">${icon("bug")}Executar agora</button></div><div class="panel-body">${latestMutation ? `<div class="metric-grid" style="margin:0">${metricCard("Escore de mutação", `${e(latestMutation.score)}%`, `${e(latestMutation.killed)}/${e(latestMutation.total)} mutantes mortos`, "bug", "#d95555", "#fdecec")}${metricCard("Sobreviventes", e(latestMutation.survived), "lacunas para novos testes", "warning", "#df8b2d", "#fff3df")}${metricCard("Ferramenta", e(latestMutation.tool), e(latestMutation.runId), "settings", "#6756e8", "#efedff")}${metricCard("Duração", `${e(latestMutation.duration)}s`, formatDate(latestMutation.finishedAt), "chart", "#1f9d8a", "#e6f7f3")}</div>` : `<div class="callout">${icon("info")}<div>Execute a mutação após estabilizar os testes funcionais e atingir a meta estrutural. O resultado cria automaticamente uma métrica da etapa <strong>Baseado em defeitos</strong>.</div></div>`}</div><div class="table-wrap">${mutationHistoryTable()}</div></section>
    ${latest?.unmapped?.length ? `<section class="panel"><div class="panel-head"><h2 class="panel-title">Testes não vinculados na última execução</h2><span class="badge badge-amber">${latest.unmapped.length}</span></div><div class="panel-body"><div class="callout integrity-warning">${icon("warning")}<div>Adicione <code>@pytest.mark.vv_case("CT-xxx")</code> aos testes abaixo: ${latest.unmapped.map((item) => `<strong>${e(item.nodeId || "teste sem nome")}</strong>${item.detectedCaseId ? ` (detectado ${e(item.detectedCaseId)}, inexistente no sistema)` : ""}`).join("; ")}</div></div></div></section>` : ""}`;
}

function syncHistoryTable() {
  if (!state.syncHistory.length) return emptyState("Nenhuma sincronização", "Inicie a ponte local e execute os testes para criar o primeiro registro.");
  return `<table><thead><tr><th>Sincronização</th><th>Data/hora</th><th>Resultado</th><th>Vinculados</th><th>Não vinculados</th><th>Cobertura</th><th>Duração</th></tr></thead><tbody>${[...state.syncHistory].reverse().map((item) => `<tr class="filter-item" data-query="${e(`${item.id} ${item.runId}`.toLowerCase())}" data-status="${e(item.status)}"><td class="id-cell">${e(item.id)}<div class="sub-cell">${e(item.runId)}</div></td><td>${e(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.finishedAt)))}</td><td>${badge(item.status)}</td><td><strong>${e(item.mapped)}</strong></td><td>${e(item.unmapped?.length || 0)}</td><td>${item.coverage ? `${e(item.coverage.statementCoverage)}% linhas · ${e(item.coverage.branchCoverage)}% desvios` : "Não coletada"}</td><td>${e(item.duration)}s</td></tr>`).join("")}</tbody></table>`;
}

function mutationHistoryTable() {
  if (!state.mutationHistory.length) return emptyState("Nenhuma execução de mutação", "Configure a ferramenta, conecte a ponte e execute a primeira análise.");
  return `<table><thead><tr><th>Execução</th><th>Data/hora</th><th>Ferramenta</th><th>Mortos</th><th>Sobreviventes</th><th>Incompetentes</th><th>Escore</th><th>Duração</th></tr></thead><tbody>${[...state.mutationHistory].reverse().map((item) => `<tr><td class="id-cell">${e(item.id)}<div class="sub-cell">${e(item.runId)}</div></td><td>${e(new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.finishedAt)))}</td><td><span class="tag">${e(item.tool)}</span></td><td><strong>${e(item.killed)} / ${e(item.total)}</strong></td><td>${e(item.survived)}</td><td>${e(item.incompetent || 0)}</td><td><strong>${e(item.score)}%</strong></td><td>${e(item.duration)}s</td></tr>`).join("")}</tbody></table>`;
}

function defectsPage() {
  return `${pageHead("Teste baseado em defeitos", "Defeitos encontrados", "Documente evidências, impacto e uma proposta de correção ligada ao caso que revelou o problema.", `<button class="btn btn-primary" data-action="open-defect">${icon("plus")}Novo defeito</button>`)}
    ${defectsTimeline()}
    <section class="panel panel-flush"><div class="panel-head"><div><h2 class="panel-title">Registro de defeitos</h2><div class="panel-subtitle">Clique em um defeito para ver onde ele estava no código e como foi corrigido</div></div></div><div style="padding:14px 16px 0">${filterToolbar("defect-table", "Buscar por ID, título, descrição ou caso...", [
      { key: "severity", label: "Todas as severidades", options: ["Alta", "Média", "Baixa"] },
      { key: "status", label: "Todos os status", options: ["Aberto", "Em correção", "Fechado"] },
      { key: "case", label: "Todos os casos", options: state.testCases.map((c) => ({ value: c.id, label: `${c.id} — ${c.title}` })) }
    ])}</div><div class="table-wrap filter-scope" id="defect-table">${defectsTable()}<div class="filter-empty" hidden>Nenhum defeito corresponde aos filtros.</div></div></section>`;
}

/** Do momento em que cada defeito apareceu até a mutação, a partir do histórico de commits do fork. */
function defectsTimeline() {
  const infos = state.defects.map((defect) => [defect, defectInfo(defect.id)]).filter(([, info]) => info);
  if (!infos.length) return "";
  const chips = (list) => list.map(([defect]) => `<button class="tag tag-red tag-link" data-action="open-defect-detail" data-id="${e(defect.id)}" title="${e(defect.title)}">${e(defect.id)}</button>`).join(" ");
  const byStage = (stage) => infos.filter(([, info]) => info.revealed.stage === stage);
  const sortable = (date) => `${date.slice(6, 10)}${date.slice(3, 5)}${date.slice(0, 2)}${date.slice(11)}`; // dd/mm/aaaa hh:mm
  const fixes = [...new Map(infos.flatMap(([, info]) => info.fixedBy.map((commit) => [commit.hash, commit]))).values()]
    .sort((a, b) => sortable(a.date).localeCompare(sortable(b.date)));
  const stageStep = (stage) => {
    const list = byStage(stage);
    if (!list.length) return "";
    const commit = list[0][1].revealed.commit;
    return `<div class="dt-step found"><span class="dt-num">${stage === "funcional" ? 1 : 2}</span><div><strong>${STAGE_NAME[stage]}</strong><small>${e(commit.date)} · ${commitLink(commit)}</small><p>${list.length} defeito${list.length > 1 ? "s" : ""} revelado${list.length > 1 ? "s" : ""}</p><div class="dt-chips">${chips(list)}</div></div></div>`;
  };
  const mutation = infos[0][1].mutationAfter;
  return `<section class="panel defects-timeline"><div class="panel-head"><div><h2 class="panel-title">Quando cada defeito apareceu e foi resolvido</h2><div class="panel-subtitle">Pelo histórico de commits do fork. Clique em um defeito para ver onde ele estava no código.</div></div><span class="badge badge-green">${infos.length} de ${state.defects.length} corrigidos</span></div>
    <div class="dt-row">
      ${stageStep("funcional")}${stageStep("estrutural")}
      <div class="dt-step fixed"><span class="dt-num">${icon("shield")}</span><div><strong>Correção no fork</strong><small>${fixes.length} commits, antes da mutação</small><ul>${fixes.map((commit) => `<li>${commitLink(commit)} <span>${e(commit.date)}</span><div>${e(commit.message.replace(/:.*$/, ""))}</div></li>`).join("")}</ul></div></div>
      <div class="dt-step mut"><span class="dt-num">3</span><div><strong>Etapa 3 · Teste de mutação</strong><small>${e(mutation.date)} · ${commitLink(mutation)}</small><p>Começou com todos os defeitos já corrigidos: a mutação usa o código corrigido.</p></div></div>
    </div></section>`;
}

function defectsTable() {
  if (!state.defects.length) return emptyState("Nenhum defeito registrado", "Falhas de execução podem ser documentadas aqui.");
  const detailed = state.defects.some((d) => defectInfo(d.id));
  return `<table class="${detailed ? "click-table" : ""}"><thead><tr><th>ID</th><th>Defeito</th><th>Caso originador</th>${detailed ? "<th>Onde</th><th>Revelado</th><th>Corrigido em</th>" : ""}<th>Severidade</th><th>Status</th>${detailed ? "" : "<th>Proposta de correção</th>"}<th></th></tr></thead><tbody>${state.defects.map((d) => {
    const tc = state.testCases.find((x) => x.id === d.testCaseId);
    const info = defectInfo(d.id);
    const extra = detailed ? `<td class="mono">${e(info?.function || "—")}<div class="sub-cell">linha ${e(info?.original.marked[0] ?? "—")} do original</div></td><td>${info ? `${e(STAGE_NAME[info.revealed.stage]?.split(" · ")[1] || info.revealed.stage)}<div class="sub-cell">${e(info.revealed.commit.date)}</div>` : "—"}</td><td>${info ? info.fixedBy.map((commit) => `${commitLink(commit)}<div class="sub-cell">${e(commit.date)}</div>`).join("") : "—"}</td>` : "";
    return `<tr class="filter-item ${info ? "clickable" : ""}" ${info ? `data-action="open-defect-detail" data-id="${e(d.id)}"` : ""} data-query="${e(`${d.id} ${d.title} ${d.description} ${d.correction} ${d.testCaseId} ${tc?.title || ""} ${info?.function || ""}`.toLowerCase())}" data-severity="${e(d.severity)}" data-status="${e(d.status)}" data-case="${e(d.testCaseId)}"><td class="id-cell">${e(d.id)}</td><td class="main-cell">${e(d.title)}<div class="sub-cell">${e(d.description)}</div></td><td><span class="tag">${e(d.testCaseId)}</span><div class="sub-cell">${e(tc?.title || "Caso não encontrado")}</div></td>${extra}<td>${badge(d.severity)}</td><td>${badge(d.status)}</td>${detailed ? "" : `<td>${e(d.correction)}</td>`}<td><button class="icon-btn" data-action="edit-defect" data-id="${d.id}" title="Editar">${icon("edit")}</button></td></tr>`;
  }).join("")}</tbody></table>`;
}

function dataPage() {
  return `${pageHead("Portabilidade", "Dados e exportação", "Faça backup do projeto, exporte a tabela para o relatório ou restaure os dados demonstrativos.")}
    <div class="grid-equal">
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Relatório técnico</h2><span class="tag">A4 retrato</span></div><div class="panel-body"><div class="callout">${icon("shield")}<div><strong>PDF completo e rastreável.</strong><br>Capa, resumo, caracterização, três funcionalidades, metodologia, classes, fichas de casos, execuções, cobertura, defeitos, matriz e conclusão.</div></div><div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary" data-action="generate-pdf">${icon("download")}Gerar relatório PDF</button><button class="btn" data-action="export-report">${icon("requirement")}Versão Markdown</button></div></div></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Dados estruturados</h2></div><div class="panel-body"><div class="callout">${icon("info")}<div>O JSON preserva todos os vínculos para restauração. O CSV contém a tabela de casos e abre diretamente no Excel.</div></div><div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap"><button class="btn" data-action="export-json">${icon("download")}Backup JSON</button><button class="btn" data-action="export-csv">${icon("download")}Casos em CSV</button></div></div></section>
      <section class="panel"><div class="panel-head"><h2 class="panel-title">Importar</h2></div><div class="panel-body"><p class="subtitle" style="margin-top:0">Restaure um backup JSON gerado pelo V&amp;V TestLab. Os dados atuais serão substituídos após confirmação.</p><label class="btn" for="import-file">${icon("upload")}Selecionar backup</label><input class="file-input" id="import-file" type="file" accept="application/json,.json"></div></section>
    </div>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2 class="panel-title">Resumo do armazenamento</h2></div><div class="panel-body"><div class="metric-grid" style="margin:0">${metricCard("Requisitos", state.requirements.length, "itens", "requirement", "#6756e8", "#efedff")}${metricCard("Classes", state.classes.length, "partições", "trace", "#1f9d8a", "#e6f7f3")}${metricCard("Casos", state.testCases.length, "cenários", "cases", "#df8b2d", "#fff3df")}${metricCard("Execuções", state.executions.length, "resultados", "play", "#d95555", "#fdecec")}</div></div></section>
    <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Estudo oficial do hotel</h2><div class="panel-subtitle">Versão mais recente gerada das evidências (casos, execuções, defeitos, mutação e explicações)</div></div></div><div class="panel-body"><div class="callout">${icon("shield")}<div>Carrega <code>estudo-hotel.json</code>, publicado pela própria ferramenta. Também pode ser aberto direto pelo endereço <code>?estudo=oficial</code>.</div></div><div style="margin-top:14px"><button class="btn btn-primary" data-action="load-official">${icon("download")}Carregar estudo oficial</button></div></div></section>
    <section class="panel"><div class="panel-body"><div class="danger-zone"><h3>Restaurar demonstração</h3><p>Substitui os dados atuais pelo exemplo inicial de cadastro e autenticação.</p><button class="btn btn-danger" data-action="reset-demo">${icon("warning")}Restaurar dados</button></div></div></section>`;
}

function emptyState(title, text) {
  return `<div class="empty">${icon("data")}<strong>${title}</strong><span>${text}</span></div>`;
}

function renderModal() {
  if (detail) return detailModal();
  if (!modal) return "";
  const { type, item = {} } = modal;
  const configs = {
    project: ["Configurar projeto", "Caracterização do software de terceiros", projectForm(item)],
    requirement: [item.id ? "Editar requisito" : "Novo requisito", "Descreva uma funcionalidade observável", requirementForm(item)],
    class: [item.id ? "Editar classe" : "Nova classe de equivalência", "Particione o domínio de entrada", classForm(item)],
    case: [item.id ? "Editar caso" : "Novo caso de teste", "Vincule requisito, classe e comportamento esperado", caseForm(item)],
    generator: ["Gerador por valor-limite", "Cria pontos abaixo, sobre e acima dos limites", generatorForm()],
    execution: [item.id ? "Editar execução" : "Registrar execução", "Documente o resultado real do pytest", executionForm(item)],
    metric: [item.id ? "Editar métrica" : "Registrar métrica", "Atualize a evolução da suíte e da cobertura", metricForm(item)],
    defect: [item.id ? "Editar defeito" : "Novo defeito", "Associe a falha ao caso que a revelou", defectForm(item)]
  };
  const [title, subtitle, form] = configs[type];
  return `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-label="${e(title)}"><form id="entity-form" data-form="${type}">
    <div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button type="button" class="icon-btn" data-action="close-modal">${icon("close")}</button></div>
    <div class="modal-body">${form}</div><div class="modal-footer">${item.id && type !== "project" ? `<button type="button" class="btn btn-danger" data-action="delete-item" data-type="${type}" data-id="${item.id}">${icon("trash")}Excluir</button>` : ""}<span style="flex:1"></span><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div>
  </form></section></div>`;
}

const field = (label, name, value = "", options = {}) => `<div class="field ${options.full ? "full" : ""}"><label for="${name}">${label}</label>${options.type === "textarea" ? `<textarea id="${name}" name="${name}" ${options.required ? "required" : ""}>${e(value)}</textarea>` : options.choices ? `<select id="${name}" name="${name}" ${options.required ? "required" : ""}>${options.choices.map((choice) => `<option ${choice === value ? "selected" : ""}>${e(choice)}</option>`).join("")}</select>` : `<input id="${name}" name="${name}" type="${options.type || "text"}" value="${e(value)}" ${options.required ? "required" : ""} ${options.min != null ? `min="${options.min}"` : ""} ${options.max != null ? `max="${options.max}"` : ""} placeholder="${e(options.placeholder || "")}">`}${options.hint ? `<div class="field-hint">${options.hint}</div>` : ""}</div>`;

function projectForm(item) {
  return `<div class="form-grid">${field("Nome do software", "name", item.name, { required: true, full: true })}${field("Repositório GitHub", "repository", item.repository, { type: "url", full: true })}${field("Caminho local do repositório", "localRepository", item.localRepository || "", { full: true, placeholder: "C:\\projetos\\meu-sistema-python", hint: "Usado para montar o comando da ponte local." })}${field("URL da ponte", "bridgeUrl", item.bridgeUrl || "http://127.0.0.1:8765", { type: "url", full: true })}${field("Origem da cobertura", "coverageSource", item.coverageSource || ".", { full: true, hint: "Pacote ou módulo passado a pytest-cov; para o hotel, hotel.views." })}${field("Funções do recorte", "coverageFunctions", item.coverageFunctions || "", { full: true, hint: "Separadas por vírgula; vazio mede toda a origem." })}${field("Argumentos do pytest", "pytestArgs", item.pytestArgs || "tests", { full: true, hint: "No hotel, tests --runxfail revela as falhas conhecidas no painel." })}${field("Criar defeito ao falhar?", "autoCreateDefects", item.autoCreateDefects || "Sim", { choices: ["Sim", "Não"] })}${field("Ferramenta de mutação", "mutationTool", item.mutationTool || "auto", { choices: ["auto", "mutmut", "cosmic-ray"], hint: "Para o hotel, use Cosmic Ray no ambiente Python separado." })}${field("Configuração do Cosmic Ray", "cosmicRayConfig", item.cosmicRayConfig || "cosmic-ray.toml", { full: true, hint: "Caminho relativo dentro do repositório autorizado." })}${field("Python da mutacao", "mutationPython", item.mutationPython || "", { full: true, hint: "Caminho relativo do Python que contem Cosmic Ray." })}${field("Seletor de mutantes", "cosmicRaySelector", item.cosmicRaySelector || "", { full: true, hint: "Script opcional para amostra reproduzivel." })}${field("Propósito real", "purpose", item.purpose, { type: "textarea", required: true, full: true })}${field("Linhas de código (LOC)", "loc", item.loc || 0, { type: "number", min: 0 })}${field("Funções e métodos", "functions", item.functions || 0, { type: "number", min: 0 })}${field("Classes", "codeClasses", item.codeClasses || 0, { type: "number", min: 0 })}${field("Módulos", "modules", item.modules || 0, { type: "number", min: 0 })}${field("Meta de cobertura (%)", "coverageTarget", item.coverageTarget, { type: "number", min: 0, max: 100 })}${field("Etapa atual", "currentPhase", item.currentPhase, { choices: phaseOrder })}</div>`;
}

function requirementForm(item) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid">${field("Nome da funcionalidade", "title", item.title, { required: true, full: true, placeholder: "Ex.: Cadastrar usuário" })}${field("Método/função no código", "method", item.method || "", { full: true, placeholder: "Ex.: UserService.create_user", hint: "Referência usada na análise estrutural e de mutação." })}${field("Descrição / regra", "description", item.description, { type: "textarea", required: true, full: true })}${field("Prioridade", "priority", item.priority || "Média", { choices: ["Alta", "Média", "Baixa"] })}${field("Status", "status", item.status || "Em análise", { choices: ["Em análise", "Aprovado", "Rascunho"] })}</div>`;
}

function requirementOptions(selected) {
  return state.requirements.map((r) => `<option value="${r.id}" ${r.id === selected ? "selected" : ""}>${e(`${r.id} — ${r.title}`)}</option>`).join("");
}

function classOptions(selected) {
  return state.classes.map((c) => `<option value="${c.id}" data-requirement="${e(c.requirementId)}" ${c.id === selected ? "selected" : ""}>${e(`${c.id} — ${c.name}`)}</option>`).join("");
}

function caseOptions(selected, failedOnly = false) {
  const ids = failedOnly ? new Set(state.executions.filter((x) => x.result === "Falhou").map((x) => x.testCaseId)) : null;
  return state.testCases.filter((c) => !ids || ids.has(c.id)).map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${e(`${c.id} — ${c.title}`)}</option>`).join("");
}

function graphOptions(selected) {
  return state.controlFlowGraphs.map((graph) => `<option value="${e(graph.id)}" data-requirement="${e(graph.requirementId)}" ${graph.id === selected ? "selected" : ""}>${e(`${graph.id} — ${graph.method}`)}</option>`).join("");
}

function classForm(item) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid"><div class="field full"><label>Requisito relacionado</label><select name="requirementId" required><option value="">Selecione...</option>${requirementOptions(item.requirementId)}</select></div>${field("Nome da classe", "name", item.name, { required: true, full: true, placeholder: "Ex.: Idade permitida" })}${field("Condição de entrada", "condition", item.condition, { required: true, full: true, placeholder: "Ex.: 18 ≤ idade ≤ 120" })}${field("Tipo", "type", item.type || "Válida", { choices: ["Válida", "Inválida"] })}${field("Limite mínimo (opcional)", "min", item.min ?? "", { type: "number" })}${field("Limite máximo (opcional)", "max", item.max ?? "", { type: "number" })}</div>`;
}

function caseForm(item) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid"><div class="field"><label>Requisito</label><select name="requirementId" data-requirement-select required><option value="">Selecione...</option>${requirementOptions(item.requirementId)}</select></div><div class="field"><label>Classe referida</label><select name="classId" data-class-select required><option value="">Selecione...</option>${classOptions(item.classId)}</select></div>${field("Título do cenário", "title", item.title, { required: true, full: true })}${field("Condição / dados de entrada", "input", item.input, { type: "textarea", required: true, full: true })}${field("Pré-condição", "precondition", item.precondition, { type: "textarea", full: true })}${field("Passos (um por linha)", "steps", Array.isArray(item.steps) ? item.steps.join("\n") : "", { type: "textarea", required: true, full: true })}${field("Resultado esperado", "expected", item.expected, { type: "textarea", required: true, full: true })}${field("Validade", "validity", item.validity || "Válido", { choices: ["Válido", "Inválido"] })}${field("Técnica", "technique", item.technique || "CE", { choices: ["CE", "AVL", "Estrutural", "Mutação"] })}${field("Prioridade", "priority", item.priority || "Média", { choices: ["Alta", "Média", "Baixa"] })}${field("Status", "status", item.status || "Pronto", { choices: ["Rascunho", "Pronto", "Bloqueado"] })}<div class="form-section full"><strong>Rastreabilidade estrutural</strong><span>Use os IDs exibidos em Grafos estruturais. Casos funcionais e de mutação também podem usar estes vínculos.</span></div><div class="field full"><label>Grafo de fluxo relacionado</label><select name="graphId" data-graph-select><option value="">Vincular automaticamente pelo requisito</option>${graphOptions(item.graphId)}</select><div class="field-hint">Após analisar o código, o sistema vincula automaticamente o grafo da funcionalidade.</div></div>${field("Casos relacionados", "relatedCaseIds", (item.relatedCaseIds || []).join(", "), { full: true, placeholder: "CT-001, CT-004", hint: "Ligue um caso estrutural aos casos funcionais reutilizados e aos casos de mutação derivados." })}${field("Nós-alvo", "targetNodeIds", (item.targetNodeIds || []).join(", "), { full: true, placeholder: "N003, N005" })}${field("Arestas-alvo", "targetEdgeIds", (item.targetEdgeIds || []).join(", "), { full: true, placeholder: "E002, E004" })}${field("Caminhos-alvo", "targetPathIds", (item.targetPathIds || []).join(", "), { full: true, placeholder: "P001, P002", hint: "Os caminhos gerados são simples e livres de laço." })}</div>`;
}

function generatorForm() {
  return `<div class="callout" style="margin-bottom:16px">${icon("spark")}<div>Para o intervalo [mínimo, máximo], serão criados casos para mín−1, mín, mín+1, máx−1, máx e máx+1, sem duplicatas.</div></div><div class="form-grid"><div class="field"><label>Requisito</label><select name="requirementId" data-requirement-select required><option value="">Selecione...</option>${requirementOptions()}</select></div><div class="field"><label>Classe válida</label><select name="classId" data-class-select required><option value="">Selecione...</option>${classOptions()}</select></div>${field("Campo testado", "field", "idade", { required: true, full: true })}${field("Mínimo inclusivo", "min", 18, { type: "number", required: true })}${field("Máximo inclusivo", "max", 120, { type: "number", required: true })}${field("Esperado para válidos", "expectedValid", "Operação aceita e concluída.", { type: "textarea", required: true, full: true })}${field("Esperado para inválidos", "expectedInvalid", "Operação rejeitada com mensagem de validação.", { type: "textarea", required: true, full: true })}</div>`;
}

function executionForm(item = {}) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid"><div class="field full"><label>Caso executado</label><select name="testCaseId" required><option value="">Selecione...</option>${caseOptions(item.testCaseId)}</select></div>${field("Data", "date", item.date || new Date().toISOString().slice(0, 10), { type: "date", required: true })}${field("Resultado", "result", item.result || "Aprovado", { choices: ["Aprovado", "Falhou", "Bloqueado"] })}${field("Ambiente", "environment", item.environment || "Python 3.13 / Windows", { required: true, full: true })}${field("Resultado obtido / evidência", "actual", item.actual || "", { type: "textarea", required: true, full: true })}</div>`;
}

function metricForm(item = {}) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid">${field("Etapa", "phase", item.phase || state.project.currentPhase, { choices: phaseOrder })}${field("Data", "date", item.date || new Date().toISOString().slice(0, 10), { type: "date", required: true })}${field("Tamanho da suíte", "suiteSize", item.suiteSize ?? state.testCases.length, { type: "number", required: true, min: 0 })}${field("Cobertura de instruções (%)", "statementCoverage", item.statementCoverage ?? 0, { type: "number", required: true, min: 0, max: 100 })}${field("Cobertura de desvios (%)", "branchCoverage", item.branchCoverage ?? 0, { type: "number", required: true, min: 0, max: 100 })}${field("Mutantes totais", "mutantsTotal", item.mutantsTotal ?? 0, { type: "number", min: 0 })}${field("Mutantes mortos", "mutantsKilled", item.mutantsKilled ?? 0, { type: "number", min: 0 })}</div>`;
}

function defectForm(item) {
  return `<input type="hidden" name="id" value="${e(item.id || "")}"><div class="form-grid"><div class="field full"><label>Caso que revelou o defeito</label><select name="testCaseId" required><option value="">Selecione...</option>${caseOptions(item.testCaseId)}</select></div>${field("Título", "title", item.title, { required: true, full: true })}${field("Descrição / evidência", "description", item.description, { type: "textarea", required: true, full: true })}${field("Severidade", "severity", item.severity || "Média", { choices: ["Alta", "Média", "Baixa"] })}${field("Status", "status", item.status || "Aberto", { choices: ["Aberto", "Em correção", "Fechado"] })}${field("Proposta de correção", "correction", item.correction, { type: "textarea", required: true, full: true })}</div>`;
}

function formatDate(date) {
  if (!date) return "—";
  // Aceita "AAAA-MM-DD" e também data e hora ISO (ex.: finishedAt vindo da ponte).
  const day = String(date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return String(date);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

function render() {
  const graphScroll = [...document.querySelectorAll(".cfg-scroll")].map((element) => [element.scrollTop, element.scrollLeft]);
  const pageScroll = window.scrollY || 0;
  const pages = { home: homePage, sobre: aboutPage, obrigado: thanksPage, dashboard: dashboardPage, funcional: () => stagePage("funcional"), estrutural: () => stagePage("estrutural"), mutacao: () => stagePage("mutacao"), requirements: requirementsPage, cases: casesPage, structural: structuralPage, traceability: traceabilityPage, execution: executionPage, integration: integrationPage, defects: defectsPage, data: dataPage };
  app.innerHTML = shell((pages[route] || homePage)() + presenterNav());
  document.querySelectorAll(".cfg-scroll").forEach((element, index) => {
    if (graphScroll[index]) [element.scrollTop, element.scrollLeft] = graphScroll[index];
  });
  if (pageScroll) window.scrollTo?.(0, pageScroll);
}

function toast(message, error = false) {
  const zone = document.querySelector("#toast-zone");
  if (!zone) return;
  const el = document.createElement("div");
  el.className = `toast ${error ? "error" : ""}`;
  el.textContent = message;
  zone.append(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(type, item = {}) {
  modal = { type, item };
  render();
  setTimeout(() => {
    syncClassOptions();
    document.querySelector(".modal input:not([type=hidden]), .modal select, .modal textarea")?.focus();
  }, 0);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bridgeEndpoint(path) {
  return `${(state.project.bridgeUrl || "http://127.0.0.1:8765").replace(/\/$/, "")}${path}`;
}

async function checkBridge() {
  bridgeStatus = { state: "running", message: "Verificando a ponte local..." };
  render();
  try {
    const response = await fetch(bridgeEndpoint("/health"), { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    bridgeStatus = {
      state: "online",
      message: `${data.repo} · Python ${data.python} · pytest ${data.pytestAvailable ? "pronto" : "ausente"} · cobertura ${data.coverageAvailable ? "pronta" : "não instalada"} · mutação ${Object.entries(data.mutationTools || {}).filter(([, available]) => available).map(([tool]) => tool).join("/") || "não instalada"}`
    };
    render();
    toast("Ponte local conectada.");
  } catch (error) {
    bridgeStatus = { state: "offline", message: `Não foi possível conectar: ${error.message}` };
    render();
    toast("Ponte local indisponível. Inicie o comando exibido nesta tela.", true);
  }
}

async function syncRepository() {
  bridgeStatus = { state: "running", message: "Executando pytest e coletando os resultados. Aguarde..." };
  render();
  try {
    const response = await fetch(bridgeEndpoint("/run"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: state.testCases.map((item) => item.id) }),
      signal: AbortSignal.timeout(1_850_000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state = applyRepositorySync(state, payload, { autoCreateDefects: state.project.autoCreateDefects !== "Não" });
    bridgeStatus = { state: "online", message: `${payload.mapped.length} caso(s) vinculados; ${payload.unmapped.length} teste(s) sem vínculo; exit code ${payload.exitCode}.` };
    saveState(`Sincronização concluída: ${payload.mapped.length} caso(s) atualizados.`);
  } catch (error) {
    bridgeStatus = { state: "offline", message: `Falha na sincronização: ${error.message}` };
    render();
    toast(`Falha na sincronização: ${error.message}`, true);
  }
}

async function runMutation() {
  bridgeStatus = { state: "running", message: "Executando teste de mutação. Esta etapa pode levar vários minutos..." };
  render();
  try {
    const response = await fetch(bridgeEndpoint("/mutation"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(7_300_000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state = applyMutationSync(state, payload);
    bridgeStatus = { state: "online", message: `${payload.tool}: ${payload.stats.killed}/${payload.stats.total} mutantes mortos (${payload.stats.score}%).` };
    saveState(`Mutação concluída: escore de ${payload.stats.score}%.`);
  } catch (error) {
    bridgeStatus = { state: "offline", message: `Falha no teste de mutação: ${error.message}` };
    render();
    toast(`Falha no teste de mutação: ${error.message}`, true);
  }
}

async function analyzeGraphs() {
  const methods = state.requirements.filter((item) => item.method?.trim());
  if (!methods.length) {
    toast("Informe o campo Método/função nos requisitos antes de analisar o código.", true);
    return;
  }
  bridgeStatus = { state: "running", message: "Analisando a estrutura das três funcionalidades..." };
  render();
  try {
    const response = await fetch(bridgeEndpoint("/graphs"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirements: state.requirements.map(({ id, method }) => ({ id, method })) }),
      signal: AbortSignal.timeout(120_000)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    state = applyGraphAnalysis(state, payload);
    selectedGraphId = state.controlFlowGraphs[0]?.id || "";
    selectedGraphCaseId = "";
    graphSelection = null;
    bridgeStatus = { state: "online", message: `${payload.graphs.length} grafo(s) gerado(s); ${payload.functionsFound} função(ões) encontradas em ${payload.filesScanned} arquivo(s).` };
    saveState(`Análise estrutural concluída: ${payload.graphs.length} grafo(s) gerado(s).`);
  } catch (error) {
    bridgeStatus = { state: "offline", message: `Falha na análise estrutural: ${error.message}` };
    render();
    toast(`Falha na análise estrutural: ${error.message}`, true);
  }
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function parseIdList(value, prefix) {
  const normalizedPrefix = prefix.toUpperCase();
  return [...new Set(String(value || "").split(/[\s,;]+/).map((item) => item.trim().toUpperCase()).filter(Boolean).map((item) => {
    const match = item.match(new RegExp(`^${normalizedPrefix}[-_ ]?0*(\\d+)$`));
    return match ? `${normalizedPrefix}-${String(Number(match[1])).padStart(3, "0")}` : item;
  }))];
}

/** Imagem ampliada sobre a página (telas do sistema na página "O projeto"); fecha com clique ou Esc. */
function openLightbox(src, caption) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<figure><img src="${e(src)}" alt="${e(caption)}"><figcaption>${e(caption)}</figcaption></figure>`;
  box.addEventListener("click", () => box.remove());
  document.body.append(box);
}

function upsert(collection, prefix, data) {
  const index = state[collection].findIndex((item) => item.id === data.id);
  if (index >= 0) state[collection][index] = { ...state[collection][index], ...data };
  else state[collection].push({ ...data, id: nextId(prefix, state[collection]) });
}

app.addEventListener("click", (event) => {
  if (event.target.matches("[data-modal-backdrop]")) {
    if (detail) { closeNodeDrawer(); detail = null; renderDetail(); return; }
    modal = null;
    render();
    return;
  }
  // Links externos (commits, GitHub) dentro de linhas clicáveis abrem só o link.
  if (event.target.closest("a[href]:not([data-action]):not([data-route])")) return;
  const target = event.target.closest("[data-route], [data-action]");
  if (!target) return;
  const nextRoute = target.dataset.route;
  if (nextRoute) { closeNodeDrawer(); route = nextRoute; modal = null; detail = null; render(); window.scrollTo?.(0, 0); return; }
  const { action, id, type } = target.dataset;
  const actions = {
    "zoom-image": () => openLightbox(target.dataset.src, target.dataset.caption),
    "open-defect-detail": () => { closeNodeDrawer(); detail = { kind: "defect", id }; detailGraphId = ""; renderDetail(); },
    "open-test": () => { closeNodeDrawer(); detail = { kind: "test", id, context: STAGES[route] ? route : detail?.context }; detailGraphId = ""; renderDetail(); },
    "open-mutant": () => { detail = { kind: "mutant", id }; renderDetail(); },
    "detail-graph": () => { closeNodeDrawer(); detailGraphId = id; renderDetail(true); },
    "detail-node": () => {
      const graphId = target.closest("svg")?.dataset.graph;
      if (nodeDrawer?.nodeId === id && nodeDrawer.graphId === graphId) closeNodeDrawer();
      else showNodeDrawer(graphId, id, "detail");
    },
    "close-detail": () => { closeNodeDrawer(); detail = null; renderDetail(); },
    "open-project": () => openModal("project", state.project),
    "open-requirement": () => state.requirements.length >= MAX_PRIMARY_FEATURES ? toast("O escopo já contém as três funcionalidades principais. Edite ou exclua uma delas para substituir.", true) : openModal("requirement"),
    "open-class": () => openModal("class"),
    "open-case": () => openModal("case"),
    "open-generator": () => openModal("generator"),
    "open-execution": () => openModal("execution"),
    "open-metric": () => openModal("metric"),
    "open-defect": () => openModal("defect"),
    "check-bridge": () => checkBridge(),
    "sync-repository": () => syncRepository(),
    "run-mutation": () => runMutation(),
    "analyze-graphs": () => analyzeGraphs(),
    "select-graph": () => { selectedGraphId = id; selectedGraphCaseId = ""; graphSelection = null; route = "structural"; render(); },
    "select-graph-element": () => {
      if (target.dataset.kind === "node") {
        const graphId = target.closest("svg")?.dataset.graph;
        if (nodeDrawer?.nodeId === id && nodeDrawer.graphId === graphId) closeNodeDrawer();
        else showNodeDrawer(graphId, id, "page");
        return;
      } graphSelection = graphSelection?.kind === target.dataset.kind && graphSelection?.id === id ? null : { kind: target.dataset.kind, id }; render(); },
    "view-case-graph": () => {
      const testCase = state.testCases.find((item) => item.id === id);
      selectedGraphId = testCase?.graphId || state.controlFlowGraphs.find((graph) => graph.requirementId === testCase?.requirementId)?.id || "";
      selectedGraphCaseId = id;
      graphSelection = null;
      route = "structural";
      render();
    },
    "edit-requirement": () => openModal("requirement", state.requirements.find((x) => x.id === id)),
    "edit-class": () => openModal("class", state.classes.find((x) => x.id === id)),
    "edit-case": () => openModal("case", state.testCases.find((x) => x.id === id)),
    "edit-defect": () => openModal("defect", state.defects.find((x) => x.id === id)),
    "edit-execution": () => openModal("execution", state.executions.find((x) => x.id === id)),
    "edit-metric": () => openModal("metric", state.metrics.find((x) => x.id === id)),
    "close-modal": () => { modal = null; render(); },
    "clear-filters": () => {
      document.querySelectorAll(`[data-filter-controls="${target.dataset.scope}"] [data-filter-key]`).forEach((control) => { control.value = ""; });
      applyFilters(target.dataset.scope);
    },
    "export-json": () => download("vv-testlab-backup.json", JSON.stringify(state, null, 2), "application/json"),
    "export-csv": () => download("casos-de-teste.csv", `\ufeff${casesToCsv(state)}`, "text/csv;charset=utf-8"),
    "export-report": () => download("relatorio-tecnico.md", reportToMarkdown(state), "text/markdown;charset=utf-8"),
    "generate-pdf": async () => {
      try {
        toast("Montando o relatório A4...");
        const { generatePdfReport } = await import("./report-pdf.js");
        generatePdfReport(state);
        toast("Relatório PDF A4 gerado com sucesso.");
      } catch (error) {
        toast(`Falha ao gerar o PDF: ${error.message}`, true);
      }
    },
    "reset-demo": () => { if (confirm("Substituir todos os dados atuais pela demonstração?")) { state = demoState(); saveState("Dados demonstrativos restaurados."); } },
    "load-official": () => { if (confirm("Substituir os dados atuais pelo estudo oficial do hotel?")) loadOfficialStudy(); },
    "delete-graph": () => deleteItem("graph", id),
    "delete-item": () => deleteItem(type, id)
  };
  actions[action]?.();
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest("#entity-form");
  if (!form) return;
  event.preventDefault();
  const data = formData(form);
  try {
    if (form.dataset.form === "project") state.project = { ...state.project, ...data, coverageTarget: Number(data.coverageTarget), loc: Number(data.loc), functions: Number(data.functions), codeClasses: Number(data.codeClasses), modules: Number(data.modules) };
    if (form.dataset.form === "requirement") {
      if (!data.id && state.requirements.length >= MAX_PRIMARY_FEATURES) throw new Error(`O projeto permite no máximo ${MAX_PRIMARY_FEATURES} funcionalidades principais.`);
      upsert("requirements", "REQ", data);
    }
    if (form.dataset.form === "class") {
      const previous = state.classes.find((item) => item.id === data.id);
      upsert("classes", "CE", { ...data, min: data.min === "" ? null : Number(data.min), max: data.max === "" ? null : Number(data.max) });
      if (previous && previous.requirementId !== data.requirementId) {
        state.testCases.filter((item) => item.classId === data.id).forEach((item) => { item.requirementId = data.requirementId; });
      }
    }
    if (form.dataset.form === "case") {
      const linkedClass = state.classes.find((item) => item.id === data.classId);
      if (!linkedClass) throw new Error("Selecione uma classe de equivalência existente.");
      if (linkedClass.requirementId !== data.requirementId) throw new Error(`A classe ${linkedClass.id} pertence ao requisito ${linkedClass.requirementId}. Selecione vínculos compatíveis.`);
      const graph = data.graphId
        ? state.controlFlowGraphs.find((item) => item.id === data.graphId)
        : state.controlFlowGraphs.find((item) => item.requirementId === data.requirementId);
      if (data.graphId && !graph) throw new Error("Selecione um grafo estrutural existente.");
      if (graph && graph.requirementId !== data.requirementId) throw new Error(`O grafo ${graph.id} pertence ao requisito ${graph.requirementId}.`);
      const relatedCaseIds = parseIdList(data.relatedCaseIds, "CT");
      const knownCaseIds = new Set(state.testCases.map((item) => item.id));
      const unknownRelated = relatedCaseIds.filter((caseId) => caseId !== data.id && !knownCaseIds.has(caseId));
      if (unknownRelated.length) throw new Error(`Casos relacionados inexistentes: ${unknownRelated.join(", ")}.`);
      const targetNodeIds = parseIdList(data.targetNodeIds, "N");
      const targetEdgeIds = parseIdList(data.targetEdgeIds, "E");
      const targetPathIds = parseIdList(data.targetPathIds, "P");
      if (graph) {
        const allowed = {
          node: new Set(graph.nodes.map((item) => item.id)),
          edge: new Set(graph.edges.map((item) => item.id)),
          path: new Set(graph.paths.map((item) => item.id))
        };
        const invalid = [
          ...targetNodeIds.filter((item) => !allowed.node.has(item)),
          ...targetEdgeIds.filter((item) => !allowed.edge.has(item)),
          ...targetPathIds.filter((item) => !allowed.path.has(item))
        ];
        if (invalid.length) throw new Error(`IDs estruturais inexistentes em ${graph.id}: ${invalid.join(", ")}.`);
      } else if (targetNodeIds.length || targetEdgeIds.length || targetPathIds.length) {
        throw new Error("Analise e vincule um grafo antes de informar nós, arestas ou caminhos-alvo.");
      }
      upsert("testCases", "CT", {
        ...data,
        graphId: graph?.id || "",
        relatedCaseIds: relatedCaseIds.filter((caseId) => caseId !== data.id),
        targetNodeIds,
        targetEdgeIds,
        targetPathIds,
        steps: data.steps.split("\n").map((x) => x.trim()).filter(Boolean)
      });
    }
    if (form.dataset.form === "execution") upsert("executions", "EXE", data);
    if (form.dataset.form === "metric") {
      const numeric = { ...data, suiteSize: Number(data.suiteSize), statementCoverage: Number(data.statementCoverage), branchCoverage: Number(data.branchCoverage), mutantsTotal: Number(data.mutantsTotal), mutantsKilled: Number(data.mutantsKilled) };
      if (numeric.mutantsKilled > numeric.mutantsTotal) throw new Error("Mutantes mortos não podem exceder o total de mutantes.");
      upsert("metrics", "MET", numeric);
    }
    if (form.dataset.form === "defect") upsert("defects", "DEF", data);
    if (form.dataset.form === "generator") {
      const linkedClass = state.classes.find((item) => item.id === data.classId);
      if (!linkedClass || linkedClass.requirementId !== data.requirementId) throw new Error("A classe selecionada deve pertencer ao requisito informado.");
      const generated = buildBoundaryCases({ ...data, min: Number(data.min), max: Number(data.max) });
      for (const item of generated) state.testCases.push({ ...item, id: nextId("CT", state.testCases) });
    }
    modal = null;
    saveState(form.dataset.form === "generator" ? "Casos de valor-limite gerados com sucesso." : "Registro salvo com sucesso.");
  } catch (error) {
    toast(error.message, true);
  }
});

app.addEventListener("input", (event) => {
  if (!event.target.matches("[data-filter-key]")) return;
  applyFilters(event.target.closest("[data-filter-controls]").dataset.filterControls);
});

app.addEventListener("change", async (event) => {
  if (event.target.matches("[data-requirement-select]")) syncClassOptions();
  if (event.target.matches("[data-graph-control]")) {
    const control = event.target.dataset.graphControl;
    if (control === "graph") {
      selectedGraphId = event.target.value;
      selectedGraphCaseId = "";
      graphSelection = null;
    }
    if (control === "case") {
      selectedGraphCaseId = event.target.value;
      graphSelection = null;
    }
    if (control === "mode") graphViewMode = event.target.value;
    render();
    return;
  }
  if (event.target.matches("[data-filter-key]")) applyFilters(event.target.closest("[data-filter-controls]").dataset.filterControls);
  if (event.target.matches("#import-file") && event.target.files[0]) {
    try {
      const imported = hydrateState(validateImportedState(JSON.parse(await event.target.files[0].text())));
      if (confirm("Importar este backup e substituir os dados atuais?")) { state = imported; saveState("Backup importado com sucesso."); }
    } catch (error) { toast(error.message || "Não foi possível importar o arquivo.", true); }
  }
});

function syncClassOptions() {
  const requirement = document.querySelector("[data-requirement-select]");
  const classSelect = document.querySelector("[data-class-select]");
  if (!requirement || !classSelect) return;
  const requirementId = requirement.value;
  [...classSelect.options].forEach((option) => {
    if (!option.value) return;
    const matches = !requirementId || option.dataset.requirement === requirementId;
    option.hidden = !matches;
    option.disabled = !matches;
  });
  if (classSelect.selectedOptions[0]?.disabled) classSelect.value = "";
  const graphSelect = document.querySelector("[data-graph-select]");
  if (graphSelect) {
    [...graphSelect.options].forEach((option) => {
      if (!option.value) return;
      const matches = !requirementId || option.dataset.requirement === requirementId;
      option.hidden = !matches;
      option.disabled = !matches;
    });
    if (graphSelect.selectedOptions[0]?.disabled) graphSelect.value = "";
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("#node-drawer [data-action]");
  if (!target) return;
  if (target.dataset.action === "close-node-drawer") closeNodeDrawer();
  if (target.dataset.action === "drawer-node" && nodeDrawer) showNodeDrawer(target.dataset.graph, target.dataset.id, nodeDrawer.context);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector(".lightbox")) { document.querySelector(".lightbox").remove(); return; }
  if (event.key === "Escape" && nodeDrawer) { closeNodeDrawer(); return; }
  if (event.key === "Escape" && detail) { detail = null; renderDetail(); return; }
  if (event.key === "Escape" && modal) { modal = null; render(); }
  if (["Enter", " "].includes(event.key) && event.target.matches('[data-action="select-graph-element"]')) {
    event.preventDefault();
    event.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});

function applyFilters(scopeId) {
  // Um filtro pode controlar mais de uma lista: a principal (id) e as marcadas com data-filter-group.
  const scopes = [document.getElementById(scopeId), ...document.querySelectorAll(`[data-filter-group="${scopeId}"]`)].filter(Boolean);
  const controls = document.querySelector(`[data-filter-controls="${scopeId}"]`);
  if (!scopes.length || !controls) return;
  const filters = Object.fromEntries([...controls.querySelectorAll("[data-filter-key]")].map((control) => [control.dataset.filterKey, control.value.trim().toLowerCase()]));
  for (const scope of scopes) {
    let visible = 0;
    const items = [...scope.querySelectorAll(".filter-item")];
    items.forEach((item) => {
      const matches = Object.entries(filters).every(([key, value]) => {
        if (!value) return true;
        // Itens sem o atributo (ex.: casos de teste na página de mutação) ignoram filtros que não se aplicam a eles.
        if (key !== "query" && !(key in item.dataset)) return true;
        const actual = String(item.dataset[key] || "").toLowerCase();
        return key === "query" ? actual.includes(value) : actual === value;
      });
      item.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = scope.querySelector(":scope > .filter-empty");
    if (empty) empty.hidden = items.length === 0 || visible !== 0;
  }
}

function deleteItem(type, id) {
  const collections = { requirement: "requirements", class: "classes", case: "testCases", execution: "executions", metric: "metrics", defect: "defects", graph: "controlFlowGraphs" };
  const collection = collections[type];
  if (!collection) return;
  const impact = deletionImpact(state, type, id);
  const details = [impact.classIds.length && `${impact.classIds.length} classe(s)`, impact.caseIds.length && `${impact.caseIds.length} caso(s)`, impact.graphIds.length && `${impact.graphIds.length} grafo(s)`, impact.executionIds.length && `${impact.executionIds.length} execução(ões)`, impact.defectIds.length && `${impact.defectIds.length} defeito(s)`, impact.structuralCoverageIds.length && `${impact.structuralCoverageIds.length} cobertura(s) por teste`].filter(Boolean).join(", ");
  const message = details ? `Excluir ${id} e seus dependentes (${details})? Esta ação não pode ser desfeita.` : `Excluir ${id}? Esta ação não pode ser desfeita.`;
  if (!confirm(message)) return;
  state = cascadeDelete(state, type, id);
  if (type === "graph" || !state.controlFlowGraphs.some((graph) => graph.id === selectedGraphId)) {
    selectedGraphId = state.controlFlowGraphs[0]?.id || "";
    selectedGraphCaseId = "";
    graphSelection = null;
  }
  modal = null;
  saveState(`${id} e vínculos dependentes excluídos.`);
}


/** Carrega o estudo oficial publicado em public/estudo-hotel.json (gerado por scripts/gerar_catalogo_testes.py). */
async function loadOfficialStudy() {
  try {
    const response = await fetch("estudo-hotel.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state = hydrateState(validateImportedState(await response.json()));
    route = "home";
    modal = null;
    detail = null;
    saveState(`Estudo oficial carregado: ${state.testCases.length} casos, ${state.defects.length} defeitos.`);
  } catch (error) {
    toast(`Não foi possível carregar o estudo oficial: ${error.message}`, true);
  }
}

/** Ao abrir, carrega o estudo publicado se ele for mais novo que o salvo no navegador. */
async function syncOfficialStudy() {
  try {
    const response = await fetch("estudo-hotel.json", { cache: "no-store" });
    if (!response.ok) return;
    const official = await response.json();
    if (official.studyVersion && official.studyVersion === state.studyVersion) return;
    state = hydrateState(validateImportedState(official));
    route = "home";
    modal = null;
    detail = null;
    saveState(`Estudo oficial carregado: ${state.testCases.length} casos, ${state.defects.length} defeitos.`);
  } catch {
    // Sem estudo publicado (por exemplo, nos testes): mantém os dados do navegador.
  }
}

render();
if (new URLSearchParams(location.search).get("estudo") === "oficial") {
  loadOfficialStudy().finally(() => history.replaceState(null, "", location.pathname));
} else if (import.meta.env?.MODE !== "test") {
  syncOfficialStudy();
}
