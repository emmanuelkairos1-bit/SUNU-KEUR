"""Logo SUNU KEUR — maison S+K+2 fenêtres, dessinée en vectoriel (reportlab / PIL).

Fond bleu nuit #0F172A, toit or #F59E0B, lettres S (or) et K (blanc) entrelacées,
2 fenêtres carrées or. Utilisé dans les PDF (draw_logo) et dans Word (logo_png_bytes).
"""
from __future__ import annotations

import io

from reportlab.lib.colors import HexColor

NUIT = HexColor("#0F172A")
OR = HexColor("#F59E0B")
BLANC = HexColor("#FFFFFF")
EMERAUDE = HexColor("#10B981")
GRIS_CLAIR = HexColor("#F1F5F9")
GRIS_TEXTE = HexColor("#475569")

SLOGAN = "Fini le cahier. Tes loyers en un coup d'oeil."
MARQUE = "SUNU KEUR"

# Représentation SVG du logo (même géométrie que draw_logo), pour le web ou l'export.
LOGO_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    '<rect width="64" height="64" rx="11" fill="#0F172A"/>'
    '<polygon points="4.5,41 32,59.5 59.5,41" fill="#F59E0B"/>'
    '<rect x="11" y="9" width="42" height="32" rx="1.5" fill="none" stroke="#FFFFFF" stroke-width="2.3"/>'
    '<rect x="15.5" y="13" width="9" height="9" fill="#F59E0B"/>'
    '<rect x="39.5" y="13" width="9" height="9" fill="#F59E0B"/>'
    '<text x="26" y="34" font-family="Helvetica,Arial,sans-serif" font-size="19" font-weight="bold"'
    ' text-anchor="middle" fill="#F59E0B" stroke="#0F172A" stroke-width="1.2">S</text>'
    '<text x="38" y="34" font-family="Helvetica,Arial,sans-serif" font-size="19" font-weight="bold"'
    ' text-anchor="middle" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.2">K</text>'
    "</svg>"
)


def draw_logo(canvas, x: float, y: float, size: float) -> None:
    """Dessine le logo vectoriel Sunu Keur sur un canvas reportlab.

    (x, y) = coin bas-gauche, size = côté du carré logo.
    """
    s = float(size)
    canvas.saveState()
    # Fond bleu nuit arrondi
    canvas.setFillColor(NUIT)
    canvas.setStrokeColor(NUIT)
    canvas.roundRect(x, y, s, s, s * 0.17, fill=1, stroke=0)
    # Toit en triangle or
    canvas.setFillColor(OR)
    p = canvas.beginPath()
    p.moveTo(x + 0.07 * s, y + 0.63 * s)
    p.lineTo(x + 0.5 * s, y + 0.94 * s)
    p.lineTo(x + 0.93 * s, y + 0.63 * s)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    # Murs : rectangle à contour blanc
    canvas.setStrokeColor(BLANC)
    canvas.setLineWidth(max(0.8, 0.035 * s))
    canvas.rect(x + 0.17 * s, y + 0.13 * s, 0.66 * s, 0.52 * s, fill=0, stroke=1)
    # 2 fenêtres carrées or
    canvas.setFillColor(OR)
    w = 0.135 * s
    canvas.rect(x + 0.235 * s, y + 0.185 * s, w, w, fill=1, stroke=0)
    canvas.rect(x + 0.63 * s, y + 0.185 * s, w, w, fill=1, stroke=0)
    # Lettres S (or) + K (blanc) entrelacées, contour nuit pour la séparation
    taille = 0.31 * s
    canvas.setLineWidth(max(0.6, 0.018 * s))
    canvas.setFont("Helvetica-Bold", taille)
    canvas.setFillColor(OR)
    canvas.setStrokeColor(NUIT)
    canvas.drawCentredString(x + 0.435 * s, y + 0.395 * s, "S")
    canvas.setFillColor(BLANC)
    canvas.drawCentredString(x + 0.585 * s, y + 0.395 * s, "K")
    canvas.restoreState()


def logo_png_bytes(size: int = 200) -> bytes:
    """Rendu PNG du même logo (via Pillow) pour l'en-tête Word."""
    from PIL import Image, ImageDraw, ImageFont

    n = int(size)
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    px = lambda v: v * n  # noqa: E731 — conversion proportion -> pixels

    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=px(0.17), fill=(15, 23, 42, 255))
    d.polygon(
        [(px(0.07), px(0.63)), (px(0.5), px(0.94)), (px(0.93), px(0.63))],
        fill=(245, 158, 11, 255),
    )
    lw = max(1, int(px(0.035)))
    d.rectangle(
        [px(0.17), px(0.13), px(0.83), px(0.65)], outline=(255, 255, 255, 255), width=lw
    )
    w = px(0.135)
    d.rectangle([px(0.235), px(0.185), px(0.235) + w, px(0.185) + w], fill=(245, 158, 11, 255))
    d.rectangle([px(0.63), px(0.185), px(0.63) + w, px(0.185) + w], fill=(245, 158, 11, 255))

    police = None
    for chemin in ("C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            police = ImageFont.truetype(chemin, int(px(0.31)))
            break
        except Exception:
            continue
    if police is None:
        try:
            police = ImageFont.load_default(size=int(px(0.31)))
        except TypeError:  # Pillow < 10.1
            police = ImageFont.load_default()

    ombre = (15, 23, 42, 255)
    d.text(
        (px(0.435), px(0.50)), "S", font=police, anchor="mm",
        fill=(245, 158, 11, 255), stroke_width=max(1, int(px(0.018))), stroke_fill=ombre,
    )
    d.text(
        (px(0.585), px(0.50)), "K", font=police, anchor="mm",
        fill=(255, 255, 255, 255), stroke_width=max(1, int(px(0.018))), stroke_fill=ombre,
    )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
