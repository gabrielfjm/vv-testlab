# V&V TestLab — Gestão do Projeto de Testes

Aplicação web local para apoiar o projeto da disciplina de Verificação e Validação de Software. O sistema organiza as três etapas obrigatórias — funcional, estrutural e baseada em defeitos — e mantém rastreabilidade entre requisitos, classes de equivalência, casos, execuções e defeitos.

- **Ferramenta online:** https://gabrielfjm.github.io/vv-testlab/ (abre com o estudo do Hotel Management System carregado)
- **Sistema testado (fork com testes, correções e evidências):** https://github.com/gabrielfjm/Hotel_Management_System

A versão online é publicada pelo GitHub Pages a cada push em `main` (`.github/workflows/pages.yml`). A integração com pytest e Cosmic Ray (ponte em `127.0.0.1:8765`) só funciona com a ferramenta rodando na máquina que tem o repositório Python.

## Documentação

- [Manual completo de uso](docs/MANUAL_DO_USUARIO.md)
- [Integração automática com pytest](docs/INTEGRACAO_PYTEST.md)
- [Descrição técnica e arquitetura](docs/DESCRICAO_TECNICA.md)

### Manuais em PDF

- [Guia rápido - comece por aqui](output/pdf/guia-rapido-vv-testlab.pdf)
- [Manual completo do usuário](output/pdf/manual-do-usuario-vv-testlab.pdf)
- [Guia de integração com pytest](output/pdf/guia-integracao-pytest-vv-testlab.pdf)

Para regenerar os três PDFs após alterar a documentação:

```bash
npm run manuals:pdf
```

## Executar

Pré-requisito: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite (normalmente `http://127.0.0.1:5173`).

Para gerar a versão de produção:

```bash
npm run build
npm run preview
```

Para executar os testes automatizados do núcleo:

```bash
npm test
```

Esse comando executa os testes de domínio e um teste de interface que cobre abertura e fechamento de modais, criação, edição, exclusão, filtros e navegação pela matriz.

## Funcionalidades

- Página inicial **O projeto**: caracterização do sistema testado (contexto de desenvolvimento, funcionalidades, métricas de código, arquitetura, telas em execução, links do repositório original e do fork). Os textos ficam em `scripts/dados/caracterizacao.json`; as métricas e o histórico git vêm das evidências e do fork quando `scripts/gerar_catalogo_testes.py` roda, e as imagens são copiadas para `public/caracterizacao/`. A página e o menu lateral mostram o vínculo com o mestrado da PUCPR e o apoio da CAPES, com as logos oficiais em `public/instituicoes/` (PUCPR: pucpr.br; CAPES: gov.br/capes; a versão branca da CAPES é a monocromática da mesma logo). O rodapé das páginas segue a ordem da apresentação: O projeto → Visão geral dos testes → Teste funcional → estrutural → de mutação → Como a ferramenta funciona → Agradecimentos.
- **Defeitos com detalhe:** a página Defeitos mostra a linha do tempo do projeto pelos commits do fork (etapa que revelou cada defeito → commits de correção → início da mutação) e, ao clicar em um defeito, onde ele estava no código original (linhas destacadas da tag `sut-original`), como ficou no código corrigido, o cenário que o revelou e os commits com data. Os dados vêm de `docs/partes/defeitos.md` e do git do fork, montados por `scripts/gerar_catalogo_testes.py`.
- Página **Agradecimentos** (encerramento): números finais do trabalho, professor da disciplina (Prof. Dr. Leo Natan Paschoal, com Lattes e LinkedIn), autor (Gabriel Felipe Jess Meira, com currículo e LinkedIn), logos da PUCPR e da CAPES e os links publicados. Os dados das pessoas ficam em `CREDITS`, em `src/app.js`.
- Página **Como a ferramenta funciona** (menu Encerramento): o que é a ferramenta, os dois modos (ao vivo com a ponte e publicado no GitHub Pages), a integração passo a passo com as rotas da ponte (`/health`, `/run`, `/mutation`, `/graphs`), um exemplo real de rastreabilidade, o guia de cada item do menu, onde ficam os dados e perguntas frequentes.
- Páginas por etapa (**Teste funcional**, **Teste estrutural** e **Teste de mutação**): visão geral dos resultados, filtros e lista de testes; ao clicar em um teste, abre a descrição, a tabela entrada/esperado/obtido/observações no código original e no corrigido, as assertivas e o código pytest, o grafo de fluxo percorrido (estrutural) e os mutantes mortos (mutação). A página de mutação lista todos os mutantes das duas rodadas e o cálculo do escore.
- Caracterização do software Python de terceiros e meta de cobertura.
- Definição das três funcionalidades/métodos principais que formam o escopo do trabalho.
- Cadastro do nome real do método/função no código para apoiar cobertura e mutação.
- Cadastro de classes de equivalência válidas e inválidas.
- Tabela de casos com ID, condição de entrada, classe/cenário, cenário válido e cenários inválidos.
- Geração automática de casos de valor-limite nos pontos `mín−1`, `mín`, `mín+1`, `máx−1`, `máx` e `máx+1`.
- Matriz bidirecional `Requisito → Classe → Caso → Execução → Defeito`.
- CRUD completo de requisitos, classes, casos, execuções, métricas e defeitos.
- Filtros combináveis por texto, requisito, situação, técnica, severidade, resultado e integridade dos vínculos.
- Navegação direta pela matriz: clique em qualquer artefato rastreado para editá-lo.
- Bloqueio da criação de uma quarta funcionalidade, mantendo todos os cenários dentro do recorte acadêmico.
- Integração local com repositórios Python: execução de pytest, importação de JUnit, cobertura, mutação e vínculo automático por `CT-xxx`.
- Execução de teste de mutação com `mutmut` ou `cosmic-ray`, histórico auditável e criação automática da métrica da etapa baseada em defeitos.
- Histórico auditável de sincronizações e criação opcional de defeitos a partir de falhas automatizadas.
- Registro de execuções, ambiente, resultado obtido e evidência textual.
- Evolução da suíte, cobertura de instruções/desvios e escore de mutação.
- Registro de defeitos e proposta de correção.
- Persistência automática no `localStorage` do navegador.
- Exportação de backup JSON e tabela CSV compatível com Excel.
- Importação de backup e dados demonstrativos prontos para exploração.
- Geração de uma primeira versão do relatório técnico em Markdown.
- Geração de relatório PDF estilizado em A4 retrato, com paginação e rastreabilidade completa.
- Cadastro das métricas de caracterização: LOC, funções/métodos, classes e módulos.

