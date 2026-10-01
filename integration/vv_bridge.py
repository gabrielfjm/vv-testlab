"""Ponte local entre um repositório Python e o V&V TestLab.

Executa pytest sem shell, produz JUnit XML/coverage JSON e disponibiliza os
resultados somente em 127.0.0.1. O diretório do repositório é fixado na
inicialização e não pode ser alterado por requisições do navegador.
"""

from __future__ import annotations

import argparse
import importlib.util
from importlib.metadata import version as package_version
import json
import os
import platform
import re
import subprocess
import sys
import time
import traceback
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from .cfg_analyzer import analyze_repository
except ImportError:  # Execução direta: python integration/vv_bridge.py
    from cfg_analyzer import analyze_repository

CASE_PATTERN = re.compile(r"CT[-_ ]?0*(\d+)", re.IGNORECASE)
PLUGIN_DIR = Path(__file__).resolve().parent
MUTATION_TOOLS = {
    "mutmut": "mutmut",
    "cosmic-ray": "cosmic_ray",
}


def normalize_case_id(value: str | None) -> str | None:
    match = CASE_PATTERN.search(value or "")
    return f"CT-{int(match.group(1)):03d}" if match else None


def testcase_result(element: ET.Element) -> tuple[str, str]:
    failure = element.find("failure")
    error = element.find("error")
    skipped = element.find("skipped")
    issue = failure if failure is not None else error
    if issue is not None:
        detail = issue.get("message") or (issue.text or "Falha sem mensagem")
        return "Falhou", " ".join(detail.split())[:1500]
    if skipped is not None:
        detail = skipped.get("message") or (skipped.text or "Teste ignorado")
        return "Bloqueado", " ".join(detail.split())[:1500]
    return "Aprovado", "Executado com sucesso."


def parse_junit(path: Path, known_case_ids: set[str]) -> tuple[list[dict], list[dict]]:
    root = ET.parse(path).getroot()
    grouped: dict[str, list[dict]] = {}
    unmapped = []
    for test in root.findall(".//testcase"):
        properties = {
            prop.get("name"): prop.get("value")
            for prop in test.findall("./properties/property")
        }
        identity = " ".join(filter(None, [test.get("classname"), test.get("name"), test.get("file")]))
        case_id = normalize_case_id(properties.get("vv_case_id")) or normalize_case_id(identity)
        result, detail = testcase_result(test)
        record = {
            "nodeId": "::".join(filter(None, [test.get("classname"), test.get("name")])),
            "result": result,
            "detail": detail,
            "duration": round(float(test.get("time", "0") or 0), 4),
        }
        if not case_id or (known_case_ids and case_id not in known_case_ids):
            record["detectedCaseId"] = case_id
            unmapped.append(record)
            continue
        grouped.setdefault(case_id, []).append(record)

    priority = {"Aprovado": 0, "Bloqueado": 1, "Falhou": 2}
    mapped = []
    for case_id, tests in grouped.items():
        result = max((item["result"] for item in tests), key=priority.get)
        failed_details = [item["detail"] for item in tests if item["result"] != "Aprovado"]
        mapped.append({
            "caseId": case_id,
            "result": result,
            "tests": len(tests),
            "duration": round(sum(item["duration"] for item in tests), 4),
            "actual": (
                f"pytest: {len(tests)} teste(s) automatizado(s); resultado {result}; "
                f"tempo {sum(item['duration'] for item in tests):.3f}s."
                + (f" Evidência: {' | '.join(failed_details)}" if failed_details else "")
            )[:3000],
            "nodeIds": [item["nodeId"] for item in tests],
        })
    return mapped, unmapped


