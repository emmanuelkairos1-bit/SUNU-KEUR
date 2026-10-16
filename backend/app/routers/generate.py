"""Routes de génération de documents réels (PDF / Word / Excel).

Les données sont lues dans Supabase (service key) puis rendues par
`app.services.document_service` (reportlab / python-docx / openpyxl).
Les fichiers sont écrits dans backend/generated/ et servis sur /files/{nom}.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import GENERATED_DIR, settings
from app.logo import MARQUE
from app.services import document_service as docs
from app.supabase_client import SupabaseIndisponible, get_supabase

logger = logging.getLogger("sunukeur.generate")
router = APIRouter(prefix="/api/generate", tags=["generation"])


# --------------------------------------------------------------------------- #
#  Modèles de requête
# --------------------------------------------------------------------------- #


class LigneDoc(BaseModel):
    description: str
    quantite: float = 1
    prix_unitaire: float = 0


class FactureIn(BaseModel):
    immeuble_id: str | None = None
    appartement_id: str | None = None
    locataire_id: str | None = None
    montant: float | None = None
    description: str = "Loyer mensuel"
    lignes: list[LigneDoc] | None = None
    note: str | None = None


class DevisIn(BaseModel):
    titre: str = "Prestation de travaux"
    client_nom: str = "Client"
    client_adresse: str | None = None
    client_ville: str | None = None
    client_telephone: str | None = None
    immeuble_id: str | None = None
    lignes: list[LigneDoc] = Field(default_factory=list)
    duree: str | None = None
    validite: str = "30 jours"
    tva: float = 0
    mentions: list[str] | None = None


class QuittancesIn(BaseModel):
    immeuble_id: str | None = None
    mois: str  # "AAAA-MM" ou "AAAA-MM-JJ"
    # Mode local : le front fournit les quittances déjà assemblées (pas de Supabase).
    donnees: dict | None = None


class RapportIn(BaseModel):
    immeuble_id: str | None = None
    debut: str  # "AAAA-MM-JJ"
    fin: str
    # Mode local : lignes brutes déjà chargées par le front (immeuble, apps,
    # locataires, loyers, charges, travaux) → le backend calcule les KPIs.
    donnees: dict | None = None


class RecuIn(BaseModel):
    loyer_id: str | None = None
    paiement_id: str | None = None
    # Mode local : données du reçu fournies directement par le front.
    donnees: dict | None = None


# --------------------------------------------------------------------------- #
#  Helpers Supabase / fichiers
# --------------------------------------------------------------------------- #


def _n(valeur: Any) -> float:
    return docs._num(valeur)  # noqa: SLF008 — partage de l'utilitaire du service


def _sb():
    """Client Supabase, ou 503 si non configuré."""
    try:
        return get_supabase()
    except SupabaseIndisponible as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _un(sb, table: str, identifiant: str, message: str) -> dict:
    """Renvoie une ligne par id, ou 404."""
    try:
        res = sb.table(table).select("*").eq("id", identifiant).execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Supabase ({table}) : {exc}") from exc
    if not res.data:
        raise HTTPException(status_code=404, detail=message)
    return res.data[0]


def _enregistrer_fichier(contenu: bytes, nom: str) -> str:
    """Écrit le fichier dans generated/ et renvoie son URL publique absolue."""
    try:
        GENERATED_DIR.mkdir(parents=True, exist_ok=True)
        (GENERATED_DIR / nom).write_bytes(contenu)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Écriture du fichier impossible : {exc}") from exc
    return f"{settings.BASE_URL}/files/{nom}"


def _slug(texte: str) -> str:
    s = re.sub(r"[^A-Za-z0-9À-ÿ]+", "-", str(texte or "")).strip("-").lower()
    return s or "document"


def _parse_date(valeur: str, champ: str) -> date:
    try:
        return datetime.fromisoformat(str(valeur)[:10]).date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Date invalide pour « {champ} » (format AAAA-MM-JJ)") from exc


def _parse_mois(valeur: str) -> date:
    v = str(valeur or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})$", v)
    if m:
        return date(int(m.group(1)), int(m.group(2)), 1)
    return _parse_date(v, "mois").replace(day=1)


def _mois_suivant(d: date) -> date:
    return date(d.year + (1 if d.month == 12 else 0), 1 if d.month == 12 else d.month + 1, 1)


def _dernier_numero(sb, prefixe: str, annee: int, type_doc: str | None = None) -> int:
    """Dernier numéro utilisé pour un préfixe (Supabase + fichiers déjà générés)."""
    dernier = 0
    if sb is not None:
        try:
            requete = sb.table("factures").select("numero").like("numero", f"{prefixe}-{annee}-%")
            if type_doc:
                requete = requete.eq("type", type_doc)
            for ligne in requete.execute().data or []:
                try:
                    dernier = max(dernier, int(str(ligne.get("numero") or "").rsplit("-", 1)[-1]))
                except ValueError:
                    continue
        except Exception as exc:  # noqa: BLE001 — repli sur le compteur local
            logger.warning("Compteur %s-%s indisponible : %s", prefixe, annee, exc)
    for fichier in GENERATED_DIR.glob(f"{prefixe}-{annee}-*.pdf"):
        try:
            dernier = max(dernier, int(fichier.stem.rsplit("-", 1)[-1]))
        except ValueError:
            continue
    return dernier


def _numero_suivant(sb, prefixe: str, annee: int, type_doc: str | None = None) -> str:
    return f"{prefixe}-{annee}-{_dernier_numero(sb, prefixe, annee, type_doc) + 1:03d}"


def _appartements(sb, immeuble_id: str) -> list[dict]:
    try:
        res = sb.table("appartements").select("*").eq("immeuble_id", immeuble_id).order("numero").execute()
        return res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture appartements impossible : %s", exc)
        return []


def _locataires_par_app(sb, app_ids: list[str]) -> dict[str, dict]:
    if not app_ids:
        return {}
    try:
        res = sb.table("locataires").select("*").in_("appartement_id", app_ids).eq("statut", "actif").execute()
        return {l["appartement_id"]: l for l in (res.data or []) if l.get("appartement_id")}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture locataires impossible : %s", exc)
        return {}


def _loyers_periode(sb, app_ids: list[str], debut: date, fin: date) -> list[dict]:
    if not app_ids:
        return []
    try:
        res = (
            sb.table("loyers").select("*")
            .in_("appartement_id", app_ids)
            .gte("mois", debut.isoformat()).lte("mois", fin.isoformat())
            .order("mois")
            .execute()
        )
        return res.data or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture loyers impossible : %s", exc)
        return []


def _depenses(sb, immeuble_id: str, debut: date, fin: date) -> list[dict]:
    """Charges communes + travaux de la période, triés par date."""
    out: list[dict] = []
    try:
        res = (
            sb.table("factures_communes").select("*").eq("immeuble_id", immeuble_id)
            .gte("date", debut.isoformat()).lte("date", fin.isoformat()).execute()
        )
        for f in res.data or []:
            out.append({
                "date": f.get("date"), "libelle": f.get("libelle"),
                "categorie": "Charges d'immeuble", "montant": _n(f.get("montant_total")),
            })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture factures_communes impossible : %s", exc)
    try:
        res = sb.table("travaux").select("*").eq("immeuble_id", immeuble_id).execute()
        for t in res.data or []:
            d = str(t.get("date_debut") or t.get("created_at") or "")[:10]
            if debut.isoformat() <= d <= fin.isoformat():
                out.append({
                    "date": d, "libelle": t.get("titre"),
                    "categorie": f"Travaux — {t.get('statut', '')}".strip(),
                    "montant": _n(t.get("cout")),
                })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture travaux impossible : %s", exc)
    out.sort(key=lambda x: str(x.get("date") or ""))
    return out


def _construire_rapport(immeuble: dict, apps: list[dict], locs: dict[str, dict],
                        loyers: list[dict], depenses: list[dict], debut: date, fin: date) -> dict:
    """Calcule KPIs / lignes / regroupement mensuel à partir de données déjà chargées."""
    lignes_loyers: list[dict] = []
    attendus = payes = 0.0
    for app in apps:
        ls = [l for l in loyers if l.get("appartement_id") == app["id"]]
        a = sum(_n(l.get("montant")) for l in ls)
        p = sum(_n(l.get("montant_paye")) for l in ls)
        attendus += a
        payes += p
        loc = locs.get(app["id"]) or {}
        if app.get("statut") == "vacant" and not ls:
            statut = "Vacant"
        elif a and p + 0.009 >= a:
            statut = "Soldé"
        elif p > 0:
            statut = "Partiel"
        else:
            statut = "Impayé"
        lignes_loyers.append({
            "appartement": app.get("numero", "—"), "type": app.get("type", ""),
            "locataire": loc.get("nom", "—"), "nb_mois": len(ls),
            "attendu": a, "paye": p, "statut": statut,
        })

    # Regroupement par mois pour le graphique
    par_mois_map: dict[str, list[float]] = {}
    for l in loyers:
        cle = str(l.get("mois") or "")[:7]
        cellule = par_mois_map.setdefault(cle, [0.0, 0.0])
        cellule[0] += _n(l.get("montant"))
        cellule[1] += _n(l.get("montant_paye"))
    par_mois = [
        (docs._mois_fr(k + "-01")[:6].rstrip() or k, v[0], v[1])  # « octobre » -> « octobre »
        for k, v in sorted(par_mois_map.items())
    ]

    total_depenses = sum(d["montant"] for d in depenses)
    nb_app = len(apps)
    nb_occ = sum(1 for a in apps if a.get("statut") == "occupe")
    impayes = max(attendus - payes, 0.0)
    kpis = {
        "loyers_attendus": round(attendus, 2),
        "loyers_percus": round(payes, 2),
        "impayes": round(impayes, 2),
        "depenses": round(total_depenses, 2),
        "net": round(payes - total_depenses, 2),
        "taux_recouvrement": (payes / attendus * 100) if attendus > 0 else 0.0,
        "taux_occupation": (nb_occ / nb_app * 100) if nb_app > 0 else 0.0,
        "nb_appartements": nb_app,
        "nb_occupes": nb_occ,
        "nb_loyers": len(loyers),
    }
    return {
        "immeuble": {
            "nom": immeuble.get("nom"), "adresse": immeuble.get("adresse"),
            "ville": immeuble.get("ville"), "id": immeuble.get("id"),
        },
        "debut": debut.isoformat(), "fin": fin.isoformat(),
        "kpis": kpis, "loyers": lignes_loyers, "depenses": depenses, "par_mois": par_mois,
    }


def _data_rapport(sb, immeuble_id: str, debut: date, fin: date) -> dict:
    """Construit toutes les données (KPIs, loyers par appartement, dépenses) d'un rapport."""
    immeuble = _un(sb, "immeubles", immeuble_id, "Immeuble introuvable")
    apps = _appartements(sb, immeuble_id)
    locs = _locataires_par_app(sb, [a["id"] for a in apps])
    loyers = _loyers_periode(sb, [a["id"] for a in apps], debut, fin)
    depenses = _depenses(sb, immeuble_id, debut, fin)
    return _construire_rapport(immeuble, apps, locs, loyers, depenses, debut, fin)


