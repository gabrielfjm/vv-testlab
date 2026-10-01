export const STORAGE_KEY = "vvtestlab-project-v1";
export const LEGACY_STORAGE_KEYS = ["veritas-test-manager-v1"];
export const MAX_PRIMARY_FEATURES = 3;

export function nextId(prefix, items) {
  const highest = items.reduce((max, item) => {
    const match = String(item.id || "").match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export function boundaryValues(min, max) {
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low > high) {
    throw new Error("Informe limites numéricos válidos, com mínimo menor ou igual ao máximo.");
  }
  return [...new Set([low - 1, low, low + 1, high - 1, high, high + 1])]
    .sort((a, b) => a - b)
    .map((value) => ({ value, valid: value >= low && value <= high }));
}

export function buildBoundaryCases({ requirementId, classId, field, min, max, expectedValid, expectedInvalid }) {
  return boundaryValues(min, max).map(({ value, valid }) => ({
    requirementId,
    classId,
    title: `${field} = ${value} (${valid ? "válido" : "inválido"})`,
    input: `${field}: ${value}`,
    precondition: "Sistema disponível e usuário na funcionalidade testada.",
    steps: [`Informar ${value} no campo ${field}.`, "Submeter a operação.", "Observar a resposta do sistema."],
    expected: valid ? expectedValid : expectedInvalid,
    validity: valid ? "Válido" : "Inválido",
    technique: "AVL",
    priority: valid ? "Média" : "Alta",
    status: "Pronto"
  }));
}

export function dashboardMetrics(state) {
  const totalCases = state.testCases.length;
  const coveredRequirementIds = new Set(state.testCases.map((item) => item.requirementId));
  const executedCaseIds = new Set(state.executions.map((item) => item.testCaseId));
  const passed = state.executions.filter((item) => item.result === "Aprovado").length;
  const failed = state.executions.filter((item) => item.result === "Falhou").length;
  const latestMutation = [...state.metrics].reverse().find((item) => Number(item.mutantsTotal || 0) > 0);
  const totalMutants = Number(latestMutation?.mutantsTotal || 0);
  const killedMutants = Number(latestMutation?.mutantsKilled || 0);
  return {
    requirements: state.requirements.length,
    classes: state.classes.length,
    totalCases,
    executed: executedCaseIds.size,
    passed,
    failed,
    openDefects: state.defects.filter((item) => item.status !== "Fechado").length,
    requirementCoverage: state.requirements.length ? Math.round((coveredRequirementIds.size / state.requirements.length) * 100) : 0,
    executionProgress: totalCases ? Math.round((executedCaseIds.size / totalCases) * 100) : 0,
    mutationScore: totalMutants ? Math.round((killedMutants / totalMutants) * 100) : 0
  };
}

/** Um defeito pode ser revelado por vários casos: o originador (testCaseId) e os relacionados (relatedCaseIds). */
export function defectCoversCase(defect, caseId) {
  return defect.testCaseId === caseId || (defect.relatedCaseIds || []).includes(caseId);
}

export function traceabilityRows(state) {
  return state.requirements.flatMap((requirement) => {
    const linkedClasses = state.classes.filter((item) => item.requirementId === requirement.id);
    const requirementGraph = (state.controlFlowGraphs || []).find((item) => item.requirementId === requirement.id) || null;
    if (!linkedClasses.length) return [{ requirement, testClass: null, testCase: null, graph: requirementGraph, execution: null, defects: [] }];
    return linkedClasses.flatMap((testClass) => {
      // Um caso cobre a classe principal (classId) e, opcionalmente, outras classes (classIds).
      const linkedCases = state.testCases.filter((item) => item.classId === testClass.id || (item.classIds || []).includes(testClass.id));
      if (!linkedCases.length) return [{ requirement, testClass, testCase: null, graph: requirementGraph, execution: null, defects: [] }];
      return linkedCases.map((testCase) => {
        const graph = (state.controlFlowGraphs || []).find((item) => item.id === testCase.graphId) || requirementGraph;
        return {
          requirement,
          testClass,
          testCase,
          graph,
          structuralCoverage: [...(state.structuralCoverage || [])].reverse().find((item) => item.testCaseId === testCase.id || item.caseId === testCase.id) || null,
          execution: [...state.executions].reverse().find((item) => item.testCaseId === testCase.id) || null,
          defects: state.defects.filter((item) => defectCoversCase(item, testCase.id))
        };
      });
    });
  });
}

export function applyGraphAnalysis(state, payload) {
  if (!payload || !Array.isArray(payload.graphs) || !Array.isArray(payload.unresolved)) {
    throw new Error("Resposta de análise estrutural inválida.");
  }
  const currentGraphs = [...(state.controlFlowGraphs || [])];
  const affectedRequirements = new Set([
    ...payload.graphs.map((graph) => graph.requirementId),
    ...payload.unresolved.map((item) => item.requirementId)
  ]);
  const preserved = currentGraphs.filter((graph) => !affectedRequirements.has(graph.requirementId));
  const analyzed = [];
  for (const graph of payload.graphs) {
    const existing = currentGraphs.find((item) => item.requirementId === graph.requirementId);
    analyzed.push({
      ...graph,
      id: existing?.id || nextId("CFG", [...preserved, ...analyzed]),
      analyzedAt: payload.analyzedAt
    });
  }
  const allGraphs = [...preserved, ...analyzed];
  const validGraphIds = new Set(allGraphs.map((graph) => graph.id));
  const graphByRequirement = new Map(allGraphs.map((graph) => [graph.requirementId, graph.id]));
  return {
    ...state,
    controlFlowGraphs: allGraphs,
    testCases: state.testCases.map((testCase) => validGraphIds.has(testCase.graphId)
      ? testCase
      : {
        ...testCase,
        graphId: graphByRequirement.get(testCase.requirementId) || "",
        targetNodeIds: [],
        targetEdgeIds: [],
        targetPathIds: []
      }),
    graphAnalysis: {
      analyzedAt: payload.analyzedAt,
      filesScanned: Number(payload.filesScanned || 0),
      functionsFound: Number(payload.functionsFound || 0),
      unresolved: payload.unresolved,
      warnings: payload.warnings || [],
      parseErrors: payload.parseErrors || []
    }
  };
}

function normalizedPath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

export function structuralCoverageForCase(state, graph, caseId) {
  const records = (state.structuralCoverage || []).filter((item) => item.caseId === caseId);
  const record = records.at(-1) || null;
  const graphFile = normalizedPath(graph?.file);
  const coveredLines = new Set();
  if (record && graph) {
    for (const [file, lines] of Object.entries(record.files || {})) {
      const normalizedFile = normalizedPath(file);
      if (normalizedFile === graphFile || normalizedFile.endsWith(`/${graphFile}`) || graphFile.endsWith(`/${normalizedFile}`)) {
        for (const line of lines || []) coveredLines.add(Number(line));
      }
    }
  }
  const functionCovered = [...coveredLines].some((line) => line >= Number(graph?.line || 0) && line <= Number(graph?.endLine || 0));
  const coveredNodeIds = (graph?.nodes || []).filter((node) => {
    if (["entry", "exit"].includes(node.type)) return functionCovered;
    for (let line = Number(node.line || 0); line <= Number(node.endLine || node.line || 0); line += 1) {
      if (coveredLines.has(line)) return true;
    }
    return false;
  }).map((node) => node.id);
  const nodeSet = new Set(coveredNodeIds);
  // O JSON de contextos informa linhas por teste, mas não arcos. A cobertura
  // de arestas é portanto inferida quando seus dois nós foram executados.
  const coveredEdgeIds = (graph?.edges || []).filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to)).map((edge) => edge.id);
  const edgeSet = new Set(coveredEdgeIds);
  const coveredPathIds = (graph?.paths || []).filter((path) => path.edgeIds.every((edgeId) => edgeSet.has(edgeId))).map((path) => path.id);
  return { record, coveredLines: [...coveredLines].sort((a, b) => a - b), coveredNodeIds, coveredEdgeIds, coveredPathIds };
}

