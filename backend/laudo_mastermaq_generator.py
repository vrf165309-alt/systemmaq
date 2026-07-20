"""
Mastermaq Laudo Generator — separate template for non-Hisense/HQ brands.

Distinguishing features vs. the Hisense generator (`laudo_generator.py`):
  * No serial_number, batch, installation_correct
  * No voltage (F1F2, F1_Terra, F2_Terra)
  * No technical_notes, final_status
  * Only 1 photo slot: "Defeito/Erro Encontrado" (uses images[7] from the
    shared 8-photo grid the user fills in the LaudoModal — same slot as the
    Hisense "FOTO 8" so the user doesn't have to rearrange).

Replacement is done at the run level of python-docx so the template's
paragraph alignment, font family, font size, bold/italic and color are
preserved on every cell we touch — nothing is rebuilt from scratch.
"""
from pathlib import Path
import io
import logging
import zipfile

from docx import Document
from docx.oxml.ns import qn

from laudo_generator import (
    _decode_base64_image,
    _to_jpeg_bytes,
)

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path(__file__).parent / "templates" / "laudo_mastermaq_template.docx"

# LaudoModal fills 8 photo slots (images[0..7]). The Mastermaq template uses a
# single defect photo — sourced from the "FOTO 8 – Defeito/Erro Encontrado"
# slot so the user doesn't have to rearrange photos between templates.
DEFECT_PHOTO_INDEX = 7

# rId7 / rId8 / rId9 → image1/image2/image3.jpeg in the template body.
# The defect photo is written to all three body slots so the layout stays
# balanced (template ships with 3 side-by-side placeholders).
PHOTO_SLOTS = [
    "word/media/image1.jpeg",
    "word/media/image2.jpeg",
    "word/media/image3.jpeg",
]


def _set_cell_text_preserving_runs(cell, new_text: str) -> None:
    """
    Replace the visible text of a table cell while keeping every run's
    formatting intact.

    Strategy:
      * Pick the most representative run (longest non-whitespace text) as the
        "carrier" — its font/color/size/bold/italic properties are what the
        user actually sees for the field.
      * Write the new text into that carrier run.
      * Empty every other run's text (so their formatting still lives on the
        paragraph but they contribute nothing visible).
      * Drop extra paragraphs beyond the first inside the cell (Word often
        adds a trailing empty paragraph that inflates row height).

    Drawings (anchored images) that live inside runs are preserved by moving
    them out before we touch text and re-attaching them afterwards.
    """
    if not cell.paragraphs:
        return

    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    new_text = "" if new_text is None else str(new_text)

    first_p = cell.paragraphs[0]

    # Preserve any drawings living inside the runs of the first paragraph.
    saved_drawings = []
    for r_elem in first_p._element.findall(f"{{{W}}}r"):
        for drawing in list(r_elem.findall(f"{{{W}}}drawing")):
            saved_drawings.append(drawing)
            r_elem.remove(drawing)

    runs = first_p.runs
    if not runs:
        # No runs to work with — fall back to a plain text assignment which
        # will create a single default-styled run.
        first_p.text = new_text
    else:
        # Pick the run with the longest stripped text as the carrier — it's
        # the visible one the user cares about. Whitespace-only leading runs
        # (very common in Word templates) are ignored.
        carrier = max(runs, key=lambda r: len(r.text.strip()))
        if not carrier.text.strip():
            # Every run is whitespace-only — just use the first run.
            carrier = runs[0]

        for r in runs:
            r.text = "" if r is not carrier else new_text

    # Clear text of every subsequent paragraph inside the cell — the cell
    # keeps its structure but only the first paragraph shows the new value.
    for extra_p in cell.paragraphs[1:]:
        for r in extra_p.runs:
            r.text = ""

    # Re-attach any drawings we pulled off.
    for drawing in saved_drawings:
        new_r = first_p._element.makeelement(f"{{{W}}}r", {})
        new_r.append(drawing)
        first_p._element.append(new_r)


def _up(v) -> str:
    return str(v).upper() if v else ""


def generate_mastermaq_laudo(data: dict) -> bytes:
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Mastermaq template not found at {TEMPLATE_PATH}")

    doc = Document(str(TEMPLATE_PATH))

    # === TABLE 0: Header ================================================
    # Row layout of the template:
    #   [NÚMERO DA OS] [<os_number>] [ASSISTÊNCIA TÉC.] [ASSISTÊNCIA TÉC.] [MASTERMAQ ...]
    #   [NOME DO CLIENTE] [<customer_name>] [...] [...] [...]
    #   [PRODUTO] [<product>] [MARCA] [<brand>] [<brand>]
    table0 = doc.tables[0]
    _set_cell_text_preserving_runs(table0.rows[0].cells[1], _up(data.get("os_number", "")))
    _set_cell_text_preserving_runs(table0.rows[1].cells[1], _up(data.get("customer_name", "")))

    product_val = data.get("product") or data.get("model") or ""
    _set_cell_text_preserving_runs(table0.rows[2].cells[1], _up(product_val))

    brand_val = _up(data.get("brand", ""))
    # Fill both brand cells (col 3 and 4) so the layout stays symmetric.
    _set_cell_text_preserving_runs(table0.rows[2].cells[3], brand_val)
    _set_cell_text_preserving_runs(table0.rows[2].cells[4], brand_val)

    # === TABLE 1: Defect + Diagnosis + Required parts ===================
    # ONLY these three fields — no serial_number, batch, installation_correct,
    # voltage or technical_notes (those are Hisense-only concepts).
    table1 = doc.tables[1]
    _set_cell_text_preserving_runs(table1.rows[0].cells[1], _up(data.get("reported_defect", "")))
    # technical_diagnosis keeps original case (long-form text).
    _set_cell_text_preserving_runs(table1.rows[1].cells[1], data.get("technical_diagnosis", ""))
    _set_cell_text_preserving_runs(table1.rows[2].cells[1], _up(data.get("required_parts", "")))

    # === Defect photo (single slot from LaudoModal index 7) =============
    images_raw = data.get("images") or []
    defect_img = images_raw[DEFECT_PHOTO_INDEX] if DEFECT_PHOTO_INDEX < len(images_raw) else ""

    photo_replacements: dict = {}
    decoded = _decode_base64_image(defect_img)
    if decoded:
        processed = _to_jpeg_bytes(decoded)
        for fname in PHOTO_SLOTS:
            photo_replacements[fname] = processed
        logger.info(
            "MASTERMAQ LAUDO: defect photo (index %d) applied to %d body slot(s)",
            DEFECT_PHOTO_INDEX, len(PHOTO_SLOTS),
        )
    else:
        logger.info("MASTERMAQ LAUDO: no defect photo provided; template placeholders kept")

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    if not photo_replacements:
        return buf.getvalue()

    # Rewrite the DOCX zip to swap the image bytes at binary level.
    src = zipfile.ZipFile(buf, "r")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in src.namelist():
            data_bytes = src.read(item)
            if item in photo_replacements:
                data_bytes = photo_replacements[item]
            zout.writestr(item, data_bytes)
    src.close()
    out.seek(0)
    return out.getvalue()
