"""
Tester konverteringen i hent_eventor.py på små, oppdiktede Eventor-svar (ingen nettverk).
Navnene på de andre løperne er oppdiktet («Ola Testløper»), og testen passer på at de aldri
havner i data/konkurranser.json.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_hent_eventor.py
"""
import json
import os
import statistics
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hent_eventor
import personvern
from hent_eventor import (
    disiplin,
    eventor_lenke,
    flett_person,
    formmal,
    koble_okter,
    konverter,
    livelox_klasselenke,
    livelox_klasser,
    livelox_lenker,
    normaliser_klasse,
    referanser,
    sekunder,
    strekktider,
    trenger_henting,
    ugyldige_strekk,
    velg_okter,
)

MEG = "9"


def person(pid: str, fornavn: str, etternavn: str) -> str:
    return (f"<Person><PersonName><Family>{etternavn}</Family><Given sequence='1'>{fornavn}</Given></PersonName>"
            f"<PersonId>{pid}</PersonId><BirthDate><Date>2001-02-03</Date></BirthDate></Person>")


def resultat(tid: str, poster: list[tuple[str, str | None]], status="OK", plass="1", diff=None) -> str:
    strekk = "".join(f"<SplitTime sequence='{i + 1}'><ControlCode>{k}</ControlCode>"
                     + (f"<Time>{t}</Time>" if t else "") + "</SplitTime>" for i, (k, t) in enumerate(poster))
    return (f"<Result><Time>{tid}</Time>" + (f"<TimeDiff>{diff}</TimeDiff>" if diff else "")
            + f"<ResultPosition>{plass}</ResultPosition><CompetitorStatus value='{status}' />{strekk}</Result>")


def klasse(cid: str, navn: str, innhold: str, starter="12") -> str:
    return (f"<ClassResult numberOfStarts='{starter}'><EventClass><EventClassId>{cid}</EventClassId>"
            f"<Name>{navn}</Name><ClassRaceInfo noOfStarts='{starter}'><EventRaceId>101</EventRaceId>"
            f"</ClassRaceInfo></EventClass>{innhold}</ClassResult>")


def lop(eid: str, navn: str, races: str, form="") -> str:
    return (f"<Event{form}><EventId>{eid}</EventId><Name>{navn}</Name><StartDate><Date>2025-06-14</Date></StartDate>"
            f"<Organiser><Organisation><Name>Eksempel OK</Name></Organisation></Organiser>{races}</Event>")


def race(rid: str, dato: str, navn="", distanse=None, lys=None) -> str:
    attr = (f" raceDistance='{distanse}'" if distanse else "") + (f" raceLightCondition='{lys}'" if lys else "")
    return (f"<EventRace{attr}><EventRaceId>{rid}</EventRaceId><Name>{navn}</Name>"
            f"<RaceDate><Date>{dato}</Date></RaceDate></EventRace>")


POSTER = ["31", "32", "33", "34"]
# Egne sammenlagte tider: strekkene blir 120, 120, 300 (bom), 120 og 60 til mål.
EGET = resultat("12:00", list(zip(POSTER, ["2:00", "4:00", "9:00", "11:00"])), plass="3", diff="1:00")

PERSON_XML = ("<ResultListList>"
              # 1: individuelt endagsløp uten raceDistance (Middle), med strekk
              "<ResultList>" + lop("100", "Testløpet", race("101", "2025-06-14"))
              + klasse("1", "H 21-", f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}{EGET}</PersonResult>")
              + "</ResultList>"
              # 2: flerdagersløp, én etappe sprint og én uten distanse men med «lang» i navnet
              + "<ResultList>" + lop("200", "Testdagene", race("201", "2025-07-01", "Dag 1", "Sprint", "Night")
                                     + race("202", "2025-07-02", "Dag 2 lang"), " eventForm='IndMultiDay'")
              + klasse("2", "M21E", f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}"
                       f"<RaceResult><EventRaceId>201</EventRaceId>{resultat('15:00', [], diff='0:30')}</RaceResult>"
                       f"<RaceResult><EventRaceId>202</EventRaceId>{resultat('50:00', [], status='MisPunch')}"
                       "</RaceResult></PersonResult>")
              + "</ResultList>"
              # 3: stafett, der Isak går 2. etappe på et lag med en annen løper
              + "<ResultList>" + lop("300", "Teststafetten", race("301", "2025-08-01", distanse="Long"),
                                     " eventForm='RelaySingleDay'")
              + klasse("3", "H 17-", "<TeamResult><TeamName>Eksempel OK 1</TeamName><ResultPosition>4</ResultPosition>"
                       f"<TeamMemberResult>{person('5', 'Kari', 'Testløper')}<Leg>1</Leg>"
                       "<CompetitorStatus value='OK' /></TeamMemberResult>"
                       f"<TeamMemberResult>{person(MEG, 'Isak', 'Eksempel')}<Leg>2</Leg>"
                       "<CompetitorStatus value='OK' /></TeamMemberResult></TeamResult>")
              + "</ResultList>"
              # 4: ikke startet, skal ikke tas med
              + "<ResultList>" + lop("400", "Ikke startet", race("401", "2025-09-01"))
              + klasse("4", "H21", f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}"
                       f"{resultat('0:00', [], status='DidNotStart', plass='0')}</PersonResult>")
              + "</ResultList></ResultListList>").encode()

