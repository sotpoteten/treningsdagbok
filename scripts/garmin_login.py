"""
Logger inn på Garmin Connect én gang og lagrer tokens, så de andre skriptene
kan hente data uten passord.

Kjør selv i en terminal (passordet skrives aldri ut eller lagres):
    .venv\\Scripts\\python scripts/garmin_login.py

Tokens lagres i ~/.garminconnect/ (utenfor prosjektet). Kjør skriptet på nytt
hvis henteskriptet sier at innloggingen har gått ut.
"""
import getpass
import sys
from pathlib import Path

from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

TOKENS = Path("~/.garminconnect").expanduser()


def main():
    TOKENS.mkdir(parents=True, exist_ok=True)
    epost = input("E-post for Garmin Connect: ").strip()
    passord = getpass.getpass("Passord (vises ikke): ")
    api = Garmin(
        epost,
        passord,
        prompt_mfa=lambda: input("Kode fra e-post/SMS (MFA): ").strip(),
    )
    try:
        api.login(str(TOKENS))
    except GarminConnectTooManyRequestsError:
        sys.exit("Garmin svarer «for mange forsøk» (429). Vent en stund og prøv igjen.")
    except GarminConnectAuthenticationError as e:
        sys.exit(f"Innloggingen feilet: {e}")
    print(f"Innlogget som {api.get_full_name()}. Tokens er lagret i {TOKENS}.")


if __name__ == "__main__":
    main()
