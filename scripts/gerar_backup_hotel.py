"""Gera os projetos importáveis pelo V&V TestLab a partir do estudo do hotel.

Fontes (repositório output/hotel-management-testado):
    tests/classes_equivalencia.json         classes de equivalência (22 dos três requisitos)
    evidencias/final-corrigida/rastreabilidade.json   caso -> etapa -> classes -> defeito
    docs/partes/casos_funcionais.md, docs/partes/relatorio_modelo.md   cenário e resultado esperado
    docs/partes/defeitos.md                 19 defeitos (causa, correção e commit)
    evidencias/*/junit.xml, evidencias/evolucao.json, evidencias/metricas/metricas.json

Saídas:
    output/hotel-vvtestlab-projeto-inicial.json  mapeamento sem execuções, defeitos ou métricas,
                                                 para a demonstração ao vivo com a ponte
    output/hotel-vvtestlab-backup.json           estudo completo: execuções no original e no
                                                 corrigido, 10 defeitos fechados e 4 métricas
"""

from datetime import date
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from gerar_catalogo_testes import titulo_humano

ROOT = Path(__file__).resolve().parents[1]
HOTEL = ROOT / "output" / "hotel-management-testado"
EVID = HOTEL / "evidencias"
PARTES = HOTEL / "docs" / "partes"
TODAY = date.today().isoformat()
FORK = "https://github.com/gabrielfjm/Hotel_Management_System"

AVL = {1, 2, 3, 4, 9, 10, 12, 13, 15}  # casos funcionais no limite ou imediatamente fora dele
FUNCOES = "reserve,cal_cost,_sessao_autenticada,_periodos_conflitam,_quartos_ocupados,_ler_quartos"
REQUISITOS_SISTEMA = (
    "Requisitos funcionais do sistema: RF-01 Cadastrar usuário; RF-02 Entrar/sair (sessão); RF-03 Listar quartos; "
    "RF-04 Consultar disponibilidade; RF-05 Reservar quartos; RF-06 Minha conta; RF-07 Alterar reserva; "
    "RF-08 Cancelar reserva; RF-09 Registrar pagamento. Recorte testado: REQ-01 Reservar quartos (RF-05), "
    "REQ-02 Data de entrada e REQ-03 Data de saída. RF-04 (consulta) e RF-08 (cancelamento) têm testes "
    "complementares no repositório (DEF-08 a DEF-14, DEF-16 e DEF-17, no relatório); os demais estão documentados.")


TITULOS = {
    "DEF-01": "Quarto reservado uma vez nunca mais pode ser reservado",
    "DEF-02": "Entrada no dia de hoje é recusada",
    "DEF-03": "Reserva com zero hóspedes é aceita",
    "DEF-04": "Texto no campo de quartos derruba o sistema",
    "DEF-05": "Quarto inexistente é aceito na reserva",
    "DEF-06": "Quarto repetido dobra a capacidade e o preço",
    "DEF-07": "Visitante sem login derruba a página de reserva",
    "DEF-08": "Usuário cancela reserva de outro usuário",
    "DEF-09": "Cancelar reserva inexistente gera erro 500",
    "DEF-10": "Requisição GET exclui a reserva",
    "DEF-11": "Pagamento fica órfão após o cancelamento",
    "DEF-12": "Consulta aceita período vazio ou invertido",
    "DEF-13": "Consulta aceita número de hóspedes inválido",
    "DEF-14": "Consulta ignora a capacidade dos quartos",
    "DEF-15": "Quarto livre é recusado por causa de reservas de outros quartos",
    "DEF-16": "Filtro de disponibilidade global vaza entre sessões",
    "DEF-17": "Remoção durante a iteração pula quartos ocupados",
    "DEF-18": "Data fora do formato derruba o sistema",
    "DEF-19": "Hóspedes escritos por extenso derrubam o sistema",
}


def ler(caminho):
    return json.loads(caminho.read_text(encoding="utf-8"))


def limpar(texto):
    return re.sub(r"[`*]", "", texto).strip()


def linhas_de_tabela(caminho, colunas):
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        if linha.startswith("| CT-") or linha.startswith("| DEF-"):
            celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
            if len(celulas) == colunas:
                yield celulas


