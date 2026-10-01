"""Captura as telas do V&V TestLab com o estudo do hotel carregado.

Uso (na raiz da ferramenta, após npm install e scripts/gerar_backup_hotel.py):

    uv run --no-project --python 3.12 --with playwright==1.55.0 python scripts/capturar_telas_vvtestlab.py

Sobe o Vite na porta 5174, grava output/hotel-vvtestlab-backup.json no
localStorage da página (mesmo efeito de "Dados e exportação -> Selecionar
backup") e fotografa cada área. Saída: output/hotel-management-testado/evidencias/telas-vvtestlab/.
"""

from pathlib import Path
import subprocess
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "output" / "hotel-vvtestlab-backup.json"
SAIDA = ROOT / "output" / "hotel-management-testado" / "evidencias" / "telas-vvtestlab"
URL = "http://127.0.0.1:5174/"
TELAS = [
    ("dashboard", "01-visao-geral"),
    ("requirements", "02-requisitos"),
    ("structural", "08-grafos-estruturais"),
    ("cases", "03-casos"),
    ("traceability", "04-rastreabilidade"),
    ("execution", "05-execucao-metricas"),
    ("integration", "06-integracao-python"),
    ("defects", "07-defeitos"),
]


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    vite = subprocess.Popen("npx vite --host 127.0.0.1 --port 5174 --strictPort", cwd=ROOT, shell=True,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(URL, timeout=1)
                break
            except OSError:
                time.sleep(0.5)
        with sync_playwright() as p:
            navegador = p.chromium.launch(channel="msedge")
            pagina = navegador.new_page(viewport={"width": 1440, "height": 860}, device_scale_factor=1.5)
            pagina.goto(URL)
            pagina.evaluate("dados => localStorage.setItem('vvtestlab-project-v1', dados)",
                            BACKUP.read_text(encoding="utf-8"))
            pagina.reload()
            pagina.wait_for_selector("button[data-route]")
            for rota, nome in TELAS:
                pagina.click(f"button[data-route={rota}]")
                pagina.wait_for_timeout(600)
                pagina.screenshot(path=str(SAIDA / f"{nome}.png"))
            # Páginas por etapa: detalhe de um caso funcional, grafo de um caso estrutural e cálculo da mutação.
            pagina.click("button[data-route=funcional]")
            pagina.click('#funcional-list [data-id="CT-009"]')
            pagina.wait_for_timeout(500)
            pagina.evaluate("document.querySelector('.modal').scrollTop = 330")
            pagina.screenshot(path=str(SAIDA / "09-teste-funcional-detalhe.png"))
            pagina.keyboard.press("Escape")
            pagina.click("button[data-route=estrutural]")
            pagina.click('#estrutural-list [data-id="CT-012"]')
            pagina.wait_for_timeout(500)
            pagina.evaluate("document.querySelector('.detail-graph').scrollIntoView()")
            pagina.screenshot(path=str(SAIDA / "10-teste-estrutural-grafo.png"))
            pagina.keyboard.press("Escape")
            pagina.click("button[data-route=mutacao]")
            pagina.wait_for_timeout(500)
            pagina.screenshot(path=str(SAIDA / "11-teste-mutacao.png"))
            navegador.close()
    finally:
        subprocess.run(f"taskkill /PID {vite.pid} /T /F", shell=True, capture_output=True)
    print(f"Telas em {SAIDA}")


if __name__ == "__main__":
    main()
