# Descrição técnica — V&V TestLab

## 1. Visão geral

O V&V TestLab é uma ferramenta web de gestão do projeto de testes criada para a disciplina de Verificação e Validação de Software. Ela reduz o trabalho manual de elaborar tabelas e, ao mesmo tempo, preserva a qualidade metodológica exigida. A aplicação conduz o usuário pelas etapas funcional, estrutural e baseada em defeitos, mantendo os artefatos conectados por identificadores estáveis.

O MVP é uma aplicação front-end de página única. O uso manual não exige servidor nem banco de dados: o estado é serializado em JSON e persistido no `localStorage`. A integração automática usa uma ponte HTTP restrita a `127.0.0.1` para iniciar pytest, coverage.py e Cosmic Ray no computador local. O backup JSON permite portabilidade e o CSV permite inserir a tabela de casos no relatório.

## 2. Objetivos

1. Padronizar requisitos, classes de equivalência e casos de teste.
2. Restringir o escopo às três funcionalidades ou métodos principais do software escolhido.
3. Gerar automaticamente casos de análise de valor-limite.
4. Rastrear cada resultado até a especificação que o originou.
5. Registrar a evolução da suíte, cobertura e mutação.
6. Evidenciar lacunas: requisito sem caso, caso sem execução e falha sem defeito.
7. Produzir dados reaproveitáveis no relatório técnico.

## 3. Modelo de dados

| Entidade | Identificador | Campos principais | Relação |
|---|---|---|---|
| Projeto | único | nome, repositório, propósito, meta, etapa | raiz do workspace |
| Funcionalidade/requisito | `REQ-nnn` | título, método/função, descrição, prioridade, status | origina classes e casos; máximo de três |
| Classe de equivalência | `CE-nnn` | condição, tipo, limites | pertence a um requisito |
| Caso de teste | `CT-nnn` | entrada, pré-condição, passos, esperado, validade, técnica | pertence a requisito e classe |
| Execução | `EXE-nnn` | caso, data, ambiente, resultado, evidência | pertence a um caso |
| Defeito | `DEF-nnn` | caso, severidade, estado, correção | revelado por um caso |
| Métrica | `MET-nnn` | etapa, suíte, coberturas, mutantes | fotografa a evolução |

A rastreabilidade principal é:

```text
REQ-001 → CE-001 → CT-001 → EXE-001 → DEF-001
```

A matriz também apresenta entidades sem descendentes. Isso é proposital: uma linha incompleta funciona como alerta de cobertura, em vez de desaparecer do relatório.

## 4. Requisitos funcionais da ferramenta

- **RF01 — Configurar projeto:** manter nome, URL do GitHub, propósito, meta e etapa atual.
- **RF02 — Manter escopo:** cadastrar e editar até três funcionalidades/requisitos principais e seus métodos correspondentes.
- **RF03 — Manter classes:** cadastrar classes válidas/inválidas e associá-las a requisitos.
- **RF04 — Manter casos:** cadastrar casos com todos os campos necessários à reprodução.
- **RF05 — Gerar valores-limite:** criar casos automaticamente para seis pontos de fronteira, removendo duplicatas quando o intervalo é pequeno.
- **RF06 — Rastrear artefatos:** materializar a cadeia requisito–classe–caso–execução–defeito.
- **RF07 — Registrar execução:** armazenar data, ambiente, estado e resultado observado.
- **RF08 — Registrar métricas:** manter tamanho da suíte, cobertura de instruções/desvios e mutação por etapa.
- **RF09 — Manter defeitos:** documentar descrição, severidade, status e proposta de correção.
- **RF10 — Exportar/importar:** gerar CSV/JSON e restaurar backup validado.
- **RF11 — Gerar relatório A4:** produzir PDF retrato com todos os artefatos, indicadores, evidências, matriz e paginação padronizada.
- **RF12 — Sincronizar pytest:** executar o repositório por uma ponte local, mapear JUnit por `CT-xxx` e criar execuções automaticamente.
- **RF13 — Importar cobertura:** registrar cobertura de instruções e desvios do `pytest-cov` na etapa atual.
- **RF14 — Tratar falhas automáticas:** listar testes sem vínculo e criar defeitos rastreados para falhas, conforme configuração.
- **RF15 — Automatizar mutação:** executar mutmut/Cosmic Ray pela ponte, normalizar estatísticas e manter histórico e métricas por rodada.

## 5. Regras de negócio