def _data_rapport_depuis_donnees(donnees: dict, debut: date, fin: date) -> dict:
    """Mode local : même calcul que _data_rapport mais à partir de lignes brutes
    déjà chargées par le front (le backend n'a pas accès à la base localStorage)."""
    immeuble = donnees.get("immeuble") or {}
    apps = donnees.get("appartements") or []
    loyers = [
        l for l in (donnees.get("loyers") or [])
        if debut.isoformat() <= str(l.get("mois") or "")[:10] <= fin.isoformat()
    ]
    depenses: list[dict] = []
    for f in donnees.get("factures_communes") or []:
        d = str(f.get("date") or "")[:10]
        if debut.isoformat() <= d <= fin.isoformat():
            depenses.append({
                "date": f.get("date"), "libelle": f.get("libelle"),
                "categorie": "Charges d'immeuble", "montant": _n(f.get("montant_total")),
            })
    for t in donnees.get("travaux") or []:
        d = str(t.get("date_debut") or t.get("created_at") or "")[:10]
        if debut.isoformat() <= d <= fin.isoformat():
            depenses.append({
                "date": d, "libelle": t.get("titre"),
                "categorie": f"Travaux — {t.get('statut', '')}".strip(),
                "montant": _n(t.get("cout")),
            })
    depenses.sort(key=lambda x: str(x.get("date") or ""))
    locs: dict[str, dict] = {
        l["appartement_id"]: l for l in (donnees.get("locataires") or []) if l.get("appartement_id")
    }
    return _construire_rapport(immeuble, apps, locs, loyers, depenses, debut, fin)