def parse_coverage(path: Path, functions: set[str] | None = None) -> dict | None:
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    totals = data.get("totals", {})
    if functions:
        summaries = [
            file_data["functions"][name]["summary"]
            for file_data in data.get("files", {}).values()
            for name in functions
            if name in file_data.get("functions", {})
        ]
        found = {
            name
            for file_data in data.get("files", {}).values()
            for name in functions
            if name in file_data.get("functions", {})
        }
        if found != functions:
            raise ValueError(f"Funções de cobertura não encontradas: {', '.join(sorted(functions - found))}")
        totals = {
            key: sum(int(summary.get(key, 0) or 0) for summary in summaries)
            for key in ("num_statements", "covered_lines", "num_branches", "covered_branches")
        }
    statements = int(totals.get("num_statements", 0) or 0)
    covered_lines = int(totals.get("covered_lines", 0) or 0)
    branches = int(totals.get("num_branches", 0) or 0)
    covered_branches = int(totals.get("covered_branches", 0) or 0)
    return {
        "statementCoverage": round(covered_lines / statements * 100, 2) if statements else round(float(totals.get("percent_covered", 0) or 0), 2),
        "branchCoverage": round(covered_branches / branches * 100, 2) if branches else 0,
        "statements": statements,
        "coveredLines": covered_lines,
        "branches": branches,
        "coveredBranches": covered_branches,
        "scope": sorted(functions) if functions else [],
    }


def parse_case_coverage(path: Path, mapped: list[dict]) -> list[dict]:
    """Relaciona linhas executadas aos CT-xxx usando contextos do coverage.py."""
    if not path.exists() or not mapped:
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    files = data.get("files", {})
    results = []
    for item in mapped:
        test_names = {
            node_id.split("::")[-1]
            for node_id in item.get("nodeIds", [])
            if node_id
        }
        covered_files: dict[str, list[int]] = {}
        for file_name, file_data in files.items():
            contexts = file_data.get("contexts", {})
            covered_lines = []
            for line, line_contexts in contexts.items():
                if any(test_name in context for context in line_contexts for test_name in test_names):
                    covered_lines.append(int(line))
            if covered_lines:
                covered_files[Path(file_name).as_posix()] = sorted(set(covered_lines))
        results.append({
            "caseId": item["caseId"],
            "files": covered_files,
            "lineCount": sum(len(lines) for lines in covered_files.values()),
        })
    return results


def parse_mutmut_stats(path: Path) -> dict:
    """Normaliza o relatório mutmut 3.5+ para o modelo do V&V TestLab."""
    data = json.loads(path.read_text(encoding="utf-8"))
    total_raw = int(data.get("total", 0) or 0)
    skipped = int(data.get("skipped", 0) or 0)
    timeout = int(data.get("timeout", 0) or 0)
    killed = int(data.get("killed", 0) or 0) + timeout
    total = max(total_raw - skipped, 0)
    if killed > total:
        raise ValueError("Relatório do mutmut inconsistente: mortos excedem o total testado.")
    return {
        "total": total,
        "killed": killed,
        "survived": int(data.get("survived", max(total - killed, 0)) or 0),
        "skipped": skipped,
        "timeout": timeout,
        "noTests": int(data.get("no_tests", 0) or 0),
        "suspicious": int(data.get("suspicious", 0) or 0),
        "rawTotal": total_raw,
    }


def parse_mutmut2_results(outputs: dict[str, str]) -> dict:
    """Conta os IDs oficiais produzidos por `mutmut result-ids` (mutmut 2.x)."""
    counts = {status: len(re.findall(r"\b\d+\b", outputs.get(status, "")))
              for status in ("killed", "survived", "timeout", "suspicious", "skipped", "untested")}
    tested = counts["killed"] + counts["survived"] + counts["timeout"] + counts["suspicious"]
    return {
        "total": tested,
        "killed": counts["killed"] + counts["timeout"],
        "survived": counts["survived"],
        "skipped": counts["skipped"],
        "timeout": counts["timeout"],
        "noTests": counts["untested"],
        "suspicious": counts["suspicious"],
        "rawTotal": tested + counts["skipped"] + counts["untested"],
    }


