"""
Henter en fersk eksport fra dagbok.olympiatoppen.no og oppdaterer data/.

Skriptet åpner Min side → Admin → «Eksportér mine data», trykker «Eksporter data»,
venter til eksporten er laget og trykker igjen for å laste ned UserDataExport.zip.
De tre filene konverter.py bruker, pakkes ut og sjekkes før de erstatter filene i
data/raw/. De gamle filene legges i data/raw/forrige/.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/hent_olt.py              # hent og konverter
    .venv\\Scripts\\python scripts/hent_olt.py --vis        # med synlig vindu
    .venv\\Scripts\\python scripts/hent_olt.py --fil X      # bruk en zip du har lastet ned selv
    .venv\\Scripts\\pythonw scripts/hent_olt.py --planlagt  # ukentlig, fra Oppgaveplanleggeren

--planlagt kjører uten vindu, logger til data/raw/hent_olt.log og varsler på mobilen
med ntfy (data/raw/varsel.json). Går importen gjennom, og personvernsjekken, testene og
bygget er i orden, committes og pushes datafilene i data/, og ingenting annet. Har
innloggingen gått ut, kommer et varsel.

Innloggingen gjør du selv, med Idrettens ID, i vinduet som åpnes første gang eller når
innloggingen har gått ut. Skriptet lagrer aldri passord, bare innloggingsøkten
(data/raw/olt-innlogging.json, holdt utenfor git). Krever playwright i .venv og Google
Chrome; uten --fil.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

import personvern
from konverter import ROOT, konverter

RAW = ROOT / "data/raw"
NY = RAW / "olt-ny"
FORRIGE = RAW / "forrige"
INNLOGGING = RAW / "olt-innlogging.json"
FILER = ("workoutSessions.json", "userData.json", "weekComments.json")
ADMIN = "https://dagbok.olympiatoppen.no/minside?tab=admin"
INNLOGGINGSFRIST = 10 * 60  # sekunder du har på deg til å logge inn
LOGG = RAW / "hent_olt.log"
VARSEL = RAW / "varsel.json"
# Filene konverter.py, hent_intervals.py og hent_eventor.py skriver. Bare disse committes av en
# planlagt kjøring.
DATAFILER = ["data/okter.json", "data/blokker.csv", "data/dager.json", "data/uker.json", "data/profil.json",
             "data/garmin_aktiviteter.json", "data/garmin_helse.json", "data/konkurranser.json"]
NODE = r"C:\Program Files\nodejs"


class Avbrutt(Exception):
    pass


class MaLoggeInn(Avbrutt):
    pass


# ── Henting ─────────────────────────────────────────────

def _ma_logge_inn(side) -> bool:
    if "dagbok.olympiatoppen.no" not in side.url or "/login" in side.url:
        return True
    lenke = side.get_by_text("Logg inn med Idrettens ID")
    return bool(lenke.count()) and lenke.first.is_visible()


def _nedtrekk(side):
    """Nedtrekksfeltet «Eksportér mine data» på adminsiden, som eksportknappen ligger i."""
    return side.get_by_role("button", name=re.compile(r"Eksport[eé]r mine data", re.I)).first


def _eksportknapp(side):
    """Knappen inne i nedtrekksfeltet. Navnet kan endre seg når eksporten er klar, så den
    finnes via feltet den ligger i når det går."""
    felt = _nedtrekk(side)
    if felt.count() and (omrade := felt.get_attribute("aria-controls")):
        knapper = side.locator(f'[id="{omrade}"]').get_by_role("button")
        if knapper.count():
            return knapper.first
    return side.get_by_role("button", name="Eksporter data").first


def _vent_pa_admin(side, frist: float) -> bool:
    """Åpner nedtrekksfeltet og venter til eksportknappen vises (True), eller til siden ber
    om innlogging (False)."""
    slutt = time.monotonic() + frist
    while time.monotonic() < slutt:
        if _ma_logge_inn(side):
            return False
        felt = _nedtrekk(side)
        if felt.count() and felt.is_visible():
            if felt.get_attribute("aria-expanded") != "true":
                felt.click()
            else:
                knapp = _eksportknapp(side)
                if knapp.count() and knapp.is_visible():
                    return True
        side.wait_for_timeout(1000)
    return False


def _hent_eksport(side, mal: Path) -> None:
    """Første trykk ber dagboka lage eksporten (GET /api/Auth/ExportUserData), og det tar
    litt tid. Når den er klar, gir et nytt trykk på samme knapp selve nedlastingen."""
    nedlastinger, svar = [], []
    side.on("download", lambda d: nedlastinger.append(d))
    side.on("response", lambda r: svar.append(r.status) if "/api/Auth/ExportUserData" in r.url else None)
    _eksportknapp(side).click()
    slutt = time.monotonic() + 300
    trykket_igjen = 0.0
    while not nedlastinger:
        if time.monotonic() > slutt:
            raise Avbrutt("eksporten ble ikke klar innen 5 minutter")
        if svar and svar[-1] >= 400:
            raise Avbrutt(f"dagboka svarte {svar[-1]} på eksporten")
        knapp = _eksportknapp(side)
        klar = svar and knapp.count() and knapp.is_visible() and knapp.is_enabled()
        if klar and time.monotonic() - trykket_igjen > 10:
            print("  Eksporten er klar. Trykker igjen for å laste ned …")
            knapp.click()
            trykket_igjen = time.monotonic()
        side.wait_for_timeout(1000)
    nedlastinger[0].save_as(mal)


def _vent_pa_innlogging(side):
    """Venter til du har logget inn, og gir fanen som står på adminsiden med eksportknappen.
    Innloggingen kan åpne nye faner, så alle fanene i vinduet følges."""
    print("Logg inn med Idrettens ID i vinduet som er åpnet. Skriptet venter i opptil 10 minutter.")
    slutt = time.monotonic() + INNLOGGINGSFRIST
    sett = None
    while time.monotonic() < slutt:
        side.wait_for_timeout(2000)
        sider = [s for s in side.context.pages if not s.is_closed()]
        urler = [s.url.split("?")[0] for s in sider]
        if urler != sett:
            print("  Faner:", ", ".join(urler))
            sett = urler
        for s in sider:
            if _ma_logge_inn(s):
                continue
            # Tilbake i dagboka. La innloggingen gjøre seg ferdig før vi går til adminsiden.
            try:
                s.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass
            if "tab=admin" not in s.url:
                s.goto(ADMIN)
            if _vent_pa_admin(s, 20):
                return s
    raise Avbrutt("ingen innlogging innen fristen")


def _last_ned(nettleser, vis: bool, mal: Path) -> bool:
    """Prøver én runde. Gir False hvis du må logge inn og vinduet er skjult."""
    lagret = str(INNLOGGING) if INNLOGGING.exists() else None
    kontekst = nettleser.new_context(storage_state=lagret, accept_downloads=True, locale="nb-NO")
    side = kontekst.new_page()
    try:
        side.goto(ADMIN)
        if not _vent_pa_admin(side, 30):
            if not _ma_logge_inn(side):
                raise Avbrutt(f"fant verken eksportknappen eller innloggingen på {ADMIN}")
            if not vis:
                return False
            side = _vent_pa_innlogging(side)
        # Lagre økta med en gang, så neste kjøring slipper innloggingen selv om nedlastingen feiler.
        kontekst.storage_state(path=str(INNLOGGING))
        print("Ber dagboka lage eksporten. Det tar litt tid …")
        _hent_eksport(side, mal)
        kontekst.storage_state(path=str(INNLOGGING))  # med eventuelt fornyede tokens
        return True
    except Exception:
        # Skjermbildet kan vise personlige data, så det legges i data/raw/ (utenfor git).
        side.screenshot(path=str(RAW / "olt-feil.png"))
        print(f"Siden var {side.url}. Skjermbilde: data/raw/olt-feil.png", file=sys.stderr)
        raise
    finally:
        kontekst.close()


def hent(vis: bool, mal: Path, planlagt: bool = False) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise Avbrutt("playwright mangler. Kjør: .venv\\Scripts\\python -m pip install playwright")
    with sync_playwright() as p:
        nettleser = p.chromium.launch(channel="chrome", headless=not vis)
        try:
            if _last_ned(nettleser, vis, mal):
                return
        finally:
            nettleser.close()
        if planlagt:
            raise MaLoggeInn("innloggingen har gått ut")
        print("Innloggingen har gått ut, eller du har ikke logget inn ennå. Åpner et vindu.")
        nettleser = p.chromium.launch(channel="chrome", headless=False)
        try:
            _last_ned(nettleser, True, mal)
        finally:
            nettleser.close()


# ── Sjekk og innbytte ───────────────────────────────────

def pakk_ut(zip_fil: Path, mappe: Path) -> None:
    with zipfile.ZipFile(zip_fil) as z:
        navn = set(z.namelist())
        mangler = [f for f in FILER if f not in navn]
        if mangler:
            raise Avbrutt(f"zip-fila mangler {', '.join(mangler)}")
        for f in FILER:  # bare filene vi kjenner, med faste navn
            (mappe / f).write_bytes(z.read(f))


def les(mappe: Path) -> dict | None:
    if not all((mappe / f).exists() for f in FILER):
        return None
    try:
        okter, bruker, uker = (json.loads((mappe / f).read_text(encoding="utf-8")) for f in FILER)
    except json.JSONDecodeError as e:
        raise Avbrutt(f"ugyldig JSON i eksporten: {e}")
    if not isinstance(okter, list) or not isinstance(bruker, dict) or "Id" not in bruker or not isinstance(uker, list):
        raise Avbrutt("eksporten har ikke formatet konverter.py venter")
    return {
        "okter": len(okter),
        "siste": max((s["Date"] for s in okter), default=""),
        "uker": len(uker),
        "dager": len(bruker.get("HealthStatuses") or []),
    }


def sjekk(gammel: dict | None, ny: dict, tving: bool) -> None:
    if ny["okter"] == 0:
        raise Avbrutt("eksporten har ingen økter")
    if gammel is None or tving:
        return
    if ny["okter"] < gammel["okter"]:
        raise Avbrutt(f"eksporten har færre økter ({ny['okter']}) enn forrige ({gammel['okter']}). "
                      "Bruk --tving hvis du har slettet økter med vilje")
    if ny["siste"] < gammel["siste"]:
        raise Avbrutt(f"siste økt i eksporten ({ny['siste']}) er eldre enn forrige ({gammel['siste']})")


def bytt_inn() -> None:
    if FORRIGE.exists():
        shutil.rmtree(FORRIGE)
    FORRIGE.mkdir()
    for f in FILER:
        if (RAW / f).exists():
            shutil.move(RAW / f, FORRIGE / f)
        shutil.move(NY / f, RAW / f)


# ── Garmin via intervals.icu ────────────────────────────

def hent_garmin() -> str:
    """Henter nye Garmin-data fra intervals.icu etter OLT-importen, så nye økter kan kobles.
    En feil her stopper ikke importen fra OLT; den står i loggen og i varselet."""
    try:
        import hent_intervals
        if not hent_intervals.nokkel():
            return "Garmin: ikke satt opp (data/raw/intervals.json)"
        print("\nHenter Garmin-data fra intervals.icu …")
        resultat = hent_intervals.oppdater()
    except Exception as e:
        resultat = f"Garmin feilet: {str(e).splitlines()[0] if str(e) else type(e).__name__}"
    print(resultat)
    return resultat


# ── Resultater fra Eventor ──────────────────────────────

def hent_konkurranser() -> str:
    """Henter nye resultater fra Eventor etter Garmin, så løpene kan kobles til nye økter.
    En feil her stopper ikke importen; den står i loggen og i varselet."""
    try:
        import hent_eventor
        import sammenlign_eventor
        if not sammenlign_eventor.OPPSETT.exists():
            return "Eventor: ikke satt opp (data/raw/eventor.json)"
        print("\nHenter resultater fra Eventor …")
        resultat = hent_eventor.oppdater()
    except Exception as e:
        resultat = f"Eventor feilet: {str(e).splitlines()[0] if str(e) else type(e).__name__}"
    print(resultat)
    return resultat


# ── Varsel, tester og commit (planlagt kjøring) ─────────

def varsle(tittel: str, tekst: str, viktig: bool = False) -> None:
    """Sender et varsel med ntfy hvis data/raw/varsel.json finnes:
    {"ntfy_server": "https://ntfy.sh", "ntfy_emne": "<langt, tilfeldig navn>"}.
    Varselet sier bare hvordan det gikk, aldri noe fra notatene eller helsedataene."""
    if not VARSEL.exists():
        return
    try:
        oppsett = json.loads(VARSEL.read_text(encoding="utf-8"))
        data = json.dumps({
            "topic": oppsett["ntfy_emne"], "title": tittel, "message": tekst,
            "priority": 4 if viktig else 2, "tags": ["warning"] if viktig else ["white_check_mark"],
        }).encode()
        foresporsel = urllib.request.Request(oppsett.get("ntfy_server", "https://ntfy.sh"), data=data,
                                             headers={"Content-Type": "application/json"})
        urllib.request.urlopen(foresporsel, timeout=20).close()
    except Exception as e:  # et varsel som ikke kommer fram, skal ikke stoppe importen
        print(f"Varselet ble ikke sendt: {e}")


def kjor(kommando: list[str], mappe: Path = ROOT) -> str:
    env = {**os.environ, "PATH": NODE + os.pathsep + os.environ.get("PATH", "")}
    r = subprocess.run(kommando, cwd=mappe, env=env, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode:
        print(r.stdout[-3000:], r.stderr[-3000:])
        siste = (r.stderr.strip() or r.stdout.strip()).splitlines()[-1:] or ["ingen utskrift"]
        raise Avbrutt(f"«{' '.join(kommando)}» feilet: {siste[0]}")
    return r.stdout


def _python() -> str:
    """Python med konsoll. Den planlagte kjøringen går i pythonw, som ikke har det."""
    exe = Path(sys.executable)
    if exe.name.lower() == "pythonw.exe" and (exe.parent / "python.exe").exists():
        return str(exe.parent / "python.exe")
    return str(exe)


def kontroller() -> None:
    """Alt som må være i orden før repoet (som er offentlig) får nye data: personvernsjekken,
    Python-testene, vitest og bygget med typesjekk. Kaster Avbrutt ved første feil."""
    print("Kjører personvernsjekken …")
    problemer = personvern.sjekk(ROOT)
    if problemer:
        print("\n".join(problemer))
        raise Avbrutt(f"personvernsjekken fant {len(problemer)} problem(er), først: {problemer[0]}")
    print("Kjører testene …")
    tester = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "scripts").glob("test_*.py"))
    kjor([_python(), "-m", "unittest", *tester])
    kjor(["npm.cmd", "test"], ROOT / "web")
    print("Bygger nettsiden …")
    kjor(["npm.cmd", "run", "build"], ROOT / "web")


def commit_data(siste: str, nye: int) -> bool:
    """Kjører kontrollene og committer og pusher datafilene, og ingenting annet.
    Gir False hvis datafilene ikke er endret."""
    if kjor(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip() != "main":
        raise Avbrutt("repoet står ikke på main")
    if not kjor(["git", "status", "--porcelain", "--", *DATAFILER]).strip():
        return False
    kontroller()
    melding = (f"Data: import fra OLT, Garmin og Eventor til {siste}\n\n"
               f"{nye:+} økter i eksporten. Kjørt automatisk av scripts/hent_olt.py --planlagt.")
    # Med stiene etter -- tas bare datafilene med, selv om noe annet er endret eller lagt til.
    kjor(["git", "commit", "-m", melding, "--", *DATAFILER])
    kjor(["git", "push", "origin", "main"])
    print("Committet og pushet.")
    return True


def main() -> int:
    p = argparse.ArgumentParser(description="Hent eksport fra Olympiatoppens treningsdagbok")
    p.add_argument("--fil", type=Path, help="bruk en UserDataExport.zip du har lastet ned selv")
    p.add_argument("--vis", action="store_true", help="vis nettleservinduet")
    p.add_argument("--tving", action="store_true", help="godta en eksport med færre økter enn forrige")
    p.add_argument("--planlagt", action="store_true", help="uten vindu, med logg, varsel, tester og commit")
    p.add_argument("--fra", default="2019-11-01", help="første dato som tas med (ÅÅÅÅ-MM-DD)")
    a = p.parse_args()

    if a.planlagt:
        # pythonw har ingen konsoll, så alt skrives til loggfila.
        sys.stdout = sys.stderr = open(LOGG, "a", encoding="utf-8", buffering=1)
        print(f"\n── {datetime.now():%Y-%m-%d %H:%M} ──")
    else:
        for strom in (sys.stdout, sys.stderr):
            strom.reconfigure(encoding="utf-8")

    if NY.exists():
        shutil.rmtree(NY)
    NY.mkdir(parents=True)
    try:
        if a.fil:
            zip_fil = a.fil
        else:
            zip_fil = NY / "UserDataExport.zip"
            hent(a.vis and not a.planlagt, zip_fil, a.planlagt)
        pakk_ut(zip_fil, NY)
        gammel, ny = les(RAW), les(NY)
        sjekk(gammel, ny, a.tving)
    except Exception as e:
        melding = str(e).splitlines()[0] if str(e) else type(e).__name__
        print(f"Avbrutt: {melding}. Filene i data/raw/ er ikke endret.", file=sys.stderr)
        shutil.rmtree(NY)
        if a.planlagt and isinstance(e, MaLoggeInn):
            varsle("Treningsdagbok: logg inn på nytt",
                   "Innloggingen til OLT har gått ut, så ukens import ble ikke kjørt. Kjør "
                   ".venv\\Scripts\\python scripts/hent_olt.py --vis på PC-en og logg inn.", viktig=True)
        elif a.planlagt:
            varsle("Treningsdagbok: importen feilet", f"{melding}. Se data/raw/hent_olt.log.", viktig=True)
        return 1

    bytt_inn()
    shutil.rmtree(NY)  # også zip-fila, som har de samme dataene
    nye = ny["okter"] - gammel["okter"] if gammel else ny["okter"]
    if gammel:
        print(f"Økter i eksporten: {gammel['okter']} → {ny['okter']} ({nye:+}), "
              f"siste økt {gammel['siste']} → {ny['siste']}")
        print(f"Ukeskommentarer: {gammel['uker']} → {ny['uker']}, dagsrapporter: {gammel['dager']} → {ny['dager']}")
    print("De forrige filene ligger i data/raw/forrige/.\n")
    konverter(RAW, a.fra)
    garmin = hent_garmin()
    eventor = hent_konkurranser()
    feil_i_tillegg = garmin.startswith("Garmin feilet") or eventor.startswith("Eventor feilet")
    tillegg = f"{garmin}. {eventor}"

    if a.planlagt:
        try:
            if commit_data(ny["siste"], nye):
                varsle("Treningsdagbok oppdatert",
                       f"{nye:+} økter, siste økt {ny['siste']}. {tillegg}. Pushet til main.", viktig=feil_i_tillegg)
            else:
                varsle("Treningsdagbok: ingen nye data", f"Siste økt er fortsatt {ny['siste']}. {tillegg}.",
                       viktig=feil_i_tillegg)
        except Exception as e:
            print(f"Ikke committet: {e}")
            varsle("Treningsdagbok: ikke committet",
                   f"Dataene er oppdatert lokalt, men {e}. Se data/raw/hent_olt.log.", viktig=True)
            return 1
        return 0

    print("Se over endringene med git status / git diff --stat før du committer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