def junit(caminho):
    raiz = ET.parse(caminho).getroot()
    for teste in raiz.iter("testcase"):
        caso = re.search(r"CT_(\d{3})", teste.get("name", ""))
        if not caso:
            continue
        pulado = teste.find("skipped")
        falha = teste.find("failure") if teste.find("failure") is not None else teste.find("error")
        if pulado is not None:  # xfail estrito no original = defeito confirmado
            yield f"CT-{caso.group(1)}", "Falhou", "Falha esperada confirmada (xfail estrito): " + (pulado.get("message") or "")
        elif falha is not None:
            yield f"CT-{caso.group(1)}", "Falhou", falha.get("message") or "Falha"
        else:
            yield f"CT-{caso.group(1)}", "Aprovado", "Asserções concluídas com sucesso no pytest."


def main():
    textos = ler(ROOT / "scripts" / "dados" / "explicacao_casos.json")  # textos em linguagem simples
    catalogo = [c for c in ler(HOTEL / "tests" / "classes_equivalencia.json") if c["req"].startswith("REQ")]
    por_id = {c["id"]: c for c in catalogo}
    classes = [{
        "id": c["id"], "requirementId": c["req"],
        "name": c["descricao"],
        "condition": re.sub(r"^C\d+ ", "", c["condicao"]), "type": "Válida" if c["tipo"] == "válida" else "Inválida",
        "min": None, "max": None,
    } for c in catalogo]

    # Um caso pode ter várias funções pytest: a funcional e as ampliações das etapas 2 e 3 (mesmo CT-xxx).
    matriz = [m for m in ler(EVID / "final-corrigida" / "rastreabilidade.json") if m["etapa"] != "secundario"]
    partes = {}
    for item in matriz:
        partes.setdefault(item["caso"], []).append(item)
    casos = []
    for caso_id in sorted(partes):
        funcional = next(p for p in partes[caso_id] if p["etapa"] == "funcional")
        todas_classes = list(dict.fromkeys(c for p in partes[caso_id] for c in p["classes"]))
        invalidas = [c for c in funcional["classes"] if por_id[c]["tipo"] == "inválida"]
        principal = invalidas[0] if invalidas else funcional["classes"][0]
        explicacao = textos["casos"][caso_id]
        casos.append({
            "id": caso_id, "requirementId": por_id[principal]["req"], "classId": principal, "classIds": todas_classes,
            "title": titulo_humano(funcional["teste"].split("::")[-1]), "input": explicacao["entrada"],
            "precondition": textos["base"]["preparacao"],
            "steps": explicacao["passos"],
            "expected": explicacao["esperado"], "validity": "Inválido" if invalidas else "Válido",
            "technique": "AVL" if int(caso_id[3:]) in AVL else "CE",
            "priority": "Alta" if any(p["defeito"] for p in partes[caso_id]) else "Média", "status": "Pronto",
        })

    requisitos = [
        {"id": "REQ-01", "title": "Reservar quartos", "method": "reserve",
         "description": "Reservar um ou mais quartos (números inteiros, existentes, sem repetição) para 1 até a capacidade "
                        "somada de hóspedes, somente se nenhum quarto tiver estadia com interseção no período; grava a "
                        "reserva, os quartos escolhidos e o custo.",
         "priority": "Alta", "status": "Aprovado"},
        {"id": "REQ-02", "title": "Data de entrada (check-in)", "method": "_periodos_conflitam",
         "description": "A data de entrada deve estar no formato MM/DD/AAAA, não pode ser passada (hoje é permitido) e uma "
                        "estadia pode começar no dia em que outra do mesmo quarto termina.",
         "priority": "Alta", "status": "Aprovado"},
        {"id": "REQ-03", "title": "Data de saída (check-out)", "method": "cal_cost",
         "description": "A data de saída deve estar no formato MM/DD/AAAA e ser posterior à entrada (mínimo 1 noite); define "
                        "o número de diárias cobradas e pode coincidir com a entrada de outra estadia do mesmo quarto.",
         "priority": "Alta", "status": "Aprovado"},
    ]

    execucoes = []
    for pasta, sut, ambiente in (
        ("estrutural-original", "original", "Código original (tag sut-original) / Windows / Python 3.9.25 / pytest 8.4.2"),
        ("final-corrigida", "corrigido", "Código corrigido (tag sut-corrigido) / Windows / Python 3.9.25 / pytest 8.4.2"),
    ):
        for caso, resultado, detalhe in junit(EVID / pasta / "junit.xml"):
            execucoes.append({
                "id": f"EXE-{len(execucoes) + 1:03d}", "testCaseId": caso, "date": TODAY,
                "result": resultado, "actual": detalhe[:1500], "environment": ambiente,
                "source": "pytest", "sourceRunId": f"evidencias/{pasta}",
            })

    conhecidos = {c["id"] for c in casos}
    defeitos = []
    for (ident, gravidade, funcao, entrada, esperado, obtido, testes, causa, correcao) in \
            linhas_de_tabela(PARTES / "defeitos.md", 9):
        casos_def = []
        for inicio, fim in re.findall(r"(\d{3})(?:\s*[–-]\s*(\d{3}))?", testes):
            casos_def += [f"CT-{n:03d}" for n in range(int(inicio), int(fim or inicio) + 1)]
        casos_def = [c for c in casos_def if c in conhecidos]
        if not casos_def:
            continue  # defeito do RF secundário (cancelamento): documentado no relatório, fora da ferramenta
        caso = casos_def[0]
        defeitos.append({
            "id": ident, "testCaseId": caso, "relatedCaseIds": casos_def[1:],
            "title": TITULOS[ident],
            "severity": "Alta" if gravidade in ("Crítica", "Alta") else "Média",
            "status": "Fechado",
            "description": textos["defeitos"][ident]["descricao"],
            "correction": textos["defeitos"][ident]["correcao"],
        })

    fases = {"1. Funcional": "Funcional", "2. Estrutural": "Estrutural",
             "3. Correção": "Baseado em defeitos", "4. Mutação": "Baseado em defeitos"}
    metricas = []
    for linha in ler(EVID / "evolucao.json"):
        mortos, total = (linha["mutacao"].split("/") if "/" in linha["mutacao"] else ("0", "0"))
        metricas.append({
            "id": f"MET-{len(metricas) + 1:03d}", "phase": fases[linha["etapa"]], "date": TODAY,
            "suiteSize": linha["casos"], "statementCoverage": linha["pct_comandos"],
            "branchCoverage": linha["pct_desvios"], "mutantsTotal": int(total), "mutantsKilled": int(mortos),
            "note": f'{linha["etapa"]} — código {linha["sut"]}',
        })

    codigo = ler(EVID / "metricas" / "metricas.json")
    projeto = {
        "name": "Hotel Management System — V&V",
        "repository": FORK,
        "purpose": "Testar a reserva de quartos e as regras das datas de entrada e de saída de um sistema web Flask de "
                   "terceiros (CrystalWang1225/Hotel_Management_System, commit 71b396b). " + REQUISITOS_SISTEMA,
        "coverageTarget": 100, "currentPhase": "Baseado em defeitos", "localRepository": str(HOTEL.resolve()),
        "bridgeUrl": "http://127.0.0.1:8765", "autoCreateDefects": "Sim",
        "mutationTool": "cosmic-ray", "cosmicRayConfig": "cosmic-ray.toml",
        "cosmicRaySelector": "scripts/selecionar_mutantes.py",
        "mutationPython": ".venv-mutation/Scripts/python.exe",
        "coverageSource": "hotel.views", "coverageFunctions": FUNCOES, "pytestArgs": "tests -m 'funcional or estrutural or mutacao'",
        "loc": codigo["sloc"], "functions": codigo["funcoes_mais_metodos"],
        "codeClasses": codigo["classes"], "modules": codigo["num_modulos"],
    }
    completo = {
        "project": projeto, "requirements": requisitos, "classes": classes, "testCases": casos,
        "executions": execucoes, "defects": defeitos, "metrics": metricas,
        "syncHistory": [], "mutationHistory": [], "controlFlowGraphs": [],
        "structuralCoverage": [], "graphAnalysis": None,
    }
    (ROOT / "output" / "hotel-vvtestlab-backup.json").write_text(
        json.dumps(completo, ensure_ascii=False, indent=2), encoding="utf-8")
    inicial = {**completo, "project": {**projeto, "currentPhase": "Funcional"},
               "requirements": [{**r, "status": "Em análise"} for r in requisitos],
               "executions": [], "defects": [], "metrics": []}
    (ROOT / "output" / "hotel-vvtestlab-projeto-inicial.json").write_text(
        json.dumps(inicial, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(requisitos)} requisitos, {len(classes)} classes, {len(casos)} casos, "
          f"{len(execucoes)} execuções, {len(defeitos)} defeitos, {len(metricas)} métricas")
    if len(casos) != 15 or len(defeitos) != 10 or len(classes) != 22:
        raise SystemExit("Contagens inesperadas")


if __name__ == "__main__":
    main()