def parse_cosmic_ray_dump(output: str) -> dict:
    """Resume as linhas JSON produzidas por ``cosmic-ray dump``."""
    completed = []
    pending = 0
    skipped = 0
    for line in output.splitlines():
        if not line.strip():
            continue
        try:
            _, result = json.loads(line)
        except (json.JSONDecodeError, ValueError) as error:
            raise ValueError("Saída JSON inválida do cosmic-ray dump.") from error
        if result is None:
            pending += 1
            continue
        if result.get("worker_outcome") == "skipped":
            skipped += 1
            continue
        completed.append(result)

    survived = sum(item.get("test_outcome") == "survived" for item in completed)
    killed = sum(item.get("test_outcome") == "killed" for item in completed)
    incompetent = sum(item.get("test_outcome") == "incompetent" for item in completed)
    timeout = sum(item.get("test_outcome") == "timeout" for item in completed)
    return {
        "total": killed + survived + timeout,
        "killed": killed + timeout,
        "survived": survived,
        "skipped": skipped,
        "timeout": timeout,
        "incompetent": incompetent,
        "noTests": 0,
        "suspicious": 0,
        "pending": pending,
        "rawTotal": len(completed) + skipped + pending,
    }


def mutation_tool_status(mutation_python: Path | None = None) -> dict[str, bool]:
    available = {
        name: importlib.util.find_spec(module) is not None
        for name, module in MUTATION_TOOLS.items()
    }
    if mutation_python and mutation_python.exists():
        probe = subprocess.run([str(mutation_python), "-c", "import importlib.util; print(int(importlib.util.find_spec('cosmic_ray') is not None))"],
                               capture_output=True, text=True, timeout=10, shell=False)
        available["cosmic-ray"] = probe.returncode == 0 and probe.stdout.strip() == "1"
    return available


def select_mutation_tool(configured: str, mutation_python: Path | None = None) -> str:
    available = mutation_tool_status(mutation_python)
    if configured != "auto":
        if configured not in MUTATION_TOOLS:
            raise ValueError(f"Ferramenta de mutação inválida: {configured}.")
        if not available[configured]:
            raise RuntimeError(f"{configured} não está instalado neste ambiente Python.")
        return configured
    native_mutmut = available["mutmut"] and package_version("mutmut").split(".")[0] == "2"
    preference = ("mutmut", "cosmic-ray") if platform.system() != "Windows" or native_mutmut else ("cosmic-ray", "mutmut")
    for tool in preference:
        if available[tool]:
            return tool
    raise RuntimeError("Nenhuma ferramenta de mutação instalada. Instale mutmut ou cosmic-ray.")


def _run_command(command: list[str], repo: Path, timeout: int) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PATH"] = str(Path(sys.executable).parent) + os.pathsep + env.get("PATH", "")
    env["PYTHONIOENCODING"] = "utf-8"
    return subprocess.run(
        command,
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        shell=False,
    )


