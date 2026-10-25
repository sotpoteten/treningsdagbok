"""
Personvernsjekk for filene git sporer. Repoet er offentlig, så alt som committes, publiseres.

Sjekken ser etter:
- stier som aldri skal committes: data/raw/, GPS-sporene, filer med .env i navnet og
  eventor.json (Eventor-nøkkelen er en klubbnøkkel), uansett hvor den ligger
- bilder (png, jpg o.l.) andre steder enn docs/bilder/
- i datafilene under data/: koordinatnøkler (lat, lon, position_lat …), nøkler for
  fødselsdato, nøkler for passord og API-nøkler, e-postadresser og tekst som ligner
  nøkler eller tokens (sk-ant-, api_nokkel, lange hex- eller base64-strenger som ikke er UUID-er)
- i data/konkurranser.json: bare feltene på hvitelista under er lov. Andre løpere skal aldri
  stå i fila, så et felt som ikke er kjent (for eksempel Given, Family eller person_id), stoppes.

Bildene i docs/bilder/ sjekkes bare for plasseringen, ikke for innholdet. Se dem over selv.

Kjør fra prosjektmappen:  python scripts/personvern.py
Gir kode 1 og en liste over funnene hvis noe er galt. hent_olt.py kjører samme sjekk før
den automatiske commiten.
"""
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent

FORBUDTE_MAPPER = ("data/raw/", "data/garmin_spor/", "web/public/garmin_spor/")
BILDER = "docs/bilder/"
BILDETYPER = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".avif"}

# Nøklene sammenlignes uten store bokstaver, _, - og mellomrom.
KOORDINATNOKLER = {"lat", "lon", "lng", "latitude", "longitude", "positionlat", "positionlong"}
FODSELSNOKLER = {"birthdate", "dateofbirth", "birthday", "dob", "fodselsdato", "fødselsdato", "fodt", "født"}
HEMMELIGE_NOKLER = {"apikey", "apinokkel", "accesstoken", "refreshtoken", "token", "secret",
                    "password", "passord", "epost", "email", "emailaddress"}

EPOST = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
TOKENMERKER = re.compile(r"sk-ant-|api_n[oø]kkel", re.I)
# En sammenhengende streng av tegn som brukes i hex, base64 og base64url.
LANG_STRENG = re.compile(r"(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{32,}={0,2}")
# Livelox' avspillerlenker har løps- og klassenavnet som ord med bindestrek i stien
# («livelox.com/Viewer/NM-sprint-ski-O-2024/H-21-?classId=…»), og LANG_STRENG ser bare
# «com/Viewer/…». Det er ikke en nøkkel så lenge hvert ord er kort.
LIVELOX_STI = re.compile(r"com/Viewer(?:/[A-Za-z0-9-]*){1,2}")
# data/konkurranser.json: hviteliste over felt. Fila er enten en liste med løp eller et objekt
# med listene under LISTER. Alt annet, også et objekt der det skal stå en enkeltverdi, stoppes.
KONKURRANSER = "data/konkurranser.json"
LISTER = {"individuelle", "stafett"}
LOPSFELT = {"eventor_id", "dato", "navn", "arrangor", "disiplin", "klasse", "status", "tid_s", "plass",
            "antall", "vinnertid_s", "prosent_bak", "strekk", "strekkfart", "bomtid_s", "lenker",
            "okt_ider", "type", "etappe", "natt", "strekk_ugyldige"}
STREKKFELT = {"post", "tid_s", "beste_s", "ref_s", "indeks", "bom"}
LENKEFELT = {"eventor", "livelox", "winsplits"}
# Felt som bærer navn eller id på en person. De får en tydeligere melding enn andre ukjente felt.
NAVNENOKLER = {"given", "family", "name", "fornavn", "etternavn", "person", "personid", "personname",
               "competitor", "navn"}

UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


def _normaliser(nokkel: str) -> str:
    return re.sub(r"[\s_-]", "", nokkel).lower()