# --------------------------------------------------------------------------- #
#  Routes
# --------------------------------------------------------------------------- #


@router.post("/facture")
def generer_facture(payload: FactureIn) -> dict:
    """Facture PDF → {numero, pdf_url} (+ INSERT factures si Supabase répond)."""
    emetteur = {
        "nom": MARQUE, "adresse": "Dakar", "ville": "Sénégal",
        "telephone": "—", "email": "contact@sunukeur.sn",
    }
    destinataire = {"nom": "Client", "adresse": "", "ville": "", "telephone": "—"}
    sb = None
    if payload.immeuble_id or payload.appartement_id or payload.locataire_id:
        sb = _sb()

    immeuble_id = appartement_id = locataire_id = None
    if payload.immeuble_id:
        immeuble = _un(sb, "immeubles", payload.immeuble_id, "Immeuble introuvable")
        immeuble_id = immeuble["id"]
        gerant: dict = {}
        try:
            res = sb.table("users").select("nom, telephone, email, agence_nom").eq(
                "id", immeuble.get("gerant_id")
            ).execute()
            gerant = (res.data or [{}])[0] or {}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Profil gérant indisponible : %s", exc)
        emetteur = {
            "nom": gerant.get("agence_nom") or f"{MARQUE} — {gerant.get('nom', 'Gérant')}",
            "adresse": immeuble.get("adresse", ""),
            "ville": immeuble.get("ville", "Dakar"),
            "telephone": gerant.get("telephone") or "—",
            "email": gerant.get("email") or "—",
        }
    if payload.locataire_id:
        loc = _un(sb, "locataires", payload.locataire_id, "Locataire introuvable")
        locataire_id = loc["id"]
        appartement_id = loc.get("appartement_id")
        destinataire = {
            "nom": loc.get("nom", "Client"), "adresse": "", "ville": "",
            "telephone": loc.get("telephone") or "—",
        }
    elif payload.appartement_id:
        app = _un(sb, "appartements", payload.appartement_id, "Appartement introuvable")
        appartement_id = app["id"]
        immeuble_id = immeuble_id or app.get("immeuble_id")
        try:
            res = sb.table("locataires").select("*").eq("appartement_id", app["id"]).eq("statut", "actif").execute()
            loc = (res.data or [None])[0]
        except Exception:  # noqa: BLE001
            loc = None
        if loc:
            locataire_id = loc["id"]
            destinataire = {
                "nom": loc.get("nom", "Client"), "adresse": f"Appartement {app.get('numero', '')}",
                "ville": "", "telephone": loc.get("telephone") or "—",
            }

    lignes = [
        {"description": l.description, "quantite": l.quantite, "prix_unitaire": l.prix_unitaire}
        for l in (payload.lignes or [])
    ]
    if not lignes:
        montant = _n(payload.montant)
        lignes = [{"description": payload.description, "quantite": 1, "prix_unitaire": montant}]
    total = sum(_n(l["quantite"]) * _n(l["prix_unitaire"]) for l in lignes)

    numero = _numero_suivant(sb, "SK", date.today().year)
    nom_fichier = f"facture-{numero}.pdf"
    data = {
        "numero": numero, "date_emission": date.today().isoformat(),
        "emetteur": emetteur, "destinataire": destinataire,
        "lignes": lignes, "total": total, "note": payload.note,
        "qr_url": f"{settings.BASE_URL}/files/{nom_fichier}",
    }
    contenu = docs.generer_facture_pdf(data)
    url = _enregistrer_fichier(contenu, nom_fichier)

    if sb is not None:
        try:
            sb.table("factures").insert({
                "numero": numero, "immeuble_id": immeuble_id,
                "appartement_id": appartement_id, "locataire_id": locataire_id,
                "type": "facture", "montant": round(total, 2),
                "description": payload.description, "pdf_url": url,
                "statut": "emise", "date_emission": date.today().isoformat(),
            }).execute()
        except Exception as exc:  # noqa: BLE001 — le PDF reste valable
            logger.warning("INSERT facture %s impossible : %s", numero, exc)

    return {"numero": numero, "pdf_url": url, "montant": round(total, 2)}