# results/event for løp 100: tre andre løpere i samme klasse og én i en annen klasse.
ANDRE = [("1", "Ola", "Testløper", ["1:40", "3:30", "5:20", "7:00"], "8:00"),
         ("2", "Per", "Testløper", ["1:50", "3:40", "5:40", "7:30"], "8:30"),
         ("3", "Pål", "Testløper", ["2:00", "4:00", "6:00", "8:00"], "9:00")]
EVENT_XML = ("<ResultList>" + lop("100", "Testløpet", race("101", "2025-06-14"))
             + klasse("1", "H 21-", "".join(
                 f"<PersonResult>{person(pid, f, e)}{resultat(tid, list(zip(POSTER, tider)), plass=str(i + 1))}"
                 "</PersonResult>" for i, (pid, f, e, tider, tid) in enumerate(ANDRE))
                 + f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}{EGET}</PersonResult>")
             + klasse("99", "D 21-", f"<PersonResult>{person('7', 'Kari', 'Testløper')}"
                      f"{resultat('5:00', list(zip(POSTER, ['0:30', '1:00', '1:30', '2:00'])))}</PersonResult>")
             + "</ResultList>").encode()

INFO_XML = ("<Event><EventId>200</EventId><DisciplineId>1</DisciplineId><HashTableEntry>"
            "<Key>Eventor_LiveloxEventConfigurations</Key><Value>50618,1;50619,1</Value></HashTableEntry></Event>")


def konverter_alt() -> dict:
    return konverter(PERSON_XML, MEG, {"200": ET.fromstring(INFO_XML)}, {"100": ET.fromstring(EVENT_XML)})


class TestTider(unittest.TestCase):
    def test_sekunder(self):
        self.assertEqual(sekunder("1:32:13"), 5533)
        self.assertEqual(sekunder("45:07"), 2707)
        self.assertEqual(sekunder("0:08"), 8)
        self.assertIsNone(sekunder("-2:42"))
        self.assertIsNone(sekunder(None))

    def test_sammenlagt_blir_strekktider(self):
        res = ET.fromstring(EGET)
        self.assertEqual([s["tid_s"] for s in strekktider(res)], [120, 120, 300, 120, 60])
        self.assertEqual([s["post"] for s in strekktider(res)], [1, 2, 3, 4, "M"])

    def test_manglende_stempel(self):
        res = ET.fromstring(resultat("6:00", [("31", "1:00"), ("32", "2:30"), ("33", None), ("34", "5:00")]))
        self.assertEqual([s["tid_s"] for s in strekktider(res)], [60, 90, None, None, 60])

    def test_maalenhet_som_siste_post_blir_maalstrekk(self):
        # Siste «post» har samme tid som totalen: det er målenheten, ikke en egen post.
        res = ET.fromstring(resultat("6:00", [("31", "2:00"), ("32", "5:15"), ("90", "6:00")]))
        self.assertEqual([s["post"] for s in strekktider(res)], [1, 2, "M"])
        self.assertEqual([s["tid_s"] for s in strekktider(res)], [120, 195, 45])
        self.assertEqual(strekktider(res)[-1]["fra"], "32")
        # Siste «post» uten tid i et godkjent løp: også målenheten.
        res = ET.fromstring(resultat("6:00", [("31", "2:00"), ("32", "5:15"), ("999", None)]))
        self.assertEqual([s["tid_s"] for s in strekktider(res)], [120, 195, 45])
        # Men ikke i et diskvalifisert løp, der siste post kan mangle stempel.
        res = ET.fromstring(resultat("6:00", [("31", "2:00"), ("32", "5:15"), ("33", None)], status="MisPunch"))
        self.assertEqual([s["post"] for s in strekktider(res)], [1, 2, 3, "M"])

    def test_maalstrekk_faar_referanse(self):
        # Referanseløperne har også målenheten som siste post, så målstrekket sammenlignes.
        egne = strekktider(ET.fromstring(resultat("6:00", [("31", "2:00"), ("32", "5:15"), ("90", "6:00")])))
        andre = [strekktider(ET.fromstring(resultat(tot, [("31", a), ("32", b), ("90", tot)])))
                 for tot, a, b in [("5:00", "1:40", "4:30"), ("5:10", "1:50", "4:40"), ("5:20", "1:45", "4:50")]]
        maal = referanser(egne, andre)[-1]
        self.assertEqual(maal["post"], "M")
        self.assertEqual(maal["ref_s"], 30.0)
        self.assertEqual(maal["indeks"], 1.5)

    def test_urimelige_tider_droppes(self):
        # Eventor har løp med negative tider og tider med 201 timer i strekkene.
        res = ET.fromstring(resultat("10:00", [("31", "201:00:00"), ("32", "201:02:00"), ("33", "-1:00")]))
        self.assertEqual([s["tid_s"] for s in strekktider(res)], [None, 120, None, None])


