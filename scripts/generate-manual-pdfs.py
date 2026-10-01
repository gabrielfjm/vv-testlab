"""Gera os manuais em PDF do V&V TestLab.

Os documentos usam apenas os arquivos Markdown mantidos no projeto e o
ReportLab. A saida e criada em output/pdf e pode ser regenerada a qualquer
momento executando este arquivo.
"""

from __future__ import annotations

import html
import re
import textwrap
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"

NAVY = colors.HexColor("#10243E")
NAVY_SOFT = colors.HexColor("#1B3859")
TEAL = colors.HexColor("#16A6A1")
CYAN = colors.HexColor("#58D5D0")
AMBER = colors.HexColor("#F3B63F")
INK = colors.HexColor("#18212F")
MUTED = colors.HexColor("#5D6B7D")
LINE = colors.HexColor("#D9E1EA")
PAPER = colors.HexColor("#F5F8FB")
PALE_TEAL = colors.HexColor("#E9F8F7")
PALE_AMBER = colors.HexColor("#FFF5DB")
WHITE = colors.white


def register_fonts() -> None:
    font_dir = Path("C:/Windows/Fonts")
    regular = font_dir / "arial.ttf"
    bold = font_dir / "arialbd.ttf"
    italic = font_dir / "ariali.ttf"
    if regular.exists() and bold.exists() and italic.exists():
        pdfmetrics.registerFont(TTFont("VVText", str(regular)))
        pdfmetrics.registerFont(TTFont("VVText-Bold", str(bold)))
        pdfmetrics.registerFont(TTFont("VVText-Italic", str(italic)))
        pdfmetrics.registerFontFamily(
            "VVText",
            normal="VVText",
            bold="VVText-Bold",
            italic="VVText-Italic",
            boldItalic="VVText-Bold",
        )
    else:
        # Helvetica cobre os caracteres latinos usados no manual.
        pdfmetrics.registerFontFamily(
            "Helvetica",
            normal="Helvetica",
            bold="Helvetica-Bold",
            italic="Helvetica-Oblique",
            boldItalic="Helvetica-BoldOblique",
        )


register_fonts()
BODY_FONT = "VVText" if "VVText" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
BODY_BOLD = "VVText-Bold" if BODY_FONT == "VVText" else "Helvetica-Bold"


def clean_text(value: str) -> str:
    """Normaliza apenas caracteres que costumam falhar em leitores antigos."""
    return (
        value.replace("\u2010", "-")
        .replace("\u2011", "-")
        .replace("\u2012", "-")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u2212", "-")
        .replace("\u00a0", " ")
        .replace("“", '"')
        .replace("”", '"')
        .replace("‘", "'")
        .replace("’", "'")
    )


def inline_markup(value: str) -> str:
    value = clean_text(value.strip())
    escaped = html.escape(value, quote=False)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"<u>\1</u>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier" color="#0F6E6A">\1</font>', escaped)
    return escaped


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=9.4,
            leading=14,
            textColor=INK,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.7,
            leading=10.5,
            textColor=MUTED,
        ),
        "h2": ParagraphStyle(
            "ManualH2",
            parent=base["Heading2"],
            fontName=BODY_BOLD,
            fontSize=17,
            leading=21,
            textColor=NAVY,
            spaceBefore=12,
            spaceAfter=8,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "ManualH3",
            parent=base["Heading3"],
            fontName=BODY_BOLD,
            fontSize=11.5,
            leading=15,
            textColor=TEAL,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName=BODY_BOLD,
            fontSize=30,
            leading=34,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=12,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=12,
            leading=18,
            textColor=colors.HexColor("#D8E5F2"),
        ),
        "cover_badge": ParagraphStyle(
            "CoverBadge",
            parent=base["BodyText"],
            fontName=BODY_BOLD,
            fontSize=8,
            leading=10,
            textColor=NAVY,
            alignment=TA_CENTER,
        ),
        "toc_title": ParagraphStyle(
            "TocTitle",
            parent=base["Title"],
            fontName=BODY_BOLD,
            fontSize=22,
            leading=26,
            textColor=NAVY,
            spaceAfter=12,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.4,
            leading=10.2,
            textColor=WHITE,
            leftIndent=0,
            rightIndent=0,
        ),
        "table": ParagraphStyle(
            "TableText",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=7.3,
            leading=10,
            textColor=INK,
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["BodyText"],
            fontName=BODY_BOLD,
            fontSize=7.3,
            leading=9.5,
            textColor=WHITE,
        ),
        "quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName=BODY_FONT,
            fontSize=8.8,
            leading=13,
            textColor=NAVY,
        ),
        "step_no": ParagraphStyle(
            "StepNo",
            parent=base["BodyText"],
            fontName=BODY_BOLD,
            fontSize=16,
            leading=18,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
    }
    return styles


