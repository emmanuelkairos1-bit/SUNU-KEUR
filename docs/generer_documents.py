# -*- coding: utf-8 -*-
"""
SUNU KEUR — Générateur des documents de présentation.

Produit :
  - docs/SUNU-KEUR-Guide-Fonctionnement.pdf  (reportlab, schémas vectoriels + captures)
  - docs/SUNU-KEUR-Guide-Fonctionnement.pptx (python-pptx, process SmartArt + captures)

Entrées : docs/captures/*.png (captures réelles de l'application en production).
Aucune donnée fictive dans les captures : elles proviennent du site live.
"""
from __future__ import annotations

import os
import struct
from pathlib import Path

# =====================================================================
# MARQUE
# =====================================================================
NAVY = "#0F172A"
NAVY2 = "#1E293B"
EMERALD = "#10B981"
EMERALD_D = "#059669"
ORANGE = "#F97316"
GOLD = "#F59E0B"
OFFWHITE = "#F8FAFC"
WHITE = "#FFFFFF"
GRAY = "#64748B"
GRAY_L = "#CBD5E1"
RED = "#EF4444"

BASE = Path(__file__).resolve().parent
CAPTURES = BASE / "captures"
PDF_OUT = BASE / "SUNU-KEUR-Guide-Fonctionnement.pdf"
PPTX_OUT = BASE / "SUNU-KEUR-Guide-Fonctionnement.pptx"

SITE = "https://sunu-keur-web.onrender.com"
API = "https://sunu-keur-api.onrender.com"

CAP = {
    "hero": CAPTURES / "01-landing-hero.png",
    "login": CAPTURES / "02-login.png",
    "fonct": CAPTURES / "03-fonctionnalites.png",
    "tarifs": CAPTURES / "04-tarifs.png",
    "dashboard": CAPTURES / "05-dashboard.png",
    "loyers": CAPTURES / "06-loyers.png",
    "locataires": CAPTURES / "07-locataires.png",
    "facturation": CAPTURES / "08-facturation.png",
    "finances": CAPTURES / "09-finances.png",
    "paiements": CAPTURES / "10-paiements.png",
}


def png_size(path: Path) -> tuple[int, int]:
    """Dimensions d'un PNG lues dans l'en-tête IHDR."""
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", head[16:24])
    return 1400, 900  # secours


