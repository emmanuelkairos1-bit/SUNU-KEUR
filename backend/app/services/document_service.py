"""Génération de documents réels : PDF (reportlab), Word (python-docx), Excel (openpyxl).

Branding SUNU KEUR : nuit #0F172A, or #F59E0B, emeraude #10B981.
Toutes les fonctions renvoient des `bytes` prêts à être écrits sur disque.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Any

import qrcode
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Drawing, Line, Rect, String

from app.logo import BLANC, EMERAUDE, GRIS_CLAIR, GRIS_TEXTE, MARQUE, NUIT, OR, SLOGAN, draw_logo

LARGEUR, HAUTEUR = A4

C_NUIT = NUIT
C_OR = OR
C_EMERAUDE = EMERAUDE
C_BLOC = colors.HexColor("#E2E8F0")

# --------------------------------------------------------------------------- #
#  Utilitaires bas niveau
# --------------------------------------------------------------------------- #


def _num(valeur: Any) -> float:
    """Convertit une valeur (float/str/Decimal/None) en float."""
    try:
        return float(valeur or 0)
    except (TypeError, ValueError):
        return 0.0


def fcfa(montant: Any) -> str:
    """Format montant : « 1 250 000 FCFA »."""
    n = _num(montant)
    entier = int(round(n))
    return f"{entier:,}".replace(",", " ") + " FCFA"


def _date_fr(valeur: Any, defaut: date | None = None) -> str:
    """« 2026-10-15 » -> « 15 octobre 2026 »."""
    if not valeur:
        d = defaut or date.today()
    else:
        try:
            d = datetime.fromisoformat(str(valeur)[:10]).date()
        except ValueError:
            return str(valeur)
    mois = [
        "janvier", "février", "mars", "avril", "mai", "juin",
        "juillet", "août", "septembre", "octobre", "novembre", "décembre",
    ]
    return f"{d.day} {mois[d.month - 1]} {d.year}"


MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _mois_fr(valeur: Any) -> str:
    """« 2026-10-01 » -> « octobre 2026 »."""
    try:
        d = datetime.fromisoformat(str(valeur)[:10]).date()
        return f"{MOIS_FR[d.month - 1]} {d.year}"
    except ValueError:
        return str(valeur)


_UNITES = [
    "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept",
    "dix-huit", "dix-neuf",
]


def _petit_nombre(n: int) -> str:
    if n < 20:
        return _UNITES[n]
    diz, uni = divmod(n, 10)
    if diz in (7, 9):
        base = "soixante" if diz == 7 else "quatre-vingt"
        return f"{base}-{_UNITES[10 + uni]}"
    tete = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "", "quatre-vingt", ""][diz]
    if uni == 1:
        return f"{tete} et un"
    if uni:
        return f"{tete}-{_UNITES[uni]}"
    return tete + "s" if diz == 8 else tete


def _centaines(n: int) -> str:
    c, reste = divmod(n, 100)
    if c:
        tete = "cent" if c == 1 else f"{_UNITES[c]} cent"
        if c == 8 and reste == 0:
            tete += "s"
        return f"{tete} {_centaines(reste)}" if reste else tete
    return _petit_nombre(reste)


def montant_en_lettres(montant: Any) -> str:
    """1 250 000 -> « un million deux cent cinquante mille »."""
    n = int(round(_num(montant)))
    if n == 0:
        return "zéro"
    parts: list[str] = []
    millions, reste = divmod(n, 1_000_000)
    milliers, unites = divmod(reste, 1_000)
    if millions:
        parts.append("un million" if millions == 1 else f"{_centaines(millions)} millions")
    if milliers:
        parts.append("mille" if milliers == 1 else f"{_centaines(milliers)} mille")
    if unites:
        parts.append(_centaines(unites))
    return " ".join(parts)


# --------------------------------------------------------------------------- #
#  Styles & gabarit (en-tête / pied de page)
# --------------------------------------------------------------------------- #


def _styles() -> dict[str, ParagraphStyle]:
    return {
        "titre": ParagraphStyle(
            "titre", fontName="Helvetica-Bold", fontSize=22, leading=26,
            textColor=C_NUIT, alignment=TA_CENTER, spaceAfter=2,
        ),
        "sous_titre": ParagraphStyle(
            "sous_titre", fontName="Helvetica", fontSize=10, leading=13,
            textColor=GRIS_TEXTE, alignment=TA_CENTER, spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "section", fontName="Helvetica-Bold", fontSize=12, leading=15,
            textColor=C_NUIT, spaceBefore=8, spaceAfter=6,
        ),
        "texte": ParagraphStyle(
            "texte", fontName="Helvetica", fontSize=9.5, leading=13, textColor=colors.HexColor("#1E293B"),
        ),
        "texte_gras": ParagraphStyle(
            "texte_gras", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=C_NUIT,
        ),
        "petit": ParagraphStyle(
            "petit", fontName="Helvetica", fontSize=8, leading=11, textColor=GRIS_TEXTE,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", fontName="Helvetica", fontSize=7.5, leading=9.5,
            textColor=colors.HexColor("#CBD5E1"), alignment=TA_CENTER,
        ),
        "kpi_valeur": ParagraphStyle(
            "kpi_valeur", fontName="Helvetica-Bold", fontSize=13, leading=16,
            textColor=BLANC, alignment=TA_CENTER,
        ),
    }


def _bandeau(c, doc, titre_doc: str) -> None:
    """En-tête commun : logo + marque + slogan + type de document."""
    h_bandeau = 56
    c.saveState()
    c.setFillColor(C_NUIT)
    c.rect(0, HAUTEUR - h_bandeau, LARGEUR, h_bandeau, fill=1, stroke=0)
    draw_logo(c, 34, HAUTEUR - h_bandeau + 11, 34)
    c.setFillColor(BLANC)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(78, HAUTEUR - 30, MARQUE)
    c.setFillColor(OR)
    c.setFont("Helvetica", 7.5)
    c.drawString(78, HAUTEUR - 41, SLOGAN)
    c.setFillColor(OR)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(LARGEUR - 34, HAUTEUR - 30, str(titre_doc).upper())
    c.setFillColor(colors.HexColor("#94A3B8"))
    c.setFont("Helvetica", 7.5)
    c.drawRightString(LARGEUR - 34, HAUTEUR - 41, f"Édité le {_date_fr(None)}")
    c.restoreState()


def _pied(c, doc) -> None:
    c.saveState()
    c.setStrokeColor(C_BLOC)
    c.setLineWidth(0.6)
    c.line(34, 40, LARGEUR - 34, 40)
    c.setFillColor(GRIS_TEXTE)
    c.setFont("Helvetica", 7.5)
    c.drawString(34, 30, f"{MARQUE} — {SLOGAN}")
    c.drawRightString(LARGEUR - 34, 30, f"Page {doc.page}")
    c.restoreState()


def _nouveau_doc_pdf(titre: str, meta: dict) -> tuple[SimpleDocTemplate, io.BytesIO]:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=34, rightMargin=34, topMargin=74, bottomMargin=52,
        title=titre, author=MARQUE, subject=SLOGAN,
    )
    doc.title_pdf = titre  # type: ignore[attr-defined]
    doc.meta_pdf = meta  # type: ignore[attr-defined]
    return doc, buf


def _callbacks(titre_doc: str):
    def _page(c, d):
        _bandeau(c, d, titre_doc)
        _pied(c, d)
    return _page


def _table_base(extra: list | None = None) -> TableStyle:
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), C_NUIT),
        ("TEXTCOLOR", (0, 0), (-1, 0), BLANC),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BLANC, GRIS_CLAIR]),
        ("GRID", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if extra:
        style.extend(extra)
    return TableStyle(style)


def _qr_flowable(url: str, taille: float = 78) -> Image:
    """QR code réel (lib qrcode) pointant vers une URL."""
    img = qrcode.make(url or "https://sunukeur.sn")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=taille, height=taille)


# --------------------------------------------------------------------------- #
#  Facture PDF
# --------------------------------------------------------------------------- #


def generer_facture_pdf(data: dict) -> bytes:
    """Facture pro : logo, numéro auto, émetteur/destinataire, lignes, total, QR."""
    st = _styles()
    numero = data.get("numero") or "SK-0000-000"
    emetteur = data.get("emetteur") or {}
    destinataire = data.get("destinataire") or {}
    lignes = data.get("lignes") or []

    doc, buf = _nouveau_doc_pdf(f"Facture {numero}", data)
    story: list = []

    # Bloc identification
    infos = [
        [
            Paragraph("<b>ÉMETTEUR</b>", st["petit"]),
            Paragraph("<b>FACTURE</b>", st["petit"]),
        ],
        [
            Paragraph(
                f"<b>{emetteur.get('nom', MARQUE)}</b><br/>"
                f"{emetteur.get('adresse', '')}<br/>{emetteur.get('ville', '')}<br/>"
                f"Tél. : {emetteur.get('telephone', '—')}<br/>Email : {emetteur.get('email', '—')}",
                st["texte"],
            ),
            Paragraph(
                f"N° <b>{numero}</b><br/>Date : <b>{_date_fr(data.get('date_emission'))}</b><br/>"
                f"Échéance : <b>{_date_fr(data.get('date_echeance'))}</b>",
                st["texte"],
            ),
        ],
        [Paragraph("<b>DESTINATAIRE</b>", st["petit"]), ""],
        [
            Paragraph(
                f"<b>{destinataire.get('nom', 'Client')}</b><br/>{destinataire.get('adresse', '')}<br/>"
                f"{destinataire.get('ville', '')}<br/>Tél. : {destinataire.get('telephone', '—')}",
                st["texte"],
            ),
            "",
        ],
    ]
    t_infos = Table(infos, colWidths=[LARGEUR - 68 - 200, 200])
    t_infos.setStyle(
        TableStyle([
            ("SPAN", (0, 2), (1, 2)),
            ("BACKGROUND", (1, 0), (1, 0), GRIS_CLAIR),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("BOX", (0, 0), (0, -1), 0.4, C_BLOC),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story += [t_infos, Spacer(1, 12)]

    # Tableau des lignes
    total_general = _num(data.get("total"))
    if not total_general:
        total_general = sum(_num(l.get("total", _num(l.get("quantite")) * _num(l.get("prix_unitaire")))) for l in lignes)

    donnees = [["Désignation", "Qté", "Prix unitaire", "Total"]]
    for l in lignes:
        q = _num(l.get("quantite", 1)) or 1
        pu = _num(l.get("prix_unitaire"))
        tot = _num(l.get("total")) or q * pu
        donnees.append([Paragraph(str(l.get("description", "")), st["texte"]), f"{q:g}", fcfa(pu), fcfa(tot)])
    donnees.append(["", "", Paragraph("<b>TOTAL À PAYER</b>", st["texte_gras"]), Paragraph(f"<b>{fcfa(total_general)}</b>", st["texte_gras"])])

    t_lignes = Table(donnees, colWidths=[LARGEUR - 68 - 80 - 100 - 100, 80, 100, 100], repeatRows=1)
    t_lignes.setStyle(
        _table_base([
            ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("ALIGN", (1, 0), (-1, 0), "RIGHT"),
            ("SPAN", (0, -1), (1, -1)),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEF3C7")),
            ("LINEABOVE", (0, -1), (-1, -1), 1.0, C_OR),
        ])
    )
    story += [t_lignes, Spacer(1, 10)]

    # Arrêtée à la somme + QR de paiement
    qr_url = data.get("qr_url") or data.get("url_paiement") or ""
    bloc_fin = [
        Paragraph(
            f"<b>Arrêtée la présente facture à la somme de :</b> {montant_en_lettres(total_general)} "
            f"({fcfa(total_general)}).<br/><br/>{data.get('note') or 'Règlement par Wave, Orange Money, Free Money ou espèces. Merci pour votre confiance.'}",
            st["texte"],
        )
    ]
    if qr_url:
        bloc_fin.append(
            Paragraph(
                f"Scannez ce QR code pour consulter ou régler la facture en ligne :<br/>"
                f'<font color="#F59E0B"><b>{qr_url}</b></font>',
                st["petit"],
            )
        )
    t_fin = Table(
        [[Paragraph("<b>PAIEMENT &amp; CONDITIONS</b>", st["petit"]), ""],
         [Paragraph("<br/>".join(str(x) for x in bloc_fin), st["texte"]),
          _qr_flowable(qr_url) if qr_url else Paragraph("—", st["petit"])]],
        colWidths=[LARGEUR - 68 - 100, 100],
    )
    t_fin.setStyle(
        TableStyle([
            ("SPAN", (0, 0), (1, 0)),
            ("BACKGROUND", (0, 0), (-1, 0), GRIS_CLAIR),
            ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 1), (1, 1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(t_fin)

    doc.build(story, onFirstPage=_callbacks("Facture"), onLaterPages=_callbacks("Facture"))
    return buf.getvalue()


# --------------------------------------------------------------------------- #
#  Devis PDF
# --------------------------------------------------------------------------- #


def generer_devis_pdf(data: dict) -> bytes:
    """Devis travaux : tableau lignes (description/Qté/PU/Total), total, mentions."""
    st = _styles()
    numero = data.get("numero") or "DV-0000-000"
    client = data.get("client") or {}
    lignes = data.get("lignes") or []

    doc, buf = _nouveau_doc_pdf(f"Devis {numero}", data)
    total = _num(data.get("total")) or sum(
        _num(l.get("quantite", 1) or 1) * _num(l.get("prix_unitaire")) for l in lignes
    )
    taux = _num(data.get("tva"))
    montant_tva = round(total * taux / 100, 2) if taux else 0.0

    story: list = [
        Paragraph("DEVIS", st["titre"]),
        Paragraph(f"{data.get('titre') or 'Prestation de travaux'} — n° {numero} du {_date_fr(data.get('date'))}", st["sous_titre"]),
    ]

    # Client / infos
    t_client = Table(
        [[Paragraph("<b>POUR LE COMPTE DE</b>", st["petit"]), Paragraph("<b>INFORMATIONS</b>", st["petit"])],
         [Paragraph(
             f"<b>{client.get('nom', 'Client')}</b><br/>{client.get('adresse', '')}<br/>"
             f"{client.get('ville', '')}<br/>Tél. : {client.get('telephone', '—')}", st["texte"]),
          Paragraph(
              f"Devis n° <b>{numero}</b><br/>Date : <b>{_date_fr(data.get('date'))}</b><br/>"
              f"Validité : <b>{data.get('validite', '30 jours')}</b>", st["texte"])]],
        colWidths=[(LARGEUR - 68) / 2, (LARGEUR - 68) / 2],
    )
    t_client.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GRIS_CLAIR),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [t_client, Spacer(1, 12), Paragraph("Détail des prestations", st["section"])]

    donnees = [["Désignation", "Qté", "Prix unitaire", "Total"]]
    for l in lignes:
        q = _num(l.get("quantite", 1)) or 1
        pu = _num(l.get("prix_unitaire"))
        donnees.append([
            Paragraph(str(l.get("description", "")), st["texte"]),
            f"{q:g}", fcfa(pu), fcfa(q * pu),
        ])
    style = _table_base([("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("ALIGN", (1, 0), (-1, 0), "RIGHT")])
    if montant_tva:
        donnees.append(["", "", Paragraph(f"<b>TVA {taux:g}%</b>", st["texte_gras"]), Paragraph(f"<b>{fcfa(montant_tva)}</b>", st["texte_gras"])])
    donnees.append(["", "", Paragraph("<b>TOTAL DU DEVIS</b>", st["texte_gras"]),
                    Paragraph(f"<b>{fcfa(total + montant_tva)}</b>", st["texte_gras"])])
    style.add("SPAN", (0, -1), (1, -1))
    style.add("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEF3C7"))
    style.add("LINEABOVE", (0, -1), (-1, -1), 1.0, C_OR)
    t_l = Table(donnees, colWidths=[LARGEUR - 68 - 70 - 110 - 110, 70, 110, 110], repeatRows=1)
    t_l.setStyle(style)
    story += [t_l, Spacer(1, 12)]

    # Mentions
    mentions = data.get("mentions") or [
        "Devis établi sous réserve de visite technique et de disponibilité des matériaux.",
        "Acompte de 50 % à la commande, solde à la réception des travaux.",
        "Délai indicatif de réalisation communiqué à la validation du devis.",
        "Garantie sur la main-d'œuvre : 3 mois après réception.",
    ]
    if data.get("duree"):
        mentions.insert(0, f"Délai de réalisation : {data['duree']}.")
    t_mentions = Table(
        [[Paragraph("<b>CONDITIONS &amp; MENTIONS</b>", st["petit"]), ""]] +
        [[Paragraph("• " + m, st["texte"]), ""] for m in mentions],
        colWidths=[LARGEUR - 68, 0],
    )
    t_mentions.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), GRIS_CLAIR),
        ("SPAN", (0, 1), (1, 1)),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [t_mentions, Spacer(1, 14)]
    story.append(Paragraph(
        f"Bon pour accord — Signature et cachet :<br/><br/><br/>"
        f"________________________<br/><b>{client.get('nom', 'Le client')}</b>", st["texte"],
    ))

    doc.build(story, onFirstPage=_callbacks("Devis"), onLaterPages=_callbacks("Devis"))
    return buf.getvalue()


# --------------------------------------------------------------------------- #
#  Quittance PDF
# --------------------------------------------------------------------------- #


def generer_quittance_pdf(data: dict) -> bytes:
    """Quittance de loyer : « Reçu de... », mois, montant, QR."""
    st = _styles()
    locataire = data.get("locataire") or {}
    appart = data.get("appartement") or {}
    immeuble = data.get("immeuble") or {}
    montant = _num(data.get("montant"))
    numero = data.get("numero") or "SK-Q-0000-000"

    doc, buf = _nouveau_doc_pdf(f"Quittance {numero}", data)
    story: list = [
        Paragraph("QUITTANCE DE LOYER", st["titre"]),
        Paragraph(f"N° {numero} — {_mois_fr(data.get('mois'))}", st["sous_titre"]),
    ]

    corps = (
        f"Je soussigné(e) <b>{immeuble.get('gerant', MARQUE)}</b>, "
        f"agissant en qualité de gérant de l'immeuble <b>{immeuble.get('nom', '—')}</b> "
        f"situé à {immeuble.get('adresse', '')}, {immeuble.get('ville', '')},<br/><br/>"
        f"déclare avoir reçu de <b>{locataire.get('nom', 'le locataire')}</b> "
        f"(tél. {locataire.get('telephone', '—')}), "
        f"locataire de l'appartement <b>n° {appart.get('numero', '—')}</b> ({appart.get('type', '')}),<br/><br/>"
        f"la somme de <b>{montant_en_lettres(montant)}</b> (<b>{fcfa(montant)}</b>),<br/><br/>"
        f"au titre du loyer du mois de <b>{_mois_fr(data.get('mois'))}</b>, "
        f"pour solde complet de la période susmentionnée."
    )
    t_corps = Table([[Paragraph(corps, st["texte"])]], colWidths=[LARGEUR - 68])
    t_corps.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story += [t_corps, Spacer(1, 12)]

    # Récapitulatif
    recap = [
        ["Élément", "Détail"],
        ["Locataire", locataire.get("nom", "—")],
        ["Appartement", f"n° {appart.get('numero', '—')} — {appart.get('type', '')}"],
        ["Immeuble", f"{immeuble.get('nom', '—')} ({immeuble.get('adresse', '')}, {immeuble.get('ville', '')})"],
        ["Mois de loyer", _mois_fr(data.get("mois"))],
        ["Montant réglé", fcfa(montant)],
        ["Mode de paiement", data.get("methode", "Mobile Money")],
        ["Date d'émission", _date_fr(data.get("date"))],
    ]
    t_recap = Table([[Paragraph(f"<b>{r[0]}</b>", st["texte"]), Paragraph(str(r[1]), st["texte"])] for r in recap[1:]],
                    colWidths=[150, LARGEUR - 68 - 150])
    t_recap.setStyle(_table_base([("BACKGROUND", (0, 0), (-1, -1), BLANC)]))
    t_recap.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), GRIS_CLAIR),
        ("GRID", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [t_recap, Spacer(1, 14)]

    # Vérification en ligne + signature
    qr_url = data.get("qr_url") or ""
    sign = Table(
        [[Paragraph(
             f"Quittance émise par <b>{MARQUE}</b> — valable sans signature manuscrite.<br/>"
             f"Vérifiable en ligne : <font color='#F59E0B'>{qr_url or '—'}</font>", st["petit"]),
           _qr_flowable(qr_url, 70) if qr_url else Paragraph("", st["petit"]),
           Paragraph("<b>Cachet &amp; signature</b><br/><br/><br/>______________________", st["petit"])]],
        colWidths=[LARGEUR - 68 - 90 - 130, 90, 130],
    )
    sign.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(sign)

    doc.build(story, onFirstPage=_callbacks("Quittance"), onLaterPages=_callbacks("Quittance"))
    return buf.getvalue()


# --------------------------------------------------------------------------- #
#  Graphique en barres (reportlab Drawing — pas de matplotlib)
# --------------------------------------------------------------------------- #


def _graphique_barres(libelles: list[str], series: list[tuple[str, str, list[float]]],
                      largeur: float = 500, hauteur: float = 170) -> Drawing:
    """Histogramme vectoriel : `series` = [(label, couleur, valeurs)]."""
    d = Drawing(largeur, hauteur)
    marge_g, marge_b, marge_h = 46, 26, 30
    zone_w, zone_h = largeur - marge_g - 10, hauteur - marge_b - marge_h

    toutes = [v for _, _, vals in series for v in vals]
    vmax = max(toutes) if toutes else 1.0
    if vmax <= 0:
        vmax = 1.0

    # Axes
    d.add(Line(marge_g, marge_b, marge_g, marge_b + zone_h, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.8))
    d.add(Line(marge_g, marge_b, marge_g + zone_w, marge_b, strokeColor=colors.HexColor("#94A3B8"), strokeWidth=0.8))
    for i in range(1, 4):
        y = marge_b + zone_h * i / 4
        d.add(Line(marge_g, y, marge_g + zone_w, y, strokeColor=colors.HexColor("#E2E8F0"), strokeWidth=0.5))
        d.add(String(marge_g - 5, y - 3, f"{int(vmax * i / 4):,}".replace(",", " "),
                     fontName="Helvetica", fontSize=6.5, fillColor=GRIS_TEXTE, textAnchor="end"))

    n = max(1, len(libelles))
    groupe_w = zone_w / n
    barre_w = min(20.0, (groupe_w - 6) / max(1, len(series)))
    couleurs = series and [s[1] for s in series] or ["#F59E0B"]

    for i, lib in enumerate(libelles):
        x0 = marge_g + i * groupe_w + (groupe_w - barre_w * len(series)) / 2
        for j, (_, couleur, vals) in enumerate(series):
            v = vals[i] if i < len(vals) else 0
            h = zone_h * (v / vmax)
            x = x0 + j * barre_w
            d.add(Rect(x, marge_b, barre_w - 1.5, max(h, 0.6),
                       fillColor=colors.HexColor(couleur), strokeColor=None))
        d.add(String(marge_g + i * groupe_w + groupe_w / 2, marge_b - 12, str(lib)[:16],
                     fontName="Helvetica", fontSize=6.5, fillColor=GRIS_TEXTE, textAnchor="middle"))

    # Légende
    lx = largeur - 10
    for label, couleur, _ in reversed(series):
        txt = f"{label}    "
        d.add(String(lx, hauteur - 14, txt, fontName="Helvetica", fontSize=7,
                     fillColor=GRIS_TEXTE, textAnchor="end"))
        lx -= 8 * len(txt)
        d.add(Rect(lx, hauteur - 16, 8, 8, fillColor=colors.HexColor(couleur), strokeColor=None))
        lx -= 12
    return d


# --------------------------------------------------------------------------- #
#  Rapport PDF (2 pages)
# --------------------------------------------------------------------------- #


def _kpi_boite(label: str, valeur: str, couleur: str) -> Table:
    st = _styles()
    t = Table(
        [[Paragraph(label.upper(), st["kpi_label"])],
         [Paragraph(valeur, st["kpi_valeur"])]],
        colWidths=[(LARGEUR - 68 - 18) / 4],
        rowHeights=[20, 26],
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(couleur)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def generer_rapport_pdf(data: dict) -> bytes:
    """Rapport d'activité 2 pages : KPIs, loyers/immeuble, dépenses, bilan, graphique."""
    st = _styles()
    immeuble = data.get("immeuble") or {}
    kpis = data.get("kpis") or {}
    lignes_loyers = data.get("loyers") or []
    lignes_depenses = data.get("depenses") or []
    par_mois = data.get("par_mois") or []  # [(label, attendu, paye)]

    doc, buf = _nouveau_doc_pdf("Rapport d'activité", data)
    periode = f"du {_date_fr(data.get('debut'))} au {_date_fr(data.get('fin'))}"
    story: list = [
        Paragraph("RAPPORT D'ACTIVITÉ", st["titre"]),
        Paragraph(
            f"<b>{immeuble.get('nom', MARQUE)}</b> — {immeuble.get('adresse', '')}, "
            f"{immeuble.get('ville', '')}<br/>Période {periode}",
            st["sous_titre"],
        ),
    ]

    # --- Page 1 : KPIs ------------------------------------------------------
    boites = Table(
        [[_kpi_boite("Loyers attendus", fcfa(kpis.get("loyers_attendus")), "#0F172A"),
          _kpi_boite("Loyers perçus", fcfa(kpis.get("loyers_percus")), "#10B981"),
          _kpi_boite("Impayés", fcfa(kpis.get("impayes")), "#B45309"),
          _kpi_boite("Dépenses", fcfa(kpis.get("depenses")), "#334155")]],
        colWidths=[(LARGEUR - 68 - 18) / 4] * 4,
    )
    boites.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [boites, Spacer(1, 10)]

    taux = _num(kpis.get("taux_recouvrement"))
    occupation = _num(kpis.get("taux_occupation"))
    synop = Table(
        [[Paragraph(
            f"<b>Taux de recouvrement :</b> {taux:.1f} % &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"<b>Taux d'occupation :</b> {occupation:.0f} % &nbsp;&nbsp;|&nbsp;&nbsp; "
            f"<b>Appartements :</b> {int(_num(kpis.get('nb_appartements')))} "
            f"({int(_num(kpis.get('nb_occupes')))} occupés)<br/>"
            f"<b>Loyers échus :</b> {fcfa(kpis.get('loyers_attendus'))} &nbsp;&nbsp; "
            f"<b>Perçus :</b> {fcfa(kpis.get('loyers_percus'))} &nbsp;&nbsp; "
            f"<b>Reste à recouvrer :</b> {fcfa(kpis.get('impayes'))}", st["texte"])]],
        colWidths=[LARGEUR - 68],
    )
    synop.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIS_CLAIR),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [synop, Spacer(1, 12)]

    # Graphique loyers attendus vs perçus (par mois ou par appartement)
    story.append(Paragraph("Loyers attendus vs perçus", st["section"]))
    if par_mois:
        lib = [m[0] for m in par_mois]
        attendus = [m[1] for m in par_mois]
        payes = [m[2] for m in par_mois]
        story.append(_graphique_barres(lib, [("Attendu", "#94A3B8", attendus), ("Perçu", "#10B981", payes)]))
    else:
        story.append(Paragraph("<i>Aucune donnée de loyer sur la période.</i>", st["texte"]))
    story.append(Spacer(1, 8))

    # Bilan net
    net = _num(kpis.get("net"))
    couleur_net = "#10B981" if net >= 0 else "#DC2626"
    bilan = Table(
        [[Paragraph("<b>BILAN DE LA PÉRIODE</b>", st["texte_gras"]),
          Paragraph(
              f"Recettes : {fcfa(kpis.get('loyers_percus'))} &nbsp;&nbsp;−&nbsp;&nbsp; "
              f"Dépenses : {fcfa(kpis.get('depenses'))} &nbsp;&nbsp;=&nbsp;&nbsp; "
              f"<font color='{couleur_net}'><b>Net : {fcfa(net)}</b></font>", st["texte"])]],
        colWidths=[180, LARGEUR - 68 - 180],
    )
    bilan.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), C_NUIT),
        ("TEXTCOLOR", (0, 0), (0, 0), BLANC),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#ECFDF5") if net >= 0 else colors.HexColor("#FEF2F2")),
        ("BOX", (0, 0), (-1, -1), 0.8, C_EMERAUDE if net >= 0 else colors.HexColor("#DC2626")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [bilan, PageBreak()]

    # --- Page 2 : tableaux détaillés ---------------------------------------
    story.append(Paragraph(f"Loyers par appartement — {periode}", st["section"]))
    donnees = [["Appart.", "Type", "Locataire", "Mois", "Attendu", "Payé", "État"]]
    for l in lignes_loyers:
        donnees.append([
            str(l.get("appartement", "—")), str(l.get("type", "")), str(l.get("locataire", "—")),
            f"{int(_num(l.get('nb_mois')))}",
            fcfa(l.get("attendu")), fcfa(l.get("paye")), str(l.get("statut", "")),
        ])
    if len(donnees) == 1:
        donnees.append(["—", "—", "Aucun loyer enregistré sur la période", "0", fcfa(0), fcfa(0), "—"])
    donnees.append(["", "", Paragraph("<b>TOTAUX</b>", st["texte_gras"]), "",
                    Paragraph(f"<b>{fcfa(kpis.get('loyers_attendus'))}</b>", st["texte_gras"]),
                    Paragraph(f"<b>{fcfa(kpis.get('loyers_percus'))}</b>", st["texte_gras"]), ""])
    t_loy = Table(donnees, colWidths=[50, 45, LARGEUR - 68 - 50 - 45 - 45 - 80 - 80 - 65, 45, 80, 80, 65], repeatRows=1)
    style = _table_base([("ALIGN", (3, 1), (-1, -1), "RIGHT")])
    style.add("SPAN", (0, -1), (2, -1))
    style.add("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEF3C7"))
    style.add("LINEABOVE", (0, -1), (-1, -1), 0.8, C_OR)
    t_loy.setStyle(style)
    story += [t_loy, Spacer(1, 12)]

    story.append(Paragraph("Dépenses de la période (charges & travaux)", st["section"]))
    d_dep = [["Date", "Libellé", "Catégorie", "Montant"]]
    for dpte in lignes_depenses:
        d_dep.append([
            _date_fr(dpte.get("date")), str(dpte.get("libelle", "")),
            str(dpte.get("categorie", "")), fcfa(dpte.get("montant")),
        ])
    if len(d_dep) == 1:
        d_dep.append(["—", "Aucune dépense enregistrée", "—", fcfa(0)])
    d_dep.append(["", Paragraph("<b>TOTAL DÉPENSES</b>", st["texte_gras"]), "",
                  Paragraph(f"<b>{fcfa(kpis.get('depenses'))}</b>", st["texte_gras"])])
    t_dep = Table(d_dep, colWidths=[90, LARGEUR - 68 - 90 - 130 - 90, 130, 90], repeatRows=1)
    style_d = _table_base([("ALIGN", (3, 1), (-1, -1), "RIGHT")])
    style_d.add("SPAN", (0, -1), (1, -1))
    style_d.add("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEF3C7"))
    style_d.add("LINEABOVE", (0, -1), (-1, -1), 0.8, C_OR)
    t_dep.setStyle(style_d)
    story += [t_dep, Spacer(1, 12)]

    observations = data.get("observations") or [
        "Rapport généré automatiquement par SUNU KEUR à partir des données de l'application.",
        "Les montants sont exprimés en francs CFA (XOF).",
    ]
    t_obs = Table([[Paragraph("<b>OBSERVATIONS</b>", st["petit"]), ""]] +
                  [[Paragraph("• " + o, st["petit"]), ""] for o in observations],
                  colWidths=[LARGEUR - 68, 0])
    t_obs.setStyle(TableStyle([
        ("SPAN", (0, 0), (1, 0)),
        ("BACKGROUND", (0, 0), (-1, 0), GRIS_CLAIR),
        ("SPAN", (0, 1), (1, 1)),
        ("BOX", (0, 0), (-1, -1), 0.4, C_BLOC),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t_obs)

    doc.build(story, onFirstPage=_callbacks("Rapport"), onLaterPages=_callbacks("Rapport"))
    return buf.getvalue()


# --------------------------------------------------------------------------- #
#  Rapport Word (.docx)
# --------------------------------------------------------------------------- #


def _docx_en_tete(doc: Document, titre: str) -> None:
    """En-tête Word : logo image + marque + slogan + type de document."""
    from app.logo import logo_png_bytes

    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for col in table.columns:
        col.width = Inches(2.3)

    def _fond(cellule, hex_couleur: str) -> None:
        el = OxmlElement("w:shd")
        el.set(qn("w:val"), "clear")
        el.set(qn("w:fill"), hex_couleur)
        cellule._tc.get_or_add_tcPr().append(el)

    c1, c2, c3 = table.rows[0].cells
    for c in (c1, c2, c3):
        _fond(c, "0F172A")
    p1 = c1.paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p1.add_run().add_picture(io.BytesIO(logo_png_bytes(160)), width=Inches(0.5))
    p2 = c2.paragraphs[0]
    r = p2.add_run(MARQUE)
    r.bold = True
    r.font.size = Pt(16)
    r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    p2b = c2.add_paragraph()
    r2 = p2b.add_run(SLOGAN)
    r2.font.size = Pt(7.5)
    r2.font.color.rgb = RGBColor(0xF5, 0x9E, 0x0B)
    p3 = c3.paragraphs[0]
    p3.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r3 = p3.add_run(titre.upper())
    r3.bold = True
    r3.font.size = Pt(12)
    r3.font.color.rgb = RGBColor(0xF5, 0x9E, 0x0B)


def _docx_tableau(doc: Document, entetes: list[str], lignes: list[list[str]]) -> None:
    """Tableau stylé Word (en-tête nuit/blanc, lignes alternées)."""
    table = doc.add_table(rows=1, cols=len(entetes))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, ent in enumerate(entetes):
        cell = table.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        r = p.add_run(ent)
        r.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        el = OxmlElement("w:shd")
        el.set(qn("w:val"), "clear")
        el.set(qn("w:fill"), "0F172A")
        cell._tc.get_or_add_tcPr().append(el)
    for idx, ligne in enumerate(lignes):
        cells = table.add_row().cells
        for i, val in enumerate(ligne):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(val))
            r.font.size = Pt(9)
            if idx % 2 == 1:
                el = OxmlElement("w:shd")
                el.set(qn("w:val"), "clear")
                el.set(qn("w:fill"), "F1F5F9")
                cells[i]._tc.get_or_add_tcPr().append(el)


def generer_rapport_docx(data: dict) -> bytes:
    """Rapport Word : tableaux loyers, dépenses, bilan + en-tête logo/texte."""
    immeuble = data.get("immeuble") or {}
    kpis = data.get("kpis") or {}
    lignes_loyers = data.get("loyers") or []
    lignes_depenses = data.get("depenses") or []

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.6)
        section.bottom_margin = Inches(0.6)
    _docx_en_tete(doc, "Rapport")

    doc.add_paragraph().add_run().add_break()  # respiration
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = t.add_run("RAPPORT D'ACTIVITÉ")
    r.bold = True
    r.font.size = Pt(18)
    r.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    s = doc.add_paragraph()
    s.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rs = s.add_run(
        f"{immeuble.get('nom', MARQUE)} — {immeuble.get('adresse', '')}, {immeuble.get('ville', '')}\n"
        f"Période : du {_date_fr(data.get('debut'))} au {_date_fr(data.get('fin'))}"
    )
    rs.font.size = Pt(10)
    rs.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    doc.add_heading("Synthèse (KPI)", level=1)
    _docx_tableau(doc, ["Indicateur", "Valeur"], [
        ["Loyers attendus", fcfa(kpis.get("loyers_attendus"))],
        ["Loyers perçus", fcfa(kpis.get("loyers_percus"))],
        ["Impayés / reste à recouvrer", fcfa(kpis.get("impayes"))],
        ["Dépenses (charges + travaux)", fcfa(kpis.get("depenses"))],
        ["Taux de recouvrement", f"{_num(kpis.get('taux_recouvrement')):.1f} %"],
        ["Taux d'occupation", f"{_num(kpis.get('taux_occupation')):.0f} %"],
    ])

    doc.add_heading("Loyers par appartement", level=1)
    _docx_tableau(doc, ["Appart.", "Locataire", "Mois", "Attendu", "Payé", "État"],
                  [[
                      str(l.get("appartement", "—")), str(l.get("locataire", "—")),
                      f"{int(_num(l.get('nb_mois')))}", fcfa(l.get("attendu")),
                      fcfa(l.get("paye")), str(l.get("statut", "")),
                  ] for l in lignes_loyers] or [["—", "Aucun loyer enregistré", "0", fcfa(0), fcfa(0), "—"]])

    doc.add_heading("Dépenses de la période", level=1)
    _docx_tableau(doc, ["Date", "Libellé", "Catégorie", "Montant"],
                  [[_date_fr(d.get("date")), str(d.get("libelle", "")), str(d.get("categorie", "")),
                    fcfa(d.get("montant"))] for d in lignes_depenses]
                  or [["—", "Aucune dépense enregistrée", "—", fcfa(0)]])

    doc.add_heading("Bilan net", level=1)
    net = _num(kpis.get("net"))
    _docx_tableau(doc, ["Poste", "Montant"], [
        ["Recettes (loyers perçus)", fcfa(kpis.get("loyers_percus"))],
        ["Dépenses", fcfa(kpis.get("depenses"))],
        ["Résultat net de la période", fcfa(net) + (" (excédent)" if net >= 0 else " (déficit)")],
    ])

    p = doc.add_paragraph()
    rp = p.add_run(f"{MARQUE} — {SLOGAN} | Document édité le {_date_fr(None)}")
    rp.font.size = Pt(8)
    rp.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


