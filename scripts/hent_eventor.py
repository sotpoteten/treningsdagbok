"""
Henter Isaks resultater og strekktider fra norsk Eventor og skriver data/konkurranser.json.

Kilder (alt bufres urørt i data/raw/eventor/, holdt utenfor git, fordi svarene har navn og
fødselsdato for andre løpere):
- results/person uten top: Isaks egne resultater med strekktider. Med top dropper Eventor
  løp der han ikke var blant de beste (se wiki: problem-eventor-top). Bufret i person.xml.
  En oppdatering henter de siste 60 dagene og fletter dem inn per løp.
- results/event?top=10: de 10 beste i hver klasse (pluss alle uten godkjent tid), til
  referansestrekk. Bufret per løp i event_<id>.xml.
- events?eventIds=…&includeAttributes=true: disiplin (o-løp, ski-o …) og Livelox-løpene.
  Bufret per løp i info_<id>.xml.
- Livelox' offentlige løpsside (www.livelox.com/Events/Show/<id>), for klasse-id-ene i Livelox.
  Bufret urørt i data/raw/livelox/<id>.html. Ett kall om gangen, med minst 1 s pause.
Et løp hentes på nytt bare hvis bufferfila mangler, eller ble hentet før det hadde gått
14 dager etter løpet (resultatene kan bli rettet de første dagene). Kallene går ett og ett,
med en liten pause.

Ut: data/konkurranser.json = {"individuelle": [...], "stafett": [...]}, med bare feltene
personvern.py tillater. Andre løpere står aldri i fila, bare avledede tall (vinnertid,
beste og referanse per strekk, antall).

Regler:
- tid_s, plass, antall og vinnertid_s (= tid − TimeDiff, ellers vinnerens tid i
  results/event). prosent_bak = (tid − vinnertid) / vinnertid × 100.
- Strekk: Eventor gir sammenlagt tid ved hver post, så strekktiden er differansen til
  forrige post (start for første post, og «mål» for siste strekk). Mangler et stempel, eller
  er tiden urimelig (≤ 0 eller lengre enn hele løpet), står strekket uten tid.
  Er siste «post» egentlig målenheten (samme tid som totalen, eller uten tid i et godkjent
  løp), blir den målstrekket, så mål = total − sammenlagt tid ved siste egentlige post.
  ref_s er snittet av de 3 beste strekktidene blant løperne i samme klasse som har samme
  strekk (samme fra- og til-post), og indeks = tid_s / ref_s. Bom er et strekk med indeks
  over 1,25 × medianen av indeksene. strekkfart er medianen av indeksene uten bom, og
  bomtid_s er summen av tid utover ref_s × median på bomstrekkene.
- Ugyldige strekktider (strekk_ugyldige): ligger mer enn halvparten av de sammenlagte tidene
  ved postene etter totaltiden, er strekktidene ødelagte (NM sprint ski-o 2024: tider på
  64–201 timer, mens totalen er 14:41, og WinSplits viser bare anslåtte tider). Da blir
  strekk, strekkfart og bomtid_s null, mens tid, plass og prosent bak beholdes. Andre løpere
  med slike strekk teller ikke i referansen.
- Lenker: Eventor-lenken går rett til klassen (eventClassId, og eventRaceId for en etappe i et
  flerdagersløp), slik Eventors egne sider lenker. Livelox-lenken går til klassen i
  avspilleren, med adressen Livelox selv lenker til fra løpssiden (/Viewer/<løp>/<klasse>?classId=…).
  Klassen finnes ved at Livelox oppgir Eventors klasse-id som externalIdentifier
  («<eventClassId>-<n>»). Finnes ikke klassen, eller feiler Livelox, lenkes det til løpet.
- Disiplin: raceDistance (Sprint, Long, UltraLong, TempO). Middle er Eventors standardverdi
  og står ikke i XML-en; da står den i WRSInfo/Distance, eller mangler helt. Fordi Middle er
  standard, overstyres den av et tydelig ord i løpsnavnet (sprint, ultra, lang).
- Flerdagersløp gir én post per etappe, med etappens dato. Ikke startet (DNS) tas ikke med.
- okt_ider: se velg_okter().

Krever data/raw/eventor.json: {"api_nokkel": "…", "person_id": …}.

Bruk (fra prosjektmappen):
    .venv\\Scripts\\python scripts/hent_eventor.py            # oppdater og skriv
    .venv\\Scripts\\python scripts/hent_eventor.py --lagret   # uten å hente results/person på nytt
"""
import html
import json
import re
import shutil
import statistics
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sammenlign_eventor import Feil, hent, les_oppsett