class TestForm(unittest.TestCase):
    def test_kjent_bomstrekk(self):
        egne = [{"fra": a, "til": b, "post": i + 1, "tid_s": t}
                for i, (a, b, t) in enumerate([("S", "1", 100), ("1", "2", 100), ("2", "3", 100),
                                               ("3", "4", 200), ("4", "M", 100)])]
        andre = [[{**s, "tid_s": 100} for s in egne] for _ in range(3)]
        strekk = referanser(egne, andre)
        self.assertEqual([s["indeks"] for s in strekk], [1.0, 1.0, 1.0, 2.0, 1.0])
        strekkfart, bomtid = formmal(strekk)
        self.assertEqual([s["bom"] for s in strekk], [False, False, False, True, False])
        self.assertEqual(strekkfart, 1.0)
        self.assertEqual(bomtid, 100)

    def test_ref_er_snittet_av_de_tre_beste_paa_samme_strekk(self):
        egne = [{"fra": "S", "til": "1", "post": 1, "tid_s": 90}]
        andre = [[{"fra": "S", "til": "1", "post": 1, "tid_s": t}] for t in (60, 70, 80, 200)]
        andre.append([{"fra": "S", "til": "7", "post": 1, "tid_s": 10}])  # annen post: teller ikke
        s = referanser(egne, andre)[0]
        self.assertEqual((s["beste_s"], s["ref_s"], s["indeks"]), (60, 70.0, round(90 / 70, 3)))

    def test_for_faa_strekk_gir_ingen_strekkfart(self):
        self.assertEqual(formmal([{"indeks": 1.0, "bom": False}]), (None, None))


class TestLopet(unittest.TestCase):
    def test_klasser(self):
        for inn, ut in [("H 21-", "H21"), ("H 19-20E", "H19-20E"), ("M21E1", "H21E1"), ("H 21- (WRE)", "H21 (WRE)"),
                        ("H 21-E1", "H21E1"), ("H 17-20", "H17-20"), ("H21 A-Finale", "H21 A-Finale"),
                        ("W21", "D21"), ("Herrer", "Herrer"), (None, None)]:
            self.assertEqual(normaliser_klasse(inn), ut, inn)

    def test_mellom_er_standard_og_navnet_overstyrer(self):
        uten = ET.fromstring(race("1", "2025-01-01"))
        wrs = ET.fromstring("<EventRace><WRSInfo><Distance>Middle</Distance></WRSInfo></EventRace>")
        self.assertEqual(disiplin(uten, "Barlindkohorten"), "mellom")
        self.assertEqual(disiplin(wrs, "NM mellom"), "mellom")
        self.assertEqual(disiplin(uten, "Ski-o-treff Nattsprint"), "sprint")
        self.assertEqual(disiplin(uten, "Ski-o-treff Langdistanse"), "lang")
        self.assertEqual(disiplin(uten, "Langløpet"), "lang")
        self.assertEqual(disiplin(uten, "NM Ultralang"), "ultralang")
        # En oppgitt distanse overstyres ikke.
        self.assertEqual(disiplin(ET.fromstring(race("1", "2025-01-01", distanse="Long")), "NC mellom"), "lang")
        self.assertEqual(disiplin(ET.fromstring(race("1", "2025-01-01", distanse="TempO")), "e-tempO"), "tempo")

    def test_livelox_per_etappe(self):
        event = ET.fromstring(lop("200", "x", race("201", "2025-07-01") + race("202", "2025-07-02")))
        lenker = livelox_lenker(ET.fromstring(INFO_XML), event)
        self.assertEqual(lenker, {"201": "https://www.livelox.com/Events/Show/50618",
                                  "202": "https://www.livelox.com/Events/Show/50619"})
        enkelt = ET.fromstring(lop("100", "x", race("101", "2025-06-14")))
        self.assertEqual(livelox_lenker(ET.fromstring(INFO_XML), enkelt), {})  # antallet stemmer ikke


