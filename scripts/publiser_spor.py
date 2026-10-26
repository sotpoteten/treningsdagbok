"""
Publiserer GPS-sporene til demoen som en zip i GitHub-utgivelsen «spor», ikke i git.

Sporene i data/garmin_spor/ pakkes i data/raw/garmin_spor.zip (holdt utenfor git). Zip-fila
lages likt hver gang (sortert, faste tidsstempler), så hashen endrer seg bare når sporene
gjør det. Hashen ligger i utgivelsen som garmin_spor.sha256, og zip-fila lastes bare opp
når den har endret seg. Pages-bygget (.github/workflows/pages.yml) laster ned zip-fila og
pakker den ut med --pakk-ut.

Isak valgte 2026-10-26 å publisere sporene, siden øktene hans er åpne på Strava. Utgivelsen
er ikke en del av git-historikken: slett den (gh release delete spor --cleanup-tag) og kjør
Pages på nytt, så er sporene borte fra demoen.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/publiser_spor.py                       # pakk og last opp ved endring
    python scripts/publiser_spor.py --pakk-ut data/raw/garmin_spor.zip    # pakk ut til data/garmin_spor/

Krever gh, innlogget som sotpoteten. Mandagskjøringen (hent_olt.py --planlagt) kjører
dette etter Garmin-hentingen.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPOR = ROOT / "data/garmin_spor"
ZIP = ROOT / "data/raw/garmin_spor.zip"
UTGIVELSE = "spor"
HASHFIL = "garmin_spor.sha256"
NAVN = re.compile(r"^\d+\.json$")  # <garmin_id>.json, ingenting annet kommer med
TIDSSTEMPEL = (1980, 1, 1, 0, 0, 0)  # det tidligste zip tillater
NOTAT = ("GPS-spor til demoen på sotpoteten.github.io/treningsdagbok, én JSON-fil per "
         "Garmin-aktivitet. Lastes opp av scripts/publiser_spor.py og hentes av Pages-bygget. "
         "Slett utgivelsen for å fjerne sporene fra demoen.")


class Feil(Exception):
    pass


# ── Zip ─────────────────────────────────────────────────

def sporfiler(mappe: Path) -> list[Path]:
    """Sporfilene i mappa, sortert etter navn. Bare <garmin_id>.json."""
    if not mappe.exists():
        return []
    return sorted((p for p in mappe.iterdir() if p.is_file() and NAVN.fullmatch(p.name)), key=lambda p: p.name)


def pakk(mappe: Path, mal: Path) -> tuple[str, int]:
    """Pakker sporfilene i mappa til mal, likt hver gang. Gir sha256 for zip-fila og antall filer."""
    filer = sporfiler(mappe)
    mal.parent.mkdir(parents=True, exist_ok=True)
    midlertidig = mal.with_suffix(".tmp")
    with zipfile.ZipFile(midlertidig, "w") as z:
        for p in filer:
            info = zipfile.ZipInfo(p.name, date_time=TIDSSTEMPEL)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 0
            info.external_attr = 0o644 << 16
            z.writestr(info, p.read_bytes(), compresslevel=6)
    midlertidig.replace(mal)
    return sha256(mal), len(filer)


def sha256(fil: Path) -> str:
    h = hashlib.sha256()
    with open(fil, "rb") as f:
        for bit in iter(lambda: f.read(1 << 20), b""):
            h.update(bit)
    return h.hexdigest()


def pakk_ut(zip_fil: Path, mappe: Path) -> int:
    """Pakker ut sporfilene til mappa. Andre navn (stier, ../ o.l.) hoppes over. Gir antallet."""
    mappe.mkdir(parents=True, exist_ok=True)
    antall = 0
    with zipfile.ZipFile(zip_fil) as z:
        for navn in z.namelist():
            if NAVN.fullmatch(navn):
                (mappe / navn).write_bytes(z.read(navn))
                antall += 1
    return antall


# ── GitHub-utgivelsen ───────────────────────────────────

def gh(*args: str) -> subprocess.CompletedProcess:
    exe = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"
    return subprocess.run([exe, *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def gh_ok(*args: str) -> str:
    r = gh(*args)
    if r.returncode:
        siste = (r.stderr.strip() or r.stdout.strip()).splitlines()[-1:] or ["ingen utskrift"]
        raise Feil(f"gh {args[0]} {args[1]} feilet: {siste[0]}")
    return r.stdout


def publisert(zip_navn: str = ZIP.name) -> tuple[bool, str | None]:
    """(om utgivelsen finnes, hashen som er lastet opp eller None)."""
    r = gh("release", "view", UTGIVELSE, "--json", "assets")
    if r.returncode:
        if "not found" in (r.stderr + r.stdout).lower():
            return False, None
        raise Feil(f"gh release view feilet: {(r.stderr.strip() or r.stdout.strip()).splitlines()[-1:]}")
    navn = {a["name"] for a in json.loads(r.stdout).get("assets", [])}
    if HASHFIL not in navn or zip_navn not in navn:
        return True, None
    with tempfile.TemporaryDirectory() as mappe:
        gh_ok("release", "download", UTGIVELSE, "--pattern", HASHFIL, "--dir", mappe, "--clobber")
        tekst = (Path(mappe) / HASHFIL).read_text(encoding="utf-8").split()
    return True, tekst[0] if tekst else None


def oppdater(mappe: Path = SPOR, zip_fil: Path = ZIP) -> str:
    """Pakker sporene og laster dem opp hvis de er endret. Gir en kort oppsummering til logg og varsel."""
    if not sporfiler(mappe):
        return "GPS-spor: ingen sporfiler å publisere"
    hash_ny, antall = pakk(mappe, zip_fil)
    mb = zip_fil.stat().st_size / 1e6
    finnes, hash_gammel = publisert(zip_fil.name)
    if hash_gammel == hash_ny:
        return f"GPS-spor: uendret ({antall} spor)"
    if not finnes:
        gh_ok("release", "create", UTGIVELSE, "--title", "GPS-spor", "--notes", NOTAT,
              "--prerelease", "--latest=false")
    hashfil = zip_fil.with_name(HASHFIL)
    hashfil.write_text(f"{hash_ny}  {zip_fil.name}\n", encoding="utf-8")
    # Zip-fila først: feiler den, står den gamle hashen, og neste kjøring prøver igjen.
    gh_ok("release", "upload", UTGIVELSE, str(zip_fil), "--clobber")
    gh_ok("release", "upload", UTGIVELSE, str(hashfil), "--clobber")
    return f"GPS-spor: {antall} spor publisert ({mb:.0f} MB)"


def main() -> int:
    p = argparse.ArgumentParser(description="Publiser GPS-sporene i GitHub-utgivelsen «spor»")
    p.add_argument("--pakk-ut", type=Path, metavar="ZIP", help="pakk ut en nedlastet zip i stedet")
    p.add_argument("--til", type=Path, default=SPOR, help="mappa --pakk-ut skriver til")
    a = p.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        if a.pakk_ut:
            print(f"Pakket ut {pakk_ut(a.pakk_ut, a.til)} GPS-spor til {a.til}")
        else:
            print(oppdater())
    except Feil as e:
        print(f"Avbrutt: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
