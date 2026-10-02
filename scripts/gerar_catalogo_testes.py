"""Acrescenta ao backup do V&V TestLab o catálogo detalhado dos testes do hotel.

O catálogo alimenta as páginas "Teste funcional", "Teste estrutural" e "Teste de
mutação": código de cada teste pytest, assertivas, descrição, entrada, resultado
esperado, resultado obtido no código original e no corrigido, e a lista completa
de mutantes do Cosmic Ray (rodadas inicial e final) com o cálculo do escore.

Fontes (repositório output/hotel-management-testado):
    tests/test_0[1-3]_*.py, tests/conftest.py        código dos testes e funções auxiliares
    docs/partes/casos_funcionais.md, relatorio_modelo.md, defeitos.md   cenários e defeitos
    evidencias/evolucao.json                         cobertura por etapa
    evidencias/mutacao-{inicial,final}/sessao.sqlite, resumo.json   mutantes
    output/vvtestlab-estudo/2-estrutural-original.json, 5-final-corrigida.json   resultados pytest

Executar depois de scripts/montar_estudo_vvtestlab.mjs (que regrava o backup):

    python scripts/gerar_catalogo_testes.py

As explicações passo a passo de cada caso e de cada etapa vêm de scripts/dados/explicacao_casos.json.
A página "O projeto" (caracterização do sistema) junta os textos de scripts/dados/caracterizacao.json
com as métricas de evidencias/metricas/ e o histórico git do fork; as telas e o diagrama ER são
copiados para public/caracterizacao/.
"""

import ast
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HOTEL = ROOT / "output" / "hotel-management-testado"
EVID = HOTEL / "evidencias"
PARTES = HOTEL / "docs" / "partes"
ESTUDO = ROOT / "output" / "vvtestlab-estudo"
BACKUP = ROOT / "output" / "hotel-vvtestlab-backup.json"
EXPLICACOES = ROOT / "scripts" / "dados" / "explicacao_casos.json"  # texto passo a passo de cada caso e etapa
CARACTERIZACAO = ROOT / "scripts" / "dados" / "caracterizacao.json"  # textos da página "O projeto"
IMAGENS = ROOT / "public" / "caracterizacao"

ARQUIVOS = {"funcional": "test_01_funcional.py", "estrutural": "test_02_estrutural.py", "mutacao": "test_03_mutacao.py"}
AUXILIARES = ["login", "path", "hoje", "reservar", "reserva_existente", "stay", "form_dates", "booking", "availability", "listed_rooms",
              "seed_reservation", "seed_payment"]