ROOT = Path(__file__).resolve().parent.parent
RA = ROOT / "data/raw/eventor"
PERSON = RA / "person.xml"
# Den komplette hentingen fra steg 1. Brukes som start hvis person.xml ikke finnes.
PERSON_START = RA / "results_person_2019-11-01_2026-10-25_strekk_ingen_top.xml"
OKTER = ROOT / "data/okter.json"
UT = ROOT / "data/konkurranser.json"
FRA = "2019-11-01"
TOPP = 10  # løpere per klasse fra results/event; nok til de 3 beste på hvert strekk
SETTLES = 14  # dager før resultatene regnes som endelige
OPPDATER_DAGER = 60  # så langt bak results/person hentes ved oppdatering
PAUSE = 0.5  # sekunder mellom kallene

EVENTOR = "https://eventor.orientering.no/Events/ResultList?eventId={}"
EVENTOR_KLASSE = "&eventClassId={}"
EVENTOR_ETAPPE = "&eventRaceId={}&overallResults=False"
LIVELOX = "https://www.livelox.com/Events/Show/{}"
LIVELOX_RA = ROOT / "data/raw/livelox"
LIVELOX_PAUSE = 1.5  # sekunder mellom kallene til Livelox
NETTLESER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
             "Chrome/130.0.0.0 Safari/537.36")
DISIPLINER = {"Sprint": "sprint", "Middle": "mellom", "Long": "lang", "UltraLong": "ultralang", "TempO": "tempo"}
TYPER = {"1": "o-løp", "2": "sykkel-o", "3": "ski-o", "4": "pre-o"}
STATUS = {"OK": "OK", "DidNotFinish": "DNF", "DidNotStart": "DNS", "Disqualified": "DSQ", "MisPunch": "MP",
          "NotCompeting": "NC", "OverTime": "OT", "Inactive": "DNS"}
BOM_GRENSE = 1.25
REF_ANTALL = 3
MAL_SLINGRING = 2  # sekunder: siste «post» så nær totaltiden er målenheten


# ── Små hjelpere for XML ────────────────────────────────

def t(e: ET.Element | None, sti: str) -> str | None:
    v = e.findtext(sti) if e is not None else None
    return v.strip() if v and v.strip() else None


def sekunder(tekst: str | None) -> int | None:
    """«1:32:13», «45:07» eller «0:08» → sekunder. Negative eller ugyldige tider gir None."""
    if not tekst or not re.fullmatch(r"\d+(:\d{1,2}){1,2}", tekst.strip()):
        return None
    s = 0
    for del_ in tekst.strip().split(":"):
        s = s * 60 + int(del_)
    return s


def resultater_i(person_result: ET.Element) -> list[tuple[str | None, ET.Element]]:
    """(EventRaceId, Result) for et PersonResult: ett per etappe i flerdagersløp."""
    rr = person_result.findall("RaceResult")
    if rr:
        return [(t(r, "EventRaceId"), r.find("Result")) for r in rr if r.find("Result") is not None]
    res = person_result.find("Result")
    return [(None, res)] if res is not None else []


def status_av(res: ET.Element) -> str | None:
    cs = res.find("CompetitorStatus")
    v = cs.get("value") if cs is not None else None
    return STATUS.get(v, v) if v else None


# ── Strekk ──────────────────────────────────────────────

def strekktider(res: ET.Element) -> list[dict]:
    """Strekkene for ett resultat: [{"fra", "til", "post", "tid_s"}], med «mål» til slutt.
    Eventor gir sammenlagt tid ved hver post. Et strekk uten gyldig tid i begge ender, eller
    med urimelig tid, får tid_s None."""
    total = sekunder(t(res, "Time"))
    poster = sorted(res.findall("SplitTime"), key=lambda s: int(s.get("sequence") or 0))
    if not poster:
        return []
    # Mange løp har målenheten som siste «post» i strekktidene, og da må målstrekket regnes
    # som total − sammenlagt tid ved siste egentlige post:
    # - siste post har samme tid som totalen (høyst MAL_SLINGRING s fra), eller
    # - siste post er uten tid, mens posten før har en gyldig tid (godkjent løp; et manglende
    #   stempel på siste post ville gitt disk).
    if total is not None and len(poster) >= 2:
        siste, nest = sekunder(t(poster[-1], "Time")), sekunder(t(poster[-2], "Time"))
        if siste is not None and 0 <= total - siste <= MAL_SLINGRING:
            poster = poster[:-1]
        elif siste is None and nest is not None and nest < total and status_av(res) == "OK":
            poster = poster[:-1]
    strekk = []
    forrige_kode, forrige_tid = "S", 0
    for s in [*poster, None]:
        if s is None:
            kode, tid = "M", total
        else:
            kode, tid = t(s, "ControlCode") or "?", sekunder(t(s, "Time"))
        lengde = None
        if tid is not None and forrige_tid is not None:
            lengde = tid - forrige_tid
            if lengde <= 0 or (total is not None and lengde > total):
                lengde = None
        strekk.append({"fra": forrige_kode, "til": kode, "post": len(strekk) + 1 if kode != "M" else "M",
                       "tid_s": lengde})
        forrige_kode, forrige_tid = kode, tid
    return strekk


