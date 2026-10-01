import test from "node:test";
import assert from "node:assert/strict";
import {
  defectCoversCase,
  boundaryValues,
  buildBoundaryCases,
  cascadeDelete,
  casesToCsv,
  dashboardMetrics,
  demoState,
  nextId,
  MAX_PRIMARY_FEATURES,
  applyGraphAnalysis,
  applyMutationSync,
  applyRepositorySync,
  referenceErrors,
  reportToMarkdown,
  structuralCoverageForCase,
  structuralSummary,
  traceabilityRows,
  validateImportedState
} from "../src/core.js";

const graphPayload = () => ({
  analyzedAt: "2026-09-04T12:00:00-03:00",
  filesScanned: 2,
  functionsFound: 4,
  unresolved: [],
  warnings: [],
  parseErrors: [],
  graphs: [{
    requirementId: "REQ-001",
    requestedMethod: "UserService.create_user",
    method: "services.UserService.create_user",
    qualifiedName: "UserService.create_user",
    file: "services.py",
    line: 10,
    endLine: 14,
    nodes: [
      { id: "N001", type: "entry", label: "Entrada", line: 10, endLine: 10 },
      { id: "N002", type: "decision", label: "Se: age >= 18", line: 11, endLine: 11 },
      { id: "N003", type: "return", label: "return True", line: 12, endLine: 12 },
      { id: "N004", type: "exit", label: "Saída", line: 14, endLine: 14 }
    ],
    edges: [
      { id: "E001", from: "N001", to: "N002", label: "", kind: "normal" },
      { id: "E002", from: "N002", to: "N003", label: "Verdadeiro", kind: "branch" },
      { id: "E003", from: "N003", to: "N004", label: "Retorno", kind: "terminal" }
    ],
    paths: [{ id: "P001", nodeIds: ["N001", "N002", "N003", "N004"], edgeIds: ["E001", "E002", "E003"], kind: "Simples livre de laço" }],
    metrics: { nodes: 4, edges: 3, simpleLoopFreePaths: 1, cyclomaticComplexity: 1, pathsTruncated: false }
  }]
});

test("nextId mantém prefixo e incrementa a maior sequência", () => {
  assert.equal(nextId("CT", [{ id: "CT-001" }, { id: "CT-009" }]), "CT-010");
});

test("escopo acadêmico está fixado em três funcionalidades principais", () => {
  assert.equal(MAX_PRIMARY_FEATURES, 3);
  assert.equal(demoState().requirements.length, MAX_PRIMARY_FEATURES);
});

test("boundaryValues cobre abaixo, sobre e acima dos dois limites", () => {
  assert.deepEqual(boundaryValues(18, 20), [
    { value: 17, valid: false },
    { value: 18, valid: true },
    { value: 19, valid: true },
    { value: 20, valid: true },
    { value: 21, valid: false }
  ]);
});

test("boundaryValues rejeita intervalo invertido", () => {
  assert.throws(() => boundaryValues(20, 10), /limites numéricos válidos/);
});

test("gerador vincula requisito e classe aos casos", () => {
  const result = buildBoundaryCases({
    requirementId: "REQ-001",
    classId: "CE-001",
    field: "idade",
    min: 18,
    max: 120,
    expectedValid: "aceitar",
    expectedInvalid: "rejeitar"
  });
  assert.equal(result.length, 6);
  assert.ok(result.every((item) => item.requirementId === "REQ-001" && item.classId === "CE-001"));
  assert.equal(result.filter((item) => item.validity === "Inválido").length, 2);
});

test("dashboard calcula cobertura e escore de mutação", () => {
  const metrics = dashboardMetrics(demoState());
  assert.equal(metrics.requirementCoverage, 67);
  assert.equal(metrics.executionProgress, 75);
  assert.equal(metrics.mutationScore, 83);
});

test("matriz mantém requisitos sem vínculos para revelar lacunas", () => {
  const rows = traceabilityRows(demoState());
  const uncovered = rows.find((row) => row.requirement.id === "REQ-003");
  assert.equal(uncovered.testClass, null);
  assert.equal(uncovered.testCase, null);
});

test("CSV contém as colunas pedidas e separa válido de inválido", () => {
  const csv = casesToCsv(demoState());
  assert.match(csv, /Condição de entrada/);
  assert.match(csv, /Cenário válido/);
  assert.match(csv, /Cenários inválidos/);
  assert.match(csv, /CT-001/);
});

test("importador rejeita documento sem coleções obrigatórias", () => {
  assert.throws(() => validateImportedState({ project: {} }), /coleção requirements ausente/);
});

test("relatório inclui caracterização, evolução e defeitos", () => {
  const report = reportToMarkdown(demoState());
  assert.match(report, /Caracterização do software/);
  assert.match(report, /Evolução da cobertura/);
  assert.match(report, /DEF-001/);
});

test("dados demonstrativos preservam toda a integridade referencial", () => {
  assert.deepEqual(referenceErrors(demoState()), []);
});

test("integridade detecta caso ligado a requisito diferente da classe", () => {
  const state = demoState();
  state.testCases[0].requirementId = "REQ-002";
  assert.match(referenceErrors(state).join("\n"), /requisito diverge/);
});