# Sobreviventes da rodada inicial (relatório, seção 7.2): (linha, operador, ocorrência).
SOBREVIVENTES = {
    (17, "core/ReplaceComparisonOperator_Lt_LtE", 1): ("S1", "Não equivalente",
        "Nenhum caso tinha a nova estadia terminando no dia em que outra começa; a etapa funcional só testou o limite do outro lado (CT-003). Morto pela ampliação do CT-003."),
    (17, "core/ReplaceComparisonOperator_Lt_IsNot", 1): ("S2", "Não equivalente",
        "Mesmo cenário do S1: entre objetos de data distintos, 'is not' é sempre verdadeiro e acusa conflito. Morto pela ampliação do CT-003."),
    (17, "core/ReplaceComparisonOperator_Lt_NotEq", 1): ("S3", "Não equivalente",
        "'!=' acusa conflito com qualquer estadia posterior não adjacente; nenhum caso reservava um período inteiramente anterior a outro. Morto pela ampliação do CT-003."),
    (23, "core/ReplaceComparisonOperator_Eq_GtE", 0): ("S4", "Não equivalente",
        "Nenhum caso tinha um vínculo de reserva posterior capaz de herdar as datas de uma reserva anterior de outro quarto. Morto pela ampliação do CT-012 (etapa de mutação)."),
    (34, "core/ReplaceComparisonOperator_LtE_Lt", 0): ("S5", "Não equivalente",
        "Nenhum caso reservava todos os quartos do hotel (subconjunto próprio < em vez de <=). Morto pela ampliação do CT-002."),
    (230, "core/ReplaceComparisonOperator_LtE_Eq", 11): ("S6", "Não equivalente",
        "A classe CE-22 foi testada só com 0 noites; 'd2 == d1' deixa passar saída anterior à entrada. Morto pela ampliação do CT-015."),
    (268, "core/ReplaceComparisonOperator_Eq_Is", 9): ("S7", "Não equivalente",
        "'is' só coincide com '==' para inteiros de -5 a 256 (cache do CPython); nenhum caso reservava o quarto 301. Morto pela ampliação do CT-002."),
    (217, "core/ReplaceComparisonOperator_Eq_GtE", 8): ("S8", "Equivalente",
        "A rota só admite GET, POST, HEAD e OPTIONS, e nenhum método diferente de POST é >= 'POST' na ordem lexicográfica."),
    (226, "core/NumberReplacer", 24): ("S9", "Equivalente",
        "d1 só é comparado com datas à meia-noite e com date.today() via d1.date(); deslocar a hora dentro do mesmo dia não inverte nenhuma comparação."),
    (226, "core/NumberReplacer", 26): ("S10", "Equivalente",
        "Idem ao S9: mudar time(0, 0) para time(0, 1) não altera nenhuma comparação de data."),
    (247, "core/NumberReplacer", 34): ("S11", "Equivalente",
        "O custo provisório é sobrescrito por cal_cost antes do único commit."),
    (247, "core/NumberReplacer", 35): ("S12", "Equivalente",
        "Idem ao S11: o valor -1 é sobrescrito por cal_cost antes do commit."),
    (34, "core/ReplaceComparisonOperator_NotEq_Lt", 0): ("S13", "Equivalente",
        "Um conjunto nunca tem mais elementos que a lista de origem, então != e < são a mesma condição."),
    (34, "core/ReplaceComparisonOperator_NotEq_IsNot", 0): ("S14", "Equivalente",
        "Comprimentos só passam de 256 com mais de 256 quartos numa reserva (irrealista); abaixo disso 'is not' equivale a '!='."),
}

OPERADORES = {
    "ReplaceComparisonOperator": "Troca de operador relacional",
    "ReplaceBinaryOperator": "Troca de operador aritmético",
    "ReplaceAndWithOr": "Troca de 'and' por 'or'",
    "ReplaceOrWithAnd": "Troca de 'or' por 'and'",
    "AddNot": "Inserção de 'not'",
    "NumberReplacer": "Troca de constante numérica",
    "ReplaceTrueWithFalse": "Troca de True por False",
    "ReplaceFalseWithTrue": "Troca de False por True",
    "ExceptionReplacer": "Troca da exceção capturada",
    "ZeroIterationForLoop": "Laço com zero iterações",
    "RemoveDecorator": "Remoção de decorador",
    "ReplaceUnaryOperator": "Troca de operador unário",
    "ReplaceBreakWithContinue": "Troca de break por continue",
    "ReplaceContinueWithBreak": "Troca de continue por break",
}


def ler(caminho):
    return json.loads(caminho.read_text(encoding="utf-8"))


def limpar(texto):
    return re.sub(r"[`*]", "", texto).strip()


def tabela(caminho, colunas, prefixo="| CT-"):
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        if linha.startswith(prefixo):
            celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
            if len(celulas) == colunas:
                yield celulas


def funcoes_do_arquivo(arquivo):
    fonte = arquivo.read_text(encoding="utf-8")
    linhas = fonte.splitlines()
    resultado = {}
    for no in ast.parse(fonte).body:
        if not isinstance(no, ast.FunctionDef):
            continue
        inicio = min([d.lineno for d in no.decorator_list] + [no.lineno])
        assertivas = [{"line": a.lineno, "text": "\n".join(linhas[a.lineno - 1:a.end_lineno]).strip()}
                      for a in ast.walk(no) if isinstance(a, ast.Assert)]
        corpo = linhas[no.lineno:no.end_lineno]
        chamadas = sorted({c.func.id for c in ast.walk(no) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)})
        resultado[no.name] = {
            "line": inicio, "endLine": no.end_lineno,
            "code": "\n".join(linhas[inicio - 1:no.end_lineno]),
            "assertions": sorted(assertivas, key=lambda a: a["line"]),
            "comments": [l.strip()[1:].strip() for l in corpo if l.strip().startswith("#")],
            "calls": chamadas,
        }
    return resultado