def _ligner_token(streng: str) -> bool:
    """Lange strenger med både bokstaver og sifre ligner nøkler. UUID-ene (øktenes id) gjør
    ikke det, og heller ikke lange ord med bindestrek, lange tall eller stien i en
    Livelox-lenke med korte ord."""
    if UUID.fullmatch(streng):
        return False
    if LIVELOX_STI.fullmatch(streng) and all(len(o) <= 20 for o in re.split(r"[/-]", streng)):
        return False
    return bool(re.search(r"\d", streng) and re.search(r"[A-Za-z]", streng))


def _nokler(objekt, sti: str = ""):
    """Gir (sti, nøkkel) for alle nøkler i et JSON-objekt, uansett hvor dypt de ligger."""
    if isinstance(objekt, dict):
        for k, v in objekt.items():
            yield sti, k
            yield from _nokler(v, f"{sti}.{k}" if sti else k)
    elif isinstance(objekt, list):
        for v in objekt:
            yield from _nokler(v, f"{sti}[]")


def _er_enkeltverdi(v) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


def _ukjent(sti: str, felt: str, nokkel: str) -> str:
    if _normaliser(nokkel) in NAVNENOKLER:
        return f"{sti}: navnefelt «{felt}» (andre løpere skal aldri stå i fila)"
    return f"{sti}: feltet «{felt}» står ikke på hvitelista for konkurranser"


def sjekk_konkurranser(sti: str, data) -> list[str]:
    """Hvitelista for data/konkurranser.json. «navn» er lov bare på løpsnivå, som løpets navn."""
    problemer: list[str] = []
    if isinstance(data, dict):
        lister = []
        for k, v in data.items():
            if k not in LISTER or not isinstance(v, list):
                problemer.append(_ukjent(sti, k, k) if k not in LISTER else f"{sti}: «{k}» skal være en liste")
            else:
                lister.append((k, v))
    elif isinstance(data, list):
        lister = [("", data)]
    else:
        return [f"{sti}: skal være en liste med løp eller et objekt med listene {sorted(LISTER)}"]

    for liste, lop in lister:
        for i, post in enumerate(lop):
            sted = f"{liste}[{i}]" if liste else f"[{i}]"
            if not isinstance(post, dict):
                problemer.append(f"{sti}: {sted} skal være et objekt")
                continue
            for k, v in post.items():
                felt = f"{sted}.{k}"
                if k not in LOPSFELT:
                    problemer.append(_ukjent(sti, felt, k))
                elif k == "strekk":
                    problemer += _sjekk_liste_av_objekter(sti, felt, v, STREKKFELT)
                elif k == "lenker":
                    problemer += _sjekk_objekt(sti, felt, v, LENKEFELT)
                elif k == "okt_ider":
                    if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                        problemer.append(f"{sti}: «{felt}» skal være en liste med økt-id-er")
                elif not _er_enkeltverdi(v):
                    problemer.append(f"{sti}: «{felt}» skal være en enkeltverdi, ikke et objekt eller en liste")
    return problemer


def _sjekk_objekt(sti: str, felt: str, v, lov: set[str]) -> list[str]:
    if v is None:
        return []
    if not isinstance(v, dict):
        return [f"{sti}: «{felt}» skal være et objekt"]
    problemer = []
    for k, x in v.items():
        if k not in lov:
            problemer.append(_ukjent(sti, f"{felt}.{k}", k))
        elif not _er_enkeltverdi(x):
            problemer.append(f"{sti}: «{felt}.{k}» skal være en enkeltverdi")
    return problemer


def _sjekk_liste_av_objekter(sti: str, felt: str, v, lov: set[str]) -> list[str]:
    if v is None:
        return []
    if not isinstance(v, list):
        return [f"{sti}: «{felt}» skal være en liste"]
    problemer = []
    for i, x in enumerate(v):
        problemer += _sjekk_objekt(sti, f"{felt}[{i}]", x, lov) if x is not None else [f"{sti}: «{felt}[{i}]» er tom"]
    return problemer


