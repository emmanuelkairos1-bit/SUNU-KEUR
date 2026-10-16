# -*- coding: utf-8 -*-
"""Contrôle qualité du PowerPoint : formes hors diapo + chevauchements suspects."""
from pptx import Presentation
from pptx.util import Emu

PPTX = r"C:\dev\SUNU-KEUR\docs\SUNU-KEUR-Guide-Fonctionnement.pptx"


def pt(v):
    return Emu(v).pt if v is not None else 0.0


def controler():
    prs = Presentation(PPTX)
    W, H = pt(prs.slide_width), pt(prs.slide_height)
    print(f"diapositive {W:.0f} x {H:.0f} pt — {len(prs.slides)} diapos")
    problemes = []
    total = 0
    for num, slide in enumerate(prs.slides, 1):
        n = 0
        for shp in slide.shapes:
            n += 1
            x0, y0 = pt(shp.left), pt(shp.top)
            x1, y1 = x0 + pt(shp.width), y0 + pt(shp.height)
            if shp.shape_type is not None and str(shp.shape_type).startswith("AUTO_SHAPE") and pt(shp.width) > W:
                problemes.append(f"S{num:02d} FORME TROP LARGE w={pt(shp.width):.0f}")
            if x0 < -1 or y0 < -1 or x1 > W + 1 or y1 > H + 1:
                problemes.append(
                    f"S{num:02d} HORS DIAPO  x=[{x0:6.1f},{x1:6.1f}] y=[{y0:6.1f},{y1:6.1f}] « {shp.name[:34]} »"
                )
        total += n
        print(f"S{num:02d}  {n:3d} formes")
    print()
    if problemes:
        print(f"=== {len(problemes)} PROBLEMES ===")
        for p in problemes:
            print(" ", p)
    else:
        print("=== AUCUN PROBLEME PPTX ===")
    print(f"total {total} formes")
    return len(problemes)


if __name__ == "__main__":
    raise SystemExit(1 if controler() else 0)