# --------------------------------------------------------------------------- #
#  Classeur Excel
# --------------------------------------------------------------------------- #


def _xl_largeurs_auto(ws, largeur_max: int = 42) -> None:
    for col in ws.columns:
        lettre = get_column_letter(col[0].column)
        largeur = max((len(str(c.value)) if c.value is not None else 0) for c in col)
        ws.column_dimensions[lettre].width = min(max(10, largeur + 3), largeur_max)


def _xl_entete(ws, entetes: list[str], ligne: int = 1) -> None:
    fond = PatternFill("solid", fgColor="0F172A")
    bordure = Border(bottom=Side(style="thin", color="F59E0B"))
    for i, ent in enumerate(entetes, start=1):
        c = ws.cell(row=ligne, column=i, value=ent)
        c.font = Font(bold=True, color="FFFFFF", size=11)
        c.fill = fond
        c.border = bordure
        c.alignment = Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = ws.cell(row=ligne + 1, column=1)


def generer_excel(data: dict) -> bytes:
    """Classeur 3 onglets (Loyers, Dépenses, Bilan) avec formules SOMME."""
    immeuble = data.get("immeuble") or {}
    kpis = data.get("kpis") or {}
    lignes_loyers = data.get("loyers") or []
    lignes_depenses = data.get("depenses") or []
    periode = f"du {_date_fr(data.get('debut'))} au {_date_fr(data.get('fin'))}"

    wb = Workbook()

    # ---------- Onglet 1 : Loyers ----------
    ws = wb.active
    ws.title = "Loyers"
    ws["A1"] = f"SUNU KEUR — Loyers ({immeuble.get('nom', MARQUE)}) — {periode}"
    ws["A1"].font = Font(bold=True, size=13, color="0F172A")
    _xl_entete(ws, ["Appart.", "Type", "Locataire", "Mois suivis", "Attendu (FCFA)", "Payé (FCFA)", "État"], ligne=3)
    r = 4
    for l in lignes_loyers:
        ws.cell(row=r, column=1, value=str(l.get("appartement", "")))
        ws.cell(row=r, column=2, value=str(l.get("type", "")))
        ws.cell(row=r, column=3, value=str(l.get("locataire", "")))
        ws.cell(row=r, column=4, value=int(_num(l.get("nb_mois"))))
        ws.cell(row=r, column=5, value=round(_num(l.get("attendu")), 2))
        ws.cell(row=r, column=6, value=round(_num(l.get("paye")), 2))
        ws.cell(row=r, column=7, value=str(l.get("statut", "")))
        r += 1
    dern_loyer = max(r - 1, 4)
    ws.cell(row=r, column=4, value="TOTAL").font = Font(bold=True)
    ws.cell(row=r, column=5, value=f"=SUM(E4:E{dern_loyer})").font = Font(bold=True)
    ws.cell(row=r, column=6, value=f"=SUM(F4:F{dern_loyer})").font = Font(bold=True)
    for col in (5, 6):
        ws.cell(row=r, column=col).fill = PatternFill("solid", fgColor="FEF3C7")
    ligne_total_loyers = r
    _xl_largeurs_auto(ws)

    # ---------- Onglet 2 : Dépenses ----------
    ws2 = wb.create_sheet("Dépenses")
    ws2["A1"] = f"SUNU KEUR — Dépenses ({immeuble.get('nom', MARQUE)}) — {periode}"
    ws2["A1"].font = Font(bold=True, size=13, color="0F172A")
    _xl_entete(ws2, ["Date", "Libellé", "Catégorie", "Montant (FCFA)"], ligne=3)
    r = 4
    for d in lignes_depenses:
        ws2.cell(row=r, column=1, value=_date_fr(d.get("date")))
        ws2.cell(row=r, column=2, value=str(d.get("libelle", "")))
        ws2.cell(row=r, column=3, value=str(d.get("categorie", "")))
        ws2.cell(row=r, column=4, value=round(_num(d.get("montant")), 2))
        r += 1
    dern_dep = max(r - 1, 4)
    ws2.cell(row=r, column=3, value="TOTAL").font = Font(bold=True)
    ws2.cell(row=r, column=4, value=f"=SUM(D4:D{dern_dep})").font = Font(bold=True)
    ws2.cell(row=r, column=4).fill = PatternFill("solid", fgColor="FEF3C7")
    ligne_total_depenses = r
    _xl_largeurs_auto(ws2)

    # ---------- Onglet 3 : Bilan ----------
    ws3 = wb.create_sheet("Bilan")
    ws3["A1"] = f"SUNU KEUR — Bilan ({immeuble.get('nom', MARQUE)}) — {periode}"
    ws3["A1"].font = Font(bold=True, size=13, color="0F172A")
    _xl_entete(ws3, ["Poste", "Montant (FCFA)", "Détail"], ligne=3)
    ws3.cell(row=4, column=1, value="Loyers attendus")
    ws3.cell(row=4, column=2, value=f"='Loyers'!E{ligne_total_loyers}")
    ws3.cell(row=4, column=3, value=f"{int(_num(kpis.get('nb_appartements')))} appartements, "
                                    f"{int(_num(kpis.get('nb_occupes')))} occupés")
    ws3.cell(row=5, column=1, value="Loyers perçus")
    ws3.cell(row=5, column=2, value=f"='Loyers'!F{ligne_total_loyers}")
    ws3.cell(row=5, column=3, value=f"Taux de recouvrement : {_num(kpis.get('taux_recouvrement')):.1f} %")
    ws3.cell(row=6, column=1, value="Impayés")
    ws3.cell(row=6, column=2, value="=B4-B5")
    ws3.cell(row=6, column=3, value="Reste à recouvrer sur la période")
    ws3.cell(row=7, column=1, value="Dépenses (charges + travaux)")
    ws3.cell(row=7, column=2, value=f"='Dépenses'!D{ligne_total_depenses}")
    ws3.cell(row=7, column=3, value=f"{len(lignes_depenses)} ligne(s) de dépense(s)")
    ws3.cell(row=8, column=1, value="BILAN NET")
    ws3.cell(row=8, column=2, value="=B5-B7")
    ws3.cell(row=8, column=3, value="Recettes − dépenses")
    for c in ws3[8]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="10B981" if _num(kpis.get("net")) >= 0 else "DC2626")
    for ligne in range(4, 8):
        ws3.cell(row=ligne, column=2).number_format = "# ##0"
    ws3.cell(row=8, column=2).number_format = "# ##0"
    _xl_largeurs_auto(ws3)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


# --------------------------------------------------------------------------- #
#  Numérotation des factures
# --------------------------------------------------------------------------- #


def numero_facture_sequentiel(supabase, annee: int) -> str:
    """Prochain numéro de facture : SK-2026-001, SK-2026-002… (compte les factures de l'année)."""
    prefixe = f"SK-{annee}-"
    res = supabase.table("factures").select("numero").like("numero", f"{prefixe}%").execute()
    dernier = 0
    for ligne in res.data or []:
        numero = str(ligne.get("numero") or "")
        try:
            dernier = max(dernier, int(numero.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return f"{prefixe}{dernier + 1:03d}"
