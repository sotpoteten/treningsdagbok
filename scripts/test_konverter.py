"""Tester konverteringen av den rå OLT-eksporten (konverter.py) på en liten, oppdiktet eksport.

Kjør fra prosjektmappen:  python -m unittest scripts/test_konverter.py
"""
import contextlib
import csv
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from konverter import konverter

MEG = "isak"
TRENER = "trener"


def maling(mid, verdi):
    return {"ActivityMetricId": mid, "Value": verdi}


def blokk(posisjon, aktivitet, malinger):
    return {"ActivityId": aktivitet, "Position": posisjon, "ReportedActivityMetrics": malinger}


def okt(id, dato, varighet, blokker, kommentarer=(), orden=0, maks="I1", metrikker=((1, 3), (2, 6))):
    return {
        "Id": id, "Date": dato, "Order": orden, "Name": f"Økt {id}", "Description": None,
        "Duration": varighet, "MaxIZone": maks,
        "Comments": [{"Text": t, "AuthorId": a, "CreatedAt": c} for t, a, c in kommentarer],
        "ReportedSessionMetrics": [{"SessionMetricId": m, "Value": v} for m, v in metrikker],
        "ReportedUserDefinedMetrics": [],
        "ReportedSessionActivities": blokker,
    }


def dagsrapport(dato, kommentar=None, **flagg):
    rapport = {"Date": dato, "Comment": kommentar, "ReportedSickness": None, "ReportedInjury": None,
               "IsSick": False, "IsInjured": False, "IsTraveling": False, "IsAltitudeDay": False,
               "IsDayOff": False, "IsCompetitionDay": False}
    rapport.update(flagg)
    return rapport


OKTER = [
    # Før avgrensningen (1.11.2019): skal ikke tas med
    okt("gammel", "2019-10-31", 30, [blokk(0, 2, [maling(1, 30)])]),
    # Oppvarming, o-løp og styrke. Målingene kommer i tilfeldig rekkefølge.
    okt("o-lop", "2025-05-10", 95, [
        blokk(1, 1, [maling(9, 10.5), maling(4, 20), maling(1, 40)]),
        blokk(0, 2, [maling(9, 3.0), maling(1, 15)]),
        blokk(2, 9, [maling(11, 45)]),
        blokk(3, 12, [maling(12, 20)]),
    ], kommentarer=[("Trenerens råd", TRENER, "2025-05-11T08:00:00"),
                    ("Godt løp.", MEG, "2025-05-10T20:00:00")], maks="I3"),
    okt("jogg", "2025-05-10", 42, [blokk(0, 2, [maling(1, 42), maling(9, 7.9)])], orden=1, metrikker=()),
]

BRUKER = {
    "Id": MEG, "GivenName": "Isak", "Surname": "Jonsson",
    "Email": "hemmelig@example.com", "BirthDate": "2000-01-01T00:00:00",
    "Settings": {"Sport": {"Name": "Orientering"}, "Federation": {"Name": "Norges Orienteringsforbund"},
                 "Club": {"Name": "Klubben"}},
    "IntensityZones": [{"I1": {"Min": 126, "Max": 150}, "I2": {"Min": 151, "Max": 171},
                        "I3": {"Min": 172, "Max": 182}, "I4": {"Min": 183, "Max": 192},
                        "I5": {"Min": 193, "Max": 210}, "UpdatedAt": "2026-01-29T10:00:00"}],
    "HealthStatuses": [
        dagsrapport("2019-10-01", IsSick=True),          # før avgrensningen
        dagsrapport("2025-05-01"),                       # tom: fjernes
        dagsrapport("2025-05-02", kommentar=""),         # tom tekst: fjernes
        dagsrapport("2025-05-10", IsCompetitionDay=True),
        dagsrapport("2025-05-12", kommentar="Reise hjem"),
    ],
}

UKER = [
    {"CommentedYear": 2025, "CommentedWeekNumber": 19, "CreatedAt": "2025-05-11T21:00:00",
     "Text": "God uke.", "AuthorId": MEG},
    {"CommentedYear": 2019, "CommentedWeekNumber": 40, "CreatedAt": "2019-10-06T21:00:00",
     "Text": "For gammel.", "AuthorId": MEG},
]


