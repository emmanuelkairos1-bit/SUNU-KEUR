"""Webhooks de confirmation des opérateurs de paiement (Wave, Orange Money)."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Request

from app.config import settings
from app.services.payment_service import PaymentErreur, confirmer_paiement, est_placeholder

logger = logging.getLogger("sunukeur.webhook")
router = APIRouter(prefix="/api/webhook", tags=["webhooks"])

CLE_IDS = ("payment_id", "id", "reference", "wave_payment_id", "session_id")


def _extraire_payment_id(corps: dict, profondeur: int = 0) -> str | None:
    """Cherche récursivement l'identifiant de paiement dans le corps du webhook."""
    if not isinstance(corps, dict) or profondeur > 3:
        return None
    for cle in CLE_IDS:
        valeur = corps.get(cle)
        if isinstance(valeur, str) and valeur:
            return valeur
    for valeur in corps.values():
        if isinstance(valeur, dict):
            trouve = _extraire_payment_id(valeur, profondeur + 1)
            if trouve:
                return trouve
    return None


def _signature_valide(corps_brut: bytes, signature: str | None, secret: str) -> bool:
    """Vérifie la signature HMAC-SHA256 du corps (format commun aux opérateurs)."""
    if not signature:
        return False
    attendu = hmac.new(secret.encode("utf-8"), corps_brut, hashlib.sha256).hexdigest()
    return hmac.compare_digest(attendu, signature.strip().lower())


async def _traiter_webhook(request: Request, secret: str, source: str, entete_sig: str) -> dict:
    corps_brut = await request.body()
    try:
        corps = json.loads(corps_brut or b"{}")
    except json.JSONDecodeError:
        corps = {}

    signature = request.headers.get(entete_sig) or request.headers.get("x-signature")
    if not est_placeholder(secret):
        if not _signature_valide(corps_brut, signature, secret):
            logger.warning("Webhook %s rejeté : signature invalide.", source)
            raise HTTPException(status_code=401, detail="Signature invalide")
    else:
        logger.info("webhook %s reçu (mode démo, signature non vérifiée)", source)

    payment_id = _extraire_payment_id(corps if isinstance(corps, dict) else {})
    if not payment_id:
        raise HTTPException(status_code=400, detail="Identifiant de paiement manquant dans le corps")

    try:
        resultat = confirmer_paiement(payment_id)
    except PaymentErreur as exc:
        logger.warning("Webhook %s : confirmation impossible (%s)", source, exc)
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    logger.info("Webhook %s : paiement %s confirmé.", source, payment_id)
    return {"ok": True, "source": source, "payment_id": payment_id, **resultat}


@router.post("/wave")
async def webhook_wave(request: Request) -> dict:
    """POST /api/webhook/wave — confirmation d'un paiement Wave."""
    return await _traiter_webhook(request, settings.WAVE_WEBHOOK_SECRET, "wave", "x-wave-signature")


@router.post("/orange_money")
async def webhook_orange_money(request: Request) -> dict:
    """POST /api/webhook/orange_money — confirmation d'un paiement Orange Money."""
    return await _traiter_webhook(request, settings.ORANGE_WEBHOOK_SECRET, "orange_money", "x-orange-signature")


@router.post("/free_money")
async def webhook_free_money(request: Request) -> dict:
    """POST /api/webhook/free_money — confirmation d'un paiement Free Money."""
    return await _traiter_webhook(request, settings.FREE_WEBHOOK_SECRET, "free_money", "x-free-signature")