STYLES = build_styles()


class ManualDocTemplate(BaseDocTemplate):
    def __init__(self, filename: Path, short_title: str):
        self.short_title = short_title
        self._bookmark_seq = 0
        frame = Frame(
            20 * mm,
            18 * mm,
            A4[0] - 40 * mm,
            A4[1] - 39 * mm,
            id="content",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        super().__init__(
            str(filename),
            pagesize=A4,
            leftMargin=20 * mm,
            rightMargin=20 * mm,
            topMargin=21 * mm,
            bottomMargin=18 * mm,
            title=short_title,
            author="V&V TestLab",
            subject="Manual da plataforma de gestão de testes",
        )
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=[frame], onPage=self.draw_cover),
                PageTemplate(id="body", frames=[frame], onPage=self.draw_body),
            ]
        )

    def draw_cover(self, canvas, _doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, width, height, stroke=0, fill=1)
        canvas.setFillColor(NAVY_SOFT)
        canvas.circle(width + 20 * mm, height - 20 * mm, 66 * mm, stroke=0, fill=1)
        canvas.setFillColor(TEAL)
        canvas.circle(width - 13 * mm, height - 2 * mm, 25 * mm, stroke=0, fill=1)
        canvas.setFillColor(AMBER)
        canvas.rect(0, 0, 7 * mm, height, stroke=0, fill=1)
        canvas.setFillColor(CYAN)
        canvas.rect(7 * mm, 0, 2 * mm, height, stroke=0, fill=1)
        canvas.setFillColor(colors.HexColor("#7891AB"))
        canvas.setFont(BODY_FONT, 7.5)
        canvas.drawRightString(width - 20 * mm, 14 * mm, "V&V TestLab  |  Setembro de 2026")
        canvas.restoreState()

    def draw_body(self, canvas, doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, height - 10 * mm, width, 10 * mm, stroke=0, fill=1)
        canvas.setFillColor(TEAL)
        canvas.rect(0, height - 10 * mm, 34 * mm, 1.4 * mm, stroke=0, fill=1)
        canvas.setFont(BODY_BOLD, 7.2)
        canvas.setFillColor(WHITE)
        canvas.drawString(20 * mm, height - 6.4 * mm, "V&V TESTLAB")
        canvas.setFont(BODY_FONT, 7.2)
        canvas.setFillColor(colors.HexColor("#D8E5F2"))
        canvas.drawRightString(width - 20 * mm, height - 6.4 * mm, clean_text(self.short_title))

        canvas.setStrokeColor(LINE)
        canvas.line(20 * mm, 13 * mm, width - 20 * mm, 13 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont(BODY_FONT, 7)
        canvas.drawString(20 * mm, 8.8 * mm, "Gestão rastreável de verificação e validação")
        canvas.drawRightString(width - 20 * mm, 8.8 * mm, f"Pagina {doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in {"ManualH2", "ManualH3"}:
            level = 0 if flowable.style.name == "ManualH2" else 1
            text = clean_text(flowable.getPlainText())
            key = getattr(flowable, "_vv_bookmark", None)
            if key is None:
                key = f"section-{self._bookmark_seq}"
                self._bookmark_seq += 1
                flowable._vv_bookmark = key
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(inline_markup(text), STYLES[style])


def cover_story(title: str, subtitle: str, badge: str, highlights: list[str]):
    title_markup = "<br/>".join(inline_markup(part) for part in title.splitlines())
    highlight_cells = []
    for index, item in enumerate(highlights, start=1):
        highlight_cells.append(
            [
                Paragraph(str(index), STYLES["step_no"]),
                Paragraph(f"<b>{inline_markup(item)}</b>", ParagraphStyle(
                    f"CoverItem{index}", parent=STYLES["body"], fontName=BODY_FONT,
                    fontSize=9.2, leading=13, textColor=WHITE, spaceAfter=0
                )),
            ]
        )
    table = Table(highlight_cells, colWidths=[11 * mm, 121 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), TEAL),
                ("BACKGROUND", (1, 0), (1, -1), NAVY_SOFT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#355473")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#355473")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (1, 0), (1, -1), 10),
                ("RIGHTPADDING", (1, 0), (1, -1), 10),
            ]
        )
    )
    badge_table = Table([[Paragraph(inline_markup(badge.upper()), STYLES["cover_badge"])]], colWidths=[50 * mm])
    badge_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), AMBER),
                ("BOX", (0, 0), (-1, -1), 0, AMBER),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return [
        Spacer(1, 35 * mm),
        badge_table,
        Spacer(1, 13 * mm),
        Paragraph(title_markup, STYLES["cover_title"]),
        Paragraph(inline_markup(subtitle), STYLES["cover_subtitle"]),
        Spacer(1, 22 * mm),
        table,
        NextPageTemplate("body"),
        PageBreak(),
    ]