def run_mutation(repo: Path, configured_tool: str, cosmic_ray_config: str,
                 mutation_python: Path | None = None, cosmic_ray_selector: str = "") -> dict:
    """Executa a ferramenta configurada e devolve estatísticas normalizadas."""
    tool = select_mutation_tool(configured_tool, mutation_python)
    mutmut_major = int(package_version("mutmut").split(".")[0]) if tool == "mutmut" else 0
    if tool == "mutmut" and platform.system() == "Windows" and mutmut_major >= 3:
        raise RuntimeError("mutmut 3+ requer WSL no Windows. Execute a ponte dentro do WSL ou use --mutation-tool cosmic-ray.")

    artifact_dir = repo / ".vvtestlab"
    artifact_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    started = time.monotonic()
    stdout_parts = []
    stderr_parts = []

    if tool == "mutmut":
        command = [sys.executable, "-m", "mutmut", "run"]
        if mutmut_major == 2:
            command.extend(["--CI", "--no-progress", "--simple-output"])
            if (repo / ".coverage").exists():
                command.append("--use-coverage")
        process = _run_command(command, repo, 7200)
        stdout_parts.append(process.stdout)
        stderr_parts.append(process.stderr)
        if process.returncode != 0:
            detail = (process.stderr or process.stdout)[-3000:]
            raise RuntimeError(f"mutmut encerrou com código {process.returncode}: {detail}")
        if mutmut_major == 2:
            outputs = {}
            for status in ("killed", "survived", "timeout", "suspicious", "skipped", "untested"):
                result = _run_command([sys.executable, "-m", "mutmut", "result-ids", status], repo, 120)
                if result.returncode != 0:
                    raise RuntimeError(f"mutmut result-ids {status} falhou: {result.stderr[-1000:]}")
                outputs[status] = result.stdout
            stats = parse_mutmut2_results(outputs)
            if stats["rawTotal"] == 0:
                raise RuntimeError("O mutmut não gerou mutantes. Confira setup.cfg e os caminhos do código.")
            (artifact_dir / f"mutmut-{stamp}.json").write_text(json.dumps({"version": package_version("mutmut"), "resultIds": outputs, "stats": stats}, ensure_ascii=False, indent=2), encoding="utf-8")
        else:
            export_command = [sys.executable, "-m", "mutmut", "export-cicd-stats"]
            export_process = _run_command(export_command, repo, 120)
            stdout_parts.append(export_process.stdout)
            stderr_parts.append(export_process.stderr)
            stats_path = repo / "mutants" / "mutmut-cicd-stats.json"
            if export_process.returncode != 0 or not stats_path.exists():
                detail = (export_process.stderr or export_process.stdout)[-3000:]
                raise RuntimeError(f"Não foi possível exportar as estatísticas do mutmut 3.5+: {detail}")
            stats = parse_mutmut_stats(stats_path)
    else:
        cosmic_python = str(mutation_python or sys.executable)
        cosmic_cli = Path(cosmic_python).with_name("cosmic-ray.exe" if platform.system() == "Windows" else "cosmic-ray")
        if not cosmic_cli.is_file():
            raise FileNotFoundError(f"Executável Cosmic Ray não encontrado: {cosmic_cli}")
        config_path = (repo / cosmic_ray_config).resolve()
        try:
            config_path.relative_to(repo)
        except ValueError as error:
            raise ValueError("A configuração do cosmic-ray deve estar dentro do repositório autorizado.") from error
        if not config_path.is_file():
            raise FileNotFoundError(f"Configuração do cosmic-ray não encontrada: {config_path}")
        session_path = artifact_dir / f"cosmic-ray-{stamp}.sqlite"
        command = [str(cosmic_cli), "init", str(config_path), str(session_path)]
        if cosmic_ray_selector:
            selector = (repo / cosmic_ray_selector).resolve()
            try:
                selector.relative_to(repo)
            except ValueError as error:
                raise ValueError("O seletor Cosmic Ray deve estar dentro do repositório autorizado.") from error
            if not selector.is_file():
                raise FileNotFoundError(f"Seletor Cosmic Ray não encontrado: {selector}")
            manifest_path = artifact_dir / f"cosmic-ray-{stamp}-manifest.json"
            command = [cosmic_python, str(selector), str(session_path), str(manifest_path)]
        init_process = _run_command(command, repo, 300)
        stdout_parts.append(init_process.stdout)
        stderr_parts.append(init_process.stderr)
        if init_process.returncode != 0:
            detail = (init_process.stderr or init_process.stdout)[-3000:]
            raise RuntimeError(f"cosmic-ray init encerrou com código {init_process.returncode}: {detail}")
        exec_command = [str(cosmic_cli), "exec", str(config_path), str(session_path)]
        process = _run_command(exec_command, repo, 7200)
        stdout_parts.append(process.stdout)
        stderr_parts.append(process.stderr)
        if process.returncode != 0:
            detail = (process.stderr or process.stdout)[-3000:]
            raise RuntimeError(f"cosmic-ray exec encerrou com código {process.returncode}: {detail}")
        dump_command = [str(cosmic_cli), "dump", str(session_path)]
        dump_process = _run_command(dump_command, repo, 300)
        stderr_parts.append(dump_process.stderr)
        if dump_process.returncode != 0:
            detail = (dump_process.stderr or dump_process.stdout)[-3000:]
            raise RuntimeError(f"cosmic-ray dump encerrou com código {dump_process.returncode}: {detail}")
        stats = parse_cosmic_ray_dump(dump_process.stdout)

    duration = round(time.monotonic() - started, 3)
    total = stats["total"]
    score = round(stats["killed"] / total * 100, 2) if total else 0
    return {
        "runId": f"MUTATION-{stamp}",
        "finishedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "tool": tool,
        "duration": duration,
        "exitCode": 0,
        "stats": {**stats, "score": score},
        "environment": f"Python {platform.python_version()} / {platform.system()} {platform.release()}",
        "command": command,
        "stdout": "\n".join(stdout_parts)[-12000:],
        "stderr": "\n".join(stderr_parts)[-12000:],
    }


