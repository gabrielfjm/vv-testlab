"""Empacota o trabalho do hotel mantendo caminhos relativos da documentação."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "output" / "hotel-management-testado"
OUTPUT = ROOT / "output" / "entrega-hotel-vv.zip"
SKIP_DIRS = {".venv", ".venv-mutation", ".pytest_cache", ".vvtestlab", "__pycache__"}
SKIP_FILES = {".coverage", ".mutmut-cache", "vvtestlab-junit-run.txt"}
files = [
    ROOT / "index.html",
    ROOT / "package.json",
    ROOT / "package-lock.json",
    ROOT / "README.md",
    ROOT / "output" / "README_ENTREGA_HOTEL.md",
    ROOT / "output" / "hotel-vvtestlab-backup.json",
    ROOT / "output" / "hotel-vvtestlab-projeto-inicial.json",
    ROOT / "docs" / "INTEGRACAO_PYTEST.md",
    ROOT / "docs" / "MANUAL_DO_USUARIO.md",
    ROOT / "docs" / "DESCRICAO_TECNICA.md",
]
files.extend(path for folder in ("src", "integration") for path in (ROOT / folder).rglob("*")
             if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc")
files.extend(
    path for path in PROJECT.rglob("*")
    if path.is_file() and not any(part in SKIP_DIRS for part in path.relative_to(PROJECT).parts)
    and path.name not in SKIP_FILES and path.suffix != ".pyc"
)
with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(ROOT))
print(f"{OUTPUT}: {len(files)} arquivos, {OUTPUT.stat().st_size} bytes")