def ugyldige_strekk(res: ET.Element) -> bool:
    """Er strekktidene ødelagte? Ja hvis mer enn halvparten av de sammenlagte tidene ved
    postene er lengre enn totaltiden (+ MAL_SLINGRING). Noen få poster etter totalen er
    vanlig (avlesning etter mål, sen start), men ikke at nesten alle er det."""
    total = sekunder(t(res, "Time"))
    if not total:
        return False
    tider = [x for s in res.findall("SplitTime") if (x := sekunder(t(s, "Time"))) is not None]
    return len(tider) > 0 and sum(x > total + MAL_SLINGRING for x in tider) * 2 > len(tider)


def eventor_lenke(eid: str, klasse_id: str | None = None, race_id: str | None = None) -> str:
    """Resultatlista i Eventor, for klassen når den er kjent. race_id gis bare for en etappe i
    et flerdagersløp, og da vises etappens resultater, ikke sammenlagt."""
    url = EVENTOR.format(eid)
    if klasse_id:
        url += EVENTOR_KLASSE.format(klasse_id)
        if race_id:
            url += EVENTOR_ETAPPE.format(race_id)
    return url


def strekknokler(strekk: list[dict]) -> list[tuple]:
    """Nøkkelen til hvert strekk: (fra, til, n), der n teller gjentatte strekk (sommerfugl)."""
    sett: dict[tuple, int] = {}
    nokler = []
    for s in strekk:
        par = (s["fra"], s["til"])
        sett[par] = sett.get(par, 0) + 1
        nokler.append((*par, sett[par]))
    return nokler


def referanser(egne: list[dict], andre: list[list[dict]]) -> list[dict]:
    """Legger til beste_s, ref_s og indeks på egne strekk. «andre» er strekkene til løperne i
    samme klasse (egne kan være med). Bare strekk med samme fra- og til-post sammenlignes."""
    pool: dict[tuple, list[int]] = {}
    for strekk in andre:
        for nokkel, s in zip(strekknokler(strekk), strekk):
            if s["tid_s"]:
                pool.setdefault(nokkel, []).append(s["tid_s"])
    ut = []
    for nokkel, s in zip(strekknokler(egne), egne):
        tider = sorted(pool.get(nokkel, []))
        beste = tider[0] if tider else None
        ref = round(sum(tider[:REF_ANTALL]) / len(tider[:REF_ANTALL]), 1) if tider else None
        indeks = round(s["tid_s"] / ref, 3) if s["tid_s"] and ref else None
        ut.append({"post": s["post"], "tid_s": s["tid_s"], "beste_s": beste, "ref_s": ref, "indeks": indeks,
                   "bom": False})
    return ut


def formmal(strekk: list[dict]) -> tuple[float | None, int | None]:
    """Markerer bom og gir (strekkfart, bomtid_s). Bom: indeks > 1,25 × medianen av alle
    indeksene. strekkfart: medianen uten bomstrekkene. bomtid_s: tid utover ref × median."""
    indekser = [s["indeks"] for s in strekk if s["indeks"]]
    if len(indekser) < 3:
        return None, None
    median = statistics.median(indekser)
    bomtid = 0.0
    for s in strekk:
        if s["indeks"] and s["indeks"] > BOM_GRENSE * median:
            s["bom"] = True
            bomtid += s["tid_s"] - s["ref_s"] * median
    uten_bom = [s["indeks"] for s in strekk if s["indeks"] and not s["bom"]]
    return round(statistics.median(uten_bom), 3), round(bomtid)


# ── Løpet ───────────────────────────────────────────────

def normaliser_klasse(navn: str | None) -> str | None:
    """«H 21-» → «H21», «H 19-20E» → «H19-20E», «M21E1» → «H21E1», «H 21- (WRE)» → «H21 (WRE)»."""
    if not navn:
        return None
    k = re.sub(r"\s+", " ", navn).strip()
    k = re.sub(r"^([HDMW])\s+(?=\d)", r"\1", k)
    k = re.sub(r"^M(?=\d)", "H", k)
    k = re.sub(r"^W(?=\d)", "D", k)
    k = re.sub(r"^([HD]\d+)-(?!\d)", r"\1", k)
    return re.sub(r"\s+", " ", k).strip()