- **RN01:** a ordem metodológica é funcional → estrutural → baseada em defeitos.
- **RN02:** todo caso deve indicar um requisito e uma classe.
- **RN03:** limites são inclusivos; um valor é válido quando `mínimo ≤ valor ≤ máximo`.
- **RN04:** pontos do gerador: `mín−1`, `mín`, `mín+1`, `máx−1`, `máx`, `máx+1`.
- **RN05:** pontos repetidos são eliminados, importante para intervalos estreitos.
- **RN06:** escore de mutação = mutantes mortos ÷ mutantes totais × 100.
- **RN07:** cobertura de requisitos = requisitos com ao menos um caso ÷ requisitos cadastrados × 100.
- **RN08:** antes de uma exclusão em cascata, o sistema informa quantas classes, casos, execuções e defeitos serão afetados e solicita confirmação.
- **RN09:** ao confirmar a exclusão de requisito, classe ou caso, seus dependentes são removidos em cascata para impedir referências órfãs.
- **RN10:** a classe selecionada por um caso deve pertencer ao mesmo requisito do caso.
- **RN11:** os filtros de uma tela são combinados com operador lógico E; a busca textual procura em todos os campos relevantes do registro.
- **RN12:** o projeto aceita no máximo três funcionalidades/requisitos principais; toda classe e todo caso deve estar vinculado a uma delas.
- **RN13:** cada funcionalidade pode registrar o nome do método/função correspondente no código, permitindo relacionar o teste funcional às etapas estrutural e de mutação.

## 6. Fluxo recomendado para a disciplina

### Fase 1 — Caracterização

1. Escolher e instalar um software Python real de terceiros.
2. Registrar nome, GitHub, propósito e meta no V&V TestLab.
3. Levantar LOC, funções/métodos, classes e módulos com uma ferramenta como `radon` ou `cloc` e colocar os números no relatório.
4. Cadastrar os requisitos observados a partir da especificação/uso.

### Fase 2.1 — Teste funcional

1. Criar classes válidas e inválidas por condição de entrada.
2. Usar o gerador para entradas numéricas com limites.
3. Criar manualmente cenários categóricos, vazios, formatos e combinações relevantes.
4. Implementar os casos em `pytest` e registrar as execuções.
5. Registrar uma métrica da etapa funcional.

### Fase 2.2 — Teste estrutural

1. Executar `coverage run -m pytest` e `coverage report`.
2. Inspecionar desvios não cobertos.
3. Acrescentar casos com técnica “Estrutural”.
4. Repetir até atingir a meta definida.
5. Registrar uma nova linha de métrica.

### Fase 2.3 — Baseado em defeitos

1. Executar `mutmut run` ou o fluxo equivalente do `cosmic-ray`.
2. Analisar mutantes sobreviventes.
3. Acrescentar casos com técnica “Mutação”.
4. Registrar mutantes totais/mortos e o escore final.
5. Documentar falhas reais e propor correções.

## 7. Arquitetura

- `core.js`: funções puras de domínio. Pode ser testado sem navegador.
- `app.js`: renderização da SPA, eventos, persistência e downloads.
- `styles.css`: tokens visuais, componentes e responsividade.
- `localStorage`: adaptador de persistência local.
- `integration/vv_bridge.py`: serviço HTTP restrito a localhost que executa pytest, cobertura e mutação sem shell.
- `integration/vvtestlab_pytest_plugin.py`: plugin que transporta o ID do caso para o JUnit XML.
- No exemplo do hotel, `output/hotel-vvtestlab-projeto-inicial.json` contém somente requisitos, classes e casos. A ponte cria as execuções, defeitos e métricas a partir de cada rodada. O Cosmic Ray pode usar um Python separado e um seletor de mutantes (no hotel, `scripts/selecionar_mutantes.py` cria todos os mutantes das funções do recorte). `output/hotel-vvtestlab-backup.json` traz o estudo completo, gerado das evidências por `scripts/gerar_backup_hotel.py`.
- `node:test`: testes unitários sem bibliotecas adicionais.
- Vite: servidor de desenvolvimento e empacotamento de produção.

Não há coleta de telemetria nem envio de dados. A fonte web usada na interface é a única requisição externa; caso o computador esteja sem internet, o sistema usa fontes locais de fallback.

## 8. Critérios de aceitação do MVP

- O usuário consegue cadastrar ao menos um item de cada entidade.
- Um caso aparece na matriz sob seu requisito e sua classe.
- Uma execução aparece ligada ao caso correto.
- Um defeito aparece na última coluna do caso que o revelou.
- O gerador classifica automaticamente os pontos externos como inválidos.
- O painel recalcula os percentuais depois de cada alteração.
- O backup exportado pode ser reimportado sem perda das coleções.
- O CSV apresenta as colunas pedidas no enunciado do usuário.
- Todos os modais permitem salvar, cancelar, fechar pelo fundo ou pela tecla Escape e, em edição, excluir o item.
- Requisitos, classes, casos, execuções, métricas e defeitos podem ser criados, consultados, alterados e excluídos.
- A matriz permite filtrar lacunas, cadeias executadas e cadeias com defeito, além de abrir cada artefato para edição.
- O PDF gerado mantém fichas de casos indivisíveis quando houver espaço, repete cabeçalhos de tabelas e identifica cada página.

## 9. Evoluções futuras

- Back-end Python com FastAPI e banco SQLite/PostgreSQL.
- Autenticação e projetos multiusuário.
- Comparação detalhada de mutantes sobreviventes e geração assistida de novos casos para eliminá-los.
- Anexos de evidência e histórico de alterações.
- Geração de esqueleto de testes `pytest` a partir dos casos.
- Relatório PDF e slides gerados diretamente do workspace.
