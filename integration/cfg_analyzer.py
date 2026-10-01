"""Analisador estático de grafos de fluxo de controle para o V&V TestLab.

O módulo usa somente a AST da biblioteca padrão. Ele não importa nem executa o
código do repositório analisado. O resultado é uma representação JSON de nós,
arestas e caminhos simples livres de laço para as funções solicitadas.
"""

from __future__ import annotations

import ast
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


IGNORED_DIRECTORIES = {
    ".git",
    ".hg",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    ".vvtestlab",
    "__pycache__",
    "build",
    "dist",
    "env",
    "node_modules",
    "site-packages",
    "venv",
}
MAX_FILES = 2_000
MAX_FUNCTION_NODES = 350
MAX_PATHS = 120


def _source_label(source: str, node: ast.AST, fallback: str) -> str:
    segment = ast.get_source_segment(source, node) or fallback
    first_line = " ".join(segment.strip().split())
    return first_line[:117] + "..." if len(first_line) > 120 else first_line


def _condition_label(source: str, node: ast.AST, prefix: str) -> str:
    try:
        expression = ast.unparse(node)
    except Exception:
        expression = _source_label(source, node, prefix)
    return f"{prefix}: {expression}"[:120]


@dataclass
class FunctionRecord:
    file: Path
    relative_file: str
    module_name: str
    qualified_name: str
    node: ast.FunctionDef | ast.AsyncFunctionDef
    source: str

    @property
    def module_qualified_name(self) -> str:
        return f"{self.module_name}.{self.qualified_name}" if self.module_name else self.qualified_name


class FunctionCollector(ast.NodeVisitor):
    def __init__(self, file: Path, relative_file: str, module_name: str, source: str):
        self.file = file
        self.relative_file = relative_file
        self.module_name = module_name
        self.source = source
        self.scope: list[str] = []
        self.records: list[FunctionRecord] = []

    def visit_ClassDef(self, node: ast.ClassDef):
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._visit_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._visit_function(node)

    def _visit_function(self, node: ast.FunctionDef | ast.AsyncFunctionDef):
        qualified = ".".join([*self.scope, node.name])
        self.records.append(FunctionRecord(
            file=self.file,
            relative_file=self.relative_file,
            module_name=self.module_name,
            qualified_name=qualified,
            node=node,
            source=self.source,
        ))
        self.scope.append(node.name)
        self.generic_visit(node)
        self.scope.pop()


