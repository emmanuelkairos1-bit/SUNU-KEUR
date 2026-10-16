# -*- coding: utf-8 -*-
"""Contrôle qualité du guide PDF : débordements hors marges + vides verticaux."""
import fitz  # pymupdf

PDF = r"C:\dev\SUNU-KEUR\docs\SUNU-KEUR-Guide-Fonctionnement.pdf"
ZONE = (34, 30, 561, 830)  # x0, y0 (haut), x1, y1 (bas) — zone sûre A4


def controler():
    doc = fitz.open(PDF)
    problemes = []
    for num, page in enumerate(doc, 1):
        largeur, hauteur = page.rect.width, page.rect.height
        # --- texte ---
        for bloc in page.get_text("dict")["blocks"]:
            if bloc.get("type") != 0:
                continue
            for ligne in bloc["lines"]:
                for span in ligne["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    mot = span["text"].strip()
                    if not mot:
                        continue
                    if x0 < ZONE[0] or x1 > ZONE[2]:
                        problemes.append(
                            f"p{num:02d} TEXTE HORS MARGE x=[{x0:6.1f},{x1:6.1f}] « {mot[:44]} »"
                        )
                    if y0 < 8 or y1 > 838:
                        problemes.append(
                            f"p{num:02d} TEXTE HAUT/BAS  y=[{y0:6.1f},{y1:6.1f}] « {mot[:44]} »"
                        )
        # --- dessins ---
        for dessin in page.get_drawings():
            r = dessin["rect"]
            plein_cadre = r.x0 <= 1 and r.x1 >= 594  # bandeau d'en-tête / couverture : voulu
            if plein_cadre:
                continue
            if r.x0 < 30 or r.x1 > 565 or r.y0 < 4 or r.y1 > 838:
                problemes.append(
                    f"p{num:02d} DESSIN HORS MARGE x=[{r.x0:6.1f},{r.x1:6.1f}] y=[{r.y0:6.1f},{r.y1:6.1f}]"
                )
        # --- remplissage vertical : derniers y du contenu ---
        ys = []
        for bloc in page.get_text("dict")["blocks"]:
            if bloc.get("type") == 0:
                ys.append(bloc["bbox"][3])
        for dessin in page.get_drawings():
            ys.append(dessin["rect"].y1)
        bas = max((y for y in ys if y < 830), default=0)
        vide_bas = 800 - bas  # espace libre sous le contenu (hors pied de page ~40)
        if vide_bas > 150:
            problemes.append(f"p{num:02d} VIDE EN BAS      contenu jusqu'à y={bas:.0f} ({vide_bas:.0f} pt libres)")
        print(f"p{num:02d}  contenu jusqu'à y={bas:6.1f}  vide bas={max(0, vide_bas):5.1f} pt")
    print()
    if problemes:
        print(f"=== {len(problemes)} PROBLEMES ===")
        for p in problemes:
            print(" ", p)
    else:
        print("=== AUCUN PROBLEME DE GEOMETRIE ===")
    return len(problemes)


if __name__ == "__main__":
    raise SystemExit(1 if controler() else 0)