ACENTOS = {
    "valida": "válida", "varios": "vários", "hospedes": "hóspedes", "hospede": "hóspede", "sao": "são",
    "diaria": "diária", "diarias": "diárias", "saida": "saída", "amanha": "amanhã", "sessao": "sessão",
    "inicio": "início", "numero": "número", "nao": "não", "sobreposicao": "sobreposição", "periodo": "período",
    "usuario": "usuário", "formulario": "formulário", "comecando": "começando", "comecar": "começar", "comeca": "começa", "lotacao": "lotação", "maxima": "máxima", "propria": "própria",
    "so": "só", "vinculo": "vínculo", "numerico": "numérico", "valida": "válida", "hospede": "hóspede",
}


def titulo_humano(nome):
    texto = re.sub(r"^test_CT_\d{3}_", "", nome).replace("_", " ")
    texto = " ".join(ACENTOS.get(p, p) for p in texto.split())
    texto = re.sub(r" e (aceit|rejeitad|recusad|comparad)", r" é \1", texto)
    texto = re.sub(r" a (capacidade|entrada|saída)", r" à \1 ", texto)
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto[:1].upper() + texto[1:]


def resultados(nome_arquivo):
    dados = ler(ESTUDO / nome_arquivo)
    saida = {}
    for item in dados["mapped"]:
        evidencia = item.get("actual", "")
        if "Evidência:" in evidencia:
            evidencia = evidencia.split("Evidência:", 1)[1].strip()
        else:
            evidencia = ""
        saida[item["caseId"]] = {"result": "Passou" if item["result"] == "Aprovado" else "Falhou",
                                 "evidence": evidencia, "duration": item.get("duration")}
    return saida, dados["runId"]


def defeitos_documentados():
    saida = {}
    for (ident, gravidade, funcao, entrada, esperado, obtido, testes, causa, correcao) in \
            tabela(PARTES / "defeitos.md", 9, "| DEF-"):
        commit = re.search(r"\(`?([0-9a-f]{7})`?\)", correcao)
        saida[ident] = {"severity": gravidade, "function": limpar(funcao), "obtained": limpar(obtido),
                        "cause": limpar(causa), "fix": limpar(correcao), "commit": commit.group(1) if commit else ""}
    return saida


def descricao(etapa, titulo, entrada, esperado, comentarios, defeito, titulos_def, falhou_no_original, chamadas):
    acao = {"funcional": "Teste caixa-preta derivado da especificação",
            "estrutural": "Teste caixa-branca acrescentado para cobrir trechos que a etapa funcional não alcançou",
            "mutacao": "Teste acrescentado para matar um mutante que sobreviveu à rodada inicial"}[etapa]
    partes = [f"{acao}. Objetivo: verificar que {titulo[0].lower() + titulo[1:]}.",
              f"Cenário: {entrada}.", f"O teste passa quando: {esperado}."]
    if defeito and falhou_no_original:
        partes.append(f"No código original ele falha e revela o {defeito} ({titulos_def.get(defeito, '')}).")
    elif defeito:
        partes.append(f"Reforça o oráculo do {defeito} ({titulos_def.get(defeito, '')}).")
    if comentarios:
        partes.append("Nota do código: " + " ".join(comentarios))
    if chamadas & {"booking", "availability"}:
        partes.append("Parâmetros não informados no código usam o padrão das funções auxiliares: quarto 101, "
                      "2 hóspedes, entrada em D+10 (hoje + 10 dias) e 2 noites.")
    return " ".join(partes)