## Estudo do hotel: catálogo de testes

As páginas por etapa leem `testCatalog` do backup (código, assertivas, resultados, mutantes e explicações passo a passo). Depois de regenerar o estudo, acrescente o catálogo; o script também publica `public/estudo-hotel.json`, que a ferramenta carrega sozinha ao abrir (sempre que o estudo publicado for mais novo que o salvo no navegador); também há **Dados e exportação → Carregar estudo oficial** e o endereço `http://127.0.0.1:5173/?estudo=oficial`, que força o recarregamento. Os textos simples dos nós dos grafos ficam em `scripts/dados/explicacao_grafos.json`:

```bash
node scripts/montar_estudo_vvtestlab.mjs
python scripts/gerar_catalogo_testes.py
```

## Onde os dados ficam

Os dados ficam somente no navegador, sob a chave `vvtestlab-project-v1`. Dados existentes da versão anterior são migrados automaticamente. Para levar o projeto a outro computador, use **Dados e exportação → Backup JSON** e depois importe o arquivo na outra instalação.

## Relatório PDF

Abra **Dados e exportação → Gerar relatório PDF**. O documento contém capa, resumo executivo, caracterização do software, escopo das três funcionalidades, metodologia, classes de equivalência, fichas completas dos casos, execuções, evolução da cobertura, defeitos, matriz de rastreabilidade e conclusão. Todas as páginas internas usam A4 retrato, cabeçalho, rodapé e numeração automática.

Para gerar o exemplar demonstrativo pelo terminal:

```bash
npm run report:sample
```

O arquivo será criado em `output/pdf/relatorio-vv-exemplo.pdf`.

## Apresentação final

A pasta `output/presentation/` contém uma apresentação editável com os dois slides exigidos no enunciado:

1. processo de desenvolvimento dos testes;
2. resultados, dificuldades e lições aprendidas.

O arquivo usa os dados demonstrativos do V&V TestLab. Antes da entrega, substitua os números e as observações pelos resultados do software de terceiros escolhido.

## Integração com pytest, cobertura e mutação

1. Configure o caminho local em **Configurar → Caminho local do repositório**.
2. Nos testes Python, use `@pytest.mark.vv_case("CT-001")` para indicar o caso correspondente.
3. Inicie a ponte local usando o Python/ambiente virtual do repositório.
4. Abra **Integração Python → Executar e sincronizar**.

```bash
python -m pip install pytest pytest-cov
python integration/vv_bridge.py --repo "C:\caminho\repositorio" --cov-source . --pytest-args tests
```

Para a etapa baseada em defeitos, instale uma das ferramentas e use **Integração Python → Executar mutação**:

```bash
python -m pip install cosmic-ray
# ou, em Linux/WSL
python -m pip install mutmut
```

No Windows nativo, a seleção `auto` prioriza o Cosmic Ray porque o mutmut 3+ requer WSL. Para Cosmic Ray, mantenha um `cosmic-ray.toml` no repositório testado; o caminho pode ser alterado em **Configurar**.

A ponte escuta apenas em `127.0.0.1`, executa somente o repositório autorizado na inicialização e nunca usa `shell=True`. Consulte [docs/INTEGRACAO_PYTEST.md](docs/INTEGRACAO_PYTEST.md) para configuração, convenções e solução de problemas.

## Estrutura

```text
src/core.js        regras puras, métricas, gerador e exportação
src/app.js         interface, formulários, navegação e persistência
src/styles.css     sistema visual responsivo
tests/core.test.js testes do núcleo de domínio
docs/              descrição técnica e roteiro de uso acadêmico
```