def disiplin(race: ET.Element | None, navn: str) -> str | None:
    """Distansen fra Eventor. Middle er standardverdien og utelates i XML-en, så den
    overstyres av et tydelig ord i navnet."""
    verdi = (race.get("raceDistance") if race is not None else None) or t(race, "WRSInfo/Distance") or "Middle"
    d = DISIPLINER.get(verdi)
    if d == "mellom":
        n = navn.lower()
        if "sprint" in n:
            return "sprint"
        if "ultra" in n:
            return "ultralang"
        if re.search(r"\blang", n) and "mellom" not in n:
            return "lang"
    return d


def lopsnavn(event: ET.Element, race: ET.Element | None) -> str:
    navn = re.sub(r"\s+", " ", t(event, "Name") or "").strip()
    if race is not None and len(event.findall("EventRace")) > 1 and t(race, "Name"):
        navn = f"{navn} – {re.sub(r'\s+', ' ', t(race, 'Name'))}"
    return navn


def livelox_lenker(info: ET.Element | None, event: ET.Element) -> dict[str | None, str]:
    """EventRaceId → lenke til Livelox-løpet."""
    return {e: LIVELOX.format(i) for e, i in livelox_ider(info, event).items()}


def livelox_ider(info: ET.Element | None, event: ET.Element) -> dict[str | None, str]:
    """EventRaceId → Livelox' id for løpet. Eventor_LiveloxEventConfigurations er «id,n;id,n»,
    én per etappe i samme rekkefølge som etappene. Stemmer ikke antallet, brukes ingen."""
    if info is None:
        return {}
    verdi = next((t(h, "Value") for h in info.findall("HashTableEntry")
                  if t(h, "Key") == "Eventor_LiveloxEventConfigurations"), None)
    ider = [d.split(",")[0].strip() for d in (verdi or "").split(";") if d.split(",")[0].strip().isdigit()]
    etapper = [t(r, "EventRaceId") for r in event.findall("EventRace")]
    if not ider or len(ider) != len(etapper):
        return {}
    return dict(zip(etapper, ider))


def livelox_klasser(side: str) -> list[tuple[int, str, int]]:
    """(Livelox' klasse-id, externalIdentifier, antall deltakere) for klassene på en
    Livelox-løpsside. Klassene ligger som JSON i siden («"classes":[…]»); bare klasser med
    Eventor-id (system 1) tas med."""
    ut, dekoder = [], json.JSONDecoder()
    for m in re.finditer(r'"classes"\s*:\s*\[', side):
        try:
            klasser, _ = dekoder.raw_decode(side, m.end() - 1)
        except ValueError:
            continue
        for k in klasser if isinstance(klasser, list) else []:
            ekst = k.get("externalIdentifier") if isinstance(k, dict) else None
            if isinstance(ekst, dict) and ekst.get("system") == 1 and isinstance(k.get("id"), int):
                antall = k.get("participantCount")
                ut.append((k["id"], str(ekst.get("id")), antall if isinstance(antall, int) else 0))
    return list(dict.fromkeys(ut))


def livelox_klasselenke(side: str, klasse_id: str | None, etappe: int = 1) -> str | None:
    """Lenken til klassen i Livelox-avspilleren, slik Livelox selv lenker til den fra
    løpssiden. Klassen finnes via externalIdentifier «<eventClassId>-<n>», der n er
    etappenummeret. Noen løp har i tillegg tomme kopier av klassen med samme id (0
    deltakere); da velges klassen med flest deltakere. None hvis klassen ikke finnes entydig."""
    if not klasse_id:
        return None
    treff = [k for k in livelox_klasser(side) if k[1].split("-")[0] == klasse_id]
    if len(treff) > 1:
        treff = [k for k in treff if k[1] == f"{klasse_id}-{etappe}"]
    if len(treff) > 1:
        flest = max(k[2] for k in treff)
        treff = [k for k in treff if k[2] == flest]
    if len(treff) != 1:
        return None
    m = re.search(rf'href="(/Viewer/[^"?]+\?classId={treff[0][0]})"', side)
    return "https://www.livelox.com" + html.unescape(m.group(1)) if m else None


def er_meg(e: ET.Element, person_id: str) -> bool:
    return t(e, "Person/PersonId") == person_id


def klasse_strekk(event_xml: ET.Element | None, klasse_id: str | None, race_id: str | None) -> list[list[dict]]:
    """Strekkene til løperne i klassen fra results/event (bare tall; navnene leses aldri)."""
    if event_xml is None or not klasse_id:
        return []
    ut = []
    for kr in event_xml.findall("ClassResult"):
        if t(kr, "EventClass/EventClassId") != klasse_id:
            continue
        for pr in kr.findall("PersonResult"):
            for rid, res in resultater_i(pr):
                if ((race_id is None or rid is None or rid == race_id) and status_av(res) == "OK"
                        and not ugyldige_strekk(res)):
                    ut.append(strekktider(res))
    return ut