# =====================================================================
# 1. PDF (reportlab)
# =====================================================================
def generer_pdf() -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas as pdfcanvas

    # -- polices : Georgia (serif type Playfair) + Segoe UI, repli standard --
    def _reg(name: str, fichiers: list[str], repli: str) -> str:
        for f in fichiers:
            try:
                pdfmetrics.registerFont(TTFont(name, f))
                return name
            except Exception:
                continue
        return repli

    SERIF = _reg("Marque-Serif", [r"C:\Windows\Fonts\georgia.ttf", "/usr/share/fonts/truetype/msttcorefonts/Georgia.ttf"], "Times-Roman")
    SERIF_B = _reg("Marque-Serif-B", [r"C:\Windows\Fonts\georgiab.ttf", "/usr/share/fonts/truetype/msttcorefonts/Georgiab.ttf"], "Times-Bold")
    SANS = _reg("Marque-Sans", [r"C:\Windows\Fonts\segoeui.ttf", "/usr/share/fonts/truetype/msttcorefonts/SegoeUI.ttf"], "Helvetica")
    SANS_B = _reg("Marque-Sans-B", [r"C:\Windows\Fonts\segoeuib.ttf", "/usr/share/fonts/truetype/msttcorefonts/SegoeUI.ttf"], "Helvetica-Bold")

    C = HexColor
    W, H = A4  # 595 x 842
    M = 42  # marge

    doc = pdfcanvas.Canvas(str(PDF_OUT), pagesize=A4)
    doc.setTitle("Sunu Keur — Guide de fonctionnement")
    doc.setAuthor("Sunu Keur")

    # ------------------------------------------------------------------
    # primitives
    # ------------------------------------------------------------------
    def rect(x, y, w, h, fill=None, stroke=None, lw=1.0, r=0):
        if fill:
            doc.setFillColor(C(fill))
        if stroke:
            doc.setStrokeColor(C(stroke))
            doc.setLineWidth(lw)
        if r:
            doc.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1 if fill else 0)
        else:
            doc.rect(x, y, w, h, stroke=1 if stroke else 0, fill=1 if fill else 0)

    def txt(x, y, s, font=SANS, size=10, color=NAVY):
        doc.setFont(font, size)
        doc.setFillColor(C(color))
        doc.drawString(x, y, s)

    def ctxt(x, y, s, font=SANS, size=10, color=NAVY):
        doc.setFont(font, size)
        doc.setFillColor(C(color))
        doc.drawCentredString(x, y, s)

    def rtxt(x, y, s, font=SANS, size=10, color=NAVY):
        doc.setFont(font, size)
        doc.setFillColor(C(color))
        doc.drawRightString(x, y, s)

    def wrap(s: str, font: str, size: float, max_w: float) -> list[str]:
        mots, lignes, cur = s.split(), [], ""
        for mot in mots:
            essai = (cur + " " + mot).strip()
            if pdfmetrics.stringWidth(essai, font, size) <= max_w:
                cur = essai
            else:
                if cur:
                    lignes.append(cur)
                cur = mot
        if cur:
            lignes.append(cur)
        return lignes or [""]

    def para(x, y, w, s, font=SANS, size=9.5, color=NAVY2, leading=13.5):
        for ligne in wrap(s, font, size, w):
            txt(x, y, ligne, font, size, color)
            y -= leading
        return y

    def bullet(x, y, w, s, color=NAVY2, point_color=EMERALD, size=9.5):
        doc.setFillColor(C(point_color))
        doc.circle(x + 2.5, y + 3.2, 2.2, stroke=0, fill=1)
        return para(x + 11, y, w - 11, s, SANS, size, color, 13)

    def fleche(x1, y1, x2, y2, color=GRAY, lw=1.4, dash=None):
        import math
        doc.setStrokeColor(C(color))
        doc.setLineWidth(lw)
        if dash:
            doc.setDash(dash)
        doc.line(x1, y1, x2, y2)
        doc.setDash()
        ang = math.atan2(y2 - y1, x2 - x1)
        tete = 7
        p = doc.beginPath()
        p.moveTo(x2, y2)
        p.lineTo(x2 - tete * math.cos(ang - 0.42), y2 - tete * math.sin(ang - 0.42))
        p.lineTo(x2 - tete * math.cos(ang + 0.42), y2 - tete * math.sin(ang + 0.42))
        p.close()
        doc.setFillColor(C(color))
        doc.drawPath(p, stroke=0, fill=1)

    def boite(x, y, w, h, titre, sous=None, fill=OFFWHITE, bord=GRAY_L, tc=NAVY, sc=GRAY, ts=11, r=7, accent=None):
        rect(x, y, w, h, fill=fill, stroke=bord, lw=1.0, r=r)
        if accent:
            rect(x, y + h - 5, w, 5, fill=accent, r=0)
            doc.setFillColor(C(fill))
            doc.rect(x, y + h - 5.2, w, 2.2, stroke=0, fill=1)
        ty = y + h - (18 if accent else 15)
        ctxt(x + w / 2, ty, titre, SANS_B, ts, tc)
        if sous:
            for i, ligne in enumerate(wrap(sous, SANS, 8.2, w - 14)[:3]):
                ctxt(x + w / 2, ty - 12.5 - i * 10.5, ligne, SANS, 8.2, sc)

    def capture(path: Path, x, y_top, w, legende=None):
        """Place une capture (largeur w) et renvoie le y du bas."""
        if not path.exists():
            rect(x, y_top - w * 0.62, w, w * 0.62, fill=NAVY2, stroke=GRAY, r=6)
            ctxt(x + w / 2, y_top - w * 0.31, "(capture indisponible)", SANS, 9, GRAY_L)
            return y_top - w * 0.62
        iw, ih = png_size(path)
        h = w * ih / iw
        doc.setFillColor(C("#00000018"))
        doc.roundRect(x + 2.5, y_top - h - 2.5, w, h, 5, stroke=0, fill=1)
        doc.drawImage(ImageReader(str(path)), x, y_top - h, width=w, height=h)
        doc.setStrokeColor(C(GRAY_L))
        doc.setLineWidth(0.8)
        doc.roundRect(x, y_top - h, w, h, 5, stroke=1, fill=0)
        if legende:
            ctxt(x + w / 2, y_top - h - 13, legende, SANS, 8.5, GRAY)
        return y_top - h - (18 if legende else 6)

    def entete(titre, sous=None, couleur=EMERALD):
        rect(0, H - 46, W, 46, fill=NAVY)
        rect(0, H - 50, W, 4, fill=couleur)
        # mini-logo
        rect(M, H - 36, 24, 24, fill=NAVY2, stroke=GOLD, lw=0.8, r=5)
        ctxt(M + 12, H - 29, "SK", SERIF_B, 11, GOLD)
        txt(M + 34, H - 27, "SUNU KEUR", SERIF_B, 13, WHITE)
        rtxt(W - M, H - 27, titre, SANS_B, 10.5, OFFWHITE)
        if sous:
            rtxt(W - M, H - 38.5, sous, SANS, 7.8, GRAY_L)

    def pied(n, total):
        doc.setStrokeColor(C(GRAY_L))
        doc.setLineWidth(0.6)
        doc.line(M, 30, W - M, 30)
        txt(M, 19, "Sunu Keur — Fini le cahier. Tes loyers en un coup d'œil.", SANS, 7.6, GRAY)
        rtxt(W - M, 19, f"{n} / {total}", SANS, 7.6, GRAY)

    def logo_grand(cx, cy, s=110):
        """Logo vectoriel : maison or + lettres SK."""
        rect(cx - s / 2, cy - s / 2, s, s, fill=NAVY2, stroke=GOLD, lw=1.6, r=s * 0.2)
        # toit
        p = doc.beginPath()
        p.moveTo(cx - s * 0.30, cy + s * 0.10)
        p.lineTo(cx, cy + s * 0.33)
        p.lineTo(cx + s * 0.30, cy + s * 0.10)
        p.close()
        doc.setFillColor(C(GOLD))
        doc.drawPath(p, stroke=0, fill=1)
        # lettres
        doc.setFont(SERIF_B, s * 0.34)
        doc.setFillColor(C(GOLD))
        doc.drawString(cx - s * 0.235, cy - s * 0.26, "S")
        doc.setFillColor(C(WHITE))
        doc.drawString(cx + s * 0.02, cy - s * 0.26, "K")

    TOTAL = 12

    # ------------------------------------------------------------------
    # P1 — couverture
    # ------------------------------------------------------------------
    rect(0, 0, W, H, fill=NAVY)
    rect(0, 0, W, 8, fill=GOLD)
    rect(0, H - 8, W, 8, fill=EMERALD)
    logo_grand(W / 2, H - 234, 120)
    ctxt(W / 2, H - 300, "SUNU KEUR", SERIF_B, 40, GOLD)
    ctxt(W / 2, H - 326, "G E S T I O N   L O C A T I V E", SANS_B, 11, EMERALD)
    ctxt(W / 2, H - 392, "« Fini le cahier. Tes loyers en un coup d'œil. »", SERIF, 15, WHITE)
    rect(W / 2 - 130, H - 432, 260, 3, fill=GOLD)
    ctxt(W / 2, H - 472, "GUIDE DE FONCTIONNEMENT DE L'APPLICATION", SANS_B, 13, WHITE)
    ctxt(W / 2, H - 494, "Architecture · Rôles · Parcours · Documents · Paiements", SANS, 10, GRAY_L)
    # encart live
    rect(W / 2 - 165, 196, 330, 86, fill=NAVY2, stroke=EMERALD, lw=1.2, r=10)
    ctxt(W / 2, 262, "APPLICATION EN LIGNÉE", SANS_B, 9.5, EMERALD)
    ctxt(W / 2, 242, SITE, SANS, 9, WHITE)
    ctxt(W / 2, 226, API, SANS, 9, WHITE)
    ctxt(W / 2, 208, "documents réels générés par l'API Python (PDF · Word · Excel)", SANS, 7.6, GRAY_L)
    ctxt(W / 2, 132, "Édition octobre 2026 · Next.js 14 · FastAPI · Render", SANS, 9, GRAY)
    ctxt(W / 2, 114, "Sénégal — Dakar, Thiès, Saint-Louis", SANS, 9, GRAY)
    doc.showPage()

    # ------------------------------------------------------------------
    # P2 — sommaire + problème/solution
    # ------------------------------------------------------------------
    entete("Sommaire & contexte")
    y = H - 92
    txt(M, y, "Ce que couvre ce document", SERIF_B, 17, NAVY)
    y -= 26
    som = [
        ("1", "L'application en un coup d'œil", "Accueil, connexion, tableau de bord", "p. 3"),
        ("2", "Architecture technique", "Frontend · API · données · services tiers", "p. 4"),
        ("3", "Les 4 rôles (RBAC)", "super_admin · gérant · propriétaire · locataire", "p. 5"),
        ("4", "Parcours du gérant", "De l'inscription au premier loyer encaissé", "p. 6"),
        ("5", "Captures du tableau de bord", "Loyers, locataires, finances", "p. 7-8"),
        ("6", "Documents officiels", "Factures, devis, quittances, rapports (PDF/Word/Excel)", "p. 9"),
        ("7", "Paiements & relances", "Wave, Orange Money, Free Money, WhatsApp", "p. 10"),
        ("8", "Finances & tarification", "Charges communes, travaux, 10 000 F/mois", "p. 11-12"),
        ("9", "Sécurité & déploiement", "Modes LOCAL/Supabase, GitHub + Render", "p. 12"),
    ]
    for num, t, s, p in som:
        rect(M, y - 13, 20, 20, fill=NAVY, r=5)
        ctxt(M + 10, y - 7.5, num, SANS_B, 9.5, GOLD)
        txt(M + 30, y - 3, t, SANS_B, 10.5, NAVY)
        txt(M + 30, y - 15, s, SANS, 8.6, GRAY)
        rtxt(W - M, y - 8, p, SANS, 8.6, GRAY)
        y -= 30

    y -= 8
    col_w = (W - 2 * M) / 2 - 30
    probs = [
        "Gérants qui suivent les loyers dans un cahier : oublis, mauvaise foi, temps perdu.",
        "Propriétaires de la diaspora sans visibilité sur leurs immeubles à Dakar.",
        "Relances WhatsApp manuelles, quittances illisibles, aucun suivi des impayés.",
    ]
    sols = [
        "Suivi des loyers en un coup d'œil : encaissé, en retard, taux de recouvrement.",
        "Encaissement mobile money (Wave, OM, Free) + quittances PDF automatiques.",
        "Portail propriétaire en lecture seule et relances WhatsApp polies, prêtes à envoyer.",
    ]

    def _hauteur_colonne(items):
        n_lignes = sum(len(wrap(t, SANS, 9.5, col_w)) for t in items)
        return n_lignes * 13 + (len(items) - 1) * 5

    h_col = max(_hauteur_colonne(probs), _hauteur_colonne(sols))
    box_top = y - 8
    box_h = 34 + h_col + 16
    rect(M, box_top - box_h, W - 2 * M, box_h, fill=OFFWHITE, stroke=GRAY_L, r=10)
    mid = M + (W - 2 * M) / 2
    txt(M + 16, box_top - 24, "Le problème", SERIF_B, 12.5, RED)
    txt(mid + 14, box_top - 24, "La solution Sunu Keur", SERIF_B, 12.5, EMERALD)
    doc.setStrokeColor(C(GRAY_L))
    doc.setLineWidth(0.8)
    doc.line(mid - 4, box_top - 12, mid - 4, box_top - box_h + 12)
    yy = box_top - 44
    for t in probs:
        yy = bullet(M + 16, yy, col_w, t, point_color=RED)
    yy = box_top - 44
    for t in sols:
        yy = bullet(mid + 14, yy, col_w, t)
    # ---------------------------------------------------------------
    # À qui s'adresse l'application (remplit le bas de page)
    # ---------------------------------------------------------------
    ay = box_top - box_h - 26
    txt(M, ay, "À qui s'adresse Sunu Keur", SERIF_B, 13, NAVY)
    ay -= 16
    cibles = [
        ("Gérant", EMERALD, "Gère ses immeubles au quotidien : loyers, locataires, documents, relances."),
        ("Propriétaire", GOLD, "Souvent de la diaspora : consulte ses rapports à distance, sans rien modifier."),
        ("Locataire", ORANGE, "Voit son loyer, paie en mobile money et télécharge ses reçus PDF."),
    ]
    cw = (W - 2 * M - 2 * 12) / 3
    ch = 96
    for i, (nom, cc, desc) in enumerate(cibles):
        x = M + i * (cw + 12)
        rect(x, ay - ch, cw, ch, fill=WHITE, stroke=GRAY_L, r=8)
        rect(x, ay - 5, cw, 5, fill=cc, r=0)
        doc.setFillColor(C(WHITE))
        doc.rect(x, ay - 5.2, cw, 2.4, stroke=0, fill=1)
        txt(x + 12, ay - 24, nom, SANS_B, 10.5, NAVY)
        para(x + 12, ay - 38, cw - 24, desc, SANS, 8.4, GRAY, 11.5)
    doc.showPage()

    # ------------------------------------------------------------------
    # P3 — l'application en un coup d'œil
    # ------------------------------------------------------------------
    entete("1 · L'application en un coup d'œil", "site public + espace gérant")
    y = H - 76
    txt(M, y, "Une application web pensée pour le terrain sénégalais", SERIF_B, 15, NAVY)
    y -= 15
    y2 = para(
        M, y, W - 2 * M,
        "Sunu Keur est une application web (ordinateur et téléphone) qui remplace le cahier du gérant : "
        "elle enregistre les immeubles, les appartements, les locataires et les loyers, encaisse par mobile money, "
        "génère les documents officiels et tient le propriétaire informé. Ci-dessous : la page d'accueil publique "
        "et la page de connexion — aucune installation, un navigateur suffit.",
    )
    y = y2 - 8
    h1 = 176
    capture(CAP["hero"], M, y, (W - 2 * M) * 0.60, "Page d'accueil — accroche, promesse et appel à l'action")
    capture(CAP["login"], M + (W - 2 * M) * 0.63, y, (W - 2 * M) * 0.37, "Connexion — email/mot de passe ou lien magique")
    y2 = min(
        y - ((W - 2 * M) * 0.60) * png_size(CAP["hero"])[1] / png_size(CAP["hero"])[0] - 22,
        y - ((W - 2 * M) * 0.37) * png_size(CAP["login"])[1] / png_size(CAP["login"])[0] - 22,
    )
    box_top = y2 - 8
    rect(M, box_top - 111, W - 2 * M, 103, fill=OFFWHITE, stroke=GRAY_L, r=10)
    txt(M + 14, box_top - 24, "Les 6 modules de l'espace gérant", SERIF_B, 11.5, NAVY)
    modules = [
        ("Tableau de bord", "encaissé du mois, retards, occupation"),
        ("Loyers", "suivi 12 mois, encaissement en un clic"),
        ("Locataires", "fiches, CNI, contrats, historique"),
        ("Finances", "charges communes réparties, travaux"),
        ("Facturation", "factures, devis, quittances, rapports"),
        ("Paiements", "Wave · Orange Money · Free Money"),
    ]
    for i, (t, s) in enumerate(modules):
        col = i % 3
        line = i // 3
        bx = M + 14 + col * ((W - 2 * M - 28) / 3)
        by = y2 - 46 - line * 38
        doc.setFillColor(C(EMERALD))
        doc.circle(bx + 4, by + 3, 2.6, stroke=0, fill=1)
        txt(bx + 13, by, t, SANS_B, 9.3, NAVY)
        txt(bx + 13, by - 11, s, SANS, 7.9, GRAY)
    # capture « fonctionnalités » pour occuper le bas de page
    fw = 360
    capture(CAP["fonct"], M + (W - 2 * M - fw) / 2, box_top - 131, fw,
            "Fonctionnalités — encaissement, relances, documents, portails")
    doc.showPage()

    # ------------------------------------------------------------------
    # P4 — architecture technique (schéma)
    # ------------------------------------------------------------------
    entete("2 · Architecture technique", "schéma de fonctionnement")
    y = H - 76
    txt(M, y, "Deux services reliés par une API HTTP", SERIF_B, 15, NAVY)
    y -= 14
    y = para(M, y, W - 2 * M,
             "L'application se compose d'un frontend Next.js (interface) et d'un backend FastAPI (moteur : calculs, "
             "documents, paiements). Ils communiquent en JSON sur HTTPS. Les données vivent soit dans le navigateur "
             "(mode LOCAL, sans configuration), soit dans Supabase/PostgreSQL (mode réel, multi-utilisateurs).")

    LR, RR = M, W - M
    LW = RR - LR  # 511 pt utiles

    # --- couche 1 : utilisateurs ---
    b1 = y - 14
    boite(LR, b1 - 54, LW, 54, "Utilisateurs", None, fill=NAVY, bord=NAVY, tc=WHITE)
    ctxt(LR + LW / 2, b1 - 26, "gérants · propriétaires (diaspora) · locataires", SANS_B, 10, WHITE)
    ctxt(LR + LW / 2, b1 - 42, "navigateur web sur ordinateur et mobile — aucune installation", SANS, 8.4, GRAY_L)
    ax_ = LR + LW / 2
    fleche(ax_, b1 - 56, ax_, b1 - 128, EMERALD)
    rtxt(ax_ - 6, b1 - 96, "formulaire · session", SANS, 7.4, GRAY)

    # --- couche 2 : frontend <-> api ---
    b2 = b1 - 130
    gap = 46
    w2 = (LW - gap) / 2
    boite(LR, b2 - 88, w2, 88, "Frontend Next.js 14", None, fill=OFFWHITE, bord=EMERALD, accent=EMERALD)
    ctxt(LR + w2 / 2, b2 - 46, "React · Tailwind · Framer Motion", SANS, 8.4, GRAY)
    ctxt(LR + w2 / 2, b2 - 64, SITE.replace("https://", ""), SANS_B, 8.4, EMERALD_D)
    ax2 = LR + w2 + gap
    boite(ax2, b2 - 88, w2, 88, "API FastAPI (Python)", None, fill=OFFWHITE, bord=GOLD, accent=GOLD)
    ctxt(ax2 + w2 / 2, b2 - 46, "routes REST · validation · RBAC", SANS, 8.4, GRAY)
    ctxt(ax2 + w2 / 2, b2 - 64, API.replace("https://", ""), SANS_B, 8.4, ORANGE)
    fleche(LR + w2 + 8, b2 - 30, ax2 - 8, b2 - 30, GOLD)
    fleche(ax2 - 8, b2 - 54, LR + w2 + 8, b2 - 54, GRAY)
    ctxt(ax_ - 6, b2 - 46, "JSON", SANS_B, 7.6, NAVY)

    # --- couche 3 : données ---
    b3 = b2 - 88 - 54
    fleche(LR + w2 / 2, b2 - 92, LR + w2 / 2, b3 + 2, GRAY)
    fleche(ax2 + w2 / 2, b2 - 92, ax2 + w2 / 2, b3 + 2, GRAY)
    rtxt(LR + w2 / 2 - 6, b3 + 18, "lecture / écriture", SANS, 7.4, GRAY)
    boite(LR, b3 - 84, w2, 84, "Données — mode LOCAL", None, fill=OFFWHITE, bord=GRAY_L, accent=NAVY2)
    ctxt(LR + w2 / 2, b3 - 46, "localStorage du navigateur", SANS, 8.4, GRAY)
    ctxt(LR + w2 / 2, b3 - 62, "une base par appareil — démo & test", SANS, 8.4, GRAY)
    boite(ax2, b3 - 84, w2, 84, "Données — mode Supabase", None, fill=OFFWHITE, bord=EMERALD, accent=EMERALD)
    ctxt(ax2 + w2 / 2, b3 - 46, "PostgreSQL managé + RLS par rôle", SANS, 8.4, GRAY)
    ctxt(ax2 + w2 / 2, b3 - 62, "une base partagée — multi réel", SANS, 8.4, GRAY)

    # --- couche 4 : moteur documents + pièces / services ---
    b4 = b3 - 84 - 54
    fleche(ax2 + 26, b3 - 88, LR + w2 / 2, b4 + 2, GOLD)
    rtxt(ax2 + 20, b3 - 108, "appel moteur", SANS, 7.4, GRAY)
    fleche(ax2 + w2 / 2, b3 - 88, ax2 + w2 / 2, b4 + 2, GRAY, dash=(3, 2))
    boite(LR, b4 - 92, w2, 92, "Moteur de documents", None, fill=OFFWHITE, bord=GOLD, accent=GOLD)
    for k, ligne in enumerate(["reportlab (PDF) · python-docx (Word)",
                               "openpyxl (Excel) · qrcode",
                               "numérotation auto SK-F-2026-001"]):
        ctxt(LR + w2 / 2, b4 - 46 - k * 14, ligne, SANS, 8.2, GRAY)
    boite(ax2, b4 - 92, w2, 92, "Pièces & services tiers", None, fill=NAVY, bord=NAVY, tc=WHITE)
    for k, (lab, cc) in enumerate([("Supabase Storage privé (CNI, contrats)", OFFWHITE),
                                   ("Wave · Orange Money · Free Money", EMERALD),
                                   ("WhatsApp (wa.me) — relances", WHITE)]):
        ctxt(ax2 + w2 / 2, b4 - 46 - k * 14, lab, SANS, 8.2, cc)

    # déploiement
    py = 108
    rect(M, py, W - 2 * M, 44, fill=NAVY, r=8)
    ctxt(M + 95, py + 26, "GitHub (code source)", SANS_B, 9, WHITE)
    ctxt(M + 95, py + 13, "push master", SANS, 7.4, GRAY_L)
    fleche(M + 190, py + 22, M + 240, py + 22, GOLD)
    ctxt(W - M - 128, py + 26, "Render (hébergement)", SANS_B, 9, WHITE)
    ctxt(W - M - 128, py + 13, "service API (Python) + service Web (Node)", SANS, 7.4, GRAY_L)
    ctxt(M + (W - 2 * M) / 2, py + 9, "→ déploiement continu", SANS, 7.6, GOLD)
    doc.showPage()

    # ------------------------------------------------------------------
    # P5 — RBAC
    # ------------------------------------------------------------------
    entete("3 · Les 4 rôles (RBAC)", "qui peut faire quoi")
    y = H - 76
    txt(M, y, "Chaque rôle a son propre espace", SERIF_B, 15, NAVY)
    y -= 14
    y = para(M, y, W - 2 * M,
             "Le contrôle d'accès est centralisé : le middleware rejette toute route protégée sans session valide, "
             "et chaque page recalcule les droits de l'utilisateur (lecture seule pour le propriétaire, périmètre "
             "limité au locataire connecté).")

    roles = [
        ("super_admin", NAVY, "Administration plateforme", ["Vue d'ensemble des immeubles", "Paramètres système", "Comptes et invitations"], "accès total"),
        ("gérant", EMERALD, "Le cœur du produit", ["Crée immeubles & appartements", "Suit les loyers, encaisse", "Génère documents & relances"], "lecture/écriture"),
        ("propriétaires (diaspora)", GOLD, "Informer, pas administrer", ["Voit ses immeubles & rapports", "Reçoit quittances & états", "Aucune modification possible"], "lecture seule"),
        ("locataire", ORANGE, "Son loyer, simplement", ["Voit son loyer & son historique", "Paie en mobile money", "Télécharge ses reçus PDF"], "périmètre personnel"),
    ]
    cw = (W - 2 * M - 3 * 12) / 4
    ry = y - 180
    for i, (nom, cc, sous, caps, tag) in enumerate(roles):
        x = M + i * (cw + 12)
        rect(x, ry, cw, 170, fill=OFFWHITE, stroke=GRAY_L, r=8)
        rect(x, ry + 170 - 26, cw, 26, fill=cc, r=0)
        doc.setFillColor(C(OFFWHITE))
        doc.rect(x, ry + 170 - 26.5, cw, 2, stroke=0, fill=1)
        ctxt(x + cw / 2, ry + 170 - 18, nom, SANS_B, 9.8, WHITE)
        ctxt(x + cw / 2, ry + 170 - 42, sous, SANS_B, 8.4, NAVY)
        yy = ry + 170 - 58
        for cap in caps:
            yy = bullet(x + 8, yy, cw - 14, cap, size=8, point_color=cc) - 3
        rect(x + 8, ry + 7, cw - 16, 16, fill=WHITE, stroke=cc, r=8)
        ctxt(x + cw / 2, ry + 11.5, tag, SANS_B, 7.6, cc)

    # grille de permissions
    gy = ry - 34
    txt(M, gy, "Grille de permissions", SERIF_B, 11.5, NAVY)
    gy -= 16
    colonnes = ["super_admin", "gérant", "propriétaire", "locataire"]
    actions = [
        ("Créer / modifier immeubles & appartements", ["—", "●", "—", "—"]),
        ("Enregistrer un loyer ou un paiement", ["—", "●", "—", "son loyer"]),
        ("Générer facture / quittance / rapport", ["—", "●", "consulter", "reçus"]),
        ("Envoyer une relance WhatsApp", ["—", "●", "—", "—"]),
        ("Consulter les tableaux de bord", ["●", "●", "ses immeubles", "son compte"]),
    ]
    lw_ = (W - 2 * M) * 0.46
    colw = (W - 2 * M - lw_) / 4
    rect(M, gy - 20, W - 2 * M, 20, fill=NAVY)
    txt(M + 8, gy - 14, "Action", SANS_B, 8.4, WHITE)
    for i, c in enumerate(colonnes):
        ctxt(M + lw_ + colw * i + colw / 2, gy - 14, c, SANS_B, 8.4, GOLD if i else WHITE)
    gy -= 20
    for j, (act, vals) in enumerate(actions):
        if j % 2 == 0:
            rect(M, gy - 21, W - 2 * M, 21, fill=OFFWHITE)
        txt(M + 8, gy - 14.5, act, SANS, 8.4, NAVY2)
        for i, v in enumerate(vals):
            ctxt(M + lw_ + colw * i + colw / 2, gy - 14.5, v, SANS_B if v == "●" else SANS, 8.4,
                 EMERALD if v == "●" else (GRAY if v == "—" else ORANGE))
        gy -= 21
    # ---------------------------------------------------------
    # Bande A : comment le contrôle s'applique (chaîne de sécurité)
    # ---------------------------------------------------------
    ty = gy - 34
    txt(M, ty, "Comment le contrôle s'applique", SERIF_B, 11.5, NAVY)
    ty -= 16
    maillons = [
        ("Session", "cookie valide\naprès connexion", EMERALD),
        ("Middleware", "rejet sans session\n→ /login", GOLD),
        ("Droits de la page", "chaque écran\nrecalcule le rôle", ORANGE),
        ("Périmètre", "immeuble ou locataire\nautorisés seulement", NAVY2),
    ]
    wc = (W - 2 * M - 3 * 16) / 4
    for i, (t, s, cc) in enumerate(maillons):
        x = M + i * (wc + 16)
        rect(x, ty - 64, wc, 64, fill=OFFWHITE, stroke=cc, r=7)
        rect(x, ty - 5, wc, 5, fill=cc, r=0)
        doc.setFillColor(C(OFFWHITE))
        doc.rect(x, ty - 5.2, wc, 2.4, stroke=0, fill=1)
        ctxt(x + wc / 2, ty - 24, t, SANS_B, 9, NAVY)
        for k, ligne in enumerate(s.split("\n")):
            ctxt(x + wc / 2, ty - 38 - k * 10, ligne, SANS, 7.6, GRAY)
        if i < 3:
            fleche(x + wc + 2, ty - 34, x + wc + 14, ty - 34, GRAY)
    # ---------------------------------------------------------
    # Bande B : cas concrets de refus / accès
    # ---------------------------------------------------------
    ty = ty - 64 - 34
    txt(M, ty, "Cas concrets", SERIF_B, 11.5, NAVY)
    ty -= 16
    cas = [
        ("Le propriétaire tente de modifier un loyer", "REFUSÉ", "lecture seule sur ses immeubles", RED),
        ("Un locataire ouvre le dossier d'un voisin", "REFUSÉ", "périmètre personnel uniquement", RED),
        ("Le gérant se connecte à son espace", "AUTORISÉ", "son agence et ses immeubles", EMERALD),
    ]
    wc3 = (W - 2 * M - 2 * 12) / 3
    for i, (act, verdict, suite, cc) in enumerate(cas):
        x = M + i * (wc3 + 12)
        rect(x, ty - 96, wc3, 96, fill=WHITE, stroke=GRAY_L, r=7)
        rect(x, ty - 96, 4, 96, fill=cc)
        para(x + 14, ty - 24, wc3 - 26, act, SANS_B, 8.8, NAVY, 12)
        rect(x + 14, ty - 68, wc3 - 26, 18, fill=cc, r=9)
        ctxt(x + 14 + (wc3 - 26) / 2, ty - 63, verdict, SANS_B, 8.4, WHITE)
        para(x + 14, ty - 78, wc3 - 26, suite, SANS, 8.1, GRAY, 10.5)
    doc.showPage()

    # ------------------------------------------------------------------
    # P6 — parcours gérant
    # ------------------------------------------------------------------
    entete("4 · Parcours du gérant", "de l'inscription au loyer encaissé")
    y = H - 76
    txt(M, y, "6 étapes, une dizaine de minutes", SERIF_B, 15, NAVY)
    y -= 14
    y = para(M, y, W - 2 * M,
             "Le parcours est guidé : à l'inscription, l'application configure l'espace (onboarding), puis chaque "
             "action mène naturellement à la suivante. Un bandeau de connexion signale que tout fonctionne déjà "
             "avec l'API en production.")

    etapes = [
        ("1", "Inscription", "email, rôle,\nmot de passe", EMERALD),
        ("2", "Onboarding", "agence, immeuble,\nappartements", EMERALD),
        ("3", "Locataires", "fiche, téléphone,\nCNI, contrat", GOLD),
        ("4", "Loyers", "suivi 12 mois,\néchéances", GOLD),
        ("5", "Encaissement", "Wave, OM,\nespèces", ORANGE),
        ("6", "Documents", "quittances PDF,\nrapports", ORANGE),
    ]
    n = len(etapes)
    cw = (W - 2 * M - (n - 1) * 6) / n
    cy = y - 134
    hh = 90
    for i, (num, t, s, cc) in enumerate(etapes):
        x = M + i * (cw + 6)
        p = doc.beginPath()
        p.moveTo(x, cy)
        p.lineTo(x + cw - 10, cy)
        p.lineTo(x + cw, cy + hh / 2)
        p.lineTo(x + cw - 10, cy + hh)
        p.lineTo(x, cy + hh)
        if i > 0:
            p.lineTo(x + 10, cy + hh / 2)
        p.close()
        doc.setFillColor(C(OFFWHITE))
        doc.setStrokeColor(C(cc))
        doc.setLineWidth(1.1)
        doc.drawPath(p, stroke=1, fill=1)
        cxm = x + cw / 2 + (4 if i else 0)
        ctxt(cxm, cy + hh - 18, num, SANS_B, 13, cc)
        ctxt(cxm, cy + hh - 33, t, SANS_B, 9.2, NAVY)
        for k, ligne in enumerate(s.split("\n")):
            ctxt(cxm, cy + hh - 48 - k * 10, ligne, SANS, 7.1, GRAY)

    # ce que produit chaque étape
    py = cy - 40
    txt(M, py, "Ce que l'application produit concrètement", SERIF_B, 11.5, NAVY)
    py -= 26
    items = [
        ("Tableau de bord vivant", "encaissé du mois, montant en retard, taux de recouvrement et taux d'occupation — recalculés à chaque connexion."),
        ("Rappels d'échéance", "les loyers non réglés remontent dans « Paiements à encaisser », avec le nom et le téléphone du locataire."),
        ("Journal d'activité", "chaque création, paiement ou modification laisse une trace horodatée consultable par le gérant."),
        ("Chiffres justes", "les montants sont proratisés sur les jours du mois en cours : le chiffre est exact dès le premier jour."),
        ("Relances en un clic", "le message WhatsApp est pré-rempli avec le nom, le montant et l'échéance — à envoyer tel quel."),
        ("Portail propriétaire", "le propriétaire consulte ses immeubles à distance, en lecture seule, sans toucher aux données."),
    ]
    for i, (t, s) in enumerate(items):
        col = i % 2
        line = i // 2
        bx = M + col * ((W - 2 * M) / 2 + 4)
        byy = py - line * 70
        rect(bx, byy - 60, (W - 2 * M) / 2 - 8, 66, fill=OFFWHITE, stroke=GRAY_L, r=7)
        rect(bx, byy - 60, 4, 66, fill=[EMERALD, GOLD, ORANGE, NAVY2][i % 4])
        txt(bx + 12, byy - 16, t, SANS_B, 9.6, NAVY)
        para(bx + 12, byy - 30, (W - 2 * M) / 2 - 28, s, SANS, 8, GRAY, 10.5)

    # bande « Et après ? »
    ty = py - 2 * 70 - 66 - 36
    txt(M, ty, "Et après ?", SERIF_B, 11.5, NAVY)
    ty -= 18
    apres = [
        ("Le propriétaire est informé", "rapport mensuel et quittances consultables dans son portail, à Dakar comme à l'étranger."),
        ("L'export comptable", "tous les loyers et paiements de la période exportés en Excel pour le comptable."),
        ("Le support WhatsApp", "une question, une réponse : l'équipe répond directement dans WhatsApp."),
    ]
    wca = (W - 2 * M - 2 * 12) / 3
    for i, (t, s) in enumerate(apres):
        x = M + i * (wca + 12)
        rect(x, ty - 95, wca, 95, fill=WHITE, stroke=GRAY_L, r=8)
        rect(x, ty - 5, wca, 5, fill=[EMERALD, GOLD, ORANGE][i], r=0)
        doc.setFillColor(C(WHITE))
        doc.rect(x, ty - 5.2, wca, 2.4, stroke=0, fill=1)
        txt(x + 12, ty - 24, t, SANS_B, 9.4, NAVY)
        para(x + 12, ty - 38, wca - 24, s, SANS, 8.1, GRAY, 11)
    txt(M, ty - 118, "Chaque étape est réversible : rien n'est perdu si le gérant s'arrête en route.",
        SANS, 8.4, GRAY)
    doc.showPage()

    # ------------------------------------------------------------------
    # P7 — captures dashboard + loyers
    # ------------------------------------------------------------------
    entete("5 · Captures", "tableau de bord & suivi des loyers")
    y = H - 76
    txt(M, y, "Le tableau de bord et la grille des loyers", SERIF_B, 15, NAVY)
    y -= 12
    # capture principale pleine largeur
    yy = capture(CAP["dashboard"], M, y - 4, W - 2 * M,
                 "Tableau de bord — encaissé du mois, retards, taux d'occupation")
    yy -= 16
    # seconde capture (gauche) + commentaire (droite)
    w2c = 290
    capture(CAP["loyers"], M, yy, w2c, "Loyers — mois en cours, encaissé, reste à recouvrer")
    bx = M + w2c + 16
    bw2 = W - M - bx
    bl = [
        "En vert : l'argent réellement encaissé. En orange : ce qui reste à recouvrer. En rouge : les retards.",
        "Chaque carte porte un badge de tendance (ex. −44 % vs mois dernier).",
        "La grille se filtre par immeuble et par année ; un clic ouvre l'encaissement.",
        "Le sous-titre rappelle la règle : « cliquez sur une cellule pour encaisser ».",
    ]
    n_lig = sum(len(wrap(t, SANS, 9, bw2 - 22)) for t in bl)
    h_enc = 34 + n_lig * 13 + len(bl) * 5 + 16
    rect(bx, yy - h_enc, bw2, h_enc, fill=OFFWHITE, stroke=GRAY_L, r=9)
    txt(bx + 12, yy - 22, "Comment lire ces écrans", SERIF_B, 10.5, NAVY)
    yb = yy - 40
    for t in bl:
        yb = bullet(bx + 12, yb, bw2 - 22, t, size=9) - 5
    # bandeau bas (sous la légende de la seconde capture)
    rect(M, 48, W - 2 * M, 64, fill=NAVY, r=9)
    ctxt(M + (W - 2 * M) / 2, 88, "En un mot", SANS_B, 9.5, GOLD)
    ctxt(M + (W - 2 * M) / 2, 69,
         "un clic sur une cellule ouvre l'encaissement : statut du loyer, quittance PDF et journal sont mis à jour ensemble.",
         SANS, 8.6, WHITE)
    doc.showPage()

    # ------------------------------------------------------------------
    # P8 — captures locataires + facturation
    # ------------------------------------------------------------------
    entete("5 · Captures", "locataires & documents officiels")
    y = H - 76
    txt(M, y, "Fiches locataires et génération de documents", SERIF_B, 15, NAVY)
    y -= 12
    yy = capture(CAP["locataires"], M, y - 4, W - 2 * M,
                 "Locataires — fiches, loyer mensuel, actions en un clic")
    yy -= 16
    w2c = 290
    capture(CAP["facturation"], M, yy, w2c, "Facturation — facture, devis, quittances, rapports")
    bx = M + w2c + 16
    bw2 = W - M - bx
    bl = [
        "La page affiche en vert l'URL du backend contacté : on sait qui répond.",
        "Les documents sont produits par Python — le PDF téléchargé est un vrai PDF.",
        "Numérotation automatique non modifiable : SK-F-2026-001, SK-R-2026-001…",
        "QR Code intégré aux quittances pour une vérification rapide.",
        "Chaque onglet correspond à un type : facture, devis, quittance, rapport.",
    ]
    n_lig = sum(len(wrap(t, SANS, 9, bw2 - 22)) for t in bl)
    h_enc = 34 + n_lig * 13 + len(bl) * 5 + 16
    rect(bx, yy - h_enc, bw2, h_enc, fill=OFFWHITE, stroke=GRAY_L, r=9)
    txt(bx + 12, yy - 22, "Le saviez-vous ?", SERIF_B, 10.5, NAVY)
    yb = yy - 40
    for t in bl:
        yb = bullet(bx + 12, yb, bw2 - 22, t, point_color=GOLD, size=9) - 5
    # bandeau bas (sous la légende de la seconde capture)
    rect(M, 48, W - 2 * M, 64, fill=NAVY, r=9)
    ctxt(M + (W - 2 * M) / 2, 88, "Tout au même endroit", SANS_B, 9.5, GOLD)
    ctxt(M + (W - 2 * M) / 2, 69,
         "chaque fiche conserve téléphone, CNI et contrat : la relance WhatsApp part depuis la fiche, avec le bon numéro.",
         SANS, 8.6, WHITE)
    doc.showPage()

    # ------------------------------------------------------------------
    # P9 — flux documents
    # ------------------------------------------------------------------
    entete("6 · Documents officiels", "flux de génération")
    y = H - 76
    txt(M, y, "Du clic à l'apporteur de PDF", SERIF_B, 15, NAVY)
    y -= 14
    y = para(M, y, W - 2 * M,
             "Chaque document est calculé côté serveur avec les données à jour, puis renvoyé au navigateur. "
             "Aucune bibliothèque JavaScript de PDF n'est utilisée : c'est bien le backend Python qui imprime.")

    # schéma en4 temps
    bw = (W - 2 * M - 3 * 34) / 4
    by = y - 96
    etapes2 = [
        ("Interface", "choix du type\n(montant, immeuble,\nlocataire…)", NAVY2),
        ("API FastAPI", "POST /api/generate/*\nvalidation + calculs\nnumérotation auto", GOLD),
        ("Moteur Python", "reportlab (PDF)\npython-docx (Word)\nopenpyxl (Excel) · qrcode", EMERALD),
        ("Fichier prêt", "PDF / Word / Excel\ntéléchargé ou lié\npar URL signée", ORANGE),
    ]
    for i, (t, s, cc) in enumerate(etapes2):
        x = M + i * (bw + 34)
        boite(x, by, bw, 78, t, None, fill=OFFWHITE, bord=cc, accent=cc)
        for k, ligne in enumerate(s.split("\n")):
            ctxt(x + bw / 2, by + 44 - k * 11, ligne, SANS, 7.8, GRAY)
        if i < 3:
            fleche(x + bw + 4, by + 39, x + bw + 30, by + 39, GRAY)

    # catalogue
    cy2 = by - 34
    txt(M, cy2, "Catalogue des documents générés", SERIF_B, 11.5, NAVY)
    cy2 -= 18
    docs_ = [
        ("Facture", "SK-F-AAAA-001", "PDF", EMERALD, "numérotation automatique, mentions légales"),
        ("Devis de travaux", "SK-D-AAAA-001", "PDF", EMERALD, "postes de dépense, total, validité"),
        ("Quittance de loyer", "SK-Q-AAAA-001", "PDF + QR", GOLD, "mois, locataire, montant en toutes lettres"),
        ("Reçu de paiement", "SK-R-AAAA-001", "PDF", GOLD, "horodaté, méthode de paiement"),
        ("Rapport mensuel", "encaissé / impayé", "PDF", ORANGE, "synthèse par immeuble — diaspora"),
        ("Rapport détaillé", "tableau complet", "Word", ORANGE, "modifiable, pour courrier et archive"),
        ("Export comptable", "lignes brutes", "Excel", NAVY2, "lignes brutes de la période"),
    ]
    rect(M, cy2 - len(docs_) * 21 - 6, W - 2 * M, len(docs_) * 21 + 10, fill=OFFWHITE, stroke=GRAY_L, r=8)
    for i, (nom, num, fmt, cc, desc) in enumerate(docs_):
        yy = cy2 - 16 - i * 21
        if i % 2 == 1:
            rect(M + 3, yy - 7, W - 2 * M - 6, 19, fill=WHITE)
        txt(M + 12, yy, nom, SANS_B, 8.8, NAVY)
        txt(M + 130, yy, num, SANS, 8.2, GRAY)
        rect(M + 248, yy - 2, 52, 13, fill=cc, r=6)
        ctxt(M + 274, yy + 1.5, fmt, SANS_B, 7, WHITE)
        txt(M + 312, yy, desc, SANS, 8.1, NAVY2)

    note_y = cy2 - len(docs_) * 21 - 26
    rect(M, 96, W - 2 * M, note_y - 100, fill=NAVY, r=10)
    ctxt(M + (W - 2 * M) / 2, note_y - 24, "Pourquoi pas de JavaScript côté client ?", SANS_B, 10, GOLD)
    para_center = wrap(
        "Générer un PDF dans le navigateur impose une bibliothèque lourde et produit un rendu différent selon "
        "l'appareil. Ici, le PDF est imprimé par Python (reportlab) : même mise en page sur un téléphone bas de "
        "gamme et sur un Mac, avec QR Code, montant en toutes lettres et entête de l'agence personnalisé.",
        SANS, 8.4, W - 2 * M - 40)
    for i, ligne in enumerate(para_center):
        ctxt(M + (W - 2 * M) / 2, note_y - 42 - i * 11.5, ligne, SANS, 8.4, WHITE)
    doc.showPage()

    # ------------------------------------------------------------------
    # P10 — paiements & relances
    # ------------------------------------------------------------------
    entete("7 · Paiements & relances", "mobile money + WhatsApp")
    y = H - 76
    txt(M, y, "Encaisser sans déplacer le carnet", SERIF_B, 15, NAVY)
    y -= 14
    y = para(M, y, W - 2 * M,
             "Le locataire choisit son moyen de paiement ; le backend crée l'ordre auprès du fournisseur, "
             "confirme la transaction puis met le loyer à jour et édite la quittance. Les espèces et virements "
             "restent encaissables manuellement par le gérant, preuve à l'appui.")

    # flux
    bw = (W - 2 * M - 4 * 22) / 5
    by = y - 78
    flux = [
        ("Locataire", "depuis son\nportail", NAVY2),
        ("Moyen", "Wave · OM\nFree · espèces", EMERALD),
        ("Backend", "ordre de\npaiement", GOLD),
        ("Confirmation", "webhook /\nvérification", ORANGE),
        ("Quittance", "loyer à jour\n+ PDF", EMERALD_D),
    ]
    for i, (t, s, cc) in enumerate(flux):
        x = M + i * (bw + 22)
        boite(x, by, bw, 56, t, None, fill=OFFWHITE, bord=cc, accent=cc)
        for k, ligne in enumerate(s.split("\n")):
            ctxt(x + bw / 2, by + 24 - k * 10, ligne, SANS, 7.6, GRAY)
        if i < 4:
            fleche(x + bw + 2, by + 28, x + bw + 20, by + 28, GRAY)

    # relance whatsapp
    ry = by - 92
    rect(M, ry, (W - 2 * M) * 0.54, 82, fill=OFFWHITE, stroke=EMERALD, r=10)
    rect(M, ry + 82 - 4, (W - 2 * M) * 0.54, 4, fill=EMERALD, r=0)
    txt(M + 14, ry + 60, "Relance WhatsApp en un clic", SANS_B, 10.5, NAVY)
    para(M + 14, ry + 46, (W - 2 * M) * 0.54 - 28,
         "Message poli et personnalisé, ouvert directement dans WhatsApp (wa.me) avec le numéro du locataire "
         "pré-rempli : « Bonjour Aminata, votre loyer de 250 000 F pour octobre arrive à échéance… »",
         SANS, 8.1, GRAY, 10.5)
    rect(M + 14, ry + 8, 92, 16, fill=EMERALD, r=8)
    ctxt(M + 60, ry + 12.5, "wa.me/221…", SANS_B, 7.6, WHITE)

    # capture paiements
    capture(CAP["paiements"], M + (W - 2 * M) * 0.57, ry + 82, (W - 2 * M) * 0.43, "Paiements — encaissé, en attente, impayés")
    # états
    sy = 96
    rect(M, sy, W - 2 * M, ry - 108, fill=NAVY, r=10)
    txt(M + 14, sy + ry - 132, "Trois états, aucun doublon", SANS_B, 10, GOLD)
    etats = [
        ("payé", "montant_paye = montant", EMERALD, "quittance émise, plus rien à réclamer"),
        ("partiel", "0 < montant_paye < montant", GOLD, "solde restant affiché en orange"),
        ("impayé", "échéance passée, rien reçu", RED, "entre dans la file de relance WhatsApp"),
    ]
    for i, (t, formule, cc, desc) in enumerate(etats):
        x = M + 14 + i * ((W - 2 * M - 28) / 3)
        rect(x, sy + 12, (W - 2 * M - 28) / 3 - 10, ry - 150, fill=NAVY2, r=7)
        ctxt(x + ((W - 2 * M - 28) / 3 - 10) / 2, sy + ry - 152, t, SANS_B, 10, cc)
        ctxt(x + ((W - 2 * M - 28) / 3 - 10) / 2, sy + ry - 166, formule, SANS, 7.4, GRAY_L)
        for k, ligne in enumerate(wrap(desc, SANS, 7.6, (W - 2 * M - 28) / 3 - 24)):
            ctxt(x + ((W - 2 * M - 28) / 3 - 10) / 2, sy + ry - 182 - k * 10, ligne, SANS, 7.6, WHITE)
    doc.showPage()

    # ------------------------------------------------------------------
    # P11 — finances
    # ------------------------------------------------------------------
    entete("8 · Finances", "charges communes & travaux")
    y = H - 76
    txt(M, y, "Répartir les charges, suivre les chantiers", SERIF_B, 15, NAVY)
    y -= 12
    # capture à gauche
    w_cap = (W - 2 * M) * 0.60
    y_cap = capture(CAP["finances"], M, y - 4, w_cap, "Finances — charges communes, éligibles, travaux")
    # schéma répartition à droite
    sx = M + w_cap + 16
    sw = W - M - sx
    txt(sx, y - 18, "Principe de répartition", SERIF_B, 11.5, NAVY)
    boite(sx, y - 78, sw, 44, "Facture commune", "électricité du couloir — 48 000 F", fill=OFFWHITE, bord=GOLD, accent=GOLD)
    fleche(sx + sw / 2, y - 80, sx + sw / 2, y - 104, GOLD)
    occ, part = 3, 48000 // 3
    for i in range(4):
        x = sx + i * (sw / 4)
        is_occ = i < occ
        rect(x, y - 148, sw / 4 - 6, 40, fill=OFFWHITE if is_occ else WHITE,
             stroke=EMERALD if is_occ else GRAY_L, r=6)
        ctxt(x + (sw / 4 - 6) / 2, y - 118, "occupé" if is_occ else "vacant", SANS_B, 7.4,
             EMERALD_D if is_occ else GRAY)
        ctxt(x + (sw / 4 - 6) / 2, y - 134, f"{part:,} F".replace(",", " ") if is_occ else "0 F",
             SANS_B, 8.4, NAVY if is_occ else GRAY)
    y2 = y - 164
    for t in [
        "Seuls les appartements OCCUPÉS participent (prorata configurable).",
        "Chaque facture commune est justificatif : photo du compteur jointe.",
        "Les travaux suivent un kanban : à faire → en cours → terminé.",
        "Le coût des travaux est cumulé : on sait ce que coûte l'immeuble.",
        "Tout est exportable avec la quittance et le rapport au propriétaire.",
    ]:
        y2 = bullet(sx, y2, sw, t, point_color=GOLD, size=8.1) - 4

    # kanban des travaux pleine largeur
    ky = 436
    txt(M, ky, "Travaux — kanban et coûts", SERIF_B, 11.5, NAVY)
    ky -= 16
    chantiers = [
        ("à faire", GRAY, "Peinture du couloir", "120 000 F"),
        ("en cours", GOLD, "Réparer la fuite du toit", "75 000 F"),
        ("terminé", EMERALD, "aucun chantier clos", "0 F"),
    ]
    wc_t = (W - 2 * M - 2 * 12) / 3
    for i, (t, cc, nom, cout) in enumerate(chantiers):
        x = M + i * (wc_t + 12)
        rect(x, ky - 90, wc_t, 90, fill=OFFWHITE, stroke=cc, r=8)
        rect(x, ky - 6, wc_t, 6, fill=cc, r=0)
        doc.setFillColor(C(OFFWHITE))
        doc.rect(x, ky - 6.2, wc_t, 3, stroke=0, fill=1)
        ctxt(x + wc_t / 2, ky - 26, t, SANS_B, 10, NAVY)
        ctxt(x + wc_t / 2, ky - 44, nom, SANS, 8.6, GRAY)
        rect(x + wc_t / 2 - 34, ky - 74, 68, 17, fill=WHITE, stroke=cc, r=8)
        ctxt(x + wc_t / 2, ky - 69.5, cout, SANS_B, 8.4, cc)

    # bandeau chiffres pleine largeur
    ny = 150
    rect(M, ny, W - 2 * M, 156, fill=NAVY, r=10)
    stats = [("46 538 F", "de charges communes", "sur la période affichée", GOLD),
             ("3 / 4", "appartements éligibles", "à la répartition", EMERALD),
             ("189 061 F", "de travaux suivis", "sur 2 chantiers", ORANGE)]
    for i, (v, l1, l2, cc) in enumerate(stats):
        x = M + 20 + i * ((W - 2 * M - 40) / 3)
        txt(x, ny + 118, v, SERIF_B, 20, cc)
        txt(x, ny + 98, l1, SANS_B, 8.6, WHITE)
        txt(x, ny + 85, l2, SANS, 8, GRAY_L)
    doc.setStrokeColor(C("#334155"))
    doc.setLineWidth(0.8)
    doc.line(M + 20, ny + 66, W - M - 20, ny + 66)
    txt(M + 20, ny + 46, "À retenir", SANS_B, 9, GOLD)
    para(M + 20, ny + 30, W - 2 * M - 40,
         "Les montants sont recalculés à chaque nouvelle facture commune : la répartition par appartement "
         "suit les occupations réelles, et chaque justificatif reste consultable depuis la page Finances.",
         SANS, 8.4, WHITE, 11.5)
    doc.showPage()

    # ------------------------------------------------------------------
    # P12 — tarifs + sécurité/déploiement
    # ------------------------------------------------------------------
    entete("9 · Tarification, sécurité & déploiement")
    y = H - 76
    txt(M, y, "Un prix clair : zéro commission", SERIF_B, 15, NAVY)
    y -= 12
    capture(CAP["tarifs"], M, y - 4, (W - 2 * M) * 0.46, "Page tarifs — la formule unique, sans surprise")
    sx = M + (W - 2 * M) * 0.49
    sw = (W - 2 * M) * 0.51
    rect(sx, y - 204, sw, 200, fill=OFFWHITE, stroke=GOLD, lw=1.4, r=10)
    ctxt(sx + sw / 2, y - 40, "10 000 F CFA", SERIF_B, 22, NAVY)
    ctxt(sx + sw / 2, y - 58, "par mois · par immeuble", SANS, 10.5, GRAY)
    rect(sx + sw / 2 - 66, y - 80, 132, 18, fill=EMERALD, r=9)
    ctxt(sx + sw / 2, y - 74, "0 % DE COMMISSION", SANS_B, 8.4, WHITE)
    yy = y - 100
    for t in [
        "Aucun prélèvement sur les loyers encaissés.",
        "Appartements et locataires illimités.",
        "Relances WhatsApp et quittances PDF incluses.",
        "Portail propriétaire et rapports inclus.",
        "Changement de formule à tout moment.",
    ]:
        yy = bullet(sx + 16, yy, sw - 32, t, point_color=GOLD, size=8.4)
    ctxt(sx + sw / 2, y - 186, "Le cahier, lui, coûte des heures et des oublis.", SANS, 8, GRAY)

    # sécurité
    sy = y - 228
    txt(M, sy, "Sécurité", SERIF_B, 11.5, NAVY)
    sy -= 16
    sec = [
        ("Rôles verrouillés", "le middleware bloque toute route protégée sans session ; chaque page recalcule les droits."),
        ("Données cloisonnées", "en mode Supabase : Row Level Security sur les 12 tables, politiques par rôle."),
        ("Documents privés", "CNI, contrats et logos stockés dans un bucket privé, accessibles par lien signé."),
        ("Mots de passe hachés", "hachage salé côté client en mode LOCAL ; Supabase Auth en mode réel."),
    ]
    for i, (t, s) in enumerate(sec):
        col = i % 2
        line = i // 2
        bx = M + col * ((W - 2 * M) / 2 + 4)
        byy = sy - line * 44
        rect(bx, byy - 34, (W - 2 * M) / 2 - 8, 40, fill=WHITE, stroke=GRAY_L, r=7)
        rect(bx, byy - 34, 4, 40, fill=EMERALD)
        txt(bx + 12, byy - 12, t, SANS_B, 8.8, NAVY)
        for k, ligne in enumerate(wrap(s, SANS, 7.6, (W - 2 * M) / 2 - 32)[:2]):
            txt(bx + 12, byy - 23 - k * 9, ligne, SANS, 7.6, GRAY)

    # déploiement
    dy = sy - 108
    txt(M, dy, "Déploiement (GitHub + Render)", SERIF_B, 11.5, NAVY)
    dy -= 14
    rect(M, dy - 44, W - 2 * M, 40, fill=NAVY, r=8)
    flow = [("git push", "master"), ("GitHub", "code source"), ("Render", "build + deploy"), ("Live", SITE.replace("https://", ""))]
    fw_ = (W - 2 * M) / 4
    for i, (t, s) in enumerate(flow):
        x = M + fw_ * i
        ctxt(x + fw_ / 2, dy - 18, t, SANS_B, 9, GOLD if i else WHITE)
        ctxt(x + fw_ / 2, dy - 31, s, SANS, 7.3, GRAY_L)
        if i < 3:
            fleche(x + fw_ - 8, dy - 24, x + fw_ + 6, dy - 24, EMERALD)

    # passage en mode réel
    ny2 = dy - 84
    txt(M, ny2, "Passer en mode réel — les 3 étapes", SERIF_B, 11.5, NAVY)
    ny2 -= 18
    etapes_r = [
        ("1 · Clés Supabase", "renseigner SUPABASE_URL et SUPABASE_SERVICE_KEY côté API, puis NEXT_PUBLIC_* côté Web", EMERALD),
        ("2 · Schéma SQL", "exécuter supabase/schema.sql : 12 tables et politiques RLS par rôle", GOLD),
        ("3 · Encaissements", "brancher les clés Wave / Orange Money pour du paiement réellement encaissé", ORANGE),
    ]
    wcr = (W - 2 * M - 2 * 12) / 3
    for i, (t, s, cc) in enumerate(etapes_r):
        x = M + i * (wcr + 12)
        rect(x, ny2 - 92, wcr, 92, fill=WHITE, stroke=GRAY_L, r=8)
        rect(x, ny2 - 5, wcr, 5, fill=cc, r=0)
        doc.setFillColor(C(WHITE))
        doc.rect(x, ny2 - 5.2, wcr, 2.4, stroke=0, fill=1)
        txt(x + 12, ny2 - 24, t, SANS_B, 9.4, NAVY)
        para(x + 12, ny2 - 38, wcr - 24, s, SANS, 8.1, GRAY, 11)
    txt(M, 178, "Plan gratuit : veille après ~15 min (1er chargement ≈ 50 s) · disque éphémère (documents regénérés à la demande).",
        SANS, 7.8, GRAY)
    doc.showPage()

    doc.save()
    print(f"PDF  -> {PDF_OUT} ({PDF_OUT.stat().st_size // 1024} Ko, {TOTAL} pages)")