class CFGBuilder:
    def __init__(self, record: FunctionRecord):
        self.record = record
        self.nodes: list[dict] = []
        self.edges: list[dict] = []
        self._edge_keys: set[tuple[str, str, str, str]] = set()
        self.entry_id = self.add_node("entry", "Entrada", record.node.lineno, record.node.lineno)
        self.exit_id = self.add_node(
            "exit",
            "Saída",
            getattr(record.node, "end_lineno", record.node.lineno),
            getattr(record.node, "end_lineno", record.node.lineno),
        )

    def add_node(self, node_type: str, label: str, line: int | None, end_line: int | None = None) -> str:
        if len(self.nodes) >= MAX_FUNCTION_NODES:
            raise ValueError(f"A função excede o limite de {MAX_FUNCTION_NODES} nós estruturais.")
        node_id = f"N{len(self.nodes) + 1:03d}"
        self.nodes.append({
            "id": node_id,
            "type": node_type,
            "label": label,
            "line": int(line or 0),
            "endLine": int(end_line or line or 0),
        })
        return node_id

    def add_edge(self, source: str, target: str, label: str = "", kind: str = "normal") -> str | None:
        key = (source, target, label, kind)
        if key in self._edge_keys:
            return None
        self._edge_keys.add(key)
        edge_id = f"E{len(self.edges) + 1:03d}"
        self.edges.append({"id": edge_id, "from": source, "to": target, "label": label, "kind": kind})
        return edge_id

    def connect(self, incoming: list[tuple[str, str, str]], target: str) -> None:
        for source, label, kind in incoming:
            self.add_edge(source, target, label, kind)

    @staticmethod
    def tails(node_id: str, label: str = "", kind: str = "normal") -> list[tuple[str, str, str]]:
        return [(node_id, label, kind)]

    def build_block(
        self,
        statements: list[ast.stmt],
        incoming: list[tuple[str, str, str]],
    ) -> list[tuple[str, str, str]]:
        tails = incoming
        for statement in statements:
            if not tails:
                # Código após return/raise não é alcançável neste bloco.
                break
            tails = self.build_statement(statement, tails)
        return tails

    def build_statement(
        self,
        statement: ast.stmt,
        incoming: list[tuple[str, str, str]],
    ) -> list[tuple[str, str, str]]:
        source = self.record.source
        end_line = getattr(statement, "end_lineno", statement.lineno)

        if isinstance(statement, ast.If):
            decision = self.add_node("decision", _condition_label(source, statement.test, "Se"), statement.lineno, end_line)
            self.connect(incoming, decision)
            true_tails = self.build_block(statement.body, self.tails(decision, "Verdadeiro", "branch"))
            false_tails = (
                self.build_block(statement.orelse, self.tails(decision, "Falso", "branch"))
                if statement.orelse else self.tails(decision, "Falso", "branch")
            )
            return [*true_tails, *false_tails]

        if isinstance(statement, (ast.For, ast.AsyncFor, ast.While)):
            expression = statement.test if isinstance(statement, ast.While) else statement.iter
            prefix = "Enquanto" if isinstance(statement, ast.While) else "Para cada"
            loop = self.add_node("loop", _condition_label(source, expression, prefix), statement.lineno, end_line)
            self.connect(incoming, loop)
            body_tails = self.build_block(statement.body, self.tails(loop, "Iterar", "branch"))
            for tail, _label, _kind in body_tails:
                self.add_edge(tail, loop, "Próxima iteração", "loop")
            if statement.orelse:
                return self.build_block(statement.orelse, self.tails(loop, "Encerrar", "branch"))
            return self.tails(loop, "Encerrar", "branch")

        # ast.Match só existe no Python 3.10+; a ponte também roda em 3.9.
        if hasattr(ast, "Match") and isinstance(statement, ast.Match):
            match = self.add_node("decision", _condition_label(source, statement.subject, "Match"), statement.lineno, end_line)
            self.connect(incoming, match)
            branch_tails: list[tuple[str, str, str]] = []
            for index, case in enumerate(statement.cases, start=1):
                branch_tails.extend(self.build_block(case.body, self.tails(match, f"Caso {index}", "branch")))
            return branch_tails or self.tails(match)

        if isinstance(statement, ast.Try):
            attempt = self.add_node("exception", "Bloco try", statement.lineno, end_line)
            self.connect(incoming, attempt)
            branch_tails = self.build_block(statement.body, self.tails(attempt, "Fluxo normal", "branch"))
            for handler in statement.handlers:
                exception_name = "Exceção"
                if handler.type is not None:
                    try:
                        exception_name = ast.unparse(handler.type)
                    except Exception:
                        pass
                branch_tails.extend(self.build_block(handler.body, self.tails(attempt, exception_name, "exception")))
            if statement.orelse:
                branch_tails = self.build_block(statement.orelse, branch_tails)
            if statement.finalbody:
                branch_tails = self.build_block(statement.finalbody, branch_tails)
            return branch_tails

        if isinstance(statement, (ast.With, ast.AsyncWith)):
            context = self.add_node("statement", _source_label(source, statement, "with"), statement.lineno, end_line)
            self.connect(incoming, context)
            return self.build_block(statement.body, self.tails(context))

        if isinstance(statement, (ast.Return, ast.Raise)):
            node_type = "return" if isinstance(statement, ast.Return) else "raise"
            fallback = "return" if isinstance(statement, ast.Return) else "raise"
            terminal = self.add_node(node_type, _source_label(source, statement, fallback), statement.lineno, end_line)
            self.connect(incoming, terminal)
            self.add_edge(terminal, self.exit_id, "Retorno" if node_type == "return" else "Exceção", "terminal")
            return []

        node_type = "statement"
        if isinstance(statement, (ast.Break, ast.Continue)):
            node_type = "loop-control"
        elif isinstance(statement, (ast.Assert,)):
            node_type = "assertion"
        node = self.add_node(node_type, _source_label(source, statement, type(statement).__name__), statement.lineno, end_line)
        self.connect(incoming, node)
        return self.tails(node)

    def simple_paths(self) -> list[dict]:
        adjacency: dict[str, list[dict]] = {node["id"]: [] for node in self.nodes}
        for edge in self.edges:
            adjacency.setdefault(edge["from"], []).append(edge)
        paths: list[dict] = []

        def visit(node_id: str, visited: list[str], traversed_edges: list[str]) -> None:
            if len(paths) >= MAX_PATHS:
                return
            if node_id == self.exit_id:
                paths.append({
                    "id": f"P{len(paths) + 1:03d}",
                    "nodeIds": visited.copy(),
                    "edgeIds": traversed_edges.copy(),
                    "kind": "Simples livre de laço",
                })
                return
            for edge in adjacency.get(node_id, []):
                target = edge["to"]
                if target in visited:
                    continue
                visit(target, [*visited, target], [*traversed_edges, edge["id"]])

        visit(self.entry_id, [self.entry_id], [])
        return paths

    def build(self) -> dict:
        tails = self.build_block(self.record.node.body, self.tails(self.entry_id))
        self.connect(tails, self.exit_id)
        paths = self.simple_paths()
        complexity = max(1, len(self.edges) - len(self.nodes) + 2)
        source_hash = hashlib.sha256(self.record.source.encode("utf-8")).hexdigest()[:16]
        return {
            "method": self.record.module_qualified_name,
            "qualifiedName": self.record.qualified_name,
            "file": self.record.relative_file,
            "line": self.record.node.lineno,
            "endLine": getattr(self.record.node, "end_lineno", self.record.node.lineno),
            "sourceHash": source_hash,
            "nodes": self.nodes,
            "edges": self.edges,
            "paths": paths,
            "metrics": {
                "nodes": len(self.nodes),
                "edges": len(self.edges),
                "simpleLoopFreePaths": len(paths),
                "cyclomaticComplexity": complexity,
                "pathsTruncated": len(paths) >= MAX_PATHS,
            },
        }