class Konvertering(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mappe = tempfile.TemporaryDirectory()
        rot = Path(cls.mappe.name)
        raw, ut = rot / "raw", rot / "ut"
        raw.mkdir()
        for navn, innhold in (("workoutSessions", OKTER), ("userData", BRUKER), ("weekComments", UKER)):
            (raw / f"{navn}.json").write_text(json.dumps(innhold, ensure_ascii=False), encoding="utf-8")
        cls.logg = io.StringIO()
        with contextlib.redirect_stdout(cls.logg):
            konverter(raw, "2019-11-01", ut)
        cls.ut = ut
        cls.okter = {o["id"]: o for o in json.loads((ut / "okter.json").read_text(encoding="utf-8"))}
        cls.dager = json.loads((ut / "dager.json").read_text(encoding="utf-8"))
        cls.profil = json.loads((ut / "profil.json").read_text(encoding="utf-8"))
        cls.uker = json.loads((ut / "uker.json").read_text(encoding="utf-8"))
        with open(ut / "blokker.csv", encoding="utf-8-sig") as f:
            cls.rader = list(csv.DictReader(f, delimiter=";"))

    @classmethod
    def tearDownClass(cls):
        cls.mappe.cleanup()

    def test_skriver_bare_til_utmappa(self):
        self.assertEqual(sorted(p.name for p in self.ut.iterdir()),
                         ["blokker.csv", "dager.json", "okter.json", "profil.json", "uker.json"])

    def test_okter_for_avgrensningen_fjernes(self):
        self.assertEqual(list(self.okter), ["o-lop", "jogg"])
        self.assertNotIn("gammel", {r["okt_id"] for r in self.rader})

    def test_varighet_er_sonetid_pluss_styrke(self):
        o = self.okter["o-lop"]
        self.assertEqual(o["sone_min"], {"I1": 55, "I4": 20})
        self.assertEqual(o["styrke_min"], 20)
        self.assertEqual(sum(o["sone_min"].values()) + o["styrke_min"], o["varighet_min"])
        self.assertNotIn("ADVARSEL", self.logg.getvalue())

    def test_o_teknikk_legges_ikke_til_varigheten(self):
        o = self.okter["o-lop"]
        self.assertEqual(o["otek_min"], 45)
        self.assertEqual(o["varighet_min"], 95)  # ikke 140
        self.assertEqual(o["loping_min"], 75)

    def test_varsler_naar_varigheten_ikke_stemmer(self):
        with tempfile.TemporaryDirectory() as d:
            raw = Path(d) / "raw"
            raw.mkdir()
            feil = [okt("feil", "2025-01-01", 140, [blokk(0, 1, [maling(1, 95)]), blokk(1, 9, [maling(11, 45)])])]
            (raw / "workoutSessions.json").write_text(json.dumps(feil), encoding="utf-8")
            logg = io.StringIO()
            with contextlib.redirect_stdout(logg):
                konverter(raw, "2019-11-01", Path(d) / "ut")
            self.assertIn("varighet stemmer ikke", logg.getvalue())

    def test_blokker_og_malinger_sorteres(self):
        o = self.okter["o-lop"]
        self.assertEqual([b["posisjon"] for b in o["blokker"]], [0, 1, 2, 3])
        terreng = o["blokker"][1]
        self.assertEqual(list(terreng["soner"]), ["I1", "I4"])
        self.assertEqual(terreng["distanse_km"], 10.5)
        rader = [r for r in self.rader if r["okt_id"] == "o-lop" and r["posisjon"] == "1"]
        self.assertEqual([int(r["metrikk_id"]) for r in rader], [1, 4, 9])

    def test_hoyeste_sone_beregnes_fra_sonedata(self):
        o = self.okter["o-lop"]
        self.assertEqual(o["hoyeste_sone"], "I4")
        self.assertEqual(o["hoyeste_sone_registrert"], "I3")
        self.assertEqual(o["distanse_km"], 13.5)

    def test_okt_metrikker(self):
        self.assertEqual((self.okter["o-lop"]["opplevd_belastning"], self.okter["o-lop"]["dagsform"]), (3, 6))
        self.assertEqual((self.okter["jogg"]["opplevd_belastning"], self.okter["jogg"]["dagsform"]), (None, None))

    def test_kommentarer_fra_andre_skilles_ut(self):
        o = self.okter["o-lop"]
        self.assertEqual(o["kommentar"], "Godt løp.")
        self.assertEqual(o["kommentarer_andre"], ["Trenerens råd"])
        self.assertIsNone(self.okter["jogg"]["kommentar"])
        self.assertEqual(self.okter["jogg"]["kommentarer_andre"], [])

    def test_profil_har_bare_tillatte_felt(self):
        self.assertEqual(set(self.profil), {"navn", "idrett", "forbund", "klubb", "pulssoner"})
        self.assertEqual(set(self.profil["pulssoner"]), {"I1", "I2", "I3", "I4", "I5", "enhet", "sist_oppdatert"})
        self.assertEqual(self.profil["pulssoner"]["sist_oppdatert"], "2026-01-29")
        tekst = (self.ut / "profil.json").read_text(encoding="utf-8")
        for hemmelig in ("hemmelig@example.com", "2000-01-01", "Email", "BirthDate", MEG):
            self.assertNotIn(hemmelig, tekst)

    def test_tomme_dagsrapporter_fjernes(self):
        self.assertEqual([d["dato"] for d in self.dager], ["2025-05-10", "2025-05-12"])
        self.assertTrue(self.dager[0]["konkurranse"])
        self.assertIsNone(self.dager[0]["notat"])
        self.assertEqual(self.dager[1]["notat"], "Reise hjem")

    def test_ukeskommentarer(self):
        self.assertEqual(len(self.uker), 1)
        u = self.uker[0]
        self.assertEqual((u["ar"], u["uke"], u["mandag"]), (2025, 19, "2025-05-05"))
        self.assertEqual(u["kommentarer"], [{"tekst": "God uke.", "skrevet": "2025-05-11", "egen": True}])


if __name__ == "__main__":
    unittest.main()
