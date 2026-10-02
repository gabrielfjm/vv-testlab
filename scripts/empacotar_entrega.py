"""Gera output/entrega-vv-gabriel-meira.zip para enviar ao professor.

Na raiz do pacote: o relatório técnico (PDF) e LINKS-E-DESCRICAO.txt.
Em estudo-completo/: o fork do hotel (com .git), a ferramenta V&V TestLab e as apresentações.
"""

import re
import zlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
TOPO = Path("entrega-vv-gabriel-meira")
ESTUDO = TOPO / "estudo-completo"
SAIDA = ROOT / "output" / "entrega-vv-gabriel-meira.zip"
HOTEL = ROOT / "output" / "hotel-management-testado"
IGNORAR = {".venv", ".venv-mutation", ".pytest_cache", "__pycache__", ".sut-original", ".vvtestlab", "node_modules"}
IGNORAR_ARQUIVOS = {".coverage", "hotel_local.db", ".DS_Store"}
# Ferramenta: arquivos soltos e pastas, com os mesmos caminhos do repositório.
FERRAMENTA_ARQUIVOS = ["README.md", "index.html", "package.json", "package-lock.json", "vitest.config.js", ".gitignore",
                       "output/hotel-vvtestlab-projeto-inicial.json", "output/hotel-vvtestlab-backup.json"]
FERRAMENTA_PASTAS = [".github", "src", "public", "integration", "docs", "tests", "scripts", "output/pdf", "output/vvtestlab-estudo"]


def incluir(caminho):
    return not (set(caminho.parts) & IGNORAR or caminho.suffix == ".pyc" or caminho.name in IGNORAR_ARQUIVOS)


def main():
    with ZipFile(SAIDA, "w", ZIP_DEFLATED) as z:
        # Raiz: relatório e o texto com descrição e links (UTF-8 com BOM e CRLF, para abrir bem no Bloco de Notas).
        z.write(HOTEL / "docs/relatorio-tecnico.pdf", TOPO / "Relatorio-Tecnico-VV-Gabriel-Meira.pdf")
        texto = (ROOT / "output/LINKS-E-DESCRICAO.txt").read_text(encoding="utf-8").replace("\r\n", "\n").replace("\n", "\r\n")
        z.writestr(str(TOPO / "LINKS-E-DESCRICAO.txt"), texto.encode("utf-8-sig"))
        # estudo-completo/
        z.write(ROOT / "output/LEIA-ME-ENTREGA.md", ESTUDO / "LEIA-ME.md")
        for p in sorted(HOTEL.rglob("*")):
            if p.is_file() and incluir(p.relative_to(HOTEL)):
                z.write(p, ESTUDO / "1-sistema-testado-hotel" / p.relative_to(HOTEL))
        ferramenta = [ROOT / nome for nome in FERRAMENTA_ARQUIVOS]
        for pasta in FERRAMENTA_PASTAS:
            ferramenta += sorted(p for p in (ROOT / pasta).rglob("*") if p.is_file())
        for p in ferramenta:
            if incluir(p.relative_to(ROOT)):
                z.write(p, ESTUDO / "2-ferramenta-vv-testlab" / p.relative_to(ROOT))
        for origem, destino in [("apresentacao-2-slides.pptx", "1-apresentacao-2-slides.pptx"),
                                ("apresentacao-apoio-demo.pptx", "2-slides-de-apoio.pptx")]:
            z.write(HOTEL / "docs" / origem, ESTUDO / "3-apresentacao" / destino)
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