def run_repository(repo: Path, pytest_args: list[str], known_case_ids: set[str], coverage_source: str, coverage_functions: set[str] | None = None) -> dict:
    artifact_dir = repo / ".vvtestlab"
    artifact_dir.mkdir(exist_ok=True)
    junit_path = artifact_dir / "junit.xml"
    coverage_path = artifact_dir / "coverage.json"
    junit_path.unlink(missing_ok=True)
    coverage_path.unlink(missing_ok=True)

    command = [
        sys.executable, "-m", "pytest", "-p", "vvtestlab_pytest_plugin",
        f"--junitxml={junit_path}", "-q", *pytest_args,
    ]
    coverage_enabled = importlib.util.find_spec("pytest_cov") is not None
    if coverage_enabled:
        command.extend([f"--cov={coverage_source}", "--cov-branch", "--cov-context=test", "--cov-report="])

    env = os.environ.copy()
    env["PYTHONPATH"] = str(PLUGIN_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    started = time.monotonic()
    process = subprocess.run(
        command,
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=1800,
        shell=False,
    )
    duration = round(time.monotonic() - started, 3)
    mapped, unmapped = parse_junit(junit_path, known_case_ids) if junit_path.exists() else ([], [])
    coverage_context_error = ""
    if coverage_enabled:
        coverage_process = subprocess.run(
            [sys.executable, "-m", "coverage", "json", "--show-contexts", "-o", str(coverage_path)],
            cwd=repo,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            shell=False,
        )
        if coverage_process.returncode != 0:
            coverage_context_error = (coverage_process.stderr or coverage_process.stdout)[-2000:]
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    return {
        "runId": f"PYTEST-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "finishedAt": now,
        "exitCode": process.returncode,
        "duration": duration,
        "mapped": mapped,
        "unmapped": unmapped,
        "coverage": parse_coverage(coverage_path, coverage_functions),
        "caseCoverage": parse_case_coverage(coverage_path, mapped),
        "coverageEnabled": coverage_enabled,
        "coverageContextError": coverage_context_error,
        "environment": f"Python {platform.python_version()} / {platform.system()} {platform.release()}",
        "command": command,
        "stdout": process.stdout[-12000:],
        "stderr": process.stderr[-12000:],
    }


class BridgeHandler(BaseHTTPRequestHandler):
    repo: Path
    pytest_args: list[str]
    coverage_source: str
    coverage_functions: set[str]
    mutation_tool: str
    cosmic_ray_config: str
    cosmic_ray_selector: str
    mutation_python: Path | None

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def cors(self):
        origin = self.headers.get("Origin", "")
        if origin.startswith(("http://127.0.0.1:", "http://localhost:")):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def respond(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") != "/health":
            self.respond(404, {"error": "Endpoint não encontrado"})
            return
        self.respond(200, {
            "status": "ready",
            "repo": str(self.repo),
            "python": platform.python_version(),
            "pytestAvailable": importlib.util.find_spec("pytest") is not None,
            "coverageAvailable": importlib.util.find_spec("pytest_cov") is not None,
            "mutationTools": mutation_tool_status(self.mutation_python),
            "mutationTool": self.mutation_tool,
        })

    def do_POST(self):
        endpoint = self.path.rstrip("/")
        if endpoint not in {"/run", "/graphs", "/mutation"}:
            self.respond(404, {"error": "Endpoint não encontrado"})
            return
        try:
            size = min(int(self.headers.get("Content-Length", "0") or 0), 1_000_000)
            payload = json.loads(self.rfile.read(size) or b"{}")
            if endpoint == "/mutation":
                self.respond(200, run_mutation(self.repo, self.mutation_tool, self.cosmic_ray_config,
                                               self.mutation_python, self.cosmic_ray_selector))
                return
            if endpoint == "/graphs":
                requirements = payload.get("requirements", [])
                if not isinstance(requirements, list):
                    self.respond(400, {"error": "A lista de requisitos é inválida."})
                    return
                safe_requirements = [
                    {"id": str(item.get("id", ""))[:40], "method": str(item.get("method", ""))[:300]}
                    for item in requirements[:3]
                    if isinstance(item, dict)
                ]
                self.respond(200, analyze_repository(self.repo, safe_requirements))
                return
            known = {case_id for value in payload.get("caseIds", []) if (case_id := normalize_case_id(str(value)))}
            if importlib.util.find_spec("pytest") is None:
                self.respond(424, {"error": "pytest não está instalado neste ambiente Python."})
                return
            self.respond(200, run_repository(self.repo, self.pytest_args, known, self.coverage_source, self.coverage_functions))
        except subprocess.TimeoutExpired:
            self.respond(504, {"error": "A execução excedeu o limite de tempo configurado."})
        except Exception as error:
            self.respond(500, {"error": str(error), "trace": traceback.format_exc(limit=5)})


def main():
    parser = argparse.ArgumentParser(description="Ponte local do V&V TestLab para pytest")
    parser.add_argument("--repo", required=True, help="Caminho absoluto do repositório Python")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--cov-source", default=".", help="Pacote ou pasta medido pelo pytest-cov (padrão: .)")
    parser.add_argument("--cov-functions", default="", help="Nomes de funções, separados por vírgula, para a métrica do recorte")
    parser.add_argument("--mutation-tool", choices=["auto", "mutmut", "cosmic-ray"], default="auto", help="Ferramenta de mutação (padrão: auto)")
    parser.add_argument("--cosmic-ray-config", default="cosmic-ray.toml", help="Configuração do cosmic-ray relativa ao repositório")
    parser.add_argument("--cosmic-ray-selector", default="", help="Script local para selecionar uma amostra reproduzível de mutantes")
    parser.add_argument("--mutation-python", default="", help="Interpretador Python separado para Cosmic Ray, relativo ao repositório")
    parser.add_argument("--pytest-args", nargs=argparse.REMAINDER, default=[], help="Argumentos adicionais passados ao pytest")
    args = parser.parse_args()
    repo = Path(args.repo).expanduser().resolve()
    if not repo.is_dir():
        parser.error(f"Repositório não encontrado: {repo}")
    BridgeHandler.repo = repo
    BridgeHandler.pytest_args = args.pytest_args
    BridgeHandler.coverage_source = args.cov_source
    BridgeHandler.coverage_functions = {name.strip() for name in args.cov_functions.split(",") if name.strip()}
    BridgeHandler.mutation_tool = args.mutation_tool
    BridgeHandler.cosmic_ray_config = args.cosmic_ray_config
    BridgeHandler.cosmic_ray_selector = args.cosmic_ray_selector
    BridgeHandler.mutation_python = (repo / args.mutation_python).resolve() if args.mutation_python else None
    if BridgeHandler.mutation_python and not BridgeHandler.mutation_python.is_file():
        parser.error(f"Python de mutação não encontrado: {BridgeHandler.mutation_python}")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), BridgeHandler)
    print(f"V&V TestLab Bridge em http://127.0.0.1:{args.port}")
    print(f"Repositório autorizado: {repo}")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPonte encerrada.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
