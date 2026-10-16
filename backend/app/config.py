"""Configuration centralisée : variables d'environnement (.env à la racine de backend/)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Racine du backend (contient main.py, requirements.txt, .env, generated/)
BASE_DIR = Path(__file__).resolve().parent.parent
GENERATED_DIR = BASE_DIR / "generated"

load_dotenv(BASE_DIR / ".env")


def _clean(valeur: str | None, defaut: str = "") -> str:
    """Renvoie la valeur nettoyée (strip, sans slash final) ou le défaut."""
    v = (valeur or defaut).strip()
    return v.rstrip("/")


class Settings:
    """Paramètres de configuration (lisibles via `settings.ATTRIBUT`)."""

    SUPABASE_URL: str = _clean(os.getenv("SUPABASE_URL"))
    SUPABASE_SERVICE_KEY: str = _clean(os.getenv("SUPABASE_SERVICE_KEY"))

    WAVE_API_KEY: str = _clean(os.getenv("WAVE_API_KEY"), "sk_test_WAVE_PLACEHOLDER")
    WAVE_API_URL: str = _clean(os.getenv("WAVE_API_URL"), "https://api.wave.com/v1")
    WAVE_MERCHANT_ID: str = _clean(os.getenv("WAVE_MERCHANT_ID"), "PLACEHOLDER")
    WAVE_WEBHOOK_SECRET: str = _clean(os.getenv("WAVE_WEBHOOK_SECRET"), "PLACEHOLDER")

    ORANGE_MONEY_API_KEY: str = _clean(os.getenv("ORANGE_MONEY_API_KEY"), "OM_PLACEHOLDER")
    ORANGE_MONEY_MERCHANT_ID: str = _clean(os.getenv("ORANGE_MONEY_MERCHANT_ID"), "OM_MERCHANT")
    ORANGE_MONEY_API_URL: str = _clean(
        os.getenv("ORANGE_MONEY_API_URL"), "https://api.orange.com/orange-money-webpay/dev/v1/webpayment"
    )
    ORANGE_WEBHOOK_SECRET: str = _clean(os.getenv("ORANGE_WEBHOOK_SECRET"))

    FREE_MONEY_API_KEY: str = _clean(os.getenv("FREE_MONEY_API_KEY"), "FM_PLACEHOLDER")
    FREE_MONEY_API_URL: str = _clean(os.getenv("FREE_MONEY_API_URL"), "https://api.free-money.sn/api/v1")
    FREE_WEBHOOK_SECRET: str = _clean(os.getenv("FREE_WEBHOOK_SECRET"))

    BASE_URL: str = _clean(os.getenv("BASE_URL"), "http://localhost:8000")
    FRONTEND_URL: str = _clean(os.getenv("FRONTEND_URL"), "http://localhost:3000")

    @property
    def supabase_configure(self) -> bool:
        """Vrai si l'URL et la clé service sont renseignées."""
        return bool(self.SUPABASE_URL and self.SUPABASE_SERVICE_KEY)


settings = Settings()
