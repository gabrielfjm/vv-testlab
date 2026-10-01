import json
import tempfile
import unittest
from pathlib import Path

from integration.cfg_analyzer import analyze_repository
from integration.vv_bridge import (
    normalize_case_id,
    parse_case_coverage,
    parse_coverage,
    parse_cosmic_ray_dump,
    parse_junit,
    parse_mutmut_stats,
    parse_mutmut2_results,
)


class BridgeTests(unittest.TestCase):
    def test_normalizes_case_id(self):
        self.assertEqual(normalize_case_id("test_CT_7_limite"), "CT-007")
        self.assertIsNone(normalize_case_id("test_sem_id"))

    def test_parses_marker_and_reports_unmapped_test(self):
        xml = """<?xml version="1.0"?>
        <testsuites><testsuite tests="2">
          <testcase classname="tests.test_user" name="test_ok" time="0.1">
            <properties><property name="vv_case_id" value="CT-001"/></properties>
          </testcase>
          <testcase classname="tests.test_user" name="test_sem_vinculo" time="0.2">
            <failure message="assert False">detalhe</failure>
          </testcase>
        </testsuite></testsuites>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "junit.xml"
            path.write_text(xml, encoding="utf-8")
            mapped, unmapped = parse_junit(path, {"CT-001"})
        self.assertEqual(mapped[0]["caseId"], "CT-001")
        self.assertEqual(mapped[0]["result"], "Aprovado")
        self.assertEqual(len(unmapped), 1)
        self.assertEqual(unmapped[0]["result"], "Falhou")

    def test_analyzes_nodes_edges_and_loop_free_paths(self):
        source = """def classify(value):
    if value > 0:
        return "positive"
    return "other"
"""
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            (repo / "sample.py").write_text(source, encoding="utf-8")
            result = analyze_repository(repo, [{"id": "REQ-001", "method": "sample.classify"}])
        self.assertEqual(len(result["graphs"]), 1)
        graph = result["graphs"][0]
        self.assertGreaterEqual(graph["metrics"]["nodes"], 5)
        self.assertEqual(graph["metrics"]["simpleLoopFreePaths"], 2)
        self.assertTrue(any(edge["label"] == "Verdadeiro" for edge in graph["edges"]))
        self.assertTrue(all(path["kind"] == "Simples livre de laço" for path in graph["paths"]))

    def test_maps_coverage_contexts_to_case(self):
        coverage = {
            "files": {
                "sample.py": {
                    "contexts": {
                        "2": ["tests/test_sample.py::test_positive|run"],
                        "3": ["tests/test_sample.py::test_positive|run"],
                        "4": ["tests/test_sample.py::test_other|run"],
                    }
                }
            }
        }
        mapped = [{"caseId": "CT-001", "nodeIds": ["tests.test_sample::test_positive"]}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "coverage.json"
            path.write_text(json.dumps(coverage), encoding="utf-8")
            result = parse_case_coverage(path, mapped)
        self.assertEqual(result[0]["files"]["sample.py"], [2, 3])
        self.assertEqual(result[0]["lineCount"], 2)

    def test_parses_mutmut_cicd_stats_using_official_score_denominator(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "mutmut-cicd-stats.json"
            path.write_text(json.dumps({
                "total": 12,
                "killed": 7,
                "survived": 2,
                "timeout": 1,
                "no_tests": 1,
                "skipped": 1,
            }), encoding="utf-8")
            stats = parse_mutmut_stats(path)
        self.assertEqual(stats["total"], 11)
        self.assertEqual(stats["killed"], 8)
        self.assertEqual(stats["survived"], 2)
        self.assertEqual(stats["noTests"], 1)

    def test_parses_mutmut_2_result_ids(self):
        stats = parse_mutmut2_results({"killed": "1 2 3\n", "survived": "4\n", "timeout": "5\n", "skipped": "6 7", "untested": "8"})
        self.assertEqual(stats["total"], 5)
        self.assertEqual(stats["killed"], 4)
        self.assertEqual(stats["rawTotal"], 8)

    def test_scoped_coverage_uses_function_summaries(self):
        coverage = {"totals": {"num_statements": 100, "covered_lines": 20}, "files": {"hotel/views.py": {"functions": {
            "reserve": {"summary": {"num_statements": 10, "covered_lines": 9, "num_branches": 4, "covered_branches": 3}},
            "cal_cost": {"summary": {"num_statements": 5, "covered_lines": 5, "num_branches": 2, "covered_branches": 2}},
        }}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "coverage.json"
            path.write_text(json.dumps(coverage), encoding="utf-8")
            result = parse_coverage(path, {"reserve", "cal_cost"})
        self.assertEqual(result["statementCoverage"], 93.33)
        self.assertEqual(result["branchCoverage"], 83.33)
        self.assertEqual(result["statements"], 15)

    def test_parses_cosmic_ray_json_lines(self):
        output = "\n".join([
            json.dumps([{"job_id": "1"}, {"worker_outcome": "normal", "test_outcome": "killed"}]),
            json.dumps([{"job_id": "2"}, {"worker_outcome": "normal", "test_outcome": "survived"}]),
            json.dumps([{"job_id": "3"}, {"worker_outcome": "skipped", "test_outcome": None}]),
            json.dumps([{"job_id": "4"}, None]),
            json.dumps([{"job_id": "5"}, {"worker_outcome": "normal", "test_outcome": "incompetent"}]),
        ])
        stats = parse_cosmic_ray_dump(output)
        self.assertEqual(stats["total"], 2)
        self.assertEqual(stats["killed"], 1)
        self.assertEqual(stats["survived"], 1)
        self.assertEqual(stats["skipped"], 1)
        self.assertEqual(stats["pending"], 1)
        self.assertEqual(stats["incompetent"], 1)
        # rawTotal conta todos os itens da sessão, inclusive o incompetente (como no parser do mutmut).
        self.assertEqual(stats["rawTotal"], 5)


if __name__ == "__main__":
    unittest.main()