def discover_functions(repo: Path) -> tuple[list[FunctionRecord], int, list[dict]]:
    records: list[FunctionRecord] = []
    errors: list[dict] = []
    files = []
    for file in repo.rglob("*.py"):
        relative_parts = file.relative_to(repo).parts
        if any(part in IGNORED_DIRECTORIES or part.startswith(".") for part in relative_parts[:-1]):
            continue
        files.append(file)
        if len(files) >= MAX_FILES:
            break

    for file in sorted(files):
        relative = file.relative_to(repo).as_posix()
        try:
            source = file.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=relative)
        except (OSError, UnicodeDecodeError, SyntaxError) as error:
            errors.append({"file": relative, "error": str(error)[:500]})
            continue
        module_name = relative.removesuffix(".py").replace("/", ".")
        if module_name.endswith(".__init__"):
            module_name = module_name.removesuffix(".__init__")
        collector = FunctionCollector(file, relative, module_name, source)
        collector.visit(tree)
        records.extend(collector.records)
    return records, len(files), errors


def _match_function(method: str, records: list[FunctionRecord]) -> tuple[FunctionRecord | None, list[str]]:
    requested = method.strip().replace(":", ".")
    if not requested:
        return None, []
    leaf = requested.split(".")[-1]

    def score(record: FunctionRecord) -> int:
        module_qualified = record.module_qualified_name
        qualified = record.qualified_name
        if requested == module_qualified:
            return 50
        if requested == qualified:
            return 45
        if module_qualified.endswith(f".{requested}"):
            return 40
        if requested.endswith(f".{qualified}"):
            return 35
        if qualified.endswith(f".{requested}"):
            return 30
        if record.node.name == leaf:
            return 20
        return 0

    ranked = sorted(
        ((score(record), record) for record in records),
        key=lambda item: (-item[0], len(item[1].module_qualified_name), item[1].relative_file),
    )
    ranked = [(value, record) for value, record in ranked if value > 0]
    if not ranked:
        return None, []
    top_score = ranked[0][0]
    candidates = [record.module_qualified_name for value, record in ranked if value == top_score]
    return ranked[0][1], candidates


def analyze_repository(repo: Path, requirements: list[dict]) -> dict:
    repo = repo.resolve()
    records, files_scanned, parse_errors = discover_functions(repo)
    graphs = []
    unresolved = []
    warnings = []

    for requirement in requirements[:3]:
        requirement_id = str(requirement.get("id", "")).strip()
        method = str(requirement.get("method", "")).strip()
        if not method:
            unresolved.append({"requirementId": requirement_id, "method": method, "reason": "Método/função não informado."})
            continue
        record, candidates = _match_function(method, records)
        if record is None:
            unresolved.append({"requirementId": requirement_id, "method": method, "reason": "Função não encontrada no repositório."})
            continue
        try:
            graph = CFGBuilder(record).build()
        except ValueError as error:
            unresolved.append({"requirementId": requirement_id, "method": method, "reason": str(error)})
            continue
        graph["requirementId"] = requirement_id
        graph["requestedMethod"] = method
        graphs.append(graph)
        if len(candidates) > 1:
            warnings.append({
                "requirementId": requirement_id,
                "message": f"Mais de uma função corresponde a {method}; foi usada {record.module_qualified_name}.",
                "candidates": candidates,
            })

    return {
        "analyzedAt": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "filesScanned": files_scanned,
        "functionsFound": len(records),
        "graphs": graphs,
        "unresolved": unresolved,
        "warnings": warnings,
        "parseErrors": parse_errors[:50],
    }

