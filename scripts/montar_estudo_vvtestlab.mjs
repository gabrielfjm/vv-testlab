// Monta o estudo completo do hotel no V&V TestLab, etapa por etapa, com as mesmas
// funções que a interface usa ao clicar em "Executar e sincronizar", "Executar mutação"
// e "Analisar grafos" (src/core.js). Entradas: output/hotel-vvtestlab-projeto-inicial.json,
// output/hotel-vvtestlab-backup.json (catálogo de defeitos) e output/vvtestlab-estudo/*.json
// (respostas da ponte, geradas por scripts/executar_etapas_ponte.py).
// Saída: output/hotel-vvtestlab-backup.json. Em seguida, rode scripts/gerar_catalogo_testes.py (acrescenta
// o catálogo das páginas por etapa) e importe o backup em "Dados e exportação".
import { readFileSync, writeFileSync } from "node:fs";
import {
  applyGraphAnalysis, applyMutationSync, applyRepositorySync, dashboardMetrics, referenceErrors, validateImportedState
} from "../src/core.js";

const ler = (arquivo) => JSON.parse(readFileSync(new URL(`../output/${arquivo}`, import.meta.url), "utf-8"));
const inicial = ler("hotel-vvtestlab-projeto-inicial.json");
const catalogo = ler("hotel-vvtestlab-backup.json");
const etapa = (nome) => ler(`vvtestlab-estudo/${nome}.json`);

const casosDaEtapa = (tecnicas) => inicial.testCases.filter((caso) => tecnicas.includes(caso.technique));
const defeito = (id, status) => ({ ...catalogo.defects.find((item) => item.id === id), status });
const idsDefeitos = catalogo.defects.map((item) => item.id);
const DESCOBERTOS_NA_ESTRUTURAL = ["DEF-15"];

// Etapa 1 — Funcional, no código original: só os casos de classes de equivalência e valor limite.
let estado = {
  ...inicial,
  project: { ...inicial.project, currentPhase: "Funcional" },
  requirements: inicial.requirements.map((item) => ({ ...item, status: "Em análise" })),
  testCases: casosDaEtapa(["CE", "AVL"]),
  executions: [], defects: [], metrics: [], syncHistory: [], mutationHistory: [], structuralCoverage: []
};
estado = applyRepositorySync(estado, etapa("1-funcional-original"), { autoCreateDefects: false });
estado.defects = idsDefeitos.filter((id) => !DESCOBERTOS_NA_ESTRUTURAL.includes(id)).map((id) => defeito(id, "Aberto"));

// Etapa 2 — Estrutural, no código original: entram os casos guiados pela cobertura.
estado = { ...estado, project: { ...estado.project, currentPhase: "Estrutural" },
  testCases: [...estado.testCases, ...casosDaEtapa(["Estrutural"])] };
estado = applyRepositorySync(estado, etapa("2-estrutural-original"), { autoCreateDefects: false });
estado.defects = [...estado.defects, ...DESCOBERTOS_NA_ESTRUTURAL.map((id) => defeito(id, "Aberto"))];

// Correção: os defeitos são corrigidos no fork (commits citados em cada defeito) e a suíte roda no código corrigido.
estado = { ...estado, project: { ...estado.project, currentPhase: "Baseado em defeitos" },
  defects: estado.defects.map((item) => ({ ...item, status: "Fechado" })) };
const semMetricaSoDeCobertura = (s, quantidade) => ({ ...s, metrics: s.metrics.filter((m, i) => !(i === quantidade && !m.mutantsTotal)) });
let antes = estado.metrics.length;
estado = applyRepositorySync(estado, etapa("3-suite-corrigida"), { autoCreateDefects: true });
estado = applyMutationSync(estado, etapa("4-mutacao-inicial"));
estado = semMetricaSoDeCobertura(estado, antes); // a métrica da mutação já copia a cobertura da execução

// Etapa 3 — Mutação: entram os casos que matam sobreviventes.
estado = { ...estado, testCases: [...estado.testCases, ...casosDaEtapa(["Mutação"])] };
antes = estado.metrics.length;
estado = applyRepositorySync(estado, etapa("5-final-corrigida"), { autoCreateDefects: true });
estado = applyMutationSync(estado, etapa("6-mutacao-final"));
estado = semMetricaSoDeCobertura(estado, antes);

// Grafos de fluxo de controle das funções-alvo (código corrigido).
estado = applyGraphAnalysis(estado, etapa("7-grafos"));
estado = {
  ...estado,
  testCases: inicial.testCases.map((caso) => estado.testCases.find((item) => item.id === caso.id)),
  requirements: estado.requirements.map((item) => ({ ...item, status: "Aprovado" })),
  metrics: estado.metrics.map((item, i) => ({ ...item, note: ["Funcional — código original", "Estrutural — código original",
    "Mutação inicial — código corrigido (suíte funcional + estrutural)", "Mutação final — código corrigido (suíte completa)"][i] }))
};

validateImportedState(estado);
const erros = referenceErrors(estado);
if (erros.length) throw new Error(`Referências inválidas: ${erros.join("; ")}`);
writeFileSync(new URL("../output/hotel-vvtestlab-backup.json", import.meta.url), JSON.stringify(estado, null, 2));
const m = dashboardMetrics(estado);
console.log(`casos ${estado.testCases.length} · execuções ${estado.executions.length} · defeitos ${estado.defects.length} · ` +
  `métricas ${estado.metrics.length} · sincronizações ${estado.syncHistory.length} · mutações ${estado.mutationHistory.length} · ` +
  `grafos ${estado.controlFlowGraphs.length} · cobertura por caso ${estado.structuralCoverage.length} · escore ${m.mutationScore}%`);
for (const item of estado.metrics) {
  console.log(`  ${item.phase.padEnd(20)} casos ${item.suiteSize}  cmd ${item.statementCoverage}%  desv ${item.branchCoverage}%  mutação ${item.mutantsKilled}/${item.mutantsTotal}`);
}
