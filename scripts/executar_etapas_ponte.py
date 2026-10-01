"""Executa as etapas do estudo do hotel pela ponte do V&V TestLab e grava as respostas.

Usa as mesmas funções que a ponte HTTP (integration/vv_bridge.py) chama nos
botões "Executar e sincronizar", "Executar mutação" e "Analisar grafos". Deve
ser executado com o Python do .venv do hotel (tem pytest e pytest-cov):

    output/hotel-management-testado/.venv/Scripts/python.exe scripts/executar_etapas_ponte.py

Depois, node scripts/montar_estudo_vvtestlab.mjs aplica as respostas, na ordem,
ao projeto inicial. Saída: output/vvtestlab-estudo/*.json (~8 min por causa da mutação).
"""

import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
HOTEL = ROOT / "output" / "hotel-management-testado"
SAIDA = ROOT / "output" / "vvtestlab-estudo"
sys.path.insert(0, str(ROOT / "integration"))
sys.path.insert(0, str(HOTEL / "scripts"))

import vv_bridge  # noqa: E402
from cfg_analyzer import analyze_repository  # noqa: E402
import etapas  # noqa: E402

ORIGINAL = {"reserve", "cal_cost"}
CORRIGIDA = ORIGINAL | {"_sessao_autenticada", "_periodos_conflitam", "_quartos_ocupados", "_ler_quartos"}
MUTACAO_PY = HOTEL / ".venv-mutation" / "Scripts" / "python.exe"


def gravar(nome, dados):
    (SAIDA / f"{nome}.json").write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    resumo = dados.get("stats") or {"mapeados": len(dados.get("mapped", [])), "cobertura": dados.get("coverage")}
    print(nome, json.dumps(resumo, ensure_ascii=False)[:300])


def sincronizar(nome, versao, marcas, funcoes, casos):
    os.environ["SUT_VERSAO"] = versao
    args = ["tests", "-m", marcas] + (["--runxfail"] if versao == "original" else [])
    gravar(nome, vv_bridge.run_repository(HOTEL, args, casos, "hotel.views", funcoes))


def mutacao(nome, marcas):
    os.environ["SUT_VERSAO"] = "corrigida"
    python = (HOTEL / ".venv" / "Scripts" / "python.exe").as_posix()
    config = HOTEL / ".vvtestlab" / f"cosmic-ray-{nome}.toml"
    config.parent.mkdir(exist_ok=True)
    config.write_text(
        '[cosmic-ray]\nmodule-path = "hotel/views.py"\ntimeout = 30.0\nexcluded-modules = []\n'
        f'test-command = "\\"{python}\\" -m pytest -x -q -p no:cacheprovider -m \'{marcas}\'"\n\n'
        '[cosmic-ray.distributor]\nname = "local"\n', encoding="utf-8")
    gravar(nome, vv_bridge.run_mutation(HOTEL, "cosmic-ray", str(config.relative_to(HOTEL)), MUTACAO_PY,
                                        "scripts/selecionar_mutantes.py"))


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    projeto = json.loads((ROOT / "output" / "hotel-vvtestlab-projeto-inicial.json").read_text(encoding="utf-8"))
    casos = {c["id"] for c in projeto["testCases"]}
    etapas.extrair_original()
    sincronizar("1-funcional-original", "original", "funcional", ORIGINAL, casos)
    sincronizar("2-estrutural-original", "original", "funcional or estrutural", ORIGINAL, casos)
    sincronizar("3-suite-corrigida", "corrigida", "funcional or estrutural", CORRIGIDA, casos)
    mutacao("4-mutacao-inicial", "funcional or estrutural")
    sincronizar("5-final-corrigida", "corrigida", "funcional or estrutural or mutacao", CORRIGIDA, casos)
    mutacao("6-mutacao-final", "funcional or estrutural or mutacao")
    requisitos = [{"id": r["id"], "method": r["method"]} for r in projeto["requirements"]]
    gravar("7-grafos", analyze_repository(HOTEL, requisitos))


if __name__ == "__main__":
    main()