class TestKonverter(unittest.TestCase):
    def setUp(self):
        self.data = konverter_alt()
        self.ind = self.data["individuelle"]

    def test_antall_og_dns(self):
        self.assertEqual(len(self.ind), 3)  # løp 100, og to etapper i løp 200; DNS er utelatt
        self.assertEqual(len(self.data["stafett"]), 1)
        self.assertNotIn(400, {p["eventor_id"] for p in self.ind})

    def test_individuelt_lop(self):
        p = self.ind[0]
        self.assertEqual((p["eventor_id"], p["dato"], p["navn"], p["klasse"], p["disiplin"]),
                         (100, "2025-06-14", "Testløpet", "H21", "mellom"))
        self.assertEqual((p["tid_s"], p["vinnertid_s"], p["plass"], p["antall"], p["status"]), (720, 660, 3, 12, "OK"))
        self.assertEqual(p["prosent_bak"], round(60 / 660 * 100, 1))
        self.assertEqual(p["arrangor"], "Eksempel OK")
        # Rett til klassen; et endagsløp får ikke eventRaceId.
        self.assertEqual(p["lenker"], {"eventor": "https://eventor.orientering.no/Events/ResultList?eventId=100"
                                                  "&eventClassId=1"})
        self.assertFalse(p["strekk_ugyldige"])

    def test_strekk_mot_klassen(self):
        p = self.ind[0]
        strekk = p["strekk"]
        self.assertEqual([s["post"] for s in strekk], [1, 2, 3, 4, "M"])
        # Strekk 1: 100, 110, 120 (andre) og 120 (egen) → beste 100, ref 110.
        self.assertEqual((strekk[0]["tid_s"], strekk[0]["beste_s"], strekk[0]["ref_s"]), (120, 100, 110.0))
        # Strekk 3 er 300 s mot ref 110 – et tydelig bom. D 21-klassen teller ikke.
        self.assertTrue(strekk[2]["bom"])
        self.assertEqual(sum(s["bom"] for s in strekk), 1)
        median = sorted(s["indeks"] for s in strekk)[2]
        self.assertEqual(p["bomtid_s"], round(300 - strekk[2]["ref_s"] * median))
        self.assertEqual(p["strekkfart"], round(statistics.median(s["indeks"] for s in strekk if not s["bom"]), 3))

    def test_uten_resultatliste_for_klassen_ingen_referanse(self):
        data = konverter(PERSON_XML, MEG, {}, {})
        p = data["individuelle"][0]
        self.assertTrue(p["strekk"])
        self.assertTrue(all(s["ref_s"] is None and s["indeks"] is None for s in p["strekk"]))
        self.assertIsNone(p["strekkfart"])

    def test_flerdagers_gir_en_post_per_etappe(self):
        dag1, dag2 = self.ind[1], self.ind[2]
        self.assertEqual((dag1["dato"], dag2["dato"]), ("2025-07-01", "2025-07-02"))
        self.assertEqual((dag1["navn"], dag2["navn"]), ("Testdagene – Dag 1", "Testdagene – Dag 2 lang"))
        self.assertEqual((dag1["disiplin"], dag2["disiplin"]), ("sprint", "lang"))
        self.assertEqual((dag1["natt"], dag2["natt"]), (True, False))
        self.assertEqual((dag1["status"], dag2["status"]), ("OK", "MP"))
        self.assertEqual((dag1["vinnertid_s"], dag1["prosent_bak"]), (870, round(30 / 870 * 100, 1)))
        self.assertIsNone(dag2["tid_s"])
        self.assertIsNone(dag2["prosent_bak"])
        self.assertEqual(dag1["klasse"], "H21E")
        self.assertEqual(dag1["type"], "o-løp")
        self.assertEqual(dag2["lenker"]["livelox"], "https://www.livelox.com/Events/Show/50619")
        # En etappe lenker til etappens resultater i klassen, ikke sammenlagt.
        self.assertEqual(dag2["lenker"]["eventor"], "https://eventor.orientering.no/Events/ResultList?eventId=200"
                                                    "&eventClassId=2&eventRaceId=202&overallResults=False")

    def test_stafett(self):
        s = self.data["stafett"][0]
        self.assertEqual(set(s), {"eventor_id", "dato", "navn", "klasse", "etappe", "status", "plass", "lenker",
                                  "okt_ider"})
        self.assertEqual((s["eventor_id"], s["dato"], s["klasse"], s["etappe"], s["plass"], s["status"]),
                         (300, "2025-08-01", "H17", 2, 4, "OK"))
        self.assertEqual(s["lenker"], {"eventor": "https://eventor.orientering.no/Events/ResultList?eventId=300"
                                                  "&eventClassId=3"})

    def test_stafett_velger_laget_isak_gaar_paa(self):
        # Et annet lag (og en annen klasse) står først; bare laget med Isaks PersonId tas med.
        annet = ("<TeamResult><TeamName>Annet OK 1</TeamName><ResultPosition>1</ResultPosition>"
                 f"<TeamMemberResult>{person('6', 'Ola', 'Testløper')}<Leg>3</Leg>"
                 "<CompetitorStatus value='OK' /></TeamMemberResult></TeamResult>")
        eget = ("<TeamResult><TeamName>Eksempel OK 1</TeamName><ResultPosition>4</ResultPosition>"
                f"<TeamMemberResult>{person(MEG, 'Isak', 'Eksempel')}<Leg>2</Leg>"
                "<CompetitorStatus value='OK' /></TeamMemberResult></TeamResult>")
        xml = ("<ResultList>" + lop("500", "Lagstafetten", race("501", "2025-08-02"), " eventForm='RelaySingleDay'")
               + klasse("5", "H15", annet) + klasse("6", "H 21-", annet + eget) + "</ResultList>").encode()
        staf = konverter(xml, MEG, {}, {})["stafett"]
        self.assertEqual([(s["klasse"], s["etappe"], s["plass"]) for s in staf], [("H21", 2, 4)])

    def test_ingen_andre_lopere_i_fila(self):
        tekst = json.dumps(self.data, ensure_ascii=False)
        for navn in ("Ola", "Per", "Pål", "Kari", "Testløper", "Isak", "2001-02-03", "\"5\"", "\"9\""):
            self.assertNotIn(navn, tekst)
        self.assertEqual(personvern.sjekk_konkurranser("data/konkurranser.json", self.data), [])
        self.assertEqual(personvern.sjekk_innhold("data/konkurranser.json", tekst), [])