# =====================================================================
# 2. PPTX (python-pptx)
# =====================================================================
def generer_pptx() -> None:
    from pptx import Presentation
    from pptx.util import Inches, Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.shapes import MSO_SHAPE
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

    def rgb(h):
        h = h.lstrip("#")
        return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

    N, W2, E, O, G = rgb(NAVY), rgb(NAVY2), rgb(EMERALD), rgb(ORANGE), rgb(GOLD)
    OW, WH, GR, GRL, RD = rgb(OFFWHITE), rgb(WHITE), rgb(GRAY), rgb(GRAY_L), rgb(RED)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    SW, SH = prs.slide_width, prs.slide_height
    BLANK = prs.slide_layouts[6]

    SERIF_F = "Georgia"
    SANS_F = "Segoe UI"

    def slide(fond=OW):
        s = prs.slides.add_slide(BLANK)
        bg = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SW, SH)
        bg.fill.solid()
        bg.fill.fore_color.rgb = fond
        bg.line.fill.background()
        bg.shadow.inherit = False
        return s

    def box(s, x, y, w, h, fill=WH, line=None, radius=True, lw=1.0):
        shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, x, y, w, h)
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
        if line:
            shp.line.color.rgb = line
            shp.line.width = Pt(lw)
        else:
            shp.line.fill.background()
        shp.shadow.inherit = False
        if radius:
            try:
                shp.adjustments[0] = 0.08
            except Exception:
                pass
        return shp

    def text(s, x, y, w, h, t, size=12, color=N, bold=False, font=SANS_F, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, italic=False, spacing=1.0):
        tb = s.shapes.add_textbox(x, y, w, h)
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Emu(0)
        tf.margin_top = tf.margin_bottom = Emu(0)
        tf.vertical_anchor = anchor
        lines = t.split("\n")
        for i, ligne in enumerate(lines):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = align
            p.line_spacing = spacing
            r = p.add_run()
            r.text = ligne
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.italic = italic
            r.font.name = font
            r.font.color.rgb = color
        return tb

    def chevron(s, x, y, w, h, fill, titre, sous, num):
        shp = s.shapes.add_shape(MSO_SHAPE.CHEVRON, x, y, w, h)
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
        shp.line.fill.background()
        shp.shadow.inherit = False
        try:
            shp.adjustments[0] = 0.28
        except Exception:
            pass
        text(s, x + Inches(0.28), y + Inches(0.10), w - Inches(0.6), Inches(0.32), num, 15, WH, True, SERIF_F)
        text(s, x + Inches(0.28), y + Inches(0.44), w - Inches(0.6), Inches(0.3), titre, 12, WH, True)
        text(s, x + Inches(0.28), y + Inches(0.74), w - Inches(0.6), Inches(0.5), sous, 8.5, OW, False, SANS_F, spacing=0.95)

    def entete_slide(s, num, titre, sous=None):
        band = box(s, 0, 0, SW, Inches(0.92), N, radius=False)
        bar = box(s, 0, Inches(0.92), SW, Inches(0.05), E, radius=False)
        box(s, Inches(0.45), Inches(0.22), Inches(0.48), Inches(0.48), W2, G, lw=0.75)
        text(s, Inches(0.45), Inches(0.30), Inches(0.48), Inches(0.34), "SK", 15, G, True, SERIF_F, PP_ALIGN.CENTER)
        text(s, Inches(1.08), Inches(0.30), Inches(5.2), Inches(0.34), titre, 20, WH, True, SERIF_F)
        if sous:
            text(s, Inches(1.10), Inches(0.62), Inches(6.5), Inches(0.24), sous, 9.5, GRL)
        text(s, SW - Inches(1.4), Inches(0.36), Inches(0.95), Inches(0.3), num, 12, G, True, SERIF_F, PP_ALIGN.RIGHT)

    def fleche(s, x, y, w, h, color=GRL):
        a = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, h)
        a.fill.solid()
        a.fill.fore_color.rgb = color
        a.line.fill.background()
        a.shadow.inherit = False
        return a

    def capture(s, path: Path, x, y, w, maxh=None, legende=None):
        if not path.exists():
            box(s, x, y, w, Inches(2.6), W2)
            text(s, x, y + Inches(1.1), w, Inches(0.4), "(capture indisponible)", 11, GRL, False, SANS_F, PP_ALIGN.CENTER)
            return y + Inches(2.6)
        iw, ih = png_size(path)
        h = int(w * ih / iw)
        if maxh and h > maxh:
            w = int(w * maxh / h)
            h = int(maxh)
        # cadre + image
        cadre = box(s, x - Emu(1), y - Emu(1), w + Emu(2), h + Emu(2), WH, GRL, radius=False, lw=0.75)
        s.shapes.add_picture(str(path), x, y, width=w, height=h)
        if legende:
            text(s, x, y + h + Inches(0.06), w, Inches(0.26), legende, 9, GR, False, SANS_F, PP_ALIGN.CENTER)
        return y + h

    # ------------------------------------------------------------------
    # S1 — couverture
    # ------------------------------------------------------------------
    s = slide(N)
    box(s, 0, 0, SW, Inches(0.10), G, radius=False)
    box(s, 0, SH - Inches(0.10), SW, Inches(0.10), E, radius=False)
    # logo
    box(s, SW / 2 - Inches(0.85), Inches(1.15), Inches(1.7), Inches(1.7), W2, G, lw=1.5)
    roof = s.shapes.add_shape(MSO_SHAPE.ISOSCELES_TRIANGLE, SW / 2 - Inches(0.55), Inches(1.5), Inches(1.1), Inches(0.55))
    roof.fill.solid(); roof.fill.fore_color.rgb = G; roof.line.fill.background(); roof.shadow.inherit = False
    text(s, SW / 2 - Inches(0.62), Inches(2.02), Inches(0.6), Inches(0.5), "S", 30, G, True, SERIF_F)
    text(s, SW / 2 + Inches(0.02), Inches(2.02), Inches(0.6), Inches(0.5), "K", 30, WH, True, SERIF_F)
    text(s, 0, Inches(3.15), SW, Inches(0.8), "SUNU KEUR", 46, G, True, SERIF_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(3.92), SW, Inches(0.3), "G E S T I O N   L O C A T I V E", 12, E, True, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(4.45), SW, Inches(0.4), "« Fini le cahier. Tes loyers en un coup d'œil. »", 17, WH, False, SERIF_F, PP_ALIGN.CENTER, italic=True)
    box(s, SW / 2 - Inches(2.6), Inches(5.15), Inches(5.2), Inches(0.9), W2, E, lw=0.75)
    text(s, 0, Inches(5.28), SW, Inches(0.3), "GUIDE DE FONCTIONNEMENT DE L'APPLICATION", 12, WH, True, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(5.58), SW, Inches(0.3), "Architecture · Rôles · Parcours · Documents · Paiements", 10, GRL, False, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(6.55), SW, Inches(0.3), SITE + "   ·   " + API, 10, E, False, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(6.85), SW, Inches(0.3), "Édition octobre 2026 · Next.js 14 · FastAPI · Render", 9, GR, False, SANS_F, PP_ALIGN.CENTER)

    # ------------------------------------------------------------------
    # S2 — problème / solution
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "01", "Le problème, la réponse", "pourquoi Sunu Keur existe")
    col = (SW - Inches(1.4)) / 2
    # colonne problème
    box(s, Inches(0.55), Inches(1.35), col, Inches(5.5), WH, RD, lw=1.25)
    box(s, Inches(0.55), Inches(1.35), col, Inches(0.62), RD, radius=False)
    text(s, Inches(0.55), Inches(1.48), col, Inches(0.36), "LE PROBLÈME", 15, WH, True, SANS_F, PP_ALIGN.CENTER)
    probs = [
        ("Le cahier du gérant", "suivi manuel des loyers : oublis, litiges, aucun historique exploitable."),
        ("La diaspora sans regard", "le propriétaire de Paris ne sait pas si son immeuble à Dakar paie."),
        ("Des relances pénibles", "messages WhatsApp écrits à la main, quittances illisibles ou inexistantes."),
        ("Les impayés qui s'accumulent", "personne ne sait combien manque, depuis quand, et pour qui."),
    ]
    yy = Inches(2.2)
    for t, d in probs:
        box(s, Inches(0.8), yy, Inches(0.10), Inches(0.85), RD, radius=False)
        text(s, Inches(1.05), yy, col - Inches(0.7), Inches(0.3), t, 13, N, True)
        text(s, Inches(1.05), yy + Inches(0.28), col - Inches(0.7), Inches(0.6), d, 10.5, GR, spacing=0.95)
        yy += Inches(1.08)
    # colonne solution
    x2 = Inches(0.55) + col + Inches(0.3)
    box(s, x2, Inches(1.35), col, Inches(5.5), WH, E, lw=1.25)
    box(s, x2, Inches(1.35), col, Inches(0.62), E, radius=False)
    text(s, x2, Inches(1.48), col, Inches(0.36), "LA SOLUTION SUNU KEUR", 15, WH, True, SANS_F, PP_ALIGN.CENTER)
    sols = [
        ("Un tableau de bord, pas un cahier", "encaissé, retards et taux de recouvrement à l'ouverture."),
        ("Le propriétaire connecté", "portail en lecture seule : rapports et quittances, sans modifier."),
        ("Relances en un clic", "message poli pré-rempli, ouvert directement dans WhatsApp."),
        ("Documents officiels réels", "factures, devis et quittances PDF générés par Python, QR à l'appui."),
    ]
    yy = Inches(2.2)
    for t, d in sols:
        box(s, x2 + Inches(0.25), yy, Inches(0.10), Inches(0.85), E, radius=False)
        text(s, x2 + Inches(0.5), yy, col - Inches(0.7), Inches(0.3), t, 13, N, True)
        text(s, x2 + Inches(0.5), yy + Inches(0.28), col - Inches(0.7), Inches(0.6), d, 10.5, GR, spacing=0.95)
        yy += Inches(1.08)
    text(s, Inches(0.55), Inches(7.0), SW - Inches(1.1), Inches(0.3), "Cible : gérants d'immeubles à Dakar, Thiès, Saint-Louis — et les propriétaires qui les emploient, souvent à l'étranger.", 10, N, True, SANS_F, PP_ALIGN.CENTER)

    # ------------------------------------------------------------------
    # S3 — architecture
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "02", "Architecture technique", "deux services, une API, deux modes de données")
    # utilisateurs
    box(s, Inches(0.55), Inches(2.2), Inches(1.7), Inches(0.9), N)
    text(s, Inches(0.55), Inches(2.42), Inches(1.7), Inches(0.3), "Utilisateurs", 13, WH, True, SANS_F, PP_ALIGN.CENTER)
    text(s, Inches(0.55), Inches(2.72), Inches(1.7), Inches(0.3), "web · mobile", 9, GRL, False, SANS_F, PP_ALIGN.CENTER)
    fleche(s, Inches(2.3), Inches(2.5), Inches(0.55), Inches(0.3), GRL)
    # frontend
    box(s, Inches(2.9), Inches(1.9), Inches(3.0), Inches(1.5), WH, E, lw=1.25)
    box(s, Inches(2.9), Inches(1.9), Inches(3.0), Inches(0.10), E, radius=False)
    text(s, Inches(3.05), Inches(2.12), Inches(2.7), Inches(0.3), "Frontend Next.js 14", 14, N, True)
    text(s, Inches(3.05), Inches(2.44), Inches(2.7), Inches(0.3), "React · Tailwind · Framer Motion", 10, GR)
    text(s, Inches(3.05), Inches(2.74), Inches(2.7), Inches(0.3), SITE.replace("https://", ""), 9.5, E, True)
    # fleches json
    fleche(s, Inches(5.95), Inches(2.45), Inches(0.75), Inches(0.3), G)
    text(s, Inches(5.95), Inches(2.15), Inches(0.75), Inches(0.25), "JSON", 9, GR, True, SANS_F, PP_ALIGN.CENTER)
    fleche(s, Inches(6.72), Inches(2.75), Inches(-0.72), Inches(0.3), GRL)
    # api
    box(s, Inches(6.75), Inches(1.9), Inches(3.0), Inches(1.5), WH, G, lw=1.25)
    box(s, Inches(6.75), Inches(1.9), Inches(3.0), Inches(0.10), G, radius=False)
    text(s, Inches(6.9), Inches(2.12), Inches(2.7), Inches(0.3), "API FastAPI (Python)", 14, N, True)
    text(s, Inches(6.9), Inches(2.44), Inches(2.7), Inches(0.3), "routes REST · validation · RBAC", 10, GR)
    text(s, Inches(6.9), Inches(2.74), Inches(2.7), Inches(0.3), API.replace("https://", ""), 9.5, O, True)
    # tiers
    box(s, Inches(10.0), Inches(1.9), Inches(2.8), Inches(1.5), N)
    text(s, Inches(10.0), Inches(2.05), Inches(2.8), Inches(0.3), "Services tiers", 13, WH, True, SANS_F, PP_ALIGN.CENTER)
    for i, (t, cc) in enumerate([("Wave", E), ("Orange Money", O), ("Free Money", RD), ("WhatsApp wa.me", E)]):
        text(s, Inches(10.0), Inches(2.40 + i * 0.24), Inches(2.8), Inches(0.24), "• " + t, 10, cc, True, SANS_F, PP_ALIGN.CENTER)
    fleche(s, Inches(9.8), Inches(2.5), Inches(0.15), Inches(0.3), GRL)
    # donnees
    box(s, Inches(2.9), Inches(4.0), Inches(3.2), Inches(1.35), WH, GRL, lw=1.0)
    box(s, Inches(2.9), Inches(4.0), Inches(3.2), Inches(0.09), W2, radius=False)
    text(s, Inches(3.05), Inches(4.20), Inches(2.9), Inches(0.3), "Mode LOCAL (par défaut)", 12.5, N, True)
    text(s, Inches(3.05), Inches(4.50), Inches(2.9), Inches(0.6), "localStorage du navigateur — aucune configuration, une base par appareil (démo & test)", 9.5, GR, spacing=0.95)
    box(s, Inches(6.75), Inches(4.0), Inches(3.2), Inches(1.35), WH, E, lw=1.0)
    box(s, Inches(6.75), Inches(4.0), Inches(3.2), Inches(0.09), E, radius=False)
    text(s, Inches(6.9), Inches(4.20), Inches(2.9), Inches(0.3), "Mode SUPABASE (réel)", 12.5, N, True)
    text(s, Inches(6.9), Inches(4.50), Inches(2.9), Inches(0.6), "PostgreSQL managé + RLS par rôle — une base partagée, multi-utilisateurs", 9.5, GR, spacing=0.95)
    # documents
    box(s, Inches(10.0), Inches(4.0), Inches(2.8), Inches(1.35), WH, G, lw=1.0)
    box(s, Inches(10.0), Inches(4.0), Inches(2.8), Inches(0.09), G, radius=False)
    text(s, Inches(10.15), Inches(4.20), Inches(2.5), Inches(0.3), "Moteur documents", 12.5, N, True)
    text(s, Inches(10.15), Inches(4.50), Inches(2.5), Inches(0.6), "reportlab · python-docx · openpyxl · qrcode", 9.5, GR, spacing=0.95)
    a1 = s.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(4.35), Inches(3.45), Inches(0.3), Inches(0.5))
    a1.fill.solid(); a1.fill.fore_color.rgb = GRL; a1.line.fill.background(); a1.shadow.inherit = False
    a2 = s.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, Inches(8.2), Inches(3.45), Inches(0.3), Inches(0.5))
    a2.fill.solid(); a2.fill.fore_color.rgb = GRL; a2.line.fill.background(); a2.shadow.inherit = False
    # deploiement
    box(s, Inches(0.55), Inches(5.85), SW - Inches(1.1), Inches(0.95), N)
    for i, (t, sub) in enumerate([("git push", "branche master"), ("GitHub", "code source"), ("Render", "build puis deploy"), ("Live", SITE.replace("https://", ""))]):
        x = Inches(0.75) + i * ((SW - Inches(1.5)) / 4)
        text(s, x, Inches(6.02), Inches(2.9), Inches(0.3), t, 13, G if i else WH, True)
        text(s, x, Inches(6.32), Inches(2.9), Inches(0.3), sub, 9.5, GRL)
        if i < 3:
            fleche(s, x + Inches(2.75), Inches(6.16), Inches(0.45), Inches(0.25), E)

    # ------------------------------------------------------------------
    # S4 — RBAC
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "03", "Les 4 rôles", "RBAC — chaque rôle, son espace et son périmètre")
    roles = [
        ("super_admin", N, "Administration plateforme", ["Vue d'ensemble des immeubles", "Paramètres système", "Comptes & invitations"], "accès total"),
        ("gérant", E, "Le cœur du produit", ["Crée immeubles & appartements", "Suit loyers, encaisse", "Documents & relances"], "lecture/écriture"),
        ("propriétaire", G, "Diaspora — informer", ["Voit ses immeubles", "Rapports & quittances", "Aucune modification"], "lecture seule"),
        ("locataire", O, "Son loyer, simplement", ["Voit son loyer & historique", "Paie en mobile money", "Reçus PDF"], "périmètre perso."),
    ]
    cw = (SW - Inches(1.1) - Inches(0.3) * 3) / 4
    for i, (nom, cc, sous, caps, tag) in enumerate(roles):
        x = Inches(0.55) + i * (cw + Inches(0.3))
        box(s, x, Inches(1.4), cw, Inches(3.6), WH, GRL, lw=0.75)
        box(s, x, Inches(1.4), cw, Inches(0.62), cc, radius=False)
        text(s, x, Inches(1.54), cw, Inches(0.36), nom, 15, WH, True, SANS_F, PP_ALIGN.CENTER)
        text(s, x, Inches(2.22), cw, Inches(0.3), sous, 11, N, True, SANS_F, PP_ALIGN.CENTER)
        yy = Inches(2.72)
        for cap in caps:
            text(s, x + Inches(0.25), yy, cw - Inches(0.4), Inches(0.44), "• " + cap, 10, GR, spacing=0.95)
            yy += Inches(0.52)
        box(s, x + Inches(0.3), Inches(4.4), cw - Inches(0.6), Inches(0.42), OW, cc)
        text(s, x + Inches(0.3), Inches(4.48), cw - Inches(0.6), Inches(0.3), tag, 10, cc, True, SANS_F, PP_ALIGN.CENTER)
    # grille
    text(s, Inches(0.55), Inches(5.3), Inches(6), Inches(0.3), "Grille de permissions", 14, N, True, SERIF_F)
    actions = [
        ("Créer / modifier immeubles & appartements", ["—", "●", "—", "—"]),
        ("Enregistrer un loyer ou un paiement", ["—", "●", "—", "son loyer"]),
        ("Générer facture / quittance / rapport", ["—", "●", "consulter", "reçus"]),
        ("Envoyer une relance WhatsApp", ["—", "●", "—", "—"]),
        ("Consulter les tableaux de bord", ["●", "●", "ses immeubles", "son compte"]),
    ]
    lw_ = Inches(5.2)
    colw = (SW - Inches(1.1) - lw_) / 4
    hy = Inches(5.72)
    box(s, Inches(0.55), hy, SW - Inches(1.1), Inches(0.34), N, radius=False)
    text(s, Inches(0.72), hy + Inches(0.06), lw_, Inches(0.26), "Action", 10.5, WH, True)
    for i, c in enumerate(["super_admin", "gérant", "propriétaire", "locataire"]):
        text(s, Inches(0.55) + lw_ + i * colw, hy + Inches(0.06), colw, Inches(0.26), c, 10.5, G, True, SANS_F, PP_ALIGN.CENTER)
    for j, (act, vals) in enumerate(actions):
        yy = hy + Inches(0.34) + j * Inches(0.28)
        if j % 2 == 0:
            box(s, Inches(0.55), yy, SW - Inches(1.1), Inches(0.28), WH, radius=False)
        text(s, Inches(0.72), yy + Inches(0.04), lw_, Inches(0.24), act, 10, N)
        for i, v in enumerate(vals):
            col = E if v == "●" else (GR if v == "—" else O)
            text(s, Inches(0.55) + lw_ + i * colw, yy + Inches(0.04), colw, Inches(0.24), v, 10, col, v == "●", SANS_F, PP_ALIGN.CENTER)

    # ------------------------------------------------------------------
    # S5 — parcours
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "04", "Parcours du gérant", "de l'inscription au loyer encaissé — une dizaine de minutes")
    etapes = [
        ("1", "Inscription", "email, mot de passe\net rôle choisi", E),
        ("2", "Onboarding", "agence + immeuble\n+ appartements", E),
        ("3", "Locataires", "fiche, téléphone,\nCNI, contrat", G),
        ("4", "Loyers", "suivi 12 mois,\néchéances, statuts", G),
        ("5", "Encaissement", "Wave / OM / espèces,\nmise à jour directe", O),
        ("6", "Documents", "quittances PDF,\nrapports au proprio", O),
    ]
    cw = (SW - Inches(1.1) - Inches(0.12) * 5) / 6
    for i, (num, t, sous, cc) in enumerate(etapes):
        chevron(s, Inches(0.55) + i * (cw + Inches(0.12)), Inches(1.5), cw, Inches(1.35), cc, t, sous, num)
    # ce que produit l'app
    items = [
        ("Tableau de bord vivant", "Encaissé du mois, montant en retard, taux de recouvrement et taux d'occupation — recalculés à chaque connexion.", E),
        ("Rappels d'échéance", "Les loyers non réglés remontent dans « Paiements à encaisser », avec nom et téléphone du locataire.", G),
        ("Journal d'activité", "Chaque création, paiement ou modification laisse une trace horodatée, consultable par le gérant.", O),
        ("Chiffres justes", "Montants proratisés sur les jours du mois en cours : le chiffre est exact dès le premier jour du mois.", N),
    ]
    for i, (t, d, cc) in enumerate(items):
        col = i % 2
        line = i // 2
        x = Inches(0.55) + col * ((SW - Inches(1.3)) / 2 + Inches(0.2))
        y = Inches(3.35) + line * Inches(1.35)
        w = (SW - Inches(1.3)) / 2
        box(s, x, y, w, Inches(1.15), WH, GRL, lw=0.75)
        box(s, x, y, Inches(0.08), Inches(1.15), cc, radius=False)
        text(s, x + Inches(0.3), y + Inches(0.14), w - Inches(0.5), Inches(0.3), t, 13, N, True)
        text(s, x + Inches(0.3), y + Inches(0.46), w - Inches(0.5), Inches(0.6), d, 10.5, GR, spacing=0.95)

    # ------------------------------------------------------------------
    # S6 — captures dashboard + loyers
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "05", "Tableau de bord & loyers", "captures réelles de l'application en production")
    capture(s, CAP["dashboard"], Inches(0.55), Inches(1.35), Inches(6.2), legende="Tableau de bord — encaissé, retards, occupation")
    capture(s, CAP["loyers"], Inches(6.95), Inches(1.35), Inches(5.8), legende="Loyers — mois en cours, encaissé, reste à recouvrer")
    box(s, Inches(0.55), Inches(6.15), SW - Inches(1.1), Inches(1.0), WH, GRL, lw=0.75)
    text(s, Inches(0.8), Inches(6.28), SW - Inches(1.6), Inches(0.3), "Lecture en couleur", 12, N, True)
    for i, (t, cc) in enumerate([("vert = encaissé", E), ("orange = à recouvrer", O), ("rouge = retard", RD), ("badges = tendance vs mois dernier", N)]):
        text(s, Inches(0.8) + i * Inches(3.05), Inches(6.58), Inches(3.0), Inches(0.3), "■ " + t, 10.5, cc, True)

    # ------------------------------------------------------------------
    # S7 — captures locataires + facturation
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "06", "Locataires & documents", "fiches, factures, quittances — captures réelles")
    capture(s, CAP["locataires"], Inches(0.55), Inches(1.35), Inches(6.2), legende="Locataires — fiches, loyer mensuel, actions")
    capture(s, CAP["facturation"], Inches(6.95), Inches(1.35), Inches(5.8), legende="Facturation — facture, devis, quittances, rapports")
    box(s, Inches(0.55), Inches(6.15), SW - Inches(1.1), Inches(1.0), WH, G, lw=0.9)
    text(s, Inches(0.8), Inches(6.28), SW - Inches(1.6), Inches(0.3), "Le saviez-vous ?", 12, N, True)
    text(s, Inches(0.8), Inches(6.58), SW - Inches(1.6), Inches(0.4),
         "La page Facturation affiche en vert l'URL du backend contacté · numérotation automatique non modifiable (SK-F-2026-001) · QR Code intégré aux quittances.",
         10.5, GR)

    # ------------------------------------------------------------------
    # S8 — flux documents (SmartArt)
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "07", "Documents officiels", "du clic au PDF — tout est généré par le backend Python")
    etapes = [
        ("Interface", "choix du type, du montant,\nde l'immeuble, du locataire", N2 := W2),
        ("API FastAPI", "POST /api/generate/*\nvalidation · calculs · numérotation", G),
        ("Moteur Python", "reportlab (PDF) · python-docx (Word)\nopenpyxl (Excel) · qrcode", E),
        ("Fichier prêt", "téléchargé immédiatement\nou accessible par lien signé", O),
    ]
    cw = (SW - Inches(1.1) - Inches(0.55) * 3) / 4
    for i, (t, sous, cc) in enumerate(etapes):
        x = Inches(0.55) + i * (cw + Inches(0.55))
        box(s, x, Inches(1.45), cw, Inches(1.55), WH, cc, lw=1.25)
        box(s, x, Inches(1.45), cw, Inches(0.10), cc, radius=False)
        text(s, x, Inches(1.70), cw, Inches(0.34), t, 15, N, True, SANS_F, PP_ALIGN.CENTER)
        text(s, x + Inches(0.2), Inches(2.10), cw - Inches(0.4), Inches(0.8), sous, 10, GR, False, SANS_F, PP_ALIGN.CENTER, spacing=0.95)
        if i < 3:
            fleche(s, x + cw + Inches(0.08), Inches(2.05), Inches(0.4), Inches(0.35), G)
    # catalogue
    docs_ = [
        ("Facture", "PDF", E, "numérotation auto, mentions légales"),
        ("Devis de travaux", "PDF", E, "postes de dépense, total, validité"),
        ("Quittance de loyer", "PDF + QR", G, "mois, montant en toutes lettres, QR"),
        ("Reçu de paiement", "PDF", G, "horodaté, méthode de paiement"),
        ("Rapport mensuel", "PDF", O, "synthèse par immeuble — diaspora"),
        ("Rapport détaillé", "Word", O, "modifiable, pour courrier & archive"),
        ("Export comptable", "Excel", N2, "lignes brutes de la période"),
    ]
    text(s, Inches(0.55), Inches(3.35), Inches(6), Inches(0.32), "Catalogue", 15, N, True, SERIF_F)
    cw2 = (SW - Inches(1.1) - Inches(0.25) * 3) / 4
    for i, (nom, fmt, cc, desc) in enumerate(docs_):
        col = i % 4
        line = i // 4
        x = Inches(0.55) + col * (cw2 + Inches(0.25))
        y = Inches(3.85) + line * Inches(1.05)
        box(s, x, y, cw2, Inches(0.92), WH, GRL, lw=0.75)
        box(s, x + cw2 - Inches(0.95), y + Inches(0.10), Inches(0.82), Inches(0.28), cc)
        text(s, x + cw2 - Inches(0.95), y + Inches(0.13), Inches(0.82), Inches(0.24), fmt, 9, WH, True, SANS_F, PP_ALIGN.CENTER)
        text(s, x + Inches(0.15), y + Inches(0.13), cw2 - Inches(1.1), Inches(0.28), nom, 11.5, N, True)
        text(s, x + Inches(0.15), y + Inches(0.46), cw2 - Inches(0.3), Inches(0.4), desc, 9, GR, spacing=0.9)
    box(s, Inches(0.55), Inches(6.1), SW - Inches(1.1), Inches(1.05), N)
    text(s, Inches(0.8), Inches(6.24), SW - Inches(1.6), Inches(0.3), "Pourquoi pas de JavaScript côté client ?", 12.5, G, True)
    text(s, Inches(0.8), Inches(6.55), SW - Inches(1.6), Inches(0.5),
         "Générer un PDF dans le navigateur impose une bibliothèque lourde et un rendu variable. Ici, c'est Python (reportlab) qui imprime : même mise en page partout, QR Code et montant en toutes lettres.",
         10.5, WH, spacing=0.95)

    # ------------------------------------------------------------------
    # S9 — paiements
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "08", "Paiements mobile money", "Wave · Orange Money · Free Money — et les espèces")
    flux = [
        ("Locataire", "depuis son portail", W2),
        ("Moyen choisi", "Wave · OM · Free · espèces", E),
        ("Backend", "ordre de paiement", G),
        ("Confirmation", "webhook ou vérification", O),
        ("Quittance", "loyer à jour + PDF", E),
    ]
    cw = (SW - Inches(1.1) - Inches(0.28) * 4) / 5
    for i, (t, sous, cc) in enumerate(flux):
        x = Inches(0.55) + i * (cw + Inches(0.28))
        box(s, x, Inches(1.4), cw, Inches(1.1), WH, cc, lw=1.1)
        box(s, x, Inches(1.4), cw, Inches(0.09), cc, radius=False)
        text(s, x, Inches(1.60), cw, Inches(0.3), t, 12.5, N, True, SANS_F, PP_ALIGN.CENTER)
        text(s, x + Inches(0.1), Inches(1.92), cw - Inches(0.2), Inches(0.5), sous, 9, GR, False, SANS_F, PP_ALIGN.CENTER, spacing=0.9)
        if i < 4:
            fleche(s, x + cw + Inches(0.02), Inches(1.78), Inches(0.24), Inches(0.3), GRL)
    # etats
    for i, (t, formule, cc, desc) in enumerate([
        ("payé", "montant_paye = montant", E, "quittance émise, plus rien à réclamer"),
        ("partiel", "0 < payé < montant", G, "solde restant affiché en orange"),
        ("impayé", "échéance passée", RD, "dans la file de relance WhatsApp"),
    ]):
        x = Inches(0.55) + i * ((SW - Inches(1.1)) / 3 + Inches(0.0))
        w = (SW - Inches(1.1)) / 3 - Inches(0.2)
        box(s, x, Inches(2.9), w, Inches(1.15), WH, cc, lw=1.0)
        text(s, x + Inches(0.2), Inches(3.02), w - Inches(0.4), Inches(0.3), t, 13, cc, True)
        text(s, x + Inches(0.2), Inches(3.32), w - Inches(0.4), Inches(0.26), formule, 9.5, GR, False, "Consolas")
        text(s, x + Inches(0.2), Inches(3.60), w - Inches(0.4), Inches(0.4), desc, 10, N, spacing=0.95)
    # relance (gauche)
    box(s, Inches(0.55), Inches(4.35), Inches(5.2), Inches(1.5), WH, E, lw=1.1)
    text(s, Inches(0.8), Inches(4.5), Inches(4.7), Inches(0.3), "Relance WhatsApp en un clic", 14, N, True)
    text(s, Inches(0.8), Inches(4.85), Inches(4.7), Inches(0.6),
         "Message poli et personnalisé, ouvert dans WhatsApp (wa.me) avec le numéro pré-rempli : « Bonjour Aminata, votre loyer de 250 000 F arrive à échéance… »",
         10.5, GR, spacing=0.95)
    box(s, Inches(0.8), Inches(5.45), Inches(1.6), Inches(0.32), E)
    text(s, Inches(0.8), Inches(5.49), Inches(1.6), Inches(0.26), "wa.me/221…", 10, WH, True, SANS_F, PP_ALIGN.CENTER)
    # capture (centre-droit)
    capture(s, CAP["paiements"], Inches(6.1), Inches(4.35), Inches(3.4), legende="Paiements — encaissé, en attente, impayés")
    # encart « aucun doublon » (droite)
    box(s, Inches(9.75), Inches(4.35), Inches(3.0), Inches(2.45), N)
    text(s, Inches(9.95), Inches(4.5), Inches(2.6), Inches(0.3), "Aucun doublon possible", 12, G, True)
    text(s, Inches(9.95), Inches(4.85), Inches(2.6), Inches(1.8),
         "Un paiement confirmé met le loyer à jour ET édite la quittance dans la même opération ; les statuts payé / partiel / impayé sont calculés, jamais saisis.",
         10.5, WH, spacing=0.95)

    # ------------------------------------------------------------------
    # S10 — finances
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "09", "Finances", "charges communes réparties · chantiers suivis")
    capture(s, CAP["finances"], Inches(0.55), Inches(1.35), Inches(6.3), legende="Finances — charges communes, éligibles, travaux")
    x = Inches(7.25)
    w = SW - Inches(0.55) - x
    text(s, x, Inches(1.4), w, Inches(0.32), "Principe de répartition", 15, N, True, SERIF_F)
    box(s, x, Inches(1.85), w, Inches(0.8), WH, G, lw=1.0)
    text(s, x, Inches(1.98), w, Inches(0.3), "Facture commune", 12.5, N, True, SANS_F, PP_ALIGN.CENTER)
    text(s, x, Inches(2.28), w, Inches(0.3), "électricité du couloir — 48 000 F", 10, GR, False, SANS_F, PP_ALIGN.CENTER)
    a = s.shapes.add_shape(MSO_SHAPE.DOWN_ARROW, x + w / 2 - Inches(0.14), Inches(2.7), Inches(0.28), Inches(0.4))
    a.fill.solid(); a.fill.fore_color.rgb = G; a.line.fill.background(); a.shadow.inherit = False
    for i in range(4):
        occ = i < 3
        box(s, x, Inches(3.2 + i * 0.55), w, Inches(0.45), WH if occ else OW, E if occ else GRL, lw=0.9)
        text(s, x + Inches(0.15), Inches(3.28 + i * 0.55), w - Inches(0.3), Inches(0.3),
             ("occupé → 16 000 F" if occ else "vacant → 0 F"), 10.5, E if occ else GR, True)
    text(s, x, Inches(5.55), w, Inches(1.2),
         "Seuls les appartements OCCUPÉS participent. Une photo du compteur peut justifier la facture.\n\nTravaux : kanban à faire → en cours → terminé, avec coût et dates.",
         10, GR, spacing=0.95)
    box(s, Inches(0.55), Inches(6.35), SW - Inches(1.1), Inches(0.8), N)
    for i, (v, lab, cc) in enumerate([("46 538 F", "charges communes", G), ("3 / 4", "appartements éligibles", E), ("189 061 F", "travaux suivis", O)]):
        x2 = Inches(0.8) + i * Inches(4.2)
        text(s, x2, Inches(6.45), Inches(2.2), Inches(0.36), v, 18, cc, True, SERIF_F)
        text(s, x2 + Inches(2.0), Inches(6.55), Inches(2.1), Inches(0.3), lab, 10.5, GRL)

    # ------------------------------------------------------------------
    # S11 — tarifs
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "10", "Tarification", "un prix clair, aucune commission")
    capture(s, CAP["tarifs"], Inches(0.55), Inches(1.4), Inches(6.2), legende="Page tarifs — la formule unique, sans surprise")
    x = Inches(7.6)
    w = SW - Inches(0.55) - x
    box(s, x, Inches(1.4), w, Inches(4.3), WH, G, lw=1.5)
    text(s, x, Inches(1.7), w, Inches(0.5), "10 000 F CFA", 34, N, True, SERIF_F, PP_ALIGN.CENTER)
    text(s, x, Inches(2.25), w, Inches(0.3), "par mois · par immeuble", 13, GR, False, SANS_F, PP_ALIGN.CENTER)
    box(s, x + w / 2 - Inches(1.1), Inches(2.7), Inches(2.2), Inches(0.45), E)
    text(s, x, Inches(2.78), w, Inches(0.3), "0 % DE COMMISSION", 13, WH, True, SANS_F, PP_ALIGN.CENTER)
    yy = Inches(3.45)
    for t in ["Aucun prélèvement sur les loyers encaissés", "Appartements et locataires illimités", "Relances WhatsApp + quittances PDF", "Portail propriétaire et rapports", "Changement de formule à tout moment"]:
        text(s, x + Inches(0.4), yy, w - Inches(0.7), Inches(0.34), "✓  " + t, 11.5, N, True)
        yy += Inches(0.42)
    box(s, Inches(0.55), Inches(6.35), SW - Inches(1.1), Inches(0.8), N)
    text(s, Inches(0.8), Inches(6.48), SW - Inches(1.6), Inches(0.3), "Le positionnement", 12, G, True)
    text(s, Inches(0.8), Inches(6.78), SW - Inches(1.6), Inches(0.3),
         "Moins cher qu'un cahier retrouvé, qu'une heure perdue en relance ou qu'un impayé découvert trois mois plus tard.",
         10.5, WH)

    # ------------------------------------------------------------------
    # S12 — sécurité & déploiement
    # ------------------------------------------------------------------
    s = slide()
    entete_slide(s, "11", "Sécurité & déploiement", "ce qui protège les données, et comment tout est mis en ligne")
    sec = [
        ("Rôles verrouillés", "Le middleware bloque toute route protégée sans session valide ; chaque page recalcule les droits de l'utilisateur.", E),
        ("Données cloisonnées", "Mode Supabase : Row Level Security activée sur les 12 tables, politiques distinctes par rôle.", G),
        ("Documents privés", "CNI, contrats et logos dans un bucket privé ; accès par lien signé à durée limitée.", O),
        ("Identité protégée", "Mots de passe hachés et salés ; en mode réel, authentification gérée par Supabase Auth.", N),
    ]
    cw = (SW - Inches(1.1) - Inches(0.3)) / 2
    for i, (t, d, cc) in enumerate(sec):
        col = i % 2
        line = i // 2
        x = Inches(0.55) + col * (cw + Inches(0.3))
        y = Inches(1.4) + line * Inches(1.35)
        box(s, x, y, cw, Inches(1.15), WH, GRL, lw=0.75)
        box(s, x, y, Inches(0.08), Inches(1.15), cc, radius=False)
        text(s, x + Inches(0.3), y + Inches(0.14), cw - Inches(0.5), Inches(0.3), t, 13.5, N, True)
        text(s, x + Inches(0.3), y + Inches(0.46), cw - Inches(0.5), Inches(0.6), d, 10.5, GR, spacing=0.95)
    # deploiement
    text(s, Inches(0.55), Inches(4.35), Inches(8), Inches(0.34), "Déploiement continu — GitHub + Render", 15, N, True, SERIF_F)
    flow = [("git push", "branche master", WH), ("GitHub", "code source (public)", WH), ("Render", "2 services : API Python + Web Node", WH), ("Live", SITE.replace("https://", ""), E)]
    for i, (t, sub, cc) in enumerate(flow):
        x = Inches(0.55) + i * ((SW - Inches(1.1)) / 4)
        w = (SW - Inches(1.1)) / 4 - Inches(0.35)
        box(s, x, Inches(4.85), w, Inches(1.0), N)
        text(s, x + Inches(0.2), Inches(4.98), w - Inches(0.4), Inches(0.3), t, 13, G if i else WH, True)
        text(s, x + Inches(0.2), Inches(5.28), w - Inches(0.4), Inches(0.5), sub, 9.5, cc, spacing=0.9)
        if i < 3:
            fleche(s, x + w + Inches(0.05), Inches(5.2), Inches(0.25), Inches(0.3), E)
    box(s, Inches(0.55), Inches(6.2), SW - Inches(1.1), Inches(0.95), OW, GRL, lw=0.75)
    text(s, Inches(0.8), Inches(6.32), SW - Inches(1.6), Inches(0.3), "À savoir sur le plan gratuit", 11.5, N, True)
    text(s, Inches(0.8), Inches(6.62), SW - Inches(1.6), Inches(0.4),
         "Veille après ~15 min d'inactivité (1er chargement ≈ 50 s) · disque éphémère : les documents sont regénérés à la demande · NEXT_PUBLIC_* figées au build, d'où un redeploy après changement d'environnement.",
         10, GR, spacing=0.95)

    # ------------------------------------------------------------------
    # S13 — merci
    # ------------------------------------------------------------------
    s = slide(N)
    box(s, 0, 0, SW, Inches(0.10), G, radius=False)
    box(s, 0, SH - Inches(0.10), SW, Inches(0.10), E, radius=False)
    text(s, 0, Inches(2.0), SW, Inches(0.7), "Merci", 44, WH, True, SERIF_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(2.85), SW, Inches(0.4), "« Fini le cahier. Tes loyers en un coup d'œil. »", 18, G, False, SERIF_F, PP_ALIGN.CENTER, italic=True)
    box(s, SW / 2 - Inches(3.6), Inches(3.7), Inches(7.2), Inches(1.5), W2, E, lw=0.9)
    text(s, 0, Inches(3.9), SW, Inches(0.3), "APPLICATION EN LIGNE", 11, E, True, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(4.25), SW, Inches(0.3), SITE, 13, WH, True, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(4.58), SW, Inches(0.3), API, 13, WH, True, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(4.90), SW, Inches(0.3), "prochaine étape : brancher Supabase pour du multi-utilisateurs réel", 10, GRL, False, SANS_F, PP_ALIGN.CENTER)
    text(s, 0, Inches(5.9), SW, Inches(0.3), "Sunu Keur · Gestion locative · Sénégal", 11, GR, False, SANS_F, PP_ALIGN.CENTER)

    prs.save(str(PPTX_OUT))
    print(f"PPTX -> {PPTX_OUT} ({PPTX_OUT.stat().st_size // 1024} Ko, {len(prs.slides)} diapositives)")


if __name__ == "__main__":
    generer_pdf()
    generer_pptx()