@router.post("/devis")
def generer_devis(payload: DevisIn) -> dict:
    """Devis travaux PDF → {numero, pdf_url}."""
    sb = _sb() if payload.immeuble_id else None
    client = {
        "nom": payload.client_nom, "adresse": payload.client_adresse or "",
        "ville": payload.client_ville or "", "telephone": payload.client_telephone or "—",
    }
    if sb is not None and payload.immeuble_id:
        immeuble = _un(sb, "immeubles", payload.immeuble_id, "Immeuble introuvable")
        client.setdefault("ville", immeuble.get("ville") or "")

    lignes = [
        {"description": l.description, "quantite": l.quantite, "prix_unitaire": l.prix_unitaire}
        for l in payload.lignes
    ]
    if not lignes:
        raise HTTPException(status_code=400, detail="Au moins une ligne de devis est requise")
    total = sum(_n(l["quantite"]) * _n(l["prix_unitaire"]) for l in lignes)

    numero = _numero_suivant(sb, "DV", date.today().year, type_doc="devis")
    nom_fichier = f"devis-{numero}.pdf"
    data = {
        "numero": numero, "date": date.today().isoformat(), "titre": payload.titre,
        "client": client, "lignes": lignes, "total": total,
        "duree": payload.duree, "validite": payload.validite, "tva": payload.tva,
        "mentions": payload.mentions,
    }
    contenu = docs.generer_devis_pdf(data)
    url = _enregistrer_fichier(contenu, nom_fichier)

    if sb is not None and payload.immeuble_id:
        try:
            sb.table("factures").insert({
                "numero": numero, "immeuble_id": payload.immeuble_id,
                "type": "devis", "montant": round(total + total * _n(payload.tva) / 100, 2),
                "description": payload.titre, "pdf_url": url,
                "statut": "emis", "date_emission": date.today().isoformat(),
            }).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("INSERT devis %s impossible : %s", numero, exc)

    return {"numero": numero, "pdf_url": url, "total": round(total, 2)}


