"""Routes de paiement mobile : Wave, Orange Money, Free Money."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.payment_service import (
    PaymentErreur,
    confirmer_paiement,
    creer_paiement_free_money,
    creer_paiement_orange_money,
    creer_paiement_wave,
)
from app.supabase_client import SupabaseIndisponible, get_supabase

logger = logging.getLogger("sunukeur.payments")
router = APIRouter(prefix="/api/pay", tags=["paiements"])


class PaiementIn(BaseModel):
    loyer_id: str
    montant: float = Field(gt=0, description="Montant en FCFA")
    telephone: str = Field(min_length=8, description="Numéro Mobile Money du locataire")
    description: str = "Paiement de loyer SUNU KEUR"


def _lancer(fonction, payload: PaiementIn) -> dict:
    try:
        return fonction(payload.loyer_id, payload.montant, payload.telephone, payload.description)
    except PaymentErreur as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/wave")
def payer_wave(payload: PaiementIn) -> dict:
    """Crée une session Wave → {payment_url, payment_id, qr_data}."""
    return _lancer(creer_paiement_wave, payload)


@router.post("/orange_money")
def payer_orange_money(payload: PaiementIn) -> dict:
    """Crée une session Orange Money → {payment_url, payment_id, qr_data}."""
    return _lancer(creer_paiement_orange_money, payload)


@router.post("/free_money")
def payer_free_money(payload: PaiementIn) -> dict:
    """Crée une session Free Money → {payment_url, payment_id, qr_data}."""
    return _lancer(creer_paiement_free_money, payload)


@router.get("/status/{payment_id}")
def statut_paiement(payment_id: str) -> dict:
    """Statut d'un paiement (interroge la table `paiements`)."""
    try:
        sb = get_supabase()
    except SupabaseIndisponible as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        res = sb.table("paiements").select("*").or_(
            f"id.eq.{payment_id},wave_payment_id.eq.{payment_id}"
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Supabase : {exc}") from exc
    lignes = res.data or []
    if not lignes:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    p = lignes[0]
    return {
        "payment_id": p.get("id"),
        "statut": p.get("statut"),
        "montant": p.get("montant"),
        "methode": p.get("methode"),
        "loyer_id": p.get("loyer_id"),
        "reference": p.get("reference"),
        "cree_le": p.get("created_at"),
        "mis_a_jour_le": p.get("updated_at"),
    }