def vinnertid_fra_event(event_xml: ET.Element | None, klasse_id: str | None, race_id: str | None) -> int | None:
    if event_xml is None or not klasse_id:
        return None
    tider = []
    for kr in event_xml.findall("ClassResult"):
        if t(kr, "EventClass/EventClassId") != klasse_id:
            continue
        for pr in kr.findall("PersonResult"):
            for rid, res in resultater_i(pr):
                if (race_id is None or rid is None or rid == race_id) and status_av(res) == "OK":
                    if (s := sekunder(t(res, "Time"))) is not None:
                        tider.append(s)
    return min(tider) if tider else None


def antall_startende(kr: ET.Element, race_id: str | None) -> int | None:
    for info in kr.findall("EventClass/ClassRaceInfo"):
        if race_id is None or t(info, "EventRaceId") == race_id:
            v = info.get("noOfStarts")
            if v and v.isdigit() and int(v) > 0:
                return int(v)
    v = kr.get("numberOfStarts") or kr.get("numberOfEntries")
    return int(v) if v and v.isdigit() else None


def individuelt(event: ET.Element, kr: ET.Element, race_id: str | None, res: ET.Element,
                info: ET.Element | None, event_xml: ET.Element | None,
                livelox: dict[str, str] | None = None) -> dict | None:
    """Én post for ett individuelt løp (eller én etappe). None for DNS."""
    status = status_av(res)
    if status == "DNS":
        return None
    eid = t(event, "EventId")
    races = event.findall("EventRace")
    race = next((r for r in races if t(r, "EventRaceId") == race_id), races[0] if races else None)
    dato = t(race, "RaceDate/Date") or t(event, "StartDate/Date")
    navn = lopsnavn(event, race)
    klasse_id = t(kr, "EventClass/EventClassId")
    rid = t(race, "EventRaceId")

    tid = sekunder(t(res, "Time")) if status == "OK" else None
    diff = sekunder(t(res, "TimeDiff"))
    vinnertid = tid - diff if tid is not None and diff is not None else None
    if vinnertid is None:
        vinnertid = vinnertid_fra_event(event_xml, klasse_id, rid)
    plass = t(res, "ResultPosition")
    plass = int(plass) if plass and plass.isdigit() and int(plass) > 0 and status == "OK" else None

    ugyldige = ugyldige_strekk(res)
    egne = [] if ugyldige else strekktider(res)
    strekk, strekkfart, bomtid = None, None, None
    if egne and any(s["tid_s"] for s in egne):
        # Uten andre løpere å sammenligne med blir referansen bare egen tid, og det sier ingenting.
        andre = klasse_strekk(event_xml, klasse_id, rid)
        strekk = referanser(egne, andre + [egne]) if andre else referanser(egne, [])
        strekkfart, bomtid = formmal(strekk) if status == "OK" else (None, None)

    lenker = {"eventor": eventor_lenke(eid, klasse_id, rid if len(races) > 1 else None)}
    if lx_id := livelox_ider(info, event).get(rid):
        side = (livelox or {}).get(lx_id)
        etappe = races.index(race) + 1 if race is not None else 1
        lenker["livelox"] = (side and livelox_klasselenke(side, klasse_id, etappe)) or LIVELOX.format(lx_id)
    typ = TYPER.get(t(info, "DisciplineId") or "")
    return {
        "eventor_id": int(eid),
        "dato": dato[:10] if dato else None,
        "navn": navn,
        "arrangor": t(event, "Organiser/Organisation/Name"),
        "type": typ,
        "disiplin": disiplin(race, navn),
        "natt": (race.get("raceLightCondition") in ("Night", "DayAndNight")) if race is not None else False,
        "klasse": normaliser_klasse(t(kr, "EventClass/Name")),
        "status": status,
        "tid_s": tid,
        "plass": plass,
        "antall": antall_startende(kr, rid),
        "vinnertid_s": vinnertid,
        "prosent_bak": round((tid - vinnertid) / vinnertid * 100, 1) if tid and vinnertid else None,
        "strekk": strekk,
        "strekkfart": strekkfart,
        "bomtid_s": bomtid,
        "strekk_ugyldige": ugyldige,
        "lenker": lenker,
        "okt_ider": [],
    }


def stafett(event: ET.Element, kr: ET.Element, team: ET.Element, medlem: ET.Element) -> dict:
    """Stafett og lag: bare løpet, klassen, etappen, Isaks status og lagets plass."""
    eid = t(event, "EventId")
    race = event.find("EventRace")
    dato = t(race, "RaceDate/Date") or t(event, "StartDate/Date")
    etappe = t(medlem, "Leg")
    plass = t(team, "ResultPosition")
    return {
        "eventor_id": int(eid),
        "dato": dato[:10] if dato else None,
        "navn": lopsnavn(event, race),
        "klasse": normaliser_klasse(t(kr, "EventClass/Name")),
        "etappe": int(etappe) if etappe and etappe.isdigit() else None,
        "status": status_av(medlem),
        "plass": int(plass) if plass and plass.isdigit() and int(plass) > 0 else None,
        "lenker": {"eventor": eventor_lenke(eid, t(kr, "EventClass/EventClassId"))},
        "okt_ider": [],
    }