@router.post("/quittances")
def generer_quittances(payload: QuittancesIn) -> dict:
    """Une quittance PDF par appartement payé du mois → {count, pdf_urls}."""
    mois = _parse_mois(payload.mois)
    suivant = _mois_suivant(mois)
    annee = mois.year

    # Mode local : le front fournit les quittances déjà assemblées → pas de Supabase.
    if payload.donnees:
        immeuble = payload.donnees.get("immeuble") or {}
        lignes = payload.donnees.get("quittances") or []
        base = _dernier_numero(None, "SK-Q", annee, type_doc="quittance")
        urls: list[str] = []
        for i, q in enumerate(lignes, start=1):
            app = q.get("appartement") or {}
            numero = f"SK-Q-{annee}-{base + i:03d}"
            nom_fichier = f"quittance-{mois.isoformat()[:7]}-{_slug(app.get('numero', 'app'))}-{i:02d}.pdf"
            data = {
                "numero": numero, "mois": mois.isoformat(),
                "date": date.today().isoformat(),
                "locataire": q.get("locataire") or {"nom": "Locataire"},
                "appartement": app,
                "immeuble": {**immeuble, "gerant": MARQUE},
                "montant": _n(q.get("montant")),
                "methode": q.get("methode") or "Mobile Money",
                "qr_url": f"{settings.BASE_URL}/files/{nom_fichier}",
            }
            urls.append(_enregistrer_fichier(docs.generer_quittance_pdf(data), nom_fichier))
        return {"count": len(urls), "pdf_urls": urls, "mois": docs._mois_fr(mois.isoformat())}

    sb = _sb()
    immeuble = _un(sb, "immeubles", payload.immeuble_id, "Immeuble introuvable")

    apps = _appartements(sb, payload.immeuble_id)
    locs = _locataires_par_app(sb, [a["id"] for a in apps])
    loyers: list[dict] = []
    if apps:
        try:
            res = (
                sb.table("loyers").select("*")
                .in_("appartement_id", [a["id"] for a in apps])
                .gte("mois", mois.isoformat()).lt("mois", suivant.isoformat())
                .execute()
            )
            loyers = res.data or []
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Erreur Supabase (loyers) : {exc}") from exc

    payes = [
        l for l in loyers
        if l.get("statut") == "paye" or _n(l.get("montant_paye")) + 0.009 >= _n(l.get("montant"))
    ]
    par_app = {a["id"]: a for a in apps}
    base = _dernier_numero(sb, "SK-Q", annee, type_doc="quittance")

    urls: list[str] = []
    for i, loyer in enumerate(payes, start=1):
        app = par_app.get(loyer.get("appartement_id")) or {}
        loc = locs.get(loyer.get("appartement_id")) or {}
        numero = f"SK-Q-{annee}-{base + i:03d}"
        nom_fichier = f"quittance-{mois.isoformat()[:7]}-{_slug(app.get('numero', 'app'))}-{i:02d}.pdf"
        data = {
            "numero": numero, "mois": mois.isoformat(),
            "date": date.today().isoformat(),
            "locataire": {"nom": loc.get("nom", "Locataire"), "telephone": loc.get("telephone")},
            "appartement": {"numero": app.get("numero", "—"), "type": app.get("type", "")},
            "immeuble": {
                "nom": immeuble.get("nom"), "adresse": immeuble.get("adresse"),
                "ville": immeuble.get("ville"), "gerant": MARQUE,
            },
            "montant": _n(loyer.get("montant_paye")) or _n(loyer.get("montant")),
            "methode": "Mobile Money",
            "qr_url": f"{settings.BASE_URL}/files/{nom_fichier}",
        }
        url = _enregistrer_fichier(docs.generer_quittance_pdf(data), nom_fichier)
        urls.append(url)
        if sb is not None:
            try:
                sb.table("factures").insert({
                    "numero": numero, "immeuble_id": payload.immeuble_id,
                    "appartement_id": app.get("id"), "locataire_id": loc.get("id"),
                    "type": "quittance", "montant": data["montant"],
                    "description": f"Quittance de loyer — {docs._mois_fr(mois.isoformat())}",
                    "pdf_url": url, "statut": "emise",
                    "date_emission": date.today().isoformat(),
                }).execute()
            except Exception as exc:  # noqa: BLE001
                logger.warning("INSERT quittance %s impossible : %s", numero, exc)

    return {"count": len(urls), "pdf_urls": urls, "mois": docs._mois_fr(mois.isoformat())}