def make_toc(introduction: str):
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(
            "TOCLevel0",
            fontName=BODY_BOLD,
            fontSize=9,
            leading=15,
            textColor=NAVY,
            leftIndent=0,
            firstLineIndent=0,
            spaceBefore=3,
        ),
        ParagraphStyle(
            "TOCLevel1",
            fontName=BODY_FONT,
            fontSize=8,
            leading=12,
            textColor=MUTED,
            leftIndent=12,
            firstLineIndent=0,
        ),
    ]
    intro = Table(
        [[Paragraph(inline_markup(introduction), STYLES["quote"])]],
        colWidths=[A4[0] - 40 * mm],
    )
    intro.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL),
                ("BOX", (0, 0), (-1, -1), 0.8, TEAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return [
        Paragraph("Sumario", STYLES["toc_title"]),
        intro,
        Spacer(1, 8 * mm),
        toc,
        PageBreak(),
    ]


def table_widths(rows: list[list[str]], total_width: float) -> list[float]:
    columns = len(rows[0])
    scores = []
    for column in range(columns):
        longest = max(len(clean_text(row[column])) for row in rows)
        scores.append(min(max(longest, 10), 42))
    score_total = sum(scores)
    widths = [total_width * score / score_total for score in scores]
    minimum = 24 * mm if columns <= 4 else 18 * mm
    widths = [max(width, minimum) for width in widths]
    scale = total_width / sum(widths)
    return [width * scale for width in widths]


def markdown_table(rows: list[list[str]]):
    total_width = A4[0] - 40 * mm
    data = []
    for row_index, row in enumerate(rows):
        style = STYLES["table_head"] if row_index == 0 else STYLES["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])
    table = Table(data, colWidths=table_widths(rows, total_width), repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, PAPER]),
                ("GRID", (0, 0), (-1, -1), 0.45, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def code_block(lines: list[str]):
    wrapped = []
    for line in lines:
        chunks = textwrap.wrap(
            clean_text(line),
            width=84,
            subsequent_indent="    ",
            replace_whitespace=False,
            drop_whitespace=False,
        ) or [""]
        wrapped.extend(chunks)
    code = "<br/>".join(html.escape(line).replace(" ", "&nbsp;") for line in wrapped)
    content = Paragraph(code, STYLES["code"])
    block = Table([[content]], colWidths=[A4[0] - 40 * mm])
    block.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), NAVY),
                ("BOX", (0, 0), (-1, -1), 0.6, NAVY_SOFT),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return block


