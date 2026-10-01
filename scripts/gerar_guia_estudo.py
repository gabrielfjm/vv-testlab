"""Gera o guia de estudo da apresentação: cada caso explicado passo a passo.

Fontes: output/hotel-vvtestlab-backup.json (catálogo dos testes, gerado por
scripts/gerar_catalogo_testes.py), scripts/dados/explicacao_casos.json e
tests/classes_equivalencia.json do repositório do hotel.

    uv run --no-project --python 3.12 --with markdown==3.9 --with playwright==1.55.0 python scripts/gerar_guia_estudo.py

Saídas: output/GUIA-DE-ESTUDO.md e output/GUIA-DE-ESTUDO.pdf
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOTEL = ROOT / "output" / "hotel-management-testado"
SAIDA = ROOT / "output" / "GUIA-DE-ESTUDO"

CONCEITOS = [
    ("Classe de equivalência (CE)", "Grupo de entradas que o sistema deveria tratar do mesmo jeito. Se um valor do grupo funciona, os outros também deveriam. Ex.: \"hóspedes de 1 até a capacidade\" é uma classe válida; \"menos de 1 hóspede\" é uma classe inválida. Testa-se um representante de cada classe."),
    ("Análise do valor limite (AVL)", "Os erros se concentram nas fronteiras. Por isso o teste usa o valor exatamente no limite e logo fora dele: 0 e 1 hóspede, ontem e hoje, 0 e 1 noite, 5 e 6 hóspedes."),
    ("Caso de teste", "Uma situação concreta com entrada, ação e resultado esperado. Aqui, cada caso é uma função pytest chamada test_CT_xxx_..."),
    ("Assertiva (assert)", "A linha que diz o que precisa ser verdade para o teste passar. Se qualquer assert for falso, o teste falha."),
    ("xfail estrito", "Marca usada no código ORIGINAL nos testes que revelam defeito: o teste precisa falhar. Se um dia ele passar, o pytest acusa erro, porque o defeito \"sumiu\" sem explicação. No código corrigido não há marca e o teste precisa passar."),
    ("Cobertura de comandos", "Porcentagem das linhas de código que pelo menos um teste executou."),
    ("Cobertura de desvios", "Porcentagem dos caminhos de cada if/for (lado verdadeiro e lado falso) que algum teste percorreu. É mais exigente que a de comandos."),
    ("Desvio inviável", "Caminho que nenhuma entrada consegue percorrer. Aqui, o 230→229 do original: os IDs das reservas vêm em ordem crescente, então a condição \"rid > maior anterior\" nunca é falsa."),
    ("Grafo de fluxo de controle", "Desenho da função em nós (comandos e decisões) e arestas (caminhos possíveis). O V&V TestLab pinta de verde o que cada teste executou."),
    ("Mutante", "Cópia do código com UMA alteração pequena, como trocar < por <=. Simula um erro de programação."),
    ("Mutante morto / sobrevivente", "Morto: algum teste falhou com a alteração, ou seja, a suíte percebeu o erro. Sobrevivente: todos os testes passaram, ou seja, a suíte deixaria esse erro passar."),
    ("Mutante equivalente", "Alteração que não muda o comportamento do programa (ex.: um valor que é sobrescrito antes de ser usado). Nenhum teste consegue matá-lo; por isso é descontado do escore ajustado."),
    ("Escore de mutação", "Mortos ÷ total de mutantes. Mede a força da suíte: quanto maior, mais erros ela detectaria."),
]

PERGUNTAS = [
    ("Por que só 15 casos funcionais?", "Porque a técnica pede um caso por classe inválida (11) e permite cobrir todas as classes válidas com poucos casos. Os valores-limite foram embutidos nesses mesmos casos (o caso inválido usa o valor logo fora do limite e o válido usa o valor no limite). Com isso, 15 casos revelaram 9 dos 10 defeitos do recorte."),
    ("Por que a consulta de disponibilidade ficou de fora do recorte?", "Ela tem formulário e regras próprias. Para manter o recorte enxuto, concentrei os três requisitos na reserva (reservar, data de entrada, data de saída). A consulta e o cancelamento ficaram como requisitos secundários, com testes complementares que também revelaram e confirmaram defeitos (DEF-08 a DEF-14, DEF-16 e DEF-17)."),
    ("O que é o xfail estrito e por que usar?", "É o jeito de provar o defeito no código original: o mesmo teste precisa FALHAR no original e PASSAR no corrigido. Se o defeito deixasse de existir sem correção, o teste avisaria."),
    ("Por que a cobertura de desvios ficou em 97,1% no original?", "Falta só o desvio 230→229, que é inviável: os IDs das reservas são crescentes, então a condição nunca é falsa. Todos os desvios viáveis foram cobertos. No código corrigido esse laço sumiu e a cobertura é 100%."),
    ("Se a cobertura era 100%, por que ainda havia mutantes vivos?", "Porque cobertura mede o que foi EXECUTADO, não o que foi VERIFICADO. Um teste pode passar por uma linha sem conferir o resultado dela no ponto exato. A mutação mostrou 7 fraquezas: limite testado de um lado só, um único exemplo de classe inválida, dados parecidos demais (quartos < 256) e ordem fixa de criação das reservas."),
    ("Por que corrigir os defeitos antes da mutação?", "A mutação precisa de uma suíte que passe 100% no programa. Com 10 testes falhando no original, não daria para saber se uma falha veio da mutação ou do defeito que já existia."),
    ("O que é um mutante equivalente? Dê um exemplo.", "É uma mudança que não altera o comportamento. Ex.: o custo da reserva é criado como 0 e depois substituído por cal_cost antes de salvar; trocar esse 0 por 1 não muda nada. Os 7 equivalentes estão justificados um a um no relatório (S8 a S14)."),
    ("Qual o defeito mais grave?", "DEF-01: a condição de conflito de datas é uma tautologia (sempre verdadeira). Depois da primeira reserva, o quarto nunca mais podia ser reservado. Foi revelado pelo valor limite \"entrar no dia em que a outra estadia sai\" (CT-003)."),
    ("O que significa defeito mascarado?", "DEF-15 só aparece depois que o DEF-01 é corrigido. Com a tautologia, tudo era recusado; mesmo corrigindo só a condição, o laço continuava juntando o quarto de uma reserva com as datas de outra (ampliação estrutural do CT-012)."),
    ("Por que vocês não criaram casos novos nas etapas 2 e 3?", "Porque os 15 casos funcionais já percorriam quase todo o código. Na estrutural, reaproveitei 5 deles (um por caminho principal da reserva) e só AMPLIEI 3 com o cenário que faltava para a cobertura. Na mutação, os 15 rodaram contra cada mutante e ampliei 4 para matar os sobreviventes. A ampliação é outra função pytest com o mesmo número de caso, então a rastreabilidade continua a mesma."),
    ("Por que as datas são de 2030?", "Para serem datas reais e fixas que continuam no futuro (a reserva não aceita datas passadas). Só os casos de 'hoje' e 'ontem' usam a data do dia da execução, porque testam exatamente essa fronteira."),
    ("Como foi calculado o escore de mutação?", "Inicial: 127 ÷ 141 = 90,1%. Final: 134 ÷ 141 = 95,0%. Ajustado (sem os 7 equivalentes): 134 ÷ (141 − 7) = 100%."),
]

ROTEIRO = [
    "Visão geral: \"Os mesmos 15 casos nas três etapas, 10 defeitos no recorte, 100% de comandos e desvios, 95% de escore de mutação (100% sem equivalentes).\"",
    "Teste funcional → abra \"Como a etapa funcional foi feita\" e explique as classes e os limites. Filtre \"Resultado no original = Falhou\" e abra o CT-003 (DEF-01) ou o CT-009 (zero hóspedes). Mostre: Em uma frase → cenário → o que aconteceu no original → tabela → assertivas → código.",
    "Teste estrutural → explique que 5 funcionais foram reaproveitados. Abra o CT-012: mostre o grafo de reserve com o caminho em verde, clique nos nós para ver o código e conte a ampliação que revelou o defeito mascarado (DEF-15).",
    "Teste de mutação → explique o cálculo (90,1% → 95,0% → 100% ajustado). Abra o CT-002: a ampliação reserva o hotel inteiro, incluindo o quarto 301, e mata dois mutantes (== virou is; <= virou <).",
]


def ler(caminho):
    return json.loads(caminho.read_text(encoding="utf-8"))


def caso_md(teste):
    x = teste["explanation"]
    linhas = [f"### {teste['id']} · {teste['title']}", "",
              f"*{teste['technique']} · {teste['requirementId']} · classes {', '.join(teste['classes'])}"
              f"{' · revela ' + teste['defect'] if teste['original']['result'] == 'Falhou' else ''}*", "",
              f"> **Em uma frase:** {x['resumo']}", "",
              f"**Por que existe.** {x['porque']}", "",
              "**Cenário, passo a passo:**", ""]
    linhas += [f"{i}. {passo}" for i, passo in enumerate(x["passos"], 1)]
    linhas += ["", f"**O que o teste confere.** {x['verifica']}", ""]
    if x.get("mutante"):
        linhas += [f"**Como ele mata o mutante.** {x['mutante']}", ""]
    linhas += [f"**No código original.** {x['original']}", "", f"**No código corrigido.** {x['corrigido']}", "",
               f"Código (`{teste['file']}`, linha {teste['line']}):", "", "```python", teste["code"], "```", ""]
    return linhas


ETAPA_AMPLIACAO = {"estrutural": "etapa estrutural", "mutacao": "etapa de mutação"}


def ampliacao_md(teste, parte):
    x = parte.get("explanation") or {}
    linhas = [f"### {teste['id']} ampliado na {ETAPA_AMPLIACAO[parte['stage']]}: {x.get('titulo', parte['function'])}", "",
              f"*Caso original: {teste['title']}{' · revela ' + parte['defect'] if parte.get('defect') else ''}*", ""]
    if x.get("porque"):
        linhas += [f"**Por que foi ampliado.** {x['porque']}", ""]
    if x.get("passos"):
        linhas += ["**Cenário acrescentado:**", ""] + [f"{i}. {passo}" for i, passo in enumerate(x["passos"], 1)] + [""]
    if x.get("verifica"):
        linhas += [f"**O que confere.** {x['verifica']}", ""]
    if x.get("mutante"):
        linhas += [f"**Como mata o mutante.** {x['mutante']}", ""]
    if x.get("original"):
        linhas += [f"**No código original.** {x['original']}", ""]
    if x.get("corrigido"):
        linhas += [f"**No código corrigido.** {x['corrigido']}", ""]
    linhas += [f"Código (`{parte['file']}`, linha {parte['line']}):", "", "```python", parte["code"], "```", ""]
    return linhas


def montar():
    estado = ler(ROOT / "output" / "hotel-vvtestlab-backup.json")
    catalogo = estado["testCatalog"]
    guia = catalogo["guide"]
    testes = catalogo["tests"]
    mutacao = catalogo["mutation"]
    evolucao = catalogo["evolution"]
    classes = [c for c in ler(HOTEL / "tests" / "classes_equivalencia.json") if c["req"].startswith("REQ")]
    ini, fim = mutacao["runs"][0], mutacao["runs"][-1]
    por_etapa = {e: [t for t in testes if e in t.get("stages", [t["stage"]])] for e in ("funcional", "estrutural", "mutacao")}
    ampliacoes = {e: [(t, p) for t in testes for p in t.get("parts", []) if p["stage"] == e] for e in ("estrutural", "mutacao")}

    md = ["# Guia de estudo: teste do Hotel Management System", "",
          "Tudo o que foi feito, caso a caso, para estudar antes da apresentação. Os números vêm das mesmas evidências do relatório.", "",
          "## 1. Resumo em um minuto", "",
          f"Testei um sistema web de reservas de hotel (Flask) em três requisitos da reserva: **REQ-01 Reservar quartos**, "
          f"**REQ-02 Data de entrada** e **REQ-03 Data de saída**. São **{len(testes)} casos de teste**, os mesmos nas três etapas: "
          f"a estrutural reaproveitou {len(por_etapa['estrutural'])} deles e ampliou {len(ampliacoes['estrutural'])}; a de mutação rodou os {len(testes)} "
          f"e ampliou {len(ampliacoes['mutacao'])}. Nenhum caso novo foi criado depois da etapa funcional. "
          f"Eles revelaram **{len(estado['defects'])} defeitos** no recorte, todos corrigidos no fork. "
          f"Cobertura final: 100% dos comandos e dos desvios. Mutação: {ini['killed']}/{ini['total']} ({str(ini['score']).replace('.', ',')}%) → "
          f"{fim['killed']}/{fim['total']} ({str(fim['score']).replace('.', ',')}%), e {mutacao['adjustedScore']:.0f}% sem os {mutacao['equivalent']} equivalentes.", "",
          "| Etapa | Código | Casos (testes pytest) | Passaram | Falharam (defeito) | Comandos | Desvios | Mutação |", "|---|---|---:|---:|---:|---|---|---|"]
    for e in evolucao:
        pct = lambda v: f"{v:g}".replace(".", ",") + "%"
        md.append(f"| {e['etapa']} | {e['sut']} | {e['casos']} ({e.get('testes', e['casos'])}) | {e['passaram']} | {e['xfail']} | {e['comandos']} ({pct(e['pct_comandos'])}) | "
                  f"{e['desvios']} ({pct(e['pct_desvios'])}) | {e['mutacao']} |")
    md += ["", "## 2. Conceitos que você precisa saber", ""]
    md += [f"- **{nome}:** {texto}" for nome, texto in CONCEITOS]
    md += ["", "## 3. Como ler o código dos testes", ""]
    md += [f"- {item}" for item in guia["base"]["itens"]]
    md += ["", "Exemplo anotado (CT-009):", "", "```python",
           "@funcional                          # etapa em que o caso foi criado",
           "@pytest.mark.ce(\"CE-12\")             # classe exercitada: menos de 1 hóspede",
           "@pytest.mark.defeito(\"DEF-03\", ...)  # no original, precisa falhar (xfail estrito)",
           "def test_CT_009_reserva_sem_hospedes_e_recusada(client):",
           "    login(client)                                          # Ana logada",
           "    assert path(reservar(client, hospedes=0)) == \"/reserve\"  # reserva com 0 hóspedes deve ser RECUSADA",
           "    assert Reservations.query.count() == 0                 # e nada pode ter sido gravado",
           "```", ""]

    md += ["## 4. Etapa 1: teste funcional", ""]
    md += [f"{i}. {p}" for i, p in enumerate(guia["stages"]["funcional"]["passos"], 1)]
    md += ["", "**As 22 classes de equivalência:**", "", "| Classe | Requisito | Condição | Tipo | Descrição |", "|---|---|---|---|---|"]
    md += [f"| {c['id']} | {c['req']} | {c['condicao']} | {c['tipo']} | {c['descricao']} |" for c in classes]
    md.append("")
    for t in por_etapa["funcional"]:
        md += caso_md(t)

    md += ["## 5. Etapa 2: teste estrutural", ""]
    md += [f"{i}. {p}" for i, p in enumerate(guia["stages"]["estrutural"]["passos"], 1)]
    md.append("")
    md += ["**Os 5 casos reaproveitados e o caminho que cada um percorre no grafo de reserve:**", "",
           "| Caso | Nome | Caminho no grafo | Ampliado? |", "|---|---|---|---|"]
    for t in por_etapa["estrutural"]:
        amp = [p for p in t.get("parts", []) if p["stage"] == "estrutural"]
        md.append(f"| {t['id']} | {t['title']} | {t.get('structuralPath', '')} | {'sim' if amp else 'não'} |")
    md.append("")
    for t, parte in ampliacoes["estrutural"]:
        md += ampliacao_md(t, parte)

    md += ["## 6. Correção dos defeitos (antes da mutação)", "",
           "Cada defeito foi corrigido no fork, em commits separados. O mesmo teste que falhava no original passou a passar.", "",
           "| Defeito | O que era | Como foi corrigido | Caso que comprova |", "|---|---|---|---|"]
    for d in estado["defects"]:
        md.append(f"| {d['id']} | {d['title']} | {d['correction']} | {d['testCaseId']} |")
    md += ["", "## 7. Etapa 3: teste de mutação", ""]
    md += [f"{i}. {p}" for i, p in enumerate(guia["stages"]["mutacao"]["passos"], 1)]
    md += ["", "**Os 14 sobreviventes da rodada inicial:**", "", "| # | Mutante | Onde | Alteração | Classificação | Por quê |", "|---|---|---|---|---|---|"]
    for m in sorted((m for m in mutacao["mutants"] if m["survivorTag"]), key=lambda m: int(m["survivorTag"][1:])):
        md.append(f"| {m['survivorTag']} | {m['id']} | {m['function']}, linha {m['line']} | `{m['original']}` → `{m['mutated']}` | "
                  f"{m['classification']} | {m['justification']} |")
    md.append("")
    for t, parte in ampliacoes["mutacao"]:
        md += ampliacao_md(t, parte)

    md += ["## 8. Perguntas prováveis e respostas", ""]
    for pergunta, resposta in PERGUNTAS:
        md += [f"**{pergunta}**", "", resposta, ""]
    md += ["## 9. Roteiro da demonstração no V&V TestLab", "",
           "Antes: `npm run dev` e importar `output/hotel-vvtestlab-backup.json` em Dados e exportação.", ""]
    md += [f"{i}. {p}" for i, p in enumerate(ROTEIRO, 1)]
    return "\n".join(md) + "\n"


def main():
    texto = montar()
    SAIDA.with_suffix(".md").write_text(texto, encoding="utf-8")
    import markdown
    from playwright.sync_api import sync_playwright
    corpo = markdown.markdown(texto, extensions=["tables", "fenced_code", "sane_lists"])
    html = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia de estudo</title><style>
@page {{ size: A4; margin: 15mm 13mm; }}
body {{ font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #1d1d1f; }}
h1 {{ font-size: 19pt; color: #4b3cc4; border-bottom: 2px solid #4b3cc4; padding-bottom: 4px; }}
h2 {{ font-size: 14pt; color: #172035; margin-top: 24px; border-bottom: 1px solid #d0d4de; page-break-after: avoid; }}
h3 {{ font-size: 11.5pt; color: #4b3cc4; margin-top: 20px; page-break-after: avoid; }}
blockquote {{ margin: 6px 0; padding: 6px 10px; border-left: 4px solid #6756e8; background: #f4f2ff; }}
table {{ border-collapse: collapse; width: 100%; font-size: 8.3pt; margin: 6px 0 12px; }}
th {{ background: #172035; color: #fff; text-align: left; padding: 4px 5px; }}
td {{ border: 1px solid #d0d4de; padding: 3px 5px; vertical-align: top; }}
code {{ font-family: Consolas, monospace; font-size: 8.5pt; background: #eef0f5; padding: 0 2px; }}
pre {{ background: #161d31; color: #dce3f7; padding: 8px 10px; border-radius: 6px; font-size: 8.3pt; white-space: pre-wrap; page-break-inside: avoid; }}
pre code {{ background: none; color: inherit; }}
</style></head><body>{corpo}</body></html>"""
    destino = SAIDA.with_suffix(".html")
    destino.write_text(html, encoding="utf-8")
    with sync_playwright() as p:
        navegador = p.chromium.launch(channel="msedge")
        pagina = navegador.new_page()
        pagina.goto(destino.resolve().as_uri())
        pagina.pdf(path=str(SAIDA.with_suffix(".pdf")), format="A4", print_background=True, display_header_footer=True,
                   header_template="<span></span>",
                   footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#666">'
                                   '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
                   margin={"top": "15mm", "bottom": "15mm", "left": "13mm", "right": "13mm"})
        navegador.close()
    destino.unlink()
    print(f"{SAIDA.with_suffix('.md')} e {SAIDA.with_suffix('.pdf')}")


if __name__ == "__main__":
    main()