def catalogo_de_testes(estado):
    """Uma ficha por caso (CT-xxx). Cada caso tem a parte funcional e, quando houve, as ampliações
    das etapas estrutural e de mutação, que são outras funções pytest com o mesmo número de caso."""
    funcoes = {etapa: funcoes_do_arquivo(HOTEL / "tests" / arquivo) for etapa, arquivo in ARQUIVOS.items()}
    original, run_original = resultados("2-estrutural-original.json")
    original_etapa1, run_etapa1 = resultados("1-funcional-original.json")
    corrigido, run_corrigido = resultados("5-final-corrigida.json")
    defeitos = defeitos_documentados()
    titulos_def = {d["id"]: d["title"] for d in estado["defects"]}
    dados = ler(EXPLICACOES)
    explicacoes, reaproveitados = dados["casos"], dados["reaproveitados_estrutural"]
    partes_por_caso = {}
    for item in ler(EVID / "final-corrigida" / "rastreabilidade.json"):
        if item["etapa"] != "secundario":
            partes_por_caso.setdefault(item["caso"], []).append(item)

    testes = []
    for caso in estado["testCases"]:
        x = explicacoes[caso["id"]]
        partes = []
        for item in sorted(partes_por_caso[caso["id"]], key=lambda i: list(ARQUIVOS).index(i["etapa"])):
            nome = item["teste"].split("::")[-1]
            fonte = funcoes[item["etapa"]][nome]
            ampliacao = None
            if item["etapa"] != "funcional":
                # As ampliações de uma mesma etapa seguem a ordem em que aparecem no arquivo de teste.
                usadas = sum(1 for p in partes if p["stage"] == item["etapa"])
                candidatas = [amp for amp in x["ampliacoes"] if amp["etapa"] == item["etapa"]]
                ampliacao = candidatas[usadas] if usadas < len(candidatas) else None
            partes.append({
                "stage": item["etapa"], "function": nome, "file": f"tests/{ARQUIVOS[item['etapa']]}",
                "line": fonte["line"], "endLine": fonte["endLine"], "code": fonte["code"],
                "assertions": fonte["assertions"], "comments": fonte["comments"], "calls": fonte["calls"],
                "classes": item["classes"], "defect": item["defeito"], "explanation": ampliacao,
            })
        principal = partes[0]
        defeito = next((d["id"] for d in estado["defects"]
                        if d["testCaseId"] == caso["id"] or caso["id"] in d.get("relatedCaseIds", [])), "")
        entrada, esperado = x["entrada"], x["esperado"]
        titulo = titulo_humano(principal["function"])
        info_def = defeitos.get(defeito, {})

        orig = original.get(caso["id"], {"result": "Não executado", "evidence": ""})
        if orig["result"] == "Falhou":
            obtido_orig = x.get("obtido") or orig["evidence"] or "Falhou"
            obs_orig = f"Revela o {defeito}: {titulos_def.get(defeito, '')}."
        else:
            obtido_orig = f"Igual ao esperado: {esperado[0].lower() + esperado[1:]}"
            obs_orig = "O sistema original já fazia certo."
        etapa1 = original_etapa1.get(caso["id"], {"result": "Não executado", "evidence": ""})
        if etapa1["result"] == orig["result"]:
            obtido_etapa1, obs_etapa1 = obtido_orig, obs_orig
        elif etapa1["result"] == "Passou":
            obtido_etapa1 = f"Igual ao esperado: {esperado[0].lower() + esperado[1:]}"
            obs_etapa1 = "Na etapa funcional o caso passou; o defeito só apareceu com a ampliação da etapa estrutural."
        else:
            obtido_etapa1, obs_etapa1 = etapa1["evidence"] or "Falhou", ""
        corr = corrigido.get(caso["id"], {"result": "Não executado", "evidence": ""})
        if corr["result"] == "Passou":
            obtido_corr = f"Igual ao esperado: {esperado[0].lower() + esperado[1:]}"
            obs_corr = (f"Passou depois da correção do {defeito}"
                        f"{' (commit ' + info_def['commit'] + ')' if info_def.get('commit') else ''}." if defeito else "Passou.")
        else:
            obtido_corr = corr["evidence"] or corr["result"]
            obs_corr = "Falhou no código corrigido."
        chamadas = {c for p in partes for c in p["calls"]}

        testes.append({
            "id": caso["id"], "stage": "funcional",
            "stages": ["funcional"] + (["estrutural"] if caso["id"] in reaproveitados else []) + ["mutacao"],
            "structuralPath": reaproveitados.get(caso["id"], ""),
            "requirementId": caso["requirementId"], "technique": caso["technique"],
            "validity": caso["validity"], "file": principal["file"], "function": principal["function"],
            "line": principal["line"], "endLine": principal["endLine"], "code": principal["code"],
            "assertions": principal["assertions"], "comments": principal["comments"],
            "helpers": [h for h in AUXILIARES if h in chamadas],
            "parts": [{k: v for k, v in p.items() if k != "calls"} for p in partes],
            "title": titulo, "classes": list(dict.fromkeys(c for p in partes for c in p["classes"])),
            "defect": defeito, "defectTitle": titulos_def.get(defeito, ""), "defectCommit": info_def.get("commit", ""),
            "input": entrada, "expected": esperado,
            "description": descricao("funcional", titulo, entrada, esperado, principal["comments"], defeito, titulos_def,
                                     orig["result"] == "Falhou", chamadas),
            "original": {**orig, "obtained": obtido_orig, "note": obs_orig, "runId": run_original},
            "originalStage1": {**etapa1, "obtained": obtido_etapa1, "note": obs_etapa1, "runId": run_etapa1},
            "corrected": {**corr, "obtained": obtido_corr, "note": obs_corr, "runId": run_corrigido},
        })
    auxiliares_fonte = funcoes_do_arquivo(HOTEL / "tests" / "conftest.py")
    auxiliares = {nome: auxiliares_fonte[nome]["code"] for nome in AUXILIARES}
    return testes, auxiliares