def parse_markdown(markdown: str):
    lines = clean_text(markdown).splitlines()
    flowables = []
    index = 0
    first_h1_skipped = False

    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("# ") and not first_h1_skipped:
            first_h1_skipped = True
            index += 1
            continue

        if stripped.startswith("## "):
            flowables.append(Paragraph(inline_markup(stripped[3:]), STYLES["h2"]))
            index += 1
            continue

        if stripped.startswith("### "):
            flowables.append(Paragraph(inline_markup(stripped[4:]), STYLES["h3"]))
            index += 1
            continue

        if stripped.startswith("```"):
            code_lines = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(lines[index])
                index += 1
            index += 1
            flowables.extend([code_block(code_lines), Spacer(1, 3 * mm)])
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            table_lines = []
            while index < len(lines):
                candidate = lines[index].strip()
                if not (candidate.startswith("|") and candidate.endswith("|")):
                    break
                table_lines.append(candidate)
                index += 1
            rows = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
            if len(rows) > 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in rows[1]):
                rows.pop(1)
            flowables.extend([markdown_table(rows), Spacer(1, 3 * mm)])
            continue

        if stripped.startswith(">"):
            quote_lines = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quote_lines.append(lines[index].strip().lstrip(">").strip())
                index += 1
            quote_table = Table(
                [[Paragraph(inline_markup(" ".join(quote_lines)), STYLES["quote"])]],
                colWidths=[A4[0] - 40 * mm],
            )
            quote_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), PALE_AMBER),
                        ("LINEBEFORE", (0, 0), (0, -1), 4, AMBER),
                        ("LEFTPADDING", (0, 0), (-1, -1), 11),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            flowables.extend([quote_table, Spacer(1, 2 * mm)])
            continue

        if re.match(r"^-\s+", stripped):
            items = []
            while index < len(lines) and re.match(r"^-\s+", lines[index].strip()):
                item = re.sub(r"^-\s+", "", lines[index].strip())
                checked = item.startswith("[x] ") or item.startswith("[X] ")
                pending = item.startswith("[ ] ")
                if checked or pending:
                    item = ("OK - " if checked else "Pendente - ") + item[4:]
                items.append(ListItem(p(item), leftIndent=11, bulletColor=TEAL))
                index += 1
            flowables.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    bulletFontName=BODY_BOLD,
                    bulletFontSize=8,
                    bulletColor=TEAL,
                    leftIndent=15,
                    bulletOffsetY=2,
                    spaceAfter=5,
                )
            )
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while index < len(lines) and re.match(r"^\d+\.\s+", lines[index].strip()):
                item = re.sub(r"^\d+\.\s+", "", lines[index].strip())
                items.append(ListItem(p(item), leftIndent=13))
                index += 1
            flowables.append(
                ListFlowable(
                    items,
                    bulletType="1",
                    start="1",
                    bulletFontName=BODY_BOLD,
                    bulletFontSize=8,
                    bulletColor=TEAL,
                    leftIndent=18,
                    spaceAfter=5,
                )
            )
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate:
                break
            if (
                candidate.startswith("#")
                or candidate.startswith("```")
                or candidate.startswith("|")
                or candidate.startswith(">")
                or re.match(r"^-\s+", candidate)
                or re.match(r"^\d+\.\s+", candidate)
            ):
                break
            paragraph_lines.append(candidate)
            index += 1
        flowables.append(p(" ".join(paragraph_lines)))

    return flowables


