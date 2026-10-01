# Entrega: Verificação e Validação · teste de software de terceiros

**Aluno:** Gabriel Felipe Jess Meira · **Disciplina:** Verificação e Validação
**Sistema testado:** Hotel Management System (CrystalWang1225, commit 71b396b) · **Recorte:** REQ-01 Reservar quartos, REQ-02 Data de entrada, REQ-03 Data de saída · **Fork:** https://github.com/gabrielfjm/Hotel_Management_System

## Arquivos principais (nesta pasta)

- `01-relatorio-tecnico.pdf`: relatório técnico completo.
- `02-apresentacao-2-slides.pptx`: os 2 slides da apresentação, com notas do apresentador.
- `03-apresentacao-apoio-demo.pptx`: slides de apoio (sistema em execução, DEF-01, V&V TestLab e roteiro da demonstração).

## Resultado

| Etapa | Código | Casos | Comandos | Desvios | Escore de mutação |
|---|---|---:|---:|---:|---:|
| 1. Funcional | original | 15 | 95,2% | 85,3% | — |
| 2. Estrutural | original | 15 (18 testes) | 100% | 97,1% | — |
| Correção (10 defeitos) | corrigido | 15 (18 testes) | 100% | 100% | 90,1% (127/141) |
| 3. Mutação | corrigido | 15 (22 testes) | 100% | 100% | 95,0% (134/141; os 7 vivos são equivalentes) |

## Estrutura

```
output/hotel-management-testado/   fork do sistema testado (repositório git com histórico e tags)
    tests/                         15 casos pytest, reaproveitados nas 3 etapas (com ampliações) + 14 complementares
    evidencias/                    saídas de cada etapa (pytest, JUnit, coverage JSON/HTML, Cosmic Ray, telas)
    docs/                          relatório (PDF/Markdown) e apresentações
    etapas.ps1 / etapas.sh         reproduzem todas as etapas
src/, integration/, docs/, tests/  V&V TestLab: ferramenta de gestão dos testes usada no trabalho
output/hotel-vvtestlab-*.json      projeto do hotel para importar no V&V TestLab
output/pdf/                        manuais do V&V TestLab
```

## Como executar

**Sistema e testes** (em `output/hotel-management-testado/`; requer uv):

- Windows: `.\setup_local.ps1`, `.\etapas.ps1` e `.\executar.ps1`.
- Linux/macOS: `./setup.sh`, `./etapas.sh` e `./executar.sh`.

**V&V TestLab** (na raiz; requer Node.js 20+):

1. Execute `npm install` e `npm run dev`, e abra o endereço mostrado.
2. Em Dados e exportação, importe `output/hotel-vvtestlab-projeto-inicial.json`.
3. Inicie a ponte em `output/hotel-management-testado`:
   - `.\iniciar-integracao.ps1 -Versao original`: os defeitos aparecem como falhas.
   - `.\iniciar-integracao.ps1`: executa o código corrigido.
4. Em Integração Python, use **Executar e sincronizar** e **Executar mutação**.

Para ver o estudo completo sem executar nada, importe `output/hotel-vvtestlab-backup.json`.