class TestKobling(unittest.TestCase):
    okter = [
        {"id": "a", "dato": "2025-06-14", "navn": "Morgenjogg", "otek_min": 0, "hoyeste_sone": "I1"},
        {"id": "b", "dato": "2025-06-14", "navn": "Testløpet mellom", "otek_min": 30, "hoyeste_sone": "I4"},
        {"id": "c", "dato": "2025-06-14", "navn": "Rolig langtur", "otek_min": 0, "hoyeste_sone": "I1"},
        {"id": "d", "dato": "2025-06-15", "navn": "Testløpet", "otek_min": 30, "hoyeste_sone": "I4"},
    ]

    def lop(self, navn="Testløpet", dato="2025-06-14", disiplin_="mellom"):
        return {"navn": navn, "dato": dato, "disiplin": disiplin_}

    def test_felles_ord_i_navnet(self):
        self.assertEqual(velg_okter(self.lop(), self.okter), ["b"])

    def test_flest_felles_ord_vinner(self):
        okter = [{"id": "x", "dato": "2025-01-11", "navn": "Ski-o treff mellomdistanse", "otek_min": 30},
                 {"id": "y", "dato": "2025-01-11", "navn": "Ski-o treff nattsprint", "otek_min": 20}]
        self.assertEqual(velg_okter(self.lop("Ski-o-treff Nattsprint", "2025-01-11"), okter), ["y"])

    def test_lopsord_og_o_teknikk(self):
        okter = [{"id": "x", "dato": "2025-06-05", "navn": "EM uttak mellom", "otek_min": 30},
                 {"id": "y", "dato": "2025-06-05", "navn": "Kveldsjogg", "otek_min": 0}]
        self.assertEqual(velg_okter(self.lop("Elgdilten", "2025-06-05"), okter), ["x"])
        okter = [{"id": "z", "dato": "2025-02-01", "navn": "Rolig på ÅbF", "otek_min": 77}]
        self.assertEqual(velg_okter(self.lop("Ås by Night", "2025-02-01"), okter), ["z"])

    def test_bare_jogg_gir_ingen(self):
        okter = [{"id": "x", "dato": "2025-09-12", "navn": "Jogg", "otek_min": 0}]
        self.assertEqual(velg_okter(self.lop("NM mellom finaler", "2025-09-12"), okter), [])

    def test_tempo_kobles_ikke(self):
        self.assertEqual(velg_okter(self.lop(disiplin_="tempo"), self.okter), [])

    def test_koble_okter_fyller_begge_lister(self):
        data = konverter_alt()
        okter = [{"id": "s", "dato": "2025-08-01", "navn": "Teststafetten", "otek_min": 40}, *self.okter]
        koble_okter(data, okter)
        self.assertEqual(data["individuelle"][0]["okt_ider"], ["b"])
        self.assertEqual(data["stafett"][0]["okt_ider"], ["s"])