QUICK_START = r"""
# Guia rapido do V&V TestLab

## 1. O que voce vai construir

O V&V TestLab organiza o trabalho da disciplina em uma cadeia unica e verificavel:

```text
Funcionalidade -> Classe de equivalencia -> Caso de teste -> Execucao -> Defeito
```

O escopo aceita exatamente as **tres funcionalidades ou metodos mais importantes** do software analisado. A plataforma ajuda a demonstrar que cada requisito foi testado, executado e, quando necessario, associado a um defeito.

## 2. Iniciar em cinco minutos

No terminal aberto na pasta do V&V TestLab:

```powershell
npm install
npm run dev
```

Abra `http://127.0.0.1:5173`. Use sempre esse endereco, pois `localhost` e `127.0.0.1` podem manter dados locais diferentes.

Em seguida:

1. Clique em **Configurar**.
2. Informe o software, o repositorio e a meta de cobertura.
3. Abra **Requisitos** e cadastre as tres funcionalidades.
4. Abra **Cenarios e casos** e crie classes validas e invalidas.
5. Crie ou gere casos, execute-os e confira **Rastreabilidade**.

## 3. Mapa das telas

| Tela | O que fazer nela |
|---|---|
| Visao geral | Conferir indicadores, etapa atual e pendencias. |
| Requisitos | Manter as tres funcionalidades principais. |
| Cenarios e casos | Criar classes validas/invalida, limites e casos. |
| Rastreabilidade | Identificar elos ausentes entre os registros. |
| Execucao e metricas | Registrar resultados, cobertura e mutacao. |
| Integracao Python | Executar pytest e importar resultados. |
| Defeitos | Documentar falhas, evidencias e correcoes. |
| Dados e exportacao | Gerar PDF, CSV, Markdown e backup JSON. |

## 4. Exemplo completo

Considere a funcionalidade **Cadastrar usuario** e a regra `18 <= idade <= 120`.

| Registro | Exemplo |
|---|---|
| Requisito | REQ-001 - Cadastrar usuario |
| Classe valida | CE-001 - Idade entre 18 e 120 |
| Classe invalida | CE-002 - Idade fora do intervalo |
| Caso valido | CT-001 - Aceitar idade 18 |
| Caso invalido | CT-002 - Rejeitar idade 17 |
| Execucao | EXE-001 - CT-001 aprovado |
| Defeito | DEF-001 - Sistema aceitou idade 17 |

Na tela **Cenarios e casos**, use **Gerar por limites** com minimo 18 e maximo 120. A plataforma criara os pontos `17, 18, 19, 119, 120 e 121` e classificara os valores externos como invalidos.

## 5. Criar um bom caso de teste

Cada caso precisa responder cinco perguntas:

1. Qual funcionalidade esta sendo validada?
2. A qual classe valida ou invalida ele pertence?
3. Qual entrada sera fornecida?
4. Quais passos precisam ser executados?
5. Qual resultado deve ser observado?

Exemplo:

| Campo | Preenchimento sugerido |
|---|---|
| Titulo | Rejeitar cadastro com idade 17 |
| Condicao de entrada | Usuario novo com idade abaixo do minimo |
| Dados | `{ "nome": "Ana", "idade": 17 }` |
| Passos | Preencher dados; confirmar cadastro |
| Esperado | Cadastro rejeitado e mensagem de idade invalida |
| Validade | Invalido |
| Tecnica | AVL |

## 6. Executar e rastrear

Para uma execucao manual, abra **Execucao e metricas**, clique em **Nova execucao**, selecione o caso e registre Aprovado, Falhou ou Bloqueado.

Depois abra **Rastreabilidade**. Uma cadeia completa deve ter requisito, classe, caso e execucao. Falhas relevantes tambem devem possuir um defeito. Use o filtro **Com lacunas** para localizar rapidamente o que falta.

## 7. Automatizar com pytest

Associe o ID do caso ao teste Python:

```python
import pytest

@pytest.mark.vv_case("CT-001")
def test_idade_minima():
    assert cadastrar_usuario(nome="Ana", idade=18).sucesso
```

Instale `pytest` e `pytest-cov`, inicie a ponte local e use **Executar e sincronizar**. O sistema importa execucoes, cobertura, testes sem vinculo e defeitos gerados por falhas.

> A execucao automatica precisa ser iniciada pela tela Integracao Python. Testes executados separadamente pela IDE nao sao capturados nesta versao.

## 8. Preparar a entrega

Antes de gerar o PDF final do trabalho:

- Confirme as tres funcionalidades.
- Confira classes validas e invalidas.
- Execute todos os casos planejados.
- Registre cobertura e mutacao.
- Documente defeitos e correcoes.
- Abra a matriz e resolva lacunas nao justificadas.
- Gere um **Backup JSON**.
- Clique em **Gerar relatorio PDF**.

## 9. Se algo nao funcionar

| Problema | Acao recomendada |
|---|---|
| Botao nao responde | Atualize com Ctrl+F5 e reinicie `npm run dev`. |
| Dados sumiram | Confira se abriu exatamente a mesma URL. |
| Quarta funcionalidade bloqueada | O limite academico e tres; edite ou substitua uma. |
| Classe nao aparece | Selecione primeiro o requisito correto. |
| Ponte desconectada | Confira terminal, URL, porta e ambiente Python. |
| Teste nao vinculado | Use um ID existente como `CT-001`. |
| PDF incompleto | Complete os registros e gere novamente. |
"""