def konverter(person_xml: bytes, person_id: str, infoer: dict[str, ET.Element],
              eventer: dict[str, ET.Element], livelox: dict[str, str] | None = None) -> dict:
    """Gjør results/person (og bufrede results/event og events) om til konkurranser.json.
    infoer og eventer er per EventId, livelox (sidene) per Livelox-id. Ren funksjon; okt_ider
    fylles av koble_okter()."""
    rot = ET.fromstring(person_xml)
    lister = [rot] if rot.tag == "ResultList" else rot.findall("ResultList")
    indiv, staf = [], []
    for rl in lister:
        event = rl.find("Event")
        if event is None or "eventor test" in (t(event, "Name") or "").lower():
            continue  # et testløp i Eventor, ikke et løp
        eid = t(event, "EventId")
        for kr in rl.findall("ClassResult"):
            for pr in kr.findall("PersonResult"):
                if not er_meg(pr, person_id):
                    continue
                for rid, res in resultater_i(pr):
                    post = individuelt(event, kr, rid, res, infoer.get(eid), eventer.get(eid), livelox)
                    if post:
                        indiv.append(post)
            for team in kr.findall("TeamResult"):
                for m in team.findall("TeamMemberResult"):
                    if er_meg(m, person_id) and status_av(m) != "DNS":
                        staf.append(stafett(event, kr, team, m))
    nokkel = lambda p: (p["dato"] or "", p["eventor_id"], p["klasse"] or "")  # noqa: E731
    # Et lag kan stå i to klasser (f.eks. «DHDH» og «DHDH NM») med samme etappe; behold én.
    unike, sett = [], set()
    for p in sorted(staf, key=nokkel):
        if (p["eventor_id"], p["dato"], p["etappe"]) not in sett:
            sett.add((p["eventor_id"], p["dato"], p["etappe"]))
            unike.append(p)
    return {"individuelle": sorted(indiv, key=nokkel), "stafett": unike}


# ── Kobling til dagboka ─────────────────────────────────

IKKE_LOP = re.compile(r"jogg|oppvarm|restitu|^rest|styrke|tøy|bevegelighet|ellipse|spinn|mølle|skate|stak\b|"
                      r"klassisk|kunstgress|gress|hente kart|^sti\b|stitur", re.I)
LOPSORD = ("sprint", "mellom", "lang", "natt", "stafett", "knockout", "prolog", "kval", "semi", "finale",
           "jaktstart", "konk", "løpet", "cup", "uttak", "test", "night", "ultra")
KORTE_LOPSORD = {"nm", "nc", "km", "ko", "qf", "sf"}
STOPPORD = {"og", "med", "i", "på", "til", "for", "av", "the", "en"}


def ord_i(tekst: str) -> set[str]:
    return {o for o in re.findall(r"[a-zæøå0-9]+", tekst.lower()) if (len(o) >= 2 or o.isdigit()) and o not in STOPPORD}


def _likt(a: str, b: str) -> bool:
    return a == b or (min(len(a), len(b)) >= 5 and (a.startswith(b) or b.startswith(a)))


def velg_okter(lop: dict, okter: list[dict]) -> list[str]:
    """Dagbokøktene samme dag som hører til løpet. Regel:
    1. Bare økter samme dato, og ikke økter som heter noe med jogg, oppvarming, styrke,
       mølle, skate o.l. e-tempO og andre løp med disiplin «tempo» kobles ikke (de løses
       foran en skjerm).
    2. Øktene som har flest ord felles med løpsnavnet (like ord, eller samme begynnelse på
       ord med minst 5 bokstaver, f.eks. festival/festivalen).
    3. Ellers øktene med løpsord i navnet (NM, sprint, mellom, stafett, KO, finale …).
    4. Ellers øktene med o-teknikk (et løp som er gått rolig, heter ofte «Rolig …»).
    5. Ellers ingen."""
    if lop.get("disiplin") == "tempo":
        return []
    kandidater = [o for o in okter if o["dato"] == lop["dato"] and not IKKE_LOP.search(o.get("navn") or "")]
    if not kandidater:
        return []
    lopsord = ord_i(lop["navn"] or "")
    poeng = {o["id"]: sum(any(_likt(a, b) for b in lopsord) for a in ord_i(o.get("navn") or "")) for o in kandidater}
    best = max(poeng.values())
    if best > 0:
        return [o["id"] for o in kandidater if poeng[o["id"]] == best]
    med_ord = [o["id"] for o in kandidater
               if any(o_ in KORTE_LOPSORD or any(w in o_ for w in LOPSORD) for o_ in ord_i(o.get("navn") or ""))]
    if med_ord:
        return med_ord
    return [o["id"] for o in kandidater if o.get("otek_min")]


