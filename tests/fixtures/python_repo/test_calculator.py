import pytest

from calculator import divide, is_adult


@pytest.mark.vv_case("CT-001")
def test_idade_minima_valida():
    assert is_adult(18)


@pytest.mark.vv_case("CT-002")
def test_idade_abaixo_do_limite():
    assert not is_adult(17)


def test_CT_003_divisao_valida():
    assert divide(6, 2) == 3


def test_sem_vinculo():
    assert divide(4, 2) == 2