def add_quick_start_accents(value: str) -> str:
    """Mantém os exemplos de código intactos e corrige a prosa do guia rápido."""
    replacements = {
        "rapido": "rápido",
        "voce": "você",
        "unica": "única",
        "verificavel": "verificável",
        "Funcionalidade": "Funcionalidade",
        "equivalencia": "equivalência",
        "Execucao": "Execução",
        "Defeito": "Defeito",
        "tres": "três",
        "metodos": "métodos",
        "validacao": "validação",
        "execucao": "execução",
        "execucoes": "execuções",
        "repositorio": "repositório",
        "endereco": "endereço",
        "Cenarios": "Cenários",
        "cenarios": "cenários",
        "validas": "válidas",
        "invalidas": "inválidas",
        "invalida": "inválida",
        "valido": "válido",
        "automaticamente": "automaticamente",
        "metricas": "métricas",
        "Integracao": "Integração",
        "integracao": "integração",
        "automatica": "automática",
        "mutacao": "mutação",
        "exportacao": "exportação",
        "relatorio": "relatório",
        "informacoes": "informações",
        "funcionalidade": "funcionalidade",
        "regra": "regra",
        "minimo": "mínimo",
        "maximo": "máximo",
        "criara": "criará",
        "classificara": "classificará",
        "sera": "será",
        "tecnica": "técnica",
        "Tecnica": "Técnica",
        "Acao": "Ação",
        "acao": "ação",
        "nao": "não",
        "codigo": "código",
        "vinculo": "vínculo",
        "tambem": "também",
        "academico": "acadêmico",
        "configuracao": "configuração",
        "pagina": "página",
        "duvidas": "dúvidas",
        "final": "final",
    }
    for original, accented in replacements.items():
        value = re.sub(rf"\b{re.escape(original)}\b", accented, value)
    return value


QUICK_START = add_quick_start_accents(QUICK_START)


MANUALS = [
    {
        "output": "guia-rapido-vv-testlab.pdf",
        "source": QUICK_START,
        "title": "Guia rápido\ndo V&V TestLab",
        "subtitle": "Do primeiro cadastro ao relatório rastreável, com um exemplo completo e orientações para evitar as dúvidas mais comuns.",
        "badge": "Comece por aqui",
        "short_title": "Guia rápido",
        "intro": "Leia este guia primeiro. Ele apresenta o fluxo essencial da plataforma e um exemplo que você pode adaptar ao seu projeto.",
        "highlights": [
            "Entenda o fluxo completo da plataforma",
            "Cadastre as três funcionalidades principais",
            "Crie, execute e rastreie os casos",
            "Prepare a entrega e o relatório final",
        ],
    },
    {
        "output": "manual-do-usuario-vv-testlab.pdf",
        "source_path": ROOT / "docs" / "MANUAL_DO_USUARIO.md",
        "title": "Manual completo\ndo usuário",
        "subtitle": "Referência operacional do V&V TestLab para planejar, executar e documentar testes de software com rastreabilidade completa.",
        "badge": "Manual de referência",
        "short_title": "Manual do usuário",
        "intro": "Use o sumário para ir diretamente a uma tarefa. O manual segue a ordem recomendada para o trabalho da disciplina.",
        "highlights": [
            "CRUD, filtros e persistência dos dados",
            "Classes, limites e casos válidos ou inválidos",
            "Execuções, métricas, defeitos e rastreabilidade",
            "Backup, restauração e relatório PDF A4",
        ],
    },
    {
        "output": "guia-integracao-pytest-vv-testlab.pdf",
        "source_path": ROOT / "docs" / "INTEGRACAO_PYTEST.md",
        "title": "Guia de integração\ncom pytest",
        "subtitle": "Configuração segura da ponte local para executar testes Python e vincular automaticamente resultados, cobertura e defeitos.",
        "badge": "Automação Python",
        "short_title": "Integração com pytest",
        "intro": "Siga as etapas na ordem apresentada. Os exemplos consideram Windows e uma ponte local em 127.0.0.1:8765.",
        "highlights": [
            "Marque cada teste com o ID CT-xxx",
            "Execute pytest no ambiente correto",
            "Importe cobertura e resultados automaticamente",
            "Diagnostique testes sem vínculo e falhas",
        ],
    },
]


def generate_manual(config: dict) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / config["output"]
    source = config.get("source")
    if source is None:
        source = config["source_path"].read_text(encoding="utf-8")

    story = cover_story(
        config["title"],
        config["subtitle"],
        config["badge"],
        config["highlights"],
    )
    story.extend(make_toc(config["intro"]))
    story.extend(parse_markdown(source))

    doc = ManualDocTemplate(output, config["short_title"])
    doc.multiBuild(story)
    return output


def main() -> None:
    outputs = [generate_manual(config) for config in MANUALS]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