def koble_okter(data: dict, okter: list[dict]) -> None:
    per_dato: dict[str, list[dict]] = {}
    for o in okter:
        per_dato.setdefault(o["dato"], []).append(o)
    for liste in data.values():
        for lop in liste:
            lop["okt_ider"] = velg_okter(lop, per_dato.get(lop["dato"], []))


# ── Henting og buffer ───────────────────────────────────

def trenger_henting(fil: Path, dato: str | None, i_dag: date) -> bool:
    """Mangler fila, eller ble den hentet før resultatene kunne regnes som endelige?"""
    if not fil.exists():
        return True
    if not dato:
        return False
    endelig = date.fromisoformat(dato[:10]) + timedelta(days=SETTLES)
    hentet = date.fromtimestamp(fil.stat().st_mtime)
    return hentet < endelig and i_dag >= date.fromisoformat(dato[:10])


def flett_person(gammel: bytes, ny: bytes) -> bytes:
    """Legger resultatlistene i ny inn i gammel, og erstatter løp med samme EventId."""
    rot = ET.fromstring(gammel)
    nye = ET.fromstring(ny).findall("ResultList")
    ider = {t(rl, "Event/EventId") for rl in nye}
    for rl in [rl for rl in rot.findall("ResultList") if t(rl, "Event/EventId") in ider]:
        rot.remove(rl)
    rot.extend(nye)
    return ET.tostring(rot, encoding="utf-8", xml_declaration=True)


def _vent():
    time.sleep(PAUSE)


def hent_person(nokkel: str, person_id: str, i_dag: date) -> bytes:
    RA.mkdir(parents=True, exist_ok=True)
    if not PERSON.exists() and PERSON_START.exists():
        shutil.copyfile(PERSON_START, PERSON)
    fra = (i_dag - timedelta(days=OPPDATER_DAGER)).isoformat() if PERSON.exists() else FRA
    ny = hent("/results/person", nokkel, personId=person_id, fromDate=fra, toDate=i_dag.isoformat(),
              includeSplitTimes="true")
    data = flett_person(PERSON.read_bytes(), ny) if PERSON.exists() else ny
    PERSON.write_bytes(data)
    return data


def lop_i(person_xml: bytes) -> list[tuple[str, str, bool]]:
    """(EventId, siste dato, er_stafett) for hvert løp i results/person."""
    ut = []
    for rl in ET.fromstring(person_xml).findall("ResultList"):
        ev = rl.find("Event")
        datoer = [t(r, "RaceDate/Date") for r in ev.findall("EventRace")] + [t(ev, "StartDate/Date")]
        stafett_ = ev.get("eventForm", "").startswith("Relay") or rl.find("ClassResult/TeamResult") is not None
        ut.append((t(ev, "EventId"), max(d for d in datoer if d)[:10], stafett_))
    return ut


def hent_buffer(nokkel: str, lop: list[tuple[str, str, bool]], i_dag: date) -> tuple[int, int]:
    """Henter info_<id>.xml (i bolker) og event_<id>.xml (ett og ett) som mangler eller ikke
    er endelige. Gir antall kall."""
    info_mangler = [eid for eid, dato, _ in lop if trenger_henting(RA / f"info_{eid}.xml", dato, i_dag)]
    kall_info = 0
    for i in range(0, len(info_mangler), 50):
        bolk = info_mangler[i:i + 50]
        svar = ET.fromstring(hent("/events", nokkel, eventIds=",".join(bolk), includeAttributes="true"))
        kall_info += 1
        for ev in svar.findall("Event"):
            (RA / f"info_{t(ev, 'EventId')}.xml").write_bytes(ET.tostring(ev, encoding="utf-8"))
        _vent()
    kall_event = 0
    for eid, dato, er_stafett in lop:
        fil = RA / f"event_{eid}.xml"
        if er_stafett or not trenger_henting(fil, dato, i_dag):
            continue
        try:
            fil.write_bytes(hent("/results/event", nokkel, eventId=eid, includeSplitTimes="true", top=TOPP))
        except Feil as e:  # ett løp som feiler, stopper ikke resten; det prøves igjen neste gang
            print(f"  results/event {eid}: {e}", file=sys.stderr)
        kall_event += 1
        _vent()
    return kall_info, kall_event


