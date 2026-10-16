"""SUNU KEUR — Backend FastAPI : documents réels (PDF/Word/Excel) & paiements mobiles.

Lancement : `python main.py` (ou `uvicorn main:app --reload`).
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import GENERATED_DIR, settings
from app.routers import generate, payments, webhook

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("sunukeur")

# Dossier des fichiers générés (PDF/DOCX/XLSX) — doit exister avant le mount
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="SUNU KEUR API",
    version="1.0.0",
    description="Fini le cahier. Génération de documents réels et paiements mobiles pour la gestion locative au Sénégal.",
)

_origins = list(dict.fromkeys(
    [settings.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"]
))
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Render peut suffixer le nom du service (sunu-keur-web-xxxx.onrender.com)
    # si le nom souhaité est déjà pris : on accepte tout sous-domaine
    # *.onrender.com pour que le CORS reste valide quelle que soit l'URL réelle.
    allow_origin_regex=r"https://[a-z0-9-]+\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router)
app.include_router(payments.router)
app.include_router(webhook.router)


@app.get("/api/health")
def health() -> dict:
    """Santé du service."""
    return {"status": "ok", "service": "sunu-keur-backend"}


app.mount("/files", StaticFiles(directory=str(GENERATED_DIR)), name="files")


if __name__ == "__main__":
    import os

    import uvicorn

    # Render (et la plupart des PaaS) injecte le port d'écoute dans $PORT.
    # On le respecte, avec repli sur 8000 pour le lancement local.
    port = int(os.environ.get("PORT") or 8000)
    uvicorn.run(app, host="0.0.0.0", port=port)