def sjekk_sti(sti: str) -> list[str]:
    """Problemer med selve stien, uavhengig av innholdet."""
    problemer = []
    if PurePosixPath(sti).name.lower() == "eventor.json":
        problemer.append(f"{sti}: eventor.json har Eventor-nøkkelen og skal aldri committes")
    if any(sti.startswith(m) for m in FORBUDTE_MAPPER):
        problemer.append(f"{sti}: skal aldri committes (rådata eller GPS-spor)")
    if fnmatch.fnmatch(PurePosixPath(sti).name.lower(), "*.env*"):
        problemer.append(f"{sti}: ser ut som en .env-fil med nøkler eller innstillinger")
    if PurePosixPath(sti).suffix.lower() in BILDETYPER and not sti.startswith(BILDER):
        problemer.append(f"{sti}: bilder skal ligge i {BILDER}")
    return problemer


def sjekk_innhold(sti: str, tekst: str) -> list[str]:
    """Problemer i innholdet i en datafil. JSON-filer sjekkes også for nøkkelnavn."""
    problemer = []
    if sti.lower().endswith(".json"):
        try:
            data = json.loads(tekst)
        except json.JSONDecodeError as e:
            problemer.append(f"{sti}: ugyldig JSON ({e})")
        else:
            if sti == KONKURRANSER:
                problemer += sjekk_konkurranser(sti, data)
            sett = set()
            for forelder, nokkel in _nokler(data):
                n = _normaliser(nokkel)
                if n in KOORDINATNOKLER:
                    hva = "koordinat"
                elif n in FODSELSNOKLER:
                    hva = "fødselsdato"
                elif n in HEMMELIGE_NOKLER:
                    hva = "nøkkel, passord eller e-post"
                else:
                    continue
                if (forelder, nokkel) not in sett:
                    sett.add((forelder, nokkel))
                    problemer.append(f"{sti}: {hva} i feltet «{forelder + '.' if forelder else ''}{nokkel}»")
    for m in EPOST.finditer(tekst):
        problemer.append(f"{sti}: e-postadresse «{m.group()}»")
    for m in TOKENMERKER.finditer(tekst):
        problemer.append(f"{sti}: ligner en nøkkel («{m.group()}»)")
    for m in LANG_STRENG.finditer(tekst):
        if _ligner_token(m.group()):
            problemer.append(f"{sti}: lang streng som ligner en nøkkel eller et token («{m.group()[:12]}…»)")
    return problemer


def finn_problemer(stier: list[str], rot: Path = ROOT) -> list[str]:
    """Sjekker stiene (relative til rot, med /) og innholdet i filene under data/."""
    problemer = []
    for sti in stier:
        problemer += sjekk_sti(sti)
        fil = rot / sti
        if sti.startswith("data/") and not sti.startswith(FORBUDTE_MAPPER) and fil.is_file():
            tekst = fil.read_text(encoding="utf-8-sig", errors="replace")
            problemer += sjekk_innhold(sti, tekst)
    return problemer


def sporede_filer(rot: Path = ROOT) -> list[str]:
    r = subprocess.run(["git", "ls-files", "-z"], cwd=rot, capture_output=True, check=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return [s for s in r.stdout.decode("utf-8").split("\0") if s]


def sjekk(rot: Path = ROOT) -> list[str]:
    """Sjekker alle filene git sporer i rot. Gir en tom liste når alt er i orden."""
    return finn_problemer(sporede_filer(rot), rot)


def main() -> int:
    for strom in (sys.stdout, sys.stderr):
        strom.reconfigure(encoding="utf-8")
    problemer = sjekk()
    if problemer:
        print(f"Personvernsjekken fant {len(problemer)} problem(er):", file=sys.stderr)
        for p in problemer:
            print(f"  {p}", file=sys.stderr)
        return 1
    print("Personvernsjekken fant ingenting.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
