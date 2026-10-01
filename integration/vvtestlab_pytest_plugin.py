"""Plugin pytest que grava o vínculo CT-xxx no relatório JUnit XML."""

import re

CASE_PATTERN = re.compile(r"^CT[-_ ]?0*(\d+)$", re.IGNORECASE)


def normalize_case_id(value):
    match = CASE_PATTERN.match(str(value).strip())
    if not match:
        raise ValueError(f"ID de caso inválido: {value}. Use CT-001, CT-002, etc.")
    return f"CT-{int(match.group(1)):03d}"


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "vv_case(case_id): vincula o teste automatizado a um caso do V&V TestLab",
    )


def pytest_collection_modifyitems(items):
    for item in items:
        marker = item.get_closest_marker("vv_case")
        if not marker or not marker.args:
            continue
        try:
            case_id = normalize_case_id(marker.args[0])
        except ValueError as error:
            raise ValueError(f"{item.nodeid}: {error}") from error
        item.user_properties.append(("vv_case_id", case_id))