export function structuralSummary(state) {
  const graphs = state.controlFlowGraphs || [];
  return {
    graphs: graphs.length,
    nodes: graphs.reduce((sum, graph) => sum + graph.nodes.length, 0),
    edges: graphs.reduce((sum, graph) => sum + graph.edges.length, 0),
    paths: graphs.reduce((sum, graph) => sum + graph.paths.length, 0),
    coveredCases: new Set((state.structuralCoverage || []).map((item) => item.caseId)).size
  };
}

export function escapeCsv(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function casesToCsv(state) {
  const header = ["ID", "Requisito", "Condição de entrada", "Classe/cenário", "Cenário válido", "Cenários inválidos", "Resultado esperado", "Técnica"];
  const rows = state.testCases.map((testCase) => {
    const req = state.requirements.find((item) => item.id === testCase.requirementId);
    const testClass = state.classes.find((item) => item.id === testCase.classId);
    return [
      testCase.id,
      req ? `${req.id} — ${req.title}` : "—",
      testCase.input,
      testClass ? `${testClass.id} — ${testClass.name}` : "—",
      testCase.validity === "Válido" ? testCase.title : "—",
      testCase.validity === "Inválido" ? testCase.title : "—",
      testCase.expected,
      testCase.technique
    ];
  });
  return [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
}

export function reportToMarkdown(state) {
  const latest = state.metrics.at(-1) || {};
  const metrics = dashboardMetrics(state);
  const row = (values) => `| ${values.map((value) => String(value ?? "—").replaceAll("|", "\\|")).join(" | ")} |`;
  const lines = [
    `# Relatório técnico — ${state.project.name}`,
    "",
    "## 1. Caracterização do software",
    "",
    state.project.purpose,
    "",
    `- Repositório: ${state.project.repository || "não informado"}`,
    `- Linhas de código (LOC): ${state.project.loc || 0}`,
    `- Funções/métodos: ${state.project.functions || 0}`,
    `- Classes: ${state.project.codeClasses || 0}`,
    `- Módulos: ${state.project.modules || 0}`,
    `- Meta de cobertura: ${state.project.coverageTarget}%`,
    "",
    "## 2. Metodologia",
    "",
    "Os testes foram aplicados incrementalmente na ordem: funcional, estrutural e baseado em defeitos. Na etapa funcional foram utilizados particionamento em classes de equivalência e análise do valor limite; na estrutural, cobertura de instruções e desvios; e na última etapa, teste de mutação.",
    "",
    "## 3. Requisitos e cobertura",
    "",
    `Foram cadastrados ${state.requirements.length} requisitos, dos quais ${metrics.requirementCoverage}% possuem ao menos um caso associado.`,
    "",
    "O escopo está limitado às três funcionalidades/métodos principais do software.",
    "",
    row(["ID", "Funcionalidade", "Método/função", "Prioridade", "Status"]),
    row(["---", "---", "---", "---", "---"]),
    ...state.requirements.map((item) => row([item.id, item.title, item.method || "não informado", item.priority, item.status])),
    "",
    "## 4. Casos de teste",
    "",
    row(["ID", "Entrada", "Classe/cenário", "Validade", "Resultado esperado"]),
    row(["---", "---", "---", "---", "---"]),
    ...state.testCases.map((item) => row([item.id, item.input, state.classes.find((x) => x.id === item.classId)?.name, item.validity, item.expected])),
    "",
    "## 5. Análise estrutural dos grafos",
    "",
    ...((state.controlFlowGraphs || []).length ? [
      row(["ID", "Requisito", "Método/função", "Arquivo", "Nós", "Arestas", "Caminhos", "Complexidade"]),
      row(["---", "---", "---", "---", "---:", "---:", "---:", "---:"]),
      ...(state.controlFlowGraphs || []).map((graph) => row([graph.id, graph.requirementId, graph.method, `${graph.file}:${graph.line}`, graph.nodes.length, graph.edges.length, graph.paths.length, graph.metrics?.cyclomaticComplexity || 0])),
      "",
      "As arestas por teste são inferidas a partir dos nós executados nos contextos do coverage.py. Os caminhos listados são caminhos simples livres de laço.",
      ""
    ] : ["Nenhum grafo de fluxo de controle analisado.", ""]),
    "## 6. Evolução da cobertura",
    "",
    row(["Etapa", "Suíte", "Instruções", "Desvios", "Mutantes mortos/total"]),
    row(["---", "---:", "---:", "---:", "---:"]),
    ...state.metrics.map((item) => row([item.phase, item.suiteSize, `${item.statementCoverage}%`, `${item.branchCoverage}%`, item.mutantsTotal ? `${item.mutantsKilled}/${item.mutantsTotal}` : "—"])),
    "",
    "## 7. Defeitos encontrados",
    "",
    ...(state.defects.length ? state.defects.flatMap((item) => [`### ${item.id} — ${item.title}`, "", item.description, "", `- Severidade: ${item.severity}`, `- Estado: ${item.status}`, `- Caso originador: ${item.testCaseId}`, `- Proposta de correção: ${item.correction}`, ""]) : ["Nenhum defeito registrado.", ""]),
    "## 8. Sincronizações automáticas",
    "",
    ...((state.syncHistory || []).length ? [
      row(["ID", "Execução pytest", "Data/hora", "Casos vinculados", "Sem vínculo", "Status"]),
      row(["---", "---", "---", "---:", "---:", "---"]),
      ...(state.syncHistory || []).map((item) => row([item.id, item.runId, item.finishedAt, item.mapped, item.unmapped?.length || 0, item.status])),
      ""
    ] : ["Nenhuma sincronização automática registrada.", ""]),
    "## 9. Resultados consolidados",
    "",
    `A suíte final possui ${state.testCases.length} casos, ${state.executions.length} execuções registradas, cobertura de instruções de ${latest.statementCoverage || 0}% e escore de mutação de ${metrics.mutationScore}%.`,
    "",
    "## 10. Dificuldades e lições aprendidas",
    "",
    "_Completar com as dificuldades observadas na instalação do software, criação dos testes, aumento da cobertura e eliminação dos mutantes sobreviventes._",
    ""
  ];
  return lines.join("\n");
}

export function validateImportedState(value) {
  const collections = ["requirements", "classes", "testCases", "executions", "defects", "metrics"];
  if (!value || typeof value !== "object" || !value.project) throw new Error("Arquivo inválido: projeto ausente.");
  for (const key of collections) if (!Array.isArray(value[key])) throw new Error(`Arquivo inválido: coleção ${key} ausente.`);
  return value;
}

export function referenceErrors(state) {
  const requirementIds = new Set(state.requirements.map((item) => item.id));
  const classIds = new Set(state.classes.map((item) => item.id));
  const caseIds = new Set(state.testCases.map((item) => item.id));
  const graphIds = new Set((state.controlFlowGraphs || []).map((item) => item.id));
  const errors = [];
  for (const item of state.classes) {
    if (!requirementIds.has(item.requirementId)) errors.push(`${item.id}: requisito ${item.requirementId} inexistente`);
  }
  for (const item of state.testCases) {
    if (!requirementIds.has(item.requirementId)) errors.push(`${item.id}: requisito ${item.requirementId} inexistente`);
    if (!classIds.has(item.classId)) errors.push(`${item.id}: classe ${item.classId} inexistente`);
    const linkedClass = state.classes.find((testClass) => testClass.id === item.classId);
    if (linkedClass && linkedClass.requirementId !== item.requirementId) errors.push(`${item.id}: requisito diverge da classe ${item.classId}`);
    if (item.graphId && !graphIds.has(item.graphId)) errors.push(`${item.id}: grafo ${item.graphId} inexistente`);
    for (const relatedId of item.relatedCaseIds || []) {
      if (!caseIds.has(relatedId)) errors.push(`${item.id}: caso relacionado ${relatedId} inexistente`);
    }
  }
  for (const graph of state.controlFlowGraphs || []) {
    if (!requirementIds.has(graph.requirementId)) errors.push(`${graph.id}: requisito ${graph.requirementId} inexistente`);
  }
  for (const item of state.executions) {
    if (!caseIds.has(item.testCaseId)) errors.push(`${item.id}: caso ${item.testCaseId} inexistente`);
  }
  for (const item of state.defects) {
    if (!caseIds.has(item.testCaseId)) errors.push(`${item.id}: caso ${item.testCaseId} inexistente`);
  }
  for (const item of state.structuralCoverage || []) {
    if (!caseIds.has(item.caseId)) errors.push(`${item.id}: caso ${item.caseId} inexistente`);
  }
  return errors;
}

export function deletionImpact(state, type, id) {
  const classIds = type === "requirement"
    ? state.classes.filter((item) => item.requirementId === id).map((item) => item.id)
    : [];
  const caseIds = type === "requirement"
    ? state.testCases.filter((item) => item.requirementId === id).map((item) => item.id)
    : type === "class"
      ? state.testCases.filter((item) => item.classId === id).map((item) => item.id)
      : type === "case" ? [id] : [];
  const caseSet = new Set(caseIds);
  const graphIds = type === "requirement"
    ? (state.controlFlowGraphs || []).filter((item) => item.requirementId === id).map((item) => item.id)
    : type === "graph" ? [id] : [];
  return {
    classIds,
    caseIds,
    graphIds,
    executionIds: state.executions.filter((item) => caseSet.has(item.testCaseId)).map((item) => item.id),
    defectIds: state.defects.filter((item) => caseSet.has(item.testCaseId)).map((item) => item.id),
    structuralCoverageIds: (state.structuralCoverage || []).filter((item) => caseSet.has(item.caseId)).map((item) => item.id)
  };
}

export function cascadeDelete(state, type, id) {
  const collections = { requirement: "requirements", class: "classes", case: "testCases", execution: "executions", metric: "metrics", defect: "defects", graph: "controlFlowGraphs" };
  const collection = collections[type];
  if (!collection) throw new Error(`Tipo de entidade inválido: ${type}`);
  const impact = deletionImpact(state, type, id);
  const classSet = new Set(impact.classIds);
  const caseSet = new Set(impact.caseIds);
  const graphSet = new Set(impact.graphIds);
  return {
    ...state,
    [collection]: state[collection].filter((item) => item.id !== id),
    classes: type === "class"
      ? state.classes.filter((item) => item.id !== id)
      : state.classes.filter((item) => !classSet.has(item.id)),
    testCases: (type === "case"
      ? state.testCases.filter((item) => item.id !== id)
      : state.testCases.filter((item) => !caseSet.has(item.id))).map((item) => ({
        ...item,
        relatedCaseIds: (item.relatedCaseIds || []).filter((relatedId) => !caseSet.has(relatedId)),
        ...(graphSet.has(item.graphId) ? { graphId: "", targetNodeIds: [], targetEdgeIds: [], targetPathIds: [] } : {})
      })),
    executions: type === "execution"
      ? state.executions.filter((item) => item.id !== id)
      : state.executions.filter((item) => !caseSet.has(item.testCaseId)),
    defects: type === "defect"
      ? state.defects.filter((item) => item.id !== id)
      : state.defects.filter((item) => !caseSet.has(item.testCaseId)),
    metrics: type === "metric"
      ? state.metrics.filter((item) => item.id !== id)
      : state.metrics,
    controlFlowGraphs: type === "graph"
      ? (state.controlFlowGraphs || []).filter((item) => item.id !== id)
      : (state.controlFlowGraphs || []).filter((item) => !graphSet.has(item.id)),
    structuralCoverage: (state.structuralCoverage || []).filter((item) => !caseSet.has(item.caseId))
  };
}

export function applyRepositorySync(state, payload, { autoCreateDefects = true } = {}) {
  if (!payload || !Array.isArray(payload.mapped) || !Array.isArray(payload.unmapped)) {
    throw new Error("Resposta de sincronização inválida.");
  }
  const next = {
    ...state,
    executions: [...state.executions],
    defects: [...state.defects],
    metrics: [...state.metrics],
    syncHistory: [...(state.syncHistory || [])],
    structuralCoverage: [...(state.structuralCoverage || [])]
  };
  const date = String(payload.finishedAt || new Date().toISOString()).slice(0, 10);
  const knownCases = new Set(state.testCases.map((item) => item.id));
  let mappedCount = 0;

  for (const result of payload.mapped) {
    if (!knownCases.has(result.caseId)) continue;
    next.executions.push({
      id: nextId("EXE", next.executions),
      testCaseId: result.caseId,
      date,
      result: result.result,
      actual: result.actual || `Resultado importado automaticamente de ${payload.runId || "pytest"}.`,
      environment: payload.environment || "pytest / ambiente não informado",
      source: "pytest",
      sourceRunId: payload.runId || ""
    });
    mappedCount += 1;
    if (autoCreateDefects && result.result === "Falhou") {
      const openDefect = next.defects.some((item) => defectCoversCase(item, result.caseId) && item.status !== "Fechado");
      if (!openDefect) {
        next.defects.push({
          id: nextId("DEF", next.defects),
          testCaseId: result.caseId,
          title: `Falha automatizada em ${result.caseId}`,
          severity: "Média",
          status: "Aberto",
          description: result.actual || `Falha detectada na execução ${payload.runId || "pytest"}.`,
          correction: "Investigar a causa, corrigir o código e executar novamente o caso para regressão.",
          source: "pytest",
          sourceRunId: payload.runId || ""
        });
      }
    }
  }

  if (payload.coverage) {
    next.metrics.push({
      id: nextId("MET", next.metrics),
      phase: state.project.currentPhase,
      date,
      suiteSize: state.testCases.length,
      statementCoverage: Number(payload.coverage.statementCoverage || 0),
      branchCoverage: Number(payload.coverage.branchCoverage || 0),
      mutantsTotal: 0,
      mutantsKilled: 0,
      source: "pytest-cov",
      sourceRunId: payload.runId || ""
    });
  }

  for (const item of payload.caseCoverage || []) {
    if (!knownCases.has(item.caseId)) continue;
    next.structuralCoverage.push({
      id: nextId("SCOV", next.structuralCoverage),
      caseId: item.caseId,
      runId: payload.runId || "pytest",
      finishedAt: payload.finishedAt || new Date().toISOString(),
      files: item.files || {},
      lineCount: Number(item.lineCount || 0),
      source: "coverage.py contexts"
    });
  }

  next.syncHistory.push({
    id: nextId("SYNC", next.syncHistory),
    runId: payload.runId || "pytest",
    finishedAt: payload.finishedAt || new Date().toISOString(),
    exitCode: Number(payload.exitCode ?? 0),
    duration: Number(payload.duration || 0),
    mapped: mappedCount,
    unmapped: payload.unmapped,
    coverage: payload.coverage || null,
    status: Number(payload.exitCode ?? 0) === 0 ? "Concluída" : "Concluída com falhas"
  });
  return next;
}

export function applyMutationSync(state, payload) {
  const stats = payload?.stats;
  if (!payload || !stats || !Number.isFinite(Number(stats.total)) || !Number.isFinite(Number(stats.killed))) {
    throw new Error("Resposta de mutação inválida.");
  }
  const total = Number(stats.total);
  const killed = Number(stats.killed);
  if (total < 0 || killed < 0 || killed > total) {
    throw new Error("Estatísticas de mutação inconsistentes.");
  }
  const latestCoverage = [...state.metrics].reverse().find((item) => Number(item.statementCoverage || 0) || Number(item.branchCoverage || 0)) || {};
  const date = String(payload.finishedAt || new Date().toISOString()).slice(0, 10);
  const runId = payload.runId || "mutation";
  const metrics = [...state.metrics, {
    id: nextId("MET", state.metrics),
    phase: "Baseado em defeitos",
    date,
    suiteSize: state.testCases.length,
    statementCoverage: Number(latestCoverage.statementCoverage || 0),
    branchCoverage: Number(latestCoverage.branchCoverage || 0),
    mutantsTotal: total,
    mutantsKilled: killed,
    source: payload.tool || "mutation",
    sourceRunId: runId
  }];
  const history = [...(state.mutationHistory || []), {
    id: nextId("MUT", state.mutationHistory || []),
    runId,
    finishedAt: payload.finishedAt || new Date().toISOString(),
    tool: payload.tool || "mutation",
    duration: Number(payload.duration || 0),
    exitCode: Number(payload.exitCode ?? 0),
    total,
    killed,
    survived: Number(stats.survived || 0),
    incompetent: Number(stats.incompetent || 0),
    skipped: Number(stats.skipped || 0),
    timeout: Number(stats.timeout || 0),
    noTests: Number(stats.noTests || 0),
    score: total ? Math.round((killed / total) * 10000) / 100 : 0,
    status: Number(payload.exitCode ?? 0) === 0 ? "Concluída" : "Concluída com falhas"
  }];
  return {
    ...state,
    project: { ...state.project, currentPhase: "Baseado em defeitos" },
    metrics,
    mutationHistory: history
  };
}

export function demoState() {
  return {
    project: {
      name: "Sistema Python de Terceiros",
      repository: "https://github.com/exemplo/projeto-python",
      purpose: "Validar uma aplicação real de terceiros usando técnicas funcionais, estruturais e baseadas em defeitos.",
      coverageTarget: 85,
      currentPhase: "Funcional",
      localRepository: "",
      bridgeUrl: "http://127.0.0.1:8765",
      autoCreateDefects: "Sim",
      mutationTool: "auto",
      cosmicRayConfig: "cosmic-ray.toml",
      loc: 1240,
      functions: 38,
      codeClasses: 9,
      modules: 12
    },
    requirements: [
      { id: "REQ-001", title: "Cadastrar usuário", method: "UserService.create_user", description: "O sistema deve cadastrar usuário com nome, e-mail e idade entre 18 e 120 anos.", priority: "Alta", status: "Aprovado" },
      { id: "REQ-002", title: "Autenticar usuário", method: "AuthService.authenticate", description: "O sistema deve autenticar credenciais válidas e rejeitar credenciais incorretas.", priority: "Alta", status: "Aprovado" },
      { id: "REQ-003", title: "Recuperar senha", method: "PasswordService.request_reset", description: "O sistema deve solicitar recuperação apenas para e-mails cadastrados.", priority: "Média", status: "Em análise" }
    ],
    classes: [
      { id: "CE-001", requirementId: "REQ-001", name: "Idade permitida", condition: "18 ≤ idade ≤ 120", type: "Válida", min: 18, max: 120 },
      { id: "CE-002", requirementId: "REQ-001", name: "Idade abaixo do mínimo", condition: "idade < 18", type: "Inválida", min: null, max: 17 },
      { id: "CE-003", requirementId: "REQ-002", name: "Credenciais cadastradas", condition: "e-mail e senha correspondem ao cadastro", type: "Válida", min: null, max: null },
      { id: "CE-004", requirementId: "REQ-002", name: "Senha incorreta", condition: "e-mail existe, senha não confere", type: "Inválida", min: null, max: null }
    ],
    testCases: [
      { id: "CT-001", requirementId: "REQ-001", classId: "CE-001", title: "Cadastrar com idade mínima", input: "nome: Ana; e-mail: ana@email.com; idade: 18", precondition: "Tela de cadastro aberta.", steps: ["Preencher os dados válidos.", "Informar idade 18.", "Confirmar cadastro."], expected: "Cadastro concluído e usuário persistido.", validity: "Válido", technique: "AVL", priority: "Alta", status: "Pronto" },
      { id: "CT-002", requirementId: "REQ-001", classId: "CE-002", title: "Rejeitar idade abaixo do mínimo", input: "nome: Ana; e-mail: ana@email.com; idade: 17", precondition: "Tela de cadastro aberta.", steps: ["Preencher os dados válidos.", "Informar idade 17.", "Confirmar cadastro."], expected: "Cadastro rejeitado e mensagem de idade inválida exibida.", validity: "Inválido", technique: "AVL", priority: "Alta", status: "Pronto" },
      { id: "CT-003", requirementId: "REQ-002", classId: "CE-003", title: "Autenticar com credenciais válidas", input: "e-mail: ana@email.com; senha: correta", precondition: "Usuário previamente cadastrado.", steps: ["Abrir o login.", "Preencher credenciais válidas.", "Entrar."], expected: "Sessão iniciada e área autenticada exibida.", validity: "Válido", technique: "CE", priority: "Alta", status: "Pronto" },
      { id: "CT-004", requirementId: "REQ-002", classId: "CE-004", title: "Rejeitar senha incorreta", input: "e-mail: ana@email.com; senha: incorreta", precondition: "Usuário previamente cadastrado.", steps: ["Abrir o login.", "Preencher senha incorreta.", "Entrar."], expected: "Acesso negado sem revelar qual credencial está incorreta.", validity: "Inválido", technique: "CE", priority: "Alta", status: "Pronto" }
    ],
    executions: [
      { id: "EXE-001", testCaseId: "CT-001", date: "2026-09-01", result: "Aprovado", actual: "Cadastro realizado conforme esperado.", environment: "Python 3.13 / Windows" },
      { id: "EXE-002", testCaseId: "CT-002", date: "2026-09-01", result: "Falhou", actual: "O sistema aceitou a idade 17.", environment: "Python 3.13 / Windows" },
      { id: "EXE-003", testCaseId: "CT-003", date: "2026-09-02", result: "Aprovado", actual: "Login concluído.", environment: "Python 3.13 / Windows" }
    ],
    defects: [
      { id: "DEF-001", testCaseId: "CT-002", title: "Cadastro aceita menor de 18 anos", severity: "Alta", status: "Aberto", description: "A validação usa idade >= 17 em vez de >= 18.", correction: "Ajustar o limite inferior e adicionar teste de regressão para 17, 18 e 19." }
    ],
    metrics: [
      { id: "MET-001", phase: "Funcional", date: "2026-09-01", suiteSize: 4, statementCoverage: 48, branchCoverage: 31, mutantsTotal: 0, mutantsKilled: 0 },
      { id: "MET-002", phase: "Estrutural", date: "2026-09-02", suiteSize: 8, statementCoverage: 83, branchCoverage: 74, mutantsTotal: 0, mutantsKilled: 0 },
      { id: "MET-003", phase: "Baseado em defeitos", date: "2026-09-03", suiteSize: 11, statementCoverage: 89, branchCoverage: 82, mutantsTotal: 24, mutantsKilled: 20 }
    ],
    syncHistory: [],
    mutationHistory: [],
    controlFlowGraphs: [],
    structuralCoverage: [],
    graphAnalysis: null
  };
}