class TestBuffer(unittest.TestCase):
    def test_trenger_henting(self):
        with tempfile.TemporaryDirectory() as mappe:
            fil = Path(mappe) / "event_1.xml"
            i_dag = date(2026, 10, 25)
            self.assertTrue(trenger_henting(fil, "2026-10-20", i_dag))  # mangler
            fil.write_text("<x/>")
            hentet = datetime(2026, 10, 21).timestamp()
            os.utime(fil, (hentet, hentet))
            self.assertTrue(trenger_henting(fil, "2026-10-20", i_dag))  # hentet dagen etter løpet
            self.assertFalse(trenger_henting(fil, "2026-09-01", i_dag))  # hentet etter 14 dager

    def test_flett_person_erstatter_samme_lop(self):
        gammel = b"<ResultListList><ResultList><Event><EventId>1</EventId><Name>gammel</Name></Event></ResultList>" \
                 b"<ResultList><Event><EventId>2</EventId></Event></ResultList></ResultListList>"
        ny = b"<ResultListList><ResultList><Event><EventId>1</EventId><Name>ny</Name></Event></ResultList>" \
             b"<ResultList><Event><EventId>3</EventId></Event></ResultList></ResultListList>"
        rot = ET.fromstring(flett_person(gammel, ny))
        self.assertEqual(sorted(rl.findtext("Event/EventId") for rl in rot), ["1", "2", "3"])
        self.assertEqual([rl.findtext("Event/Name") for rl in rot if rl.findtext("Event/EventId") == "1"], ["ny"])