test("exclusão de requisito remove dependentes sem criar órfãos", () => {
  const result = cascadeDelete(demoState(), "requirement", "REQ-001");
  assert.equal(result.requirements.some((item) => item.id === "REQ-001"), false);
  assert.equal(result.classes.some((item) => item.requirementId === "REQ-001"), false);
  assert.equal(result.testCases.some((item) => item.requirementId === "REQ-001"), false);
  assert.deepEqual(referenceErrors(result), []);
});

test("exclusão isolada de execução não remove seu caso", () => {
  const result = cascadeDelete(demoState(), "execution", "EXE-001");
  assert.equal(result.executions.some((item) => item.id === "EXE-001"), false);
  assert.equal(result.testCases.some((item) => item.id === "CT-001"), true);
});

test("sincronização do pytest cria execução, métrica e defeito rastreáveis", () => {
  const state = demoState();
  const result = applyRepositorySync(state, {
    runId: "PYTEST-001",
    finishedAt: "2026-09-04T10:00:00-03:00",
    exitCode: 1,
    duration: 1.2,
    environment: "Python 3.13 / Windows",
    mapped: [{ caseId: "CT-004", result: "Falhou", actual: "AssertionError", tests: 1 }],
    unmapped: [{ nodeId: "tests.test_extra::test_sem_marcador", result: "Aprovado" }],
    coverage: { statementCoverage: 91, branchCoverage: 84 }
  });
  assert.equal(result.executions.at(-1).testCaseId, "CT-004");
  assert.equal(result.executions.at(-1).source, "pytest");
  assert.equal(result.metrics.at(-1).statementCoverage, 91);
  assert.equal(result.defects.at(-1).testCaseId, "CT-004");
  assert.equal(result.syncHistory.at(-1).unmapped.length, 1);
  assert.deepEqual(referenceErrors(result), []);
});

test("sincronização de mutação cria histórico e métrica da etapa baseada em defeitos", () => {
  const result = applyMutationSync(demoState(), {
    runId: "MUTATION-001",
    finishedAt: "2026-09-04T13:00:00-03:00",
    tool: "cosmic-ray",
    duration: 12.5,
    stats: { total: 30, killed: 27, survived: 3, skipped: 2, score: 90 }
  });
  assert.equal(result.metrics.at(-1).phase, "Baseado em defeitos");
  assert.equal(result.metrics.at(-1).mutantsKilled, 27);
  assert.equal(result.metrics.at(-1).source, "cosmic-ray");
  assert.equal(result.mutationHistory.at(-1).survived, 3);
  assert.equal(dashboardMetrics(result).mutationScore, 90);
});

test("dashboard usa a execução de mutação mais recente, sem somar rodadas históricas", () => {
  let state = applyMutationSync(demoState(), {
    runId: "MUTATION-OLD",
    stats: { total: 10, killed: 5, survived: 5, score: 50 }
  });
  state = applyMutationSync(state, {
    runId: "MUTATION-NEW",
    stats: { total: 10, killed: 9, survived: 1, score: 90 }
  });
  assert.equal(dashboardMetrics(state).mutationScore, 90);
});

test("análise estrutural cria grafo e vincula automaticamente os casos do requisito", () => {
  const result = applyGraphAnalysis(demoState(), graphPayload());
  assert.equal(result.controlFlowGraphs.length, 1);
  assert.equal(result.testCases.find((item) => item.id === "CT-001").graphId, "CFG-001");
  assert.equal(structuralSummary(result).nodes, 4);
  assert.match(reportToMarkdown(result), /Análise estrutural dos grafos/);
  assert.deepEqual(referenceErrors(result), []);
});

test("cobertura por contexto destaca nós, arestas e caminhos de cada teste", () => {
  let state = applyGraphAnalysis(demoState(), graphPayload());
  state = applyRepositorySync(state, {
    runId: "PYTEST-CFG-001",
    finishedAt: "2026-09-04T12:10:00-03:00",
    exitCode: 0,
    duration: 0.4,
    environment: "Python 3.13 / Windows",
    mapped: [{ caseId: "CT-001", result: "Aprovado", tests: 1 }],
    unmapped: [],
    coverage: { statementCoverage: 90, branchCoverage: 80 },
    caseCoverage: [{ caseId: "CT-001", files: { "services.py": [11, 12] }, lineCount: 2 }]
  });
  const graph = state.controlFlowGraphs[0];
  const coverage = structuralCoverageForCase(state, graph, "CT-001");
  assert.deepEqual(coverage.coveredNodeIds, ["N001", "N002", "N003", "N004"]);
  assert.deepEqual(coverage.coveredEdgeIds, ["E001", "E002", "E003"]);
  assert.deepEqual(coverage.coveredPathIds, ["P001"]);
});

test("defeito revelado por vários casos cobre o originador e os relacionados", () => {
  const state = demoState();
  const defect = { ...state.defects[0], testCaseId: "CT-002", relatedCaseIds: ["CT-004"] };
  assert.equal(defectCoversCase(defect, "CT-002"), true);
  assert.equal(defectCoversCase(defect, "CT-004"), true);
  assert.equal(defectCoversCase(defect, "CT-003"), false);
  const rows = traceabilityRows({ ...state, defects: [defect] });
  assert.equal(rows.find((row) => row.testCase?.id === "CT-004").defects.length, 1);
  assert.equal(rows.find((row) => row.testCase?.id === "CT-003").defects.length, 0);
});
