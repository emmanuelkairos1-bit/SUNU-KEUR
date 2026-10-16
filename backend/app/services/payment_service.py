"""Paiements mobiles (Wave, Orange Money, Free Money) — vrais appels REST via httpx.

Si la clé API est un placeholder (`.env` de démo), aucun appel réseau n'est fait :
on renvoie une URL de paiement fonctionnelle côté front (mode démo assumé et loggé).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.supabase_client import SupabaseIndisponible, get_supabase

logger = logging.getLogger("sunukeur.paiements")

METHODES = {
    "wave": {
        "api_key": lambda: settings.WAVE_API_KEY,
        "api_url": lambda: settings.WAVE_API_URL,
        "merchant": lambda: settings.WAVE_MERCHANT_ID,
    },
    "orange_money": {
        "api_key": lambda: settings.ORANGE_MONEY_API_KEY,
        "api_url": lambda: settings.ORANGE_MONEY_API_URL,
        "merchant": lambda: settings.ORANGE_MONEY_MERCHANT_ID,
    },
    "free_money": {
        "api_key": lambda: settings.FREE_MONEY_API_KEY,
        "api_url": lambda: settings.FREE_MONEY_API_URL,
        "merchant": lambda: "FREE_MERCHANT",
    },
}


class PaymentErreur(RuntimeError):
    """Échec d'un appel à un opérateur de paiement ou donnée introuvable."""


def _num(valeur) -> float:
    try:
        return float(valeur or 0)
    except (TypeError, ValueError):
        return 0.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds")


def est_placeholder(cle: str | None) -> bool:
    """Vrai si la clé est absente ou marquée PLACEHOLDER (mode démo)."""
    return not cle or "PLACEHOLDER" in cle.upper()


def _url_demo(loyer_id: str, statut: str = "pending") -> str:
    return f"{settings.FRONTEND_URL}/paiements?loyer={loyer_id}&status={statut}&demo=1"


