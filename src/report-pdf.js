import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { dashboardMetrics, referenceErrors, structuralCoverageForCase, traceabilityRows } from "./core.js";

const C = {
  ink: [23, 32, 53], muted: [100, 112, 135], line: [225, 228, 236],
  primary: [103, 86, 232], primaryDark: [72, 57, 184], soft: [244, 242, 255],
  teal: [31, 157, 138], amber: [223, 139, 45], red: [207, 75, 75], white: [255, 255, 255]
};

function txt(value) {
  return String(value ?? "-")
    .replaceAll("→", "->").replaceAll("≤", "<=").replaceAll("≥", ">=")
    .replaceAll("−", "-").replaceAll("—", "-").replaceAll("–", "-");
}

function datePt(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function safeFileName(value) {
  return txt(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projeto";
}

export function generatePdfReport(state, { save = true, filename } = {}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const metrics = dashboardMetrics(state);
  const traces = traceabilityRows(state);
  const integrity = referenceErrors(state);
  const generatedAt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const margin = 14;
  let y = 24;

  doc.setProperties({
    title: `Relatório de Verificação e Validação - ${txt(state.project.name)}`,
    subject: "Relatório técnico rastreável de testes de software",
    author: "V&V TestLab",
    creator: "V&V TestLab"
  });

  const drawHeader = () => {
    doc.setFillColor(...C.primaryDark); doc.rect(0, 0, 210, 13, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...C.white); doc.text("V&V TESTLAB  |  RELATÓRIO TÉCNICO", margin, 8.3);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(doc.splitTextToSize(txt(state.project.name), 85)[0], 196, 8.3, { align: "right" });
  };
  const newPage = () => { doc.addPage(); drawHeader(); y = 24; };
  const ensure = (height = 18) => { if (y + height > 276) newPage(); };
  const section = (number, title, subtitle = "") => {
    ensure(subtitle ? 25 : 19);
    doc.setFillColor(...C.primary);
    doc.roundedRect(margin, y, 8, 8, 2, 2, "F");
    doc.setTextColor(...C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text(txt(number), margin + 4, y + 5.3, { align: "center" });
    doc.setTextColor(...C.ink); doc.setFontSize(14);
    doc.text(txt(title), margin + 12, y + 5.7);
    y += 11;
    if (subtitle) {
      doc.setTextColor(...C.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      const lines = doc.splitTextToSize(txt(subtitle), 182);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 3;
    } else y += 3;
  };
  const paragraph = (text, options = {}) => {
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(options.size || 8.5); doc.setTextColor(...(options.color || C.ink));
    const lines = doc.splitTextToSize(txt(text), options.width || 182);
    ensure(lines.length * 4.2 + 3);
    doc.text(lines, margin, y, { lineHeightFactor: 1.35 });
    y += lines.length * 4.2 + (options.after ?? 4);
  };
  const table = (head, body, options = {}) => {
    ensure(18);
    autoTable(doc, {
      startY: y,
      head: [head.map(txt)],
      body: body.map((row) => row.map(txt)),
      theme: "grid",
      margin: { left: margin, right: margin, top: 22, bottom: 17 },
      styles: { font: "helvetica", fontSize: options.fontSize || 7, textColor: C.ink, lineColor: C.line, lineWidth: 0.15, cellPadding: options.cellPadding || 2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: options.headColor || C.primaryDark, textColor: C.white, fontStyle: "bold", fontSize: options.headFontSize || 7 },
      alternateRowStyles: { fillColor: [249, 249, 252] },
      columnStyles: options.columnStyles || {},
      rowPageBreak: "avoid",
      showHead: "everyPage",
      willDrawPage: drawHeader
    });
    y = doc.lastAutoTable.finalY + 6;
  };
  const keyValueCard = (title, rows, accent = C.primary) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
    const estimatedHeight = 10 + rows.reduce((sum, [label, value]) => {
      const labelLines = doc.splitTextToSize(txt(label), 34).length;
      const valueLines = doc.splitTextToSize(txt(value), 138).length;
      return sum + Math.max(labelLines, valueLines) * 3.4 + 4;
    }, 0);
    ensure(Math.min(estimatedHeight, 250));
    doc.setFillColor(...accent); doc.roundedRect(margin, y, 182, 8, 2, 2, "F");
    doc.setTextColor(...C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(txt(title), margin + 3, y + 5.3);
    y += 8;
    autoTable(doc, {
      startY: y,
      body: rows.map(([label, value]) => [txt(label), txt(value)]),
      theme: "grid",
      margin: { left: margin, right: margin, top: 22, bottom: 17 },
      styles: { font: "helvetica", fontSize: 7.2, textColor: C.ink, lineColor: C.line, lineWidth: 0.15, cellPadding: 2, overflow: "linebreak", valign: "top" },
      columnStyles: { 0: { cellWidth: 38, fontStyle: "bold", fillColor: C.soft, textColor: C.primaryDark }, 1: { cellWidth: 144 } },
      rowPageBreak: "avoid",
      willDrawPage: drawHeader
    });
    y = doc.lastAutoTable.finalY + 6;
  };
  const drawControlFlowGraph = (graph) => {
    const entry = graph.nodes.find((node) => node.type === "entry")?.id || graph.nodes[0]?.id;
    const depths = new Map(entry ? [[entry, 0]] : []);
    const queue = entry ? [entry] : [];
    while (queue.length) {
      const current = queue.shift();
      for (const edge of graph.edges.filter((item) => item.from === current && item.kind !== "loop")) {
        if (!depths.has(edge.to)) {
          depths.set(edge.to, (depths.get(current) || 0) + 1);
          queue.push(edge.to);
        }
      }
    }
    let fallback = Math.max(0, ...depths.values()) + 1;
    graph.nodes.forEach((node) => { if (!depths.has(node.id)) depths.set(node.id, fallback++); });
    const levels = new Map();
    graph.nodes.forEach((node) => {
      const level = depths.get(node.id);
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(node);
    });
    const maxDepth = Math.max(0, ...depths.values());
    const height = Math.min(150, Math.max(52, (maxDepth + 1) * 19));
    ensure(height + 14);
    const top = y + 3;
    const positions = new Map();
    for (const [level, nodes] of levels.entries()) {
      nodes.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
      nodes.forEach((node, index) => positions.set(node.id, {
        x: margin + ((index + 1) * 182) / (nodes.length + 1),
        y: top + (level * (height - 10)) / Math.max(1, maxDepth)
      }));
    }
    doc.setDrawColor(145, 153, 170); doc.setLineWidth(0.35);
    graph.edges.forEach((edge) => {
      const from = positions.get(edge.from); const to = positions.get(edge.to);
      if (!from || !to) return;
      if (edge.kind === "loop" || to.y <= from.y) {
        doc.line(from.x + 12, from.y, 194, from.y);
        doc.line(194, from.y, 194, to.y);
        doc.line(194, to.y, to.x + 12, to.y);
      } else doc.line(from.x, from.y + 5, to.x, to.y - 5);
    });
    graph.nodes.forEach((node) => {
      const point = positions.get(node.id);
      const terminal = ["entry", "exit"].includes(node.type);
      const decision = ["decision", "loop"].includes(node.type);
      doc.setFillColor(...(terminal ? C.primaryDark : decision ? C.soft : C.white));
      doc.setDrawColor(...(decision ? C.primary : C.line));
      doc.roundedRect(point.x - 13, point.y - 5, 26, 10, terminal ? 5 : 2, terminal ? 5 : 2, "FD");
      doc.setTextColor(...(terminal ? C.white : C.ink)); doc.setFont("helvetica", "bold"); doc.setFontSize(5.7);
      doc.text(node.id, point.x, point.y - 0.5, { align: "center" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(4.8);
      doc.text(txt(node.type).slice(0, 18), point.x, point.y + 3.2, { align: "center" });
    });
    y = top + height + 5;
  };

  // Capa
  doc.setFillColor(...C.primaryDark); doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...C.primary); doc.circle(184, 30, 42, "F");
  doc.setDrawColor(150, 138, 245); doc.setLineWidth(0.4);
  for (let i = 0; i < 6; i += 1) doc.circle(184, 30, 48 + i * 8, "S");
  doc.setFillColor(...C.white); doc.roundedRect(14, 46, 182, 205, 5, 5, "F");
  doc.setFillColor(...C.primary); doc.roundedRect(25, 61, 28, 9, 2, 2, "F");
  doc.setTextColor(...C.white); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("V&V TESTLAB", 39, 67, { align: "center" });
  doc.setTextColor(...C.ink); doc.setFontSize(25); doc.text("Relatório técnico", 25, 91);
  doc.setTextColor(...C.primaryDark); doc.setFontSize(19); doc.text("Verificação e Validação", 25, 102);
  doc.setFontSize(12); doc.setTextColor(...C.muted); doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(txt(state.project.name), 150), 25, 119);
  doc.setDrawColor(...C.line); doc.line(25, 139, 185, 139);
  const coverRows = [
    ["Escopo", `${state.requirements.length}/3 funcionalidades principais`],
    ["Etapa atual", state.project.currentPhase],
    ["Meta de cobertura", `${state.project.coverageTarget}%`],
    ["Repositório", state.project.repository || "Não informado"],
    ["Gerado em", generatedAt]
  ];
  let coverY = 153;
  coverRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...C.primary); doc.text(txt(label).toUpperCase(), 25, coverY);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...C.ink);
    const lines = doc.splitTextToSize(txt(value), 120); doc.text(lines, 61, coverY); coverY += Math.max(11, lines.length * 4.2 + 4);
  });
  doc.setTextColor(224, 220, 255); doc.setFontSize(7.5); doc.text("Documento rastreável - requisito -> classe -> caso -> execução -> defeito", 105, 275, { align: "center" });

  newPage();
  section("1", "Resumo executivo", "Visão consolidada da qualidade e da completude dos artefatos cadastrados.");
  table(["Indicador", "Resultado", "Interpretação"], [
    ["Funcionalidades no escopo", `${state.requirements.length}/3`, state.requirements.length === 3 ? "Escopo definido" : "Escopo incompleto"],
    ["Casos de teste", state.testCases.length, `${metrics.executed} executados`],
    ["Cobertura do escopo", `${metrics.requirementCoverage}%`, "Funcionalidades com ao menos um caso"],
    ["Progresso de execução", `${metrics.executionProgress}%`, `${metrics.passed} aprovados; ${metrics.failed} falharam`],
    ["Escore de mutação", `${metrics.mutationScore}%`, "Mutantes mortos sobre o total"],
    ["Defeitos abertos", metrics.openDefects, `${state.defects.length} defeitos registrados`]
  ], { columnStyles: { 0: { cellWidth: 57 }, 1: { cellWidth: 32, halign: "center", fontStyle: "bold" }, 2: { cellWidth: 93 } } });
  paragraph(integrity.length ? `Atenção: foram encontradas ${integrity.length} inconsistências referenciais: ${integrity.join("; ")}.` : "Integridade referencial verificada: não existem referências órfãs entre os artefatos.", { bold: true, color: integrity.length ? C.red : C.teal });

  section("2", "Caracterização do software", "Dados utilizados na apresentação da Fase 1.");
  table(["Propriedade", "Valor"], [
    ["Software", state.project.name], ["Propósito", state.project.purpose], ["Repositório", state.project.repository || "Não informado"],
    ["Linhas de código (LOC)", state.project.loc || 0], ["Funções e métodos", state.project.functions || 0],
    ["Classes", state.project.codeClasses || 0], ["Módulos", state.project.modules || 0], ["Meta de cobertura", `${state.project.coverageTarget}%`]
  ], { columnStyles: { 0: { cellWidth: 54, fontStyle: "bold" }, 1: { cellWidth: 128 } } });

  section("3", "Escopo funcional", "As três funcionalidades/métodos principais que delimitam todos os cenários do projeto.");
  table(["ID", "Funcionalidade", "Método/função", "Prior.", "Status"], state.requirements.map((r) => [r.id, r.title, r.method || "Não informado", r.priority, r.status]), {
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 51 }, 2: { cellWidth: 61 }, 3: { cellWidth: 22 }, 4: { cellWidth: 30 } }
  });
  state.requirements.forEach((r) => keyValueCard(`${r.id} - ${r.title}`, [["Método/função", r.method || "Não informado"], ["Descrição/regra", r.description], ["Prioridade", r.priority], ["Status", r.status]], C.primary));

  section("4", "Metodologia", "Aplicação incremental obrigatória das técnicas de teste.");
  table(["Etapa", "Técnica / objetivo", "Ferramenta"], [
    ["1. Funcional", "Classes de equivalência e análise do valor limite a partir da especificação", "pytest"],
    ["2. Estrutural", "Reuso da suíte funcional, medição de cobertura e inclusão de casos", "coverage.py"],
    ["3. Baseada em defeitos", "Teste de mutação e novos casos para eliminar mutantes sobreviventes", "mutmut / cosmic-ray"]
  ], { columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 106 }, 2: { cellWidth: 40 } } });

  section("5", "Análise estrutural dos grafos", "Nós, arestas, caminhos simples livres de laço e cobertura individual por teste.");
  if (!state.controlFlowGraphs?.length) paragraph("Nenhum grafo de fluxo de controle foi analisado.", { color: C.muted });
  (state.controlFlowGraphs || []).forEach((graph) => {
    keyValueCard(`${graph.id} - ${graph.method}`, [
      ["Rastreabilidade", `${graph.requirementId} -> ${graph.id}`],
      ["Localização", `${graph.file}:${graph.line}-${graph.endLine}`],
      ["Métricas", `${graph.nodes.length} nós | ${graph.edges.length} arestas | ${graph.paths.length} caminhos | complexidade ${graph.metrics?.cyclomaticComplexity || 1}`],
      ["Analisado em", graph.analyzedAt || "Não informado"]
    ], C.primary);
    drawControlFlowGraph(graph);
    table(["Nó", "Tipo", "Linha", "Código / condição"], graph.nodes.map((node) => [node.id, node.type, `${node.line}-${node.endLine}`, node.label]), {
      fontSize: 6.2, columnStyles: { 0: { cellWidth: 19 }, 1: { cellWidth: 28 }, 2: { cellWidth: 24 }, 3: { cellWidth: 111 } }
    });
    table(["Aresta", "Origem", "Destino", "Condição", "Tipo"], graph.edges.map((edge) => [edge.id, edge.from, edge.to, edge.label || "Fluxo direto", edge.kind]), {
      fontSize: 6.2, columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 25 }, 2: { cellWidth: 25 }, 3: { cellWidth: 72 }, 4: { cellWidth: 35 } }
    });
    table(["Caminho", "Nós", "Arestas", "Classificação"], graph.paths.map((path) => [path.id, path.nodeIds.join(" -> "), path.edgeIds.join(", "), path.kind]), {
      fontSize: 6.1, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 63 }, 2: { cellWidth: 49 }, 3: { cellWidth: 48 } }
    });
    const linkedCases = state.testCases.filter((testCase) => testCase.graphId === graph.id || testCase.requirementId === graph.requirementId);
    table(["Caso", "Técnica", "Nós cobertos", "Arestas inferidas", "Caminhos", "Alvos", "Relacionados"], linkedCases.map((testCase) => {
      const coverage = structuralCoverageForCase(state, graph, testCase.id);
      const targets = [...(testCase.targetNodeIds || []), ...(testCase.targetEdgeIds || []), ...(testCase.targetPathIds || [])].join(", ") || "-";
      return [testCase.id, testCase.technique, `${coverage.coveredNodeIds.length}/${graph.nodes.length}`, `${coverage.coveredEdgeIds.length}/${graph.edges.length}`, `${coverage.coveredPathIds.length}/${graph.paths.length}`, targets, (testCase.relatedCaseIds || []).join(", ") || "Mesmo requisito"];
    }), { fontSize: 5.9, columnStyles: { 0: { cellWidth: 21 }, 1: { cellWidth: 25 }, 2: { cellWidth: 24 }, 3: { cellWidth: 28 }, 4: { cellWidth: 22 }, 5: { cellWidth: 34 }, 6: { cellWidth: 28 } } });
  });
  paragraph("Nota metodológica: a cobertura de arestas por teste é inferida quando os dois nós aparecem no mesmo contexto do coverage.py. A cobertura global de desvios do pytest-cov permanece como medida oficial.", { size: 7.2, color: C.muted });

  section("6", "Classes de equivalência", "Partições válidas e inválidas associadas às funcionalidades do escopo.");
  table(["ID", "Req.", "Classe", "Condição", "Tipo", "Limites"], state.classes.map((c) => [c.id, c.requirementId, c.name, c.condition, c.type, c.min != null || c.max != null ? `${c.min ?? "-inf"} a ${c.max ?? "+inf"}` : "-"]), {
    fontSize: 6.5, columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 18 }, 2: { cellWidth: 43 }, 3: { cellWidth: 57 }, 4: { cellWidth: 22 }, 5: { cellWidth: 25 } }
  });

  newPage(); section("7", "Casos de teste detalhados", "Cada ficha contém as informações necessárias para reproduzir e automatizar o teste.");
  if (!state.testCases.length) paragraph("Nenhum caso de teste cadastrado.", { color: C.muted });
  state.testCases.forEach((tc) => {
    const req = state.requirements.find((r) => r.id === tc.requirementId);
    const cls = state.classes.find((c) => c.id === tc.classId);
    keyValueCard(`${tc.id} - ${tc.title}`, [
      ["Rastreabilidade", `${tc.requirementId} (${req?.title || "não encontrado"}) -> ${tc.classId} (${cls?.name || "não encontrada"})`],
      ["Condição de entrada", tc.input], ["Pré-condição", tc.precondition || "Não informada"],
      ["Passos", (tc.steps || []).map((step, index) => `${index + 1}. ${step}`).join("\n")], ["Resultado esperado", tc.expected],
      ["Classificação", `${tc.validity} | ${tc.technique} | prioridade ${tc.priority} | ${tc.status}`],
      ["Vínculo estrutural", tc.graphId ? `${tc.graphId} | nós ${tc.targetNodeIds?.join(", ") || "-"} | arestas ${tc.targetEdgeIds?.join(", ") || "-"} | caminhos ${tc.targetPathIds?.join(", ") || "-"}` : "Não vinculado"],
      ["Casos relacionados", tc.relatedCaseIds?.join(", ") || "Nenhum vínculo explícito"]
    ], tc.validity === "Inválido" ? C.red : C.teal);
  });

  section("8", "Execuções", "Resultados observados, ambiente e evidências de execução.");
  table(["ID", "Caso", "Data", "Resultado", "Origem", "Ambiente", "Obtido / evidência"], state.executions.map((x) => [x.id, x.testCaseId, datePt(x.date), x.result, x.source === "pytest" ? `pytest\n${x.sourceRunId || ""}` : "manual", x.environment, x.actual]), {
    fontSize: 6.1, columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 16 }, 2: { cellWidth: 20 }, 3: { cellWidth: 20 }, 4: { cellWidth: 24 }, 5: { cellWidth: 38 }, 6: { cellWidth: 48 } }
  });

  if (state.syncHistory?.length) {
    paragraph("Sincronizações automáticas do repositório", { bold: true, size: 10, color: C.primaryDark });
    table(["ID", "Execução pytest", "Data/hora", "Mapeados", "Sem vínculo", "Cobertura", "Status"], state.syncHistory.map((item) => [
      item.id, item.runId, new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.finishedAt)), item.mapped,
      item.unmapped?.length || 0, item.coverage ? `${item.coverage.statementCoverage}% / ${item.coverage.branchCoverage}%` : "-", item.status
    ]), { fontSize: 6.2, columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 35 }, 2: { cellWidth: 30 }, 3: { cellWidth: 22 }, 4: { cellWidth: 22 }, 5: { cellWidth: 28 }, 6: { cellWidth: 27 } } });
  }

  section("9", "Evolução da cobertura", "Tamanho do conjunto de testes e resultados obtidos em cada etapa.");
  table(["Etapa", "Data", "Suíte", "Instruções", "Desvios", "Mutantes", "Escore"], state.metrics.map((m) => {
    const score = Number(m.mutantsTotal) ? Math.round((Number(m.mutantsKilled) / Number(m.mutantsTotal)) * 100) : 0;
    return [m.phase, datePt(m.date), m.suiteSize, `${m.statementCoverage}%`, `${m.branchCoverage}%`, m.mutantsTotal ? `${m.mutantsKilled}/${m.mutantsTotal}` : "-", m.mutantsTotal ? `${score}%` : "-"];
  }), { fontSize: 6.5, columnStyles: { 0: { cellWidth: 44 }, 1: { cellWidth: 24 }, 2: { cellWidth: 18 }, 3: { cellWidth: 27 }, 4: { cellWidth: 24 }, 5: { cellWidth: 25 }, 6: { cellWidth: 20 } } });

  section("10", "Defeitos encontrados", "Falhas ligadas aos casos que as revelaram, com proposta de correção.");
  if (!state.defects.length) paragraph("Nenhum defeito registrado.", { color: C.muted });
  state.defects.forEach((d) => keyValueCard(`${d.id} - ${d.title}`, [["Caso originador", d.testCaseId], ["Severidade / status", `${d.severity} / ${d.status}`], ["Descrição", d.description], ["Proposta de correção", d.correction]], C.red));

  newPage(); section("11", "Matriz de rastreabilidade", "Cobertura bidirecional entre necessidade, partição, grafo, teste, resultado e defeito.");
  table(["Requisito", "Classe", "Caso", "Grafo", "Execução", "Resultado", "Defeito(s)"], traces.map((row) => [
    row.requirement?.id || "-", row.testClass?.id || "LACUNA", row.testCase?.id || "LACUNA", row.graph?.id || "LACUNA", row.execution?.id || "NÃO EXEC.", row.execution?.result || "-", row.defects.map((d) => d.id).join(", ") || "-"
  ]), { fontSize: 6.2, columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 26 }, 2: { cellWidth: 26 }, 3: { cellWidth: 25 }, 4: { cellWidth: 28 }, 5: { cellWidth: 25 }, 6: { cellWidth: 26 } } });
  paragraph("Legenda: LACUNA indica ausência de vínculo; NÃO EXEC. indica caso ainda sem resultado registrado. Os identificadores permitem navegar do requisito ao defeito e realizar o caminho inverso.", { size: 7.5, color: C.muted });

  section("12", "Conclusão e pendências", "Síntese pronta para complementar com a análise acadêmica do grupo.");
  paragraph(`O conjunto atual contém ${state.testCases.length} casos de teste e ${state.executions.length} execuções. A cobertura das três funcionalidades é ${metrics.requirementCoverage}%, o progresso de execução é ${metrics.executionProgress}% e o escore de mutação é ${metrics.mutationScore}%.`);
  const gaps = traces.filter((row) => !row.testClass || !row.testCase || !row.execution).length;
  paragraph(gaps ? `Existem ${gaps} linha(s) com lacunas na matriz. Elas devem ser tratadas ou justificadas antes da entrega final.` : "Todas as linhas da matriz possuem classe, caso e execução associados.", { bold: true, color: gaps ? C.amber : C.teal });
  paragraph("Dificuldades e lições aprendidas: completar com os desafios de instalação, interpretação da especificação, aumento de cobertura e eliminação de mutantes sobreviventes.", { color: C.muted });

  // Cabeçalho e rodapé consistentes após a paginação.
  const pages = doc.getNumberOfPages();
  for (let page = 2; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...C.line); doc.line(margin, 285, 196, 285);
    doc.setTextColor(...C.muted); doc.setFontSize(6.5); doc.text("Verificação e Validação de Software", margin, 290);
    doc.text(`Página ${page} de ${pages}`, 196, 290, { align: "right" });
  }

  const outputName = filename || `relatorio-vv-${safeFileName(state.project.name)}.pdf`;
  if (save) doc.save(outputName);
  return doc;
}
