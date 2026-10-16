"""Client Supabase côté serveur (clé service role, contourne les politiques RLS)."""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


class SupabaseIndisponible(RuntimeError):
    """Supabase n'est pas configuré (backend/.env) ou le client n'a pu être créé."""


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Renvoie le client Supabase partagé (créé paresseusement)."""
    if not settings.supabase_configure:
        raise SupabaseIndisponible(
            "Supabase non configuré : renseignez SUPABASE_URL et SUPABASE_SERVICE_KEY dans backend/.env"
        )
    try:
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    except Exception as exc:  # pragma: no cover — dépend du réseau
        raise SupabaseIndisponible(f"Impossible de créer le client Supabase : {exc}") from exc