def _enregistrer_paiement(loyer_id: str | None, montant: float, methode: str,
                          paiement_id: str, reference: str) -> None:
    """Insère la ligne `paiements` (statut en_attente). Best-effort."""
    try:
        sb = get_supabase()
        sb.table("paiements").insert(
            {
                "id": paiement_id,
                "loyer_id": loyer_id,
                "montant": round(_num(montant), 2),
                "methode": methode,
                "reference": reference,
                "statut": "en_attente",
                "wave_payment_id": reference,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
        ).execute()
    except SupabaseIndisponible:
        logger.warning("Supabase non configuré : paiement %s non enregistré en base.", paiement_id)
    except Exception as exc:  # noqa: BLE001 — on ne bloque pas la création de session
        logger.warning("INSERT paiements impossible (%s) : %s", paiement_id, exc)


def _creer_session(methode: str, loyer_id: str | None, montant: float,
                   telephone: str, description: str) -> dict:
    """Crée une session de paiement (API réelle ou mode démo)."""
    cfg = METHODES[methode]
    api_key, api_url = cfg["api_key"](), cfg["api_url"]()
    paiement_id = str(uuid.uuid4())
    montant = round(_num(montant), 2)

    if est_placeholder(api_key):
        logger.info("mode démo %s (clé placeholder) — loyer=%s montant=%s", methode, loyer_id, montant)
        url = _url_demo(loyer_id or "inconnu")
        _enregistrer_paiement(loyer_id, montant, methode, paiement_id, f"demo_{methode}_{paiement_id[:8]}")
        return {
            "payment_url": url,
            "payment_id": paiement_id,
            "qr_data": url,
            "mode_demo": True,
            "methode": methode,
            "montant": montant,
        }

    payload = {
        "money": {"amount": int(round(montant)), "currency": "XOF"},
        "customer": {"phone_number": telephone},
        "description": description,
        "reference": paiement_id,
        "merchant_id": cfg["merchant"](),
        "success_url": _url_demo(loyer_id or "inconnu", "success"),
        "fail_url": _url_demo(loyer_id or "inconnu", "failed"),
        "cancel_url": _url_demo(loyer_id or "inconnu", "cancelled"),
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    url_carte = f"{api_url}/checkout/sessions" if "orange" not in methode else api_url

    try:
        resp = httpx.post(url_carte, headers=headers, json=payload, timeout=20.0)
        resp.raise_for_status()
        donnees = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Appel %s en échec : %s", methode, exc)
        raise PaymentErreur(f"Opérateur {methode} injoignable : {exc}") from exc
    except ValueError as exc:
        raise PaymentErreur(f"Réponse illisible du service {methode}") from exc

    payment_ext = str(donnees.get("id") or donnees.get("payment_id") or donnees.get("reference") or paiement_id)
    payment_url = str(
        donnees.get("payment_url") or donnees.get("url") or donnees.get("checkout_url")
        or _url_demo(loyer_id or "inconnu")
    )
    _enregistrer_paiement(loyer_id, montant, methode, paiement_id, payment_ext)
    logger.info("Session %s créée : %s", methode, payment_ext)
    return {
        "payment_url": payment_url,
        "payment_id": paiement_id,
        "qr_data": payment_url,
        "mode_demo": False,
        "methode": methode,
        "montant": montant,
    }


def creer_paiement_wave(loyer_id: str, montant: float, telephone: str, description: str) -> dict:
    """Session Wave (POST {WAVE_API_URL}/checkout/sessions ou mode démo)."""
    return _creer_session("wave", loyer_id, montant, telephone, description)


def creer_paiement_orange_money(loyer_id: str, montant: float, telephone: str, description: str) -> dict:
    """Session Orange Money (idem, endpoint OM ou mode démo)."""
    return _creer_session("orange_money", loyer_id, montant, telephone, description)


def creer_paiement_free_money(loyer_id: str, montant: float, telephone: str, description: str) -> dict:
    """Session Free Money (idem)."""
    return _creer_session("free_money", loyer_id, montant, telephone, description)


def confirmer_paiement(paiement_id: str) -> dict:
    """Confirme un paiement : maj `paiements`, `loyers` (montant_paye/statut) + journal `activites`."""
    try:
        sb = get_supabase()
    except SupabaseIndisponible as exc:
        raise PaymentErreur(str(exc)) from exc

    res = (
        sb.table("paiements")
        .select("*")
        .or_(f"id.eq.{paiement_id},wave_payment_id.eq.{paiement_id}")
        .execute()
    )
    lignes = res.data or []
    if not lignes:
        raise PaymentErreur(f"Paiement introuvable : {paiement_id}")
    paiement = lignes[0]

    if paiement.get("statut") == "confirme":
        return {"ok": True, "deja_confirme": True, "paiement_id": paiement["id"], "loyer_id": paiement.get("loyer_id")}

    montant = _num(paiement.get("montant"))
    sb.table("paiements").update({"statut": "confirme", "updated_at": _now_iso()}).eq(
        "id", paiement["id"]
    ).execute()

    loyer_id = paiement.get("loyer_id")
    statut_loyer = None
    if loyer_id:
        res_loyer = sb.table("loyers").select("*").eq("id", loyer_id).execute()
        loyer = (res_loyer.data or [None])[0]
        if loyer:
            paye = _num(loyer.get("montant_paye")) + montant
            du = _num(loyer.get("montant"))
            statut_loyer = "paye" if paye + 0.009 >= du else "partiel"
            sb.table("loyers").update(
                {"montant_paye": round(paye, 2), "statut": statut_loyer, "updated_at": _now_iso()}
            ).eq("id", loyer_id).execute()
            _journaliser(sb, loyer, montant, paiement.get("methode") or "wave")

    logger.info("Paiement %s confirmé (%s FCFA) — loyer %s : %s", paiement_id, montant, loyer_id, statut_loyer)
    return {
        "ok": True,
        "paiement_id": paiement["id"],
        "loyer_id": loyer_id,
        "montant": montant,
        "statut_loyer": statut_loyer,
    }


def _journaliser(sb, loyer: dict, montant: float, methode: str) -> None:
    """Écrit une ligne dans `activites` (journal). Best-effort."""
    try:
        immeuble_id = None
        res_app = sb.table("appartements").select("id, immeuble_id, numero").eq(
            "id", loyer.get("appartement_id")
        ).execute()
        app = (res_app.data or [None])[0]
        if app:
            immeuble_id = app["immeuble_id"]
        sb.table("activites").insert(
            {
                "immeuble_id": immeuble_id,
                "type": "paiement",
                "message": (
                    f"Paiement de {montant:,.0f} FCFA confirmé via {methode} "
                    f"(appartement {app['numero'] if app else 'N/A'}, "
                    f"mois {str(loyer.get('mois'))[:10]})."
                ).replace(",", " "),
                "created_at": _now_iso(),
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001 — le journal ne doit pas faire échouer le paiement
        logger.warning("Journal activites non écrit : %s", exc)