def les_buffer(lop: list[tuple[str, str, bool]]) -> tuple[dict, dict]:
    infoer, eventer = {}, {}
    for eid, _, _ in lop:
        if (f := RA / f"info_{eid}.xml").exists():
            infoer[eid] = ET.fromstring(f.read_bytes())
        if (f := RA / f"event_{eid}.xml").exists():
            try:
                eventer[eid] = ET.fromstring(f.read_bytes())
            except ET.ParseError:
                pass
    return infoer, eventer


def livelox_lop(lop: list[tuple[str, str, bool]], infoer: dict[str, ET.Element]) -> list[tuple[str, str]]:
    """(Livelox-id, dato) for de individuelle løpene som har et Livelox-løp. Svaret fra events
    har etappene (EventRace), så det brukes både som info og som løp."""
    ut = []
    for eid, dato, er_stafett in lop:
        info = infoer.get(eid)
        if er_stafett or info is None:
            continue
        ut += [(lx, dato) for lx in dict.fromkeys(livelox_ider(info, info).values())]
    return ut


def hent_livelox_side(lx_id: str) -> str:
    """Den offentlige løpssiden i Livelox. Feiler med Feil hvis siden ikke har klasser med
    Eventor-id (f.eks. en side som ber om innlogging), så en slik side aldri bufres."""
    sporring = urllib.request.Request(LIVELOX.format(lx_id), headers={
        "User-Agent": NETTLESER, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "nb-NO,nb;q=0.9"})
    with urllib.request.urlopen(sporring, timeout=30) as svar:
        side = svar.read().decode("utf-8", errors="replace")
    if not livelox_klasser(side):
        raise Feil("siden mangler klasser med Eventor-id")
    return side


def hent_livelox(lx_lop: list[tuple[str, str]], i_dag: date) -> tuple[int, list[str]]:
    """Henter Livelox-sidene som mangler eller ikke er endelige. En side som feiler, logges og
    hoppes over (da lenkes det til løpet), og prøves igjen neste gang. Gir (kall, feil)."""
    LIVELOX_RA.mkdir(parents=True, exist_ok=True)
    kall, feil = 0, []
    for lx_id, dato in lx_lop:
        fil = LIVELOX_RA / f"{lx_id}.html"
        if not trenger_henting(fil, dato, i_dag):
            continue
        if kall:
            time.sleep(LIVELOX_PAUSE)
        kall += 1
        try:
            fil.write_text(hent_livelox_side(lx_id), encoding="utf-8")
        except (OSError, Feil) as e:  # Livelox skal aldri stoppe hentingen
            feil.append(lx_id)
            print(f"  Livelox {lx_id}: {e}", file=sys.stderr)
    return kall, feil


def les_livelox(lx_lop: list[tuple[str, str]]) -> dict[str, str]:
    return {lx: f.read_text(encoding="utf-8") for lx, _ in lx_lop if (f := LIVELOX_RA / f"{lx}.html").exists()}


def skriv(data: dict) -> None:
    UT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def oppdater(hent_person_pa_nytt: bool = True) -> str:
    """Henter det som mangler, konverterer og skriver data/konkurranser.json. Gir en kort
    oppsummering til logg og varsel."""
    nokkel, person_id = les_oppsett()
    i_dag = date.today()
    if hent_person_pa_nytt:
        person = hent_person(nokkel, person_id, i_dag)
    else:
        kilde = PERSON if PERSON.exists() else PERSON_START
        if not kilde.exists():
            raise Feil("fant ingen bufret results/person i data/raw/eventor/")
        person = kilde.read_bytes()
    lop = lop_i(person)
    kall_info, kall_event = hent_buffer(nokkel, lop, i_dag)
    infoer, eventer = les_buffer(lop)
    lx_lop = livelox_lop(lop, infoer)
    kall_lx, feil_lx = hent_livelox(lx_lop, i_dag)
    data = konverter(person, person_id, infoer, eventer, les_livelox(lx_lop))
    koble_okter(data, json.loads(OKTER.read_text(encoding="utf-8")))
    skriv(data)
    ind = data["individuelle"]
    return (f"Eventor: {len(ind)} individuelle løp ({sum(1 for p in ind if p['strekk'])} med strekk), "
            f"{len(data['stafett'])} stafetter, {kall_info + kall_event} kall, "
            f"Livelox: {sum(1 for p in ind if '/Viewer/' in p['lenker'].get('livelox', ''))} klasselenker, "
            f"{kall_lx} kall" + (f", {len(feil_lx)} feilet" if feil_lx else ""))


if __name__ == "__main__":
    for strom in (sys.stdout, sys.stderr):
        strom.reconfigure(encoding="utf-8")
    try:
        print(oppdater(hent_person_pa_nytt="--lagret" not in sys.argv[1:]))
    except Feil as e:
        sys.exit(f"Avbrutt: {e}. data/konkurranser.json er ikke endret.")