def mutantes(caso_por_funcao):
    resumo = {r: ler(EVID / f"mutacao-{r}" / "resumo.json") for r in ("inicial", "final")}
    faixas = resumo["final"]["funcoes"]

    def funcao_da_linha(linha):
        return next((nome for nome, (ini, fim) in faixas.items() if ini <= linha <= fim), "?")

    def rodada(nome):
        con = sqlite3.connect(EVID / f"mutacao-{nome}" / "sessao.sqlite")
        linhas = con.execute(
            "select s.start_pos_row, s.start_pos_col, s.operator_name, s.occurrence, r.test_outcome, r.output, r.diff "
            "from mutation_specs s join work_results r using(job_id)").fetchall()
        saida = {}
        for linha, coluna, operador, ocorrencia, resultado, texto, diff in linhas:
            assassino = re.search(r"_+ (test_CT_\d{3}\w*) _+", texto or "")
            erro = [l[1:].strip() for l in (texto or "").splitlines() if l.startswith("E ")][:4]
            saida[(linha, coluna, operador, ocorrencia)] = {
                "outcome": "Morto" if resultado == "KILLED" else "Sobrevivente" if resultado == "SURVIVED" else resultado,
                "killedBy": caso_por_funcao.get(assassino.group(1), assassino.group(1)) if assassino else "",
                "error": " | ".join(erro)[:400], "diff": diff or ""}
        return saida

    inicial, final = rodada("inicial"), rodada("final")
    lista = []
    for chave in sorted(final, key=lambda k: (k[0], k[2], k[3], k[1])):
        linha, coluna, operador, ocorrencia = chave
        f, i = final[chave], inicial.get(chave, {})
        removida = [l[1:] for l in f["diff"].splitlines() if l.startswith("-") and not l.startswith("---")]
        inserida = [l[1:] for l in f["diff"].splitlines() if l.startswith("+") and not l.startswith("+++")]
        familia = operador.split("/")[-1].split("_")[0]
        tag, classe, justificativa = SOBREVIVENTES.get((linha, operador, ocorrencia), ("", "", ""))
        lista.append({
            "id": f"M{len(lista) + 1:03d}", "function": funcao_da_linha(linha), "line": linha,
            "operator": operador.replace("core/", ""), "operatorFamily": OPERADORES.get(familia, familia),
            "occurrence": ocorrencia, "original": "\n".join(removida).strip(), "mutated": "\n".join(inserida).strip(),
            "initial": i.get("outcome", "—"), "initialKilledBy": i.get("killedBy", ""),
            "final": f["outcome"], "killedBy": f["killedBy"], "error": f["error"],
            "survivorTag": tag, "classification": classe, "justification": justificativa,
        })
    rodadas = []
    evolucao = ler(EVID / "evolucao.json")
    linhas = {linha["etapa"].split(". ")[1]: linha for linha in evolucao}
    for nome, suite in (("inicial", f'15 casos com as ampliações estruturais ({linhas["Correção"]["testes"]} testes pytest)'),
                        ("final", f'15 casos com todas as ampliações ({linhas["Mutação"]["testes"]} testes pytest)')):
        r = resumo[nome]
        rodadas.append({"id": nome, "suite": suite, "total": r["total"], "killed": r["mortos"],
                        "survived": r["sobreviventes"], "score": r["escore_pct"], "duration": r["duracao_s"],
                        "byFunction": r["por_funcao"]})
    equivalentes = sum(1 for m in lista if m["classification"] == "Equivalente")
    final_r = rodadas[-1]
    return {
        "tool": "Cosmic Ray 8.4.3", "module": "hotel/views.py (código corrigido)",
        "functions": list(faixas), "runs": rodadas, "mutants": lista, "equivalent": equivalentes,
        "adjustedScore": round(100 * final_r["killed"] / (final_r["total"] - equivalentes), 1),
    }