@router.post("/receipt")
def generer_recu(payload: RecuIn) -> dict:
    """Reçu / quittance de loyer pour un loyer précis → {pdf_url, numero}."""
    # Mode local : le front fournit toutes les données du reçu (Supabase
    # étant indisponible hors ligne, on ne touche pas à _sb() qui renverrait 503).
    if payload.donnees:
        d = dict(payload.donnees)
        mois = str(d.get("mois") or date.today().isoformat())[:7]
        annee = _parse_mois(mois).year
        app = d.get("appartement") or {}
        base = _dernier_numero(None, "SK-R", annee, type_doc="quittance")
        if GENERATED_DIR.exists():
            base = max(base, len(list(GENERATED_DIR.glob("recu-*.pdf"))))
        numero = f"SK-R-{annee}-{base + 1:03d}"
        nom_fichier = f"recu-{mois}-{_slug(app.get('numero', 'app'))}-{numero.rsplit('-', 1)[-1]}.pdf"
        d["numero"] = numero
        d["mois"] = f"{mois}-01"
        d["date"] = d.get("date") or date.today().isoformat()
        d.setdefault("immeuble", {})
        d["immeuble"]["gerant"] = MARQUE
        d.setdefault("methode", "Mobile Money")
        d["qr_url"] = f"{settings.BASE_URL}/files/{nom_fichier}"
        url = _enregistrer_fichier(docs.generer_quittance_pdf(d), nom_fichier)
        return {"pdf_url": url, "numero": numero, "mois": docs._mois_fr(f"{mois}-01")}

    sb = _sb()
    loyer = _un(sb, "loyers", payload.loyer_id, "Loyer introuvable")

    app = _un(sb, "appartements", loyer.get("appartement_id"), "Appartement introuvable") if loyer.get("appartement_id") else {}
    immeuble = _un(sb, "immeubles", app.get("immeuble_id"), "Immeuble introuvable") if app.get("immeuble_id") else {}
    loc = {}
    if loyer.get("locataire_id"):
        try:
            loc = sb.table("locataires").select("*").eq("id", loyer["locataire_id"]).execute().data[0]
        except Exception:  # noqa: BLE001
            loc = {}
    elif app.get("id"):
        try:
            loc = sb.table("locataires").select("*").eq("appartement_id", app["id"]).eq("statut", "actif").execute().data[0]
        except Exception:  # noqa: BLE001
            loc = {}

    methode = "Mobile Money"
    if payload.paiement_id:
        try:
            p = sb.table("paiements").select("methode").eq("id", payload.paiement_id).execute().data[0]
            methode = (p.get("methode") or methode).replace("_", " ").title()
        except Exception:  # noqa: BLE001
            pass

    mois = str(loyer.get("mois") or date.today().isoformat())[:7]
    numero = _numero_suivant(sb, "SK-R", _parse_mois(mois).year, type_doc="quittance")
    nom_fichier = f"recu-{mois}-{_slug(app.get('numero', 'app'))}-{numero.rsplit('-', 1)[-1]}.pdf"
    data = {
        "numero": numero, "mois": f"{mois}-01", "date": date.today().isoformat(),
        "locataire": {"nom": loc.get("nom", "Locataire"), "telephone": loc.get("telephone")},
        "appartement": {"numero": app.get("numero", "—"), "type": app.get("type", "")},
        "immeuble": {
            "nom": immeuble.get("nom"), "adresse": immeuble.get("adresse"),
            "ville": immeuble.get("ville"), "gerant": MARQUE,
        },
        "montant": _n(loyer.get("montant_paye")) or _n(loyer.get("montant")),
        "methode": methode, "qr_url": f"{settings.BASE_URL}/files/{nom_fichier}",
    }
    url = _enregistrer_fichier(docs.generer_quittance_pdf(data), nom_fichier)
    return {"pdf_url": url, "numero": numero, "mois": docs._mois_fr(f"{mois}-01")}


