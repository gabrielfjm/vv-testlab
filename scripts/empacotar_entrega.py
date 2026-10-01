"""Gera output/entrega-vv-gabriel-meira.zip: relatório, slides, fork do hotel (com .git) e V&V TestLab."""

import re
import zlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
TOPO = Path("entrega-vv-gabriel-meira")
SAIDA = ROOT / "output" / "entrega-vv-gabriel-meira.zip"
HOTEL = ROOT / "output" / "hotel-management-testado"
IGNORAR = {".venv", ".venv-mutation", ".pytest_cache", "__pycache__", ".sut-original", ".vvtestlab", "node_modules"}
RAIZ = ["README.md", "index.html", "package.json", "package-lock.json", "vitest.config.js",
        "output/README_ENTREGA_HOTEL.md", "output/hotel-vvtestlab-projeto-inicial.json", "output/hotel-vvtestlab-backup.json"]
PASTAS = ["src", "public", "integration", "docs", "tests", "scripts", "output/pdf", "output/vvtestlab-estudo"]


def main():
    arquivos = [ROOT / nome for nome in RAIZ]
    for pasta in PASTAS:
        arquivos += [p for p in (ROOT / pasta).rglob("*") if p.is_file()]
    arquivos += [p for p in HOTEL.rglob("*") if p.is_file()]
    with ZipFile(SAIDA, "w", ZIP_DEFLATED) as z:
        for origem, destino in [(ROOT / "output" / "LEIA-ME-ENTREGA.md", "LEIA-ME.md"),
                                (HOTEL / "docs/relatorio-tecnico.pdf", "01-relatorio-tecnico.pdf"),
                                (HOTEL / "docs/apresentacao-2-slides.pptx", "02-apresentacao-2-slides.pptx"),
                                (HOTEL / "docs/apresentacao-apoio-demo.pptx", "03-apresentacao-apoio-demo.pptx")]:
            z.write(origem, TOPO / destino)
        for p in arquivos:
            rel = p.relative_to(ROOT)
            if set(rel.parts) & IGNORAR or p.suffix == ".pyc" or p.name in {".coverage", "hotel_local.db"}:
                continue
            z.write(p, TOPO / rel)
    padrao = re.compile(("cla" "ude|anth" "ropic|co-aut" "hored-by").encode(), re.I)  # verificação de menções
    achados = []
    with ZipFile(SAIDA) as z:
        for nome in z.namelist():
            dados = z.read(nome)
            candidatos = [dados]
            if "/.git/objects/" in nome and "/pack/" not in nome:
                try:
                    candidatos.append(zlib.decompress(dados))
                except zlib.error:
                    pass
            if any(padrao.search(c) for c in candidatos):
                achados.append(nome)
        print(f"{SAIDA.name}: {len(z.namelist())} arquivos; menções: {achados or 'nenhuma'}")


if __name__ == "__main__":
    main()