def git(*args):
    return subprocess.run(["git", "-C", str(HOTEL), *args], capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip()


def caracterizacao():
    """Textos da caracterização + métricas medidas (radon/pygount) + histórico git do fork."""
    dados = ler(CARACTERIZACAO)
    metricas = ler(EVID / "metricas" / "metricas.json")
    radon = ler(EVID / "metricas" / "radon-cc.json")
    no_recorte = {"reserve", "cal_cost"}
    funcoes = sorted(({"name": f["name"], "module": modulo.replace("\\", "/"), "cc": f["complexity"], "rank": f["rank"],
                       "inScope": f["name"] in no_recorte}
                      for modulo, itens in radon.items() for f in itens if f["type"] == "function"),
                     key=lambda f: -f["cc"])
    upstream = "upstream-71b396b"
    datas_upstream = git("log", "--format=%ad", "--date=short", upstream).splitlines()
    dados["metricas"] = {**metricas, "funcoesComplexidade": funcoes}
    dados["git"] = {
        "upstreamCommit": git("rev-parse", upstream),
        "upstreamCommits": len(datas_upstream),
        "upstreamPeriodo": [datas_upstream[-1], datas_upstream[0]],
        "forkCommits": int(git("rev-list", "--count", "HEAD")),
        "forkNovosCommits": int(git("rev-list", "--count", f"{upstream}..HEAD")),
        "forkUltimo": dict(zip(["hash", "data", "mensagem"], git("log", "-1", "--format=%h%n%ad%n%s", "--date=short").splitlines())),
        "tags": git("tag", "--list").split(),
    }
    # Imagens servidas pela ferramenta: telas do sistema em execução e o diagrama ER (recortado e reduzido).
    from PIL import Image
    IMAGENS.mkdir(parents=True, exist_ok=True)
    for arquivo, _, *recorte in dados["telas"]:  # recorte opcional [x0, y0, x1, y1] tira o espaço em branco
        tela = Image.open(EVID / "telas" / arquivo)
        (tela.crop(tuple(recorte[0])) if recorte else tela).save(IMAGENS / arquivo, optimize=True)
    er = Image.open(HOTEL / "Image" / "ER.png").convert("RGB")
    er = er.crop((90, 100, 2840, 1800))
    er.thumbnail((1400, 1400))
    er.save(IMAGENS / "diagrama-er.png", optimize=True)
    dados["diagramaER"] = "diagrama-er.png"
    return dados


def commit_info(ref):
    hash_curto, data, mensagem = git("log", "-1", "--format=%h%n%ad%n%s", "--date=format:%d/%m/%Y %H:%M", ref).splitlines()
    return {"hash": hash_curto, "full": git("rev-parse", ref), "date": data, "message": mensagem}


def trecho_corrigido(linhas, defeito):
    """Blocos do views.py corrigido marcados com o comentário do defeito (ex.: "# DEF-04/05/06: ...")."""
    numero = defeito.split("-")[1]
    blocos = []
    for i, linha in enumerate(linhas):
        marca = re.search(r"DEF-(\d+(?:/\d+)*)", linha)
        if not marca or numero not in marca.group(1).split("/"):
            continue
        anterior = linhas[i - 1].strip() if i else ""
        if anterior.startswith("def "):  # função auxiliar inteira
            inicio, fim = i - 1, i
            while fim + 1 < len(linhas) and linhas[fim + 1].strip():
                fim += 1
        else:  # comentário + o comando seguinte e o que está dentro dele
            recuo = len(linha) - len(linha.lstrip())
            inicio, fim = i, min(i + 1, len(linhas) - 1)
            while fim + 1 < len(linhas) and linhas[fim + 1].strip() and len(linhas[fim + 1]) - len(linhas[fim + 1].lstrip()) > recuo:
                fim += 1
        funcao = next((l[4:].split("(")[0] for l in reversed(linhas[:inicio + 1]) if l.startswith("def ")), "")
        blocos.append({"start": inicio + 1, "marked": [i + 1], "lines": linhas[inicio:fim + 1], "function": funcao})
    # Primeiro os trechos das funções do recorte (reserva, custo e auxiliares).
    return sorted(blocos, key=lambda b: not (b["function"] in {"reserve", "cal_cost"} or b["function"].startswith("_")))


def detalhes_dos_defeitos(estado, testes):
    """Onde cada defeito acontecia (código original), como ficou (código corrigido) e quando foi revelado e corrigido."""
    tabela = {}
    for linha in (PARTES / "defeitos.md").read_text(encoding="utf-8").splitlines():
        celulas = [c.strip() for c in linha.strip().strip("|").split("|")]
        if celulas and re.fullmatch(r"DEF-\d+", celulas[0]):
            tabela[celulas[0]] = dict(zip(["id", "severity", "where", "input", "expected", "obtained", "tests", "cause", "fix"], celulas))
    original = git("show", "sut-original:hotel/views.py").splitlines()
    corrigido = (HOTEL / "hotel" / "views.py").read_text(encoding="utf-8").splitlines()
    etapas = {"funcional": commit_info(git("log", "-1", "--format=%h", "--grep=^Etapa 1")),
              "estrutural": commit_info(git("log", "-1", "--format=%h", "--grep=^Etapa 2"))}
    mutacao = commit_info(git("log", "-1", "--format=%h", "--grep=mutação inicial"))
    revelado = {p["defect"]: (p["stage"], t["id"]) for t in testes for p in t["parts"] if p.get("defect")}
    detalhes = {}
    for defeito in estado["defects"]:
        linha = tabela[defeito["id"]]
        # Trecho do original: a parte da função reserve (o recorte), ou a primeira função citada.
        partes = [p.strip() for p in linha["where"].split(";")]
        parte = next((p for p in partes if p.startswith("`reserve`")), partes[0])
        funcao = re.match(r"`([^`]+)`", parte).group(1)
        marcadas = []
        for a, b in re.findall(r"(\d+)(?:–(\d+))?", parte.split("`")[-1]):
            marcadas += list(range(int(a), int(b or a) + 1))
        inicio, fim = max(1, min(marcadas) - 2), min(len(original), max(marcadas) + 2)
        estagio, caso = revelado.get(defeito["id"], ("funcional", defeito["testCaseId"]))
        commits = list(dict.fromkeys(re.findall(r"`([0-9a-f]{7})`", linha["fix"])))
        detalhes[defeito["id"]] = {
            "severity": linha["severity"], "function": funcao, "where": linha["where"],
            "input": linha["input"], "expected": linha["expected"], "obtained": linha["obtained"],
            "cause": linha["cause"], "fix": re.sub(r"\s*\((`[0-9a-f]{7}`(?:, )?)+\)\s*$", "", linha["fix"]),
            "original": {"start": inicio, "marked": marcadas, "lines": original[inicio - 1:fim]},
            "corrected": trecho_corrigido(corrigido, defeito["id"])[:2],
            "revealed": {"stage": estagio, "caseId": caso, "commit": etapas[estagio]},
            "fixedBy": [commit_info(c) for c in commits],
            "mutationAfter": mutacao,
        }
        if not detalhes[defeito["id"]]["corrected"] or not commits:
            raise SystemExit(f"{defeito['id']}: sem trecho corrigido ou sem commit de correção")
    return detalhes


def main():
    estado = ler(BACKUP)
    testes, auxiliares = catalogo_de_testes(estado)
    caso_por_funcao = {p["function"]: t["id"] for t in testes for p in t["parts"]}
    evolucao = ler(EVID / "evolucao.json")
    mutacao = mutantes(caso_por_funcao)
    for teste in testes:  # com pytest -x, cada mutante morto é creditado ao primeiro teste que falhou
        teste["mutantsKilled"] = [m["id"] for m in mutacao["mutants"] if m["killedBy"] == teste["id"]]
        teste["survivorsKilled"] = [m["id"] for m in mutacao["mutants"]
                                    if m["killedBy"] == teste["id"] and m["initial"] == "Sobrevivente"]
    # Resultado de cada execução em linguagem simples (a ponte grava o texto técnico do pytest).
    por_id = {t["id"]: t for t in testes}
    # Títulos dos casos cadastrados iguais aos do catálogo (com acentos), para todas as páginas mostrarem o mesmo texto.
    for caso in estado["testCases"]:
        if caso["id"] in por_id:
            caso["title"] = por_id[caso["id"]]["title"]
    for execucao in estado["executions"]:
        teste = por_id.get(execucao["testCaseId"])
        if not teste:
            continue
        if execucao["result"] == "Aprovado":
            execucao["actual"] = f'Passou: {teste["expected"][0].lower() + teste["expected"][1:]}.'
        else:
            evidencia = execucao["actual"].split("Evidência:", 1)[-1].strip() if "Evidência:" in execucao["actual"] else ""
            execucao["actual"] = (f'Falhou: {teste["original"]["obtained"][0].lower() + teste["original"]["obtained"][1:]}.'
                                  + (f' Mensagem do pytest: {evidencia}' if evidencia else ""))
    explicacoes = ler(EXPLICACOES)
    faltando = [t["id"] for t in testes if t["id"] not in explicacoes["casos"]]
    if faltando:
        raise SystemExit(f"Casos sem explicação em {EXPLICACOES.name}: {faltando}")
    for teste in testes:
        teste["explanation"] = explicacoes["casos"][teste["id"]]
    # Texto simples de cada nó dos grafos e código-fonte de cada função analisada.
    textos_grafos = ler(EXPLICACOES.with_name("explicacao_grafos.json"))
    fonte_views = (HOTEL / "hotel" / "views.py").read_text(encoding="utf-8").splitlines()
    graph_text, graph_sources = {}, {}
    for grafo in estado["controlFlowGraphs"]:
        textos = textos_grafos[grafo["method"].split(".")[-1]]
        nos = {}
        for no in grafo["nodes"]:
            chave = {"entry": "entrada", "exit": "saida"}.get(no["type"], str(no["line"]))
            if chave not in textos:
                raise SystemExit(f"Nó sem texto em explicacao_grafos.json: {grafo['method']} {chave}")
            nos[no["id"]] = {"short": textos[chave][0], "text": textos[chave][1]}
        graph_text[grafo["id"]] = nos
        graph_sources[grafo["id"]] = {"start": grafo["line"], "lines": fonte_views[grafo["line"] - 1:grafo["endLine"]]}
    estado["testCatalog"] = {
        "source": "output/hotel-management-testado (tests/, evidencias/, docs/partes/)",
        "tests": testes, "helpers": auxiliares, "evolution": evolucao, "mutation": mutacao,
        "guide": {"base": explicacoes["base"], "stages": explicacoes["etapas"]},
        "graphText": graph_text, "graphSources": graph_sources,
        "characterization": caracterizacao(),
        "defects": detalhes_dos_defeitos(estado, testes),
    }
    # Versão do estudo: a ferramenta recarrega o estudo publicado quando ela muda.
    estado.pop("studyVersion", None)
    estado["studyVersion"] = hashlib.sha1(json.dumps(estado, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:12]
    BACKUP.write_text(json.dumps(estado, ensure_ascii=False, indent=2), encoding="utf-8")
    # Cópia servida pela ferramenta: "Carregar estudo oficial" e o endereço ?estudo=oficial.
    publicado = ROOT / "public" / "estudo-hotel.json"
    publicado.write_text(json.dumps(estado, ensure_ascii=False), encoding="utf-8")
    m = estado["testCatalog"]["mutation"]
    por_etapa = {e: sum(1 for t in testes if e in t["stages"]) for e in ARQUIVOS}
    print(f"testes {por_etapa} · mutantes {len(m['mutants'])} · equivalentes {m['equivalent']} · "
          f"escore ajustado {m['adjustedScore']}% · backup {BACKUP.stat().st_size // 1024} KB")
    if len(testes) != 15 or len(m["mutants"]) != 141:
        raise SystemExit("Contagens inesperadas")


if __name__ == "__main__":
    main()