class TestOppdater(unittest.TestCase):
    """oppdater() med hent() byttet ut, så ingen kall går ut på nettet."""

    def setUp(self):
        mappe = tempfile.TemporaryDirectory()
        self.addCleanup(mappe.cleanup)
        ra = Path(mappe.name) / "eventor"
        ra.mkdir()
        (ra / "person.xml").write_bytes(PERSON_XML)
        for eid in ("100", "200", "300", "400"):  # bufret og endelig (hentet lenge etter løpet)
            (ra / f"info_{eid}.xml").write_text(f"<Event><EventId>{eid}</EventId></Event>")
        for eid in ("200", "400"):
            (ra / f"event_{eid}.xml").write_text("<ResultList/>")
        (ra / "event_100.xml").write_bytes(EVENT_XML)
        okter = Path(mappe.name) / "okter.json"
        okter.write_text("[]")
        self.ra, self.ut = ra, Path(mappe.name) / "konkurranser.json"
        # Nytt løp for 30 dager siden: innenfor de 60 dagene, men alt endelig.
        self.dato = (date.today() - timedelta(days=30)).isoformat()
        self.kall = []
        for navn, verdi in {"RA": ra, "PERSON": ra / "person.xml", "PERSON_START": ra / "finnes_ikke.xml",
                            "OKTER": okter, "UT": self.ut, "LIVELOX_RA": Path(mappe.name) / "livelox",
                            "PAUSE": 0, "hent": self.falsk_hent,
                            "les_oppsett": lambda: ("nokkel", MEG)}.items():
            patcher = mock.patch.object(hent_eventor, navn, verdi)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = mock.patch.object(hent_eventor, "hent_livelox_side", side_effect=AssertionError("Livelox"))
        patcher.start()
        self.addCleanup(patcher.stop)

    def nytt_lop(self) -> str:
        return (lop("500", "Nyløpet", race("501", self.dato))
                + klasse("1", "H 21-", f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}{EGET}</PersonResult>"))

    def falsk_hent(self, sti, nokkel, **param):
        self.kall.append((sti, param))
        if sti == "/results/person":
            return ("<ResultListList><ResultList>" + lop("100", "Testløpet", race("101", "2025-06-14"))
                    + "</ResultList><ResultList>" + self.nytt_lop() + "</ResultList></ResultListList>").encode()
        if sti == "/events":
            return f"<EventList><Event><EventId>{param['eventIds']}</EventId></Event></EventList>".encode()
        if sti == "/results/event":
            return ("<ResultList>" + self.nytt_lop() + "</ResultList>").encode()
        raise AssertionError(sti)

    def test_henter_egne_resultater_hver_gang(self):
        forste = hent_eventor.oppdater()
        self.assertEqual([k[0] for k in self.kall], ["/results/person", "/events", "/results/event"])
        param = self.kall[0][1]
        self.assertEqual(param["fromDate"], (date.today() - timedelta(days=60)).isoformat())
        self.assertEqual(param["personId"], MEG)
        self.assertIn("hentet egne resultater (1 kall: 2 løp siste 60 dager, 1 nye)", forste)
        self.assertIn("2 kall for løpsdata (1 løpsinfo, 1 resultatlister)", forste)
        flettet = {rl.findtext("Event/EventId") for rl in ET.fromstring((self.ra / "person.xml").read_bytes())}
        self.assertEqual(flettet, {"100", "200", "300", "400", "500"})
        self.assertIn(500, {p["eventor_id"] for p in json.loads(self.ut.read_text("utf-8"))["individuelle"]})

        self.kall.clear()
        andre = hent_eventor.oppdater()
        self.assertEqual([k[0] for k in self.kall], ["/results/person"])  # bufret løp gir ingen kall
        self.assertIn("(1 kall: 2 løp siste 60 dager, 0 nye), 0 kall for løpsdata", andre)

    def test_lagret_gir_ingen_kall(self):
        svar = hent_eventor.oppdater(hent_person_pa_nytt=False)
        self.assertEqual(self.kall, [])
        self.assertIn("egne resultater fra bufferen (0 kall), 0 kall for løpsdata", svar)


if __name__ == "__main__":
    unittest.main()


class TestLenker(unittest.TestCase):
    def test_eventor_lenke(self):
        self.assertEqual(eventor_lenke("19373"), "https://eventor.orientering.no/Events/ResultList?eventId=19373")
        self.assertEqual(eventor_lenke("19373", "186339"),
                         "https://eventor.orientering.no/Events/ResultList?eventId=19373&eventClassId=186339")
        # Uten klasse gir en etappe ingen mening alene; da lenkes det til hele lista.
        self.assertEqual(eventor_lenke("19373", None, "20102"),
                         "https://eventor.orientering.no/Events/ResultList?eventId=19373")

    def test_lenkene_stopper_ikke_personvernsjekken(self):
        data = konverter_alt()
        self.assertEqual(personvern.sjekk_innhold("data/konkurranser.json",
                                                  json.dumps(data, ensure_ascii=False)), [])


# NM sprint ski-o 2024: totalen er 14:41, men de sammenlagte tidene ved postene er 64–201 timer.
ODELAGT = resultat("14:41", [("31", "64:58:09"), ("34", "65:02:56"), ("35", "65:06:46"), ("40", "201:39:26")],
                   plass="7", diff="1:25")


class TestUgyldigeStrekk(unittest.TestCase):
    def test_regelen(self):
        self.assertTrue(ugyldige_strekk(ET.fromstring(ODELAGT)))
        self.assertFalse(ugyldige_strekk(ET.fromstring(EGET)))
        # Avlesning etter mål (én eller to poster etter totalen) er vanlig og ikke ugyldig.
        etter_mal = resultat("12:00", [("31", "2:00"), ("32", "4:00"), ("33", "11:00"), ("999", "14:04:00")])
        self.assertFalse(ugyldige_strekk(ET.fromstring(etter_mal)))
        # Uten totaltid (disk, brutt) og uten strekk kan regelen ikke slå til.
        self.assertFalse(ugyldige_strekk(ET.fromstring(resultat("0:00", [("31", "9:00")], status="Disqualified"))))
        self.assertFalse(ugyldige_strekk(ET.fromstring(resultat("12:00", []))))

    def test_lopet_beholder_tid_men_ikke_strekk(self):
        xml = ("<ResultList>" + lop("100", "Testløpet", race("101", "2025-06-14"))
               + klasse("1", "H 21-", f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}{ODELAGT}</PersonResult>")
               + "</ResultList>").encode()
        p = konverter(xml, MEG, {}, {"100": ET.fromstring(EVENT_XML)})["individuelle"][0]
        self.assertTrue(p["strekk_ugyldige"])
        self.assertEqual((p["strekk"], p["strekkfart"], p["bomtid_s"]), (None, None, None))
        self.assertEqual((p["tid_s"], p["plass"], p["vinnertid_s"]), (881, 7, 796))
        self.assertIsNotNone(p["prosent_bak"])

    def test_andre_med_odelagte_strekk_teller_ikke_i_referansen(self):
        # Tidene er forskjøvet en time: strekkene mellom postene ser rimelige (og raske) ut.
        forskjovet = resultat("8:00", list(zip(POSTER, ["1:01:40", "1:03:30", "1:05:20", "1:07:00"])))
        andre = (f"<PersonResult>{person('1', 'Ola', 'Testløper')}{forskjovet}</PersonResult>"
                 f"<PersonResult>{person(MEG, 'Isak', 'Eksempel')}{EGET}</PersonResult>")
        event = ("<ResultList>" + lop("100", "Testløpet", race("101", "2025-06-14"))
                 + klasse("1", "H 21-", andre) + "</ResultList>").encode()
        data = konverter(PERSON_XML, MEG, {}, {"100": ET.fromstring(event)})
        # Bare egne strekk igjen i klassen, så referansen blir egen tid.
        self.assertTrue(all(s["indeks"] == 1.0 for s in data["individuelle"][0]["strekk"]))


def livelox_side(klasser: list[tuple[int, str, str]], uten_lenke: int | None = None,
                 deltakere: dict[int, int] | None = None) -> str:
    """En liten Livelox-løpsside: klassene som JSON i et skript, og en avspillerlenke per klasse."""
    data = {"event": {"name": "Testløpet", "organisers": [{"externalIdentifiers": [{"system": 1, "id": "189"}]}],
                      "classes": [{"id": i, "name": n, "participants": [],
                                   "participantCount": (deltakere or {}).get(i, 3),
                                   "externalIdentifier": {"system": 1, "id": e}}
                                  for i, n, e in klasser]}}
    lenker = "".join(f'<a href="/Viewer/Testlopet/{n.replace(" ", "-")}?classId={i}"><span>Replay</span></a>'
                     f'<a href="/Sessions/Create?eventId=50618&amp;classId={i}">Add route</a>'
                     for i, n, _ in klasser if i != uten_lenke)
    return f"<html><script>var modell = {json.dumps(data)};</script><body>{lenker}</body></html>"


class TestLiveloxKlasse(unittest.TestCase):
    SIDE = livelox_side([(920886, "D 21-", "186336-1"), (920889, "H 21-", "186339-1"),
                         (9208890, "H 21- B", "1863390-1")])

    def test_klassene_fra_siden(self):
        self.assertEqual(livelox_klasser(self.SIDE),
                         [(920886, "186336-1", 3), (920889, "186339-1", 3), (9208890, "1863390-1", 3)])

    def test_lenke_til_klassen(self):
        # Samme adresse som Livelox lenker til, ikke en lenger klasse-id som begynner likt.
        self.assertEqual(livelox_klasselenke(self.SIDE, "186339"),
                         "https://www.livelox.com/Viewer/Testlopet/H-21-?classId=920889")

    def test_ukjent_klasse_eller_uten_lenke_gir_none(self):
        self.assertIsNone(livelox_klasselenke(self.SIDE, "999"))
        self.assertIsNone(livelox_klasselenke(self.SIDE, None))
        self.assertIsNone(livelox_klasselenke(livelox_side([(1, "H21", "186339-1")], uten_lenke=1), "186339"))
        self.assertIsNone(livelox_klasselenke("<html>ingen klasser</html>", "186339"))

    def test_flere_med_samme_klasse_velger_etappen(self):
        side = livelox_side([(11, "H21", "2-1"), (12, "H21", "2-2")])
        self.assertEqual(livelox_klasselenke(side, "2", 2), "https://www.livelox.com/Viewer/Testlopet/H21?classId=12")
        self.assertIsNone(livelox_klasselenke(side, "2", 3))

    def test_tomme_kopier_av_klassen_velges_bort(self):
        # Fjord-O 2020: fem Livelox-klasser med samme externalIdentifier, bare én med deltakere.
        side = livelox_side([(11, "H19-20", "2-4"), (12, "H19-20", "2-4"), (13, "H19-20", "2-4")],
                            deltakere={11: 0, 12: 14, 13: 0})
        self.assertEqual(livelox_klasselenke(side, "2", 4), "https://www.livelox.com/Viewer/Testlopet/H19-20?classId=12")
        like = livelox_side([(11, "H21", "2-1"), (12, "H21", "2-1")])
        self.assertIsNone(livelox_klasselenke(like, "2"))  # ikke entydig

    def test_konverter_bruker_klasselenken_og_faller_tilbake(self):
        # Løp 200 har klasse 2 og to etapper med Livelox-løpene 50618 og 50619.
        sider = {"50618": livelox_side([(77, "M21E", "2-1")])}
        data = konverter(PERSON_XML, MEG, {"200": ET.fromstring(INFO_XML)}, {}, sider)
        dag1, dag2 = data["individuelle"][1], data["individuelle"][2]
        self.assertEqual(dag1["lenker"]["livelox"], "https://www.livelox.com/Viewer/Testlopet/M21E?classId=77")
        self.assertEqual(dag2["lenker"]["livelox"], "https://www.livelox.com/Events/Show/50619")  # ingen side
        self.assertEqual(personvern.sjekk_innhold("data/konkurranser.json", json.dumps(data, ensure_ascii=False)), [])