@router.post("/report-pdf")
def generer_report_pdf(payload: RapportIn) -> dict:
    """Rapport d'activité PDF 2 pages → {pdf_url}."""
    debut, fin = _parse_date(payload.debut, "debut"), _parse_date(payload.fin, "fin")
    if debut > fin:
        raise HTTPException(status_code=400, detail="La date de début doit précéder la date de fin")
    data = (
        _data_rapport_depuis_donnees(payload.donnees, debut, fin)
        if payload.donnees
        else _data_rapport(_sb(), payload.immeuble_id, debut, fin)
    )
    nom_fichier = f"rapport-{_slug(data['immeuble']['nom'])}-{debut}_{fin}.pdf".replace("rapport--", "rapport-")
    contenu = docs.generer_rapport_pdf(data)
    return {"pdf_url": _enregistrer_fichier(contenu, nom_fichier), "kpis": data["kpis"]}


@router.post("/report-docx")
def generer_report_docx(payload: RapportIn) -> dict:
    """Rapport d'activité Word → {docx_url}."""
    debut, fin = _parse_date(payload.debut, "debut"), _parse_date(payload.fin, "fin")
    if debut > fin:
        raise HTTPException(status_code=400, detail="La date de début doit précéder la date de fin")
    data = (
        _data_rapport_depuis_donnees(payload.donnees, debut, fin)
        if payload.donnees
        else _data_rapport(_sb(), payload.immeuble_id, debut, fin)
    )
    nom_fichier = f"rapport-{_slug(data['immeuble']['nom'])}-{debut}_{fin}.docx".replace("rapport--", "rapport-")
    contenu = docs.generer_rapport_docx(data)
    return {"docx_url": _enregistrer_fichier(contenu, nom_fichier), "kpis": data["kpis"]}


@router.post("/excel")
def generer_excel(payload: RapportIn) -> dict:
    """Classeur Excel 3 onglets (Loyers / Dépenses / Bilan) → {xlsx_url}."""
    debut, fin = _parse_date(payload.debut, "debut"), _parse_date(payload.fin, "fin")
    if debut > fin:
        raise HTTPException(status_code=400, detail="La date de début doit précéder la date de fin")
    data = (
        _data_rapport_depuis_donnees(payload.donnees, debut, fin)
        if payload.donnees
        else _data_rapport(_sb(), payload.immeuble_id, debut, fin)
    )
    nom_fichier = f"loyers-{_slug(data['immeuble']['nom'])}-{debut}_{fin}.xlsx".replace("loyers--", "loyers-")
    contenu = docs.generer_excel(data)
    return {"xlsx_url": _enregistrer_fichier(contenu, nom_fichier), "kpis": data["kpis"]}
