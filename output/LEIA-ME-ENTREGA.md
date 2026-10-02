# Estudo completo: Verificação e Validação · teste de software de terceiros

**Aluno:** Gabriel Felipe Jess Meira · **Professor:** Prof. Dr. Leo Natan Paschoal · **Disciplina:** Verificação e Validação de Software
**Sistema testado:** Hotel Management System (CrystalWang1225, commit 71b396b) · **Recorte:** REQ-01 Reservar quartos, REQ-02 Data de entrada, REQ-03 Data de saída

O relatório técnico está na raiz do pacote (`Relatorio-Tecnico-VV-Gabriel-Meira.pdf`), junto com `LINKS-E-DESCRICAO.txt`.
A ferramenta com o estudo carregado está online em https://gabrielfjm.github.io/vv-testlab/.

## Resultado

| Etapa | Código | Casos | Comandos | Desvios | Escore de mutação* |
|---|---|---:|---:|---:|---:|
| 1. Funcional | original | 15 | 95,2% | 85,3% | — |
| 2. Estrutural | original | 15 (18 testes) | 100% | 97,1% | — |
| Correção (10 defeitos) | corrigido | 15 (18 testes) | 100% | 100% | 94,8% (127 ÷ 134) |
| 3. Mutação | corrigido | 15 (22 testes) | 100% | 100% | 100,0% (134 ÷ 134) |

\* Escore = mortos ÷ (gerados − equivalentes) × 100, com 141 mutantes e 7 equivalentes. Sem descontar os equivalentes: 90,1% (127/141) e 95,0% (134/141).

## Pastas

```
1-sistema-testado-hotel/      fork do sistema testado (repositório git com histórico e tags)
    hotel/                    código do sistema (views.py, models.py, forms.py), já corrigido
    tests/                    15 casos pytest reaproveitados nas 3 etapas (com ampliações) + 14 complementares
    evidencias/               saídas de cada etapa: pytest, JUnit, cobertura (JSON e HTML), Cosmic Ray, telas
    docs/                     relatório (PDF, HTML e Markdown) e apresentações
    etapas.ps1 / etapas.sh    reproduzem todas as etapas
2-ferramenta-vv-testlab/      V&V TestLab: ferramenta de gestão dos testes usada no trabalho
    src/, integration/        aplicação web e ponte com o pytest, coverage.py e Cosmic Ray
    output/pdf/               manuais da ferramenta
    output/*.json             projeto do hotel para importar na ferramenta
3-apresentacao/               os 2 slides da apresentação e os slides de apoio
```

O código original do sistema está na tag `sut-original` do repositório (`git checkout sut-original`), e as correções podem ser vistas com `git diff sut-original sut-corrigido -- hotel`.

## Como executar

**Sistema e testes** (em `1-sistema-testado-hotel/`; requer uv):

- Windows: `.\setup_local.ps1`, `.\etapas.ps1` e `.\executar.ps1` (sobe o sistema com dados de demonstração; acesse o endereço exibido pelo Flask).
- Linux/macOS: `./setup.sh`, `./etapas.sh` e `./executar.sh`.

**V&V TestLab** (em `2-ferramenta-vv-testlab/`; requer Node.js 20+), ou use a versão online:

1. Execute `npm install` e `npm run dev`, e abra o endereço mostrado. O estudo do hotel carrega sozinho.
2. Para executar os testes pela ferramenta, inicie a ponte em `1-sistema-testado-hotel/`:
   - `.\iniciar-integracao.ps1 -Versao original`: os defeitos aparecem como falhas.
   - `.\iniciar-integracao.ps1`: executa o código corrigido.
3. Em Integração Python, use **Executar e sincronizar** e **Executar mutação**.

Os scripts de `2-ferramenta-vv-testlab/scripts/` que regeneram o estudo esperam o repositório do hotel em `2-ferramenta-vv-testlab/output/hotel-management-testado/`.
