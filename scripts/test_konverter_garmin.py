"""Tester deler av konverter_garmin.py: behold_nyere, spor_fra_fit og at aktivitetsfila er uten koordinater.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_konverter_garmin.py
"""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import konverter_garmin as kg

ROT = Path(__file__).resolve().parent.parent


def akt(gid, start):
    return {"garmin_id": gid, "start_lokal": start}


def dag(dato, hvilepuls=45):
    return {"dato": dato, "hvilepuls": hvilepuls}


class BeholdNyere(unittest.TestCase):
    """Data fra intervals.icu som er nyere enn eksporten, skal ikke forsvinne ved ny konvertering."""

    def setUp(self):
        self.mappe = tempfile.TemporaryDirectory()
        self.ut = Path(self.mappe.name)
        self.patch = mock.patch.object(kg, "UT", self.ut)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.mappe.cleanup()

    def skriv(self, aktiviteter, helse):
        (self.ut / "garmin_aktiviteter.json").write_text(json.dumps(aktiviteter), encoding="utf-8")
        (self.ut / "garmin_helse.json").write_text(json.dumps(helse), encoding="utf-8")

    def test_uten_gamle_filer(self):
        a, h = kg.behold_nyere([akt(1, "2026-10-01T10:00:00")], [dag("2026-10-01")])
        self.assertEqual([x["garmin_id"] for x in a], [1])
        self.assertEqual([d["dato"] for d in h], ["2026-10-01"])

    def test_beholder_bare_det_som_er_nyere(self):
        self.skriv(
            [akt(1, "2026-09-30T10:00:00"), akt(2, "2026-10-01T10:00:00"), akt(3, "2026-10-01T18:00:00"),
             akt(4, "2026-10-05T07:00:00")],
            [dag("2026-09-30", 40), dag("2026-10-01", 41), dag("2026-10-02", 42), dag("2026-10-05", 43)],
        )
        eksport = [akt(1, "2026-09-30T10:00:00"), akt(2, "2026-10-01T10:00:00")]
        a, h = kg.behold_nyere(eksport, [dag("2026-09-30", 50), dag("2026-10-01", 51)])
        self.assertEqual([x["garmin_id"] for x in a], [1, 2, 3, 4])
        # Eksporten vinner for dagene den dekker; bare nyere dager hentes fra den gamle fila
        self.assertEqual([(d["dato"], d["hvilepuls"]) for d in h],
                         [("2026-09-30", 50), ("2026-10-01", 51), ("2026-10-02", 42), ("2026-10-05", 43)])

    def test_ingen_duplikater_av_kjente_aktiviteter(self):
        # Samme aktivitet med senere starttid i den gamle fila (f.eks. rettet tidssone) tas ikke med to ganger
        self.skriv([akt(2, "2026-10-01T12:00:00")], [])
        a, _ = kg.behold_nyere([akt(1, "2026-09-30T10:00:00"), akt(2, "2026-10-01T10:00:00")], [])
        self.assertEqual([x["garmin_id"] for x in a], [1, 2])

    def test_sortert_etter_start(self):
        self.skriv([akt(9, "2026-10-03T06:00:00")], [])
        a, _ = kg.behold_nyere([akt(2, "2026-10-01T10:00:00"), akt(1, "2026-09-30T10:00:00")], [])
        self.assertEqual([x["garmin_id"] for x in a], [1, 2, 9])


class SporFraFit(unittest.TestCase):
    """fitdecode kan bare lese, så det er ikke billig å lage en ekte FIT-fil. Testen bytter ut
    dekod() med ferdig dekodede meldinger og tester resten av spor_fra_fit."""

    START = datetime(2026, 5, 10, 8, 0, 0, tzinfo=timezone.utc)

    def kjor(self, meldinger):
        with mock.patch.object(kg, "dekod", return_value=meldinger):
            return kg.spor_fra_fit(b"")

    def test_uten_session(self):
        self.assertEqual(self.kjor({"record": [{"timestamp": self.START}]}), (None, None))

    def test_tynner_og_regner_om_koordinater(self):
        semi = 2**31 / 180  # grader → semicircles
        rec = [{"timestamp": self.START + timedelta(seconds=s), "position_lat": round(63.4 * semi),
                "position_long": round(10.4 * semi), "heart_rate": 140 + s, "enhanced_speed": 3.456,
                "distance": 3.4 * s} for s in range(0, 13)]
        rec.append({"timestamp": None})
        lap = [{"start_time": self.START, "total_timer_time": 600.04, "total_distance": 2000.4,
                "avg_heart_rate": 150, "max_heart_rate": 170, "avg_speed": 3.3333},
               {"start_time": self.START, "total_timer_time": None}]
        start, spor = self.kjor({"session": [{"start_time": self.START}], "record": rec, "lap": lap})
        self.assertEqual(start, self.START)
        p = spor["punkter"]
        self.assertEqual(p["t"], [0, 5, 10])
        self.assertEqual(p["lat"], [63.4] * 3)
        self.assertEqual(p["lon"], [10.4] * 3)
        self.assertEqual(p["puls"], [140, 145, 150])
        self.assertEqual(p["fart"], [3.46] * 3)
        self.assertEqual(p["dist"], [0, 17, 34])
        self.assertNotIn("hoyde", p)  # tomme kolonner fjernes
        self.assertEqual(spor["runder"], [{"start_s": 0, "tid_s": 600.0, "dist_m": 2000, "puls": 150,
                                           "makspuls": 170, "fart": 3.33}])

    def test_uten_gps(self):
        rec = [{"timestamp": self.START + timedelta(seconds=s), "heart_rate": 120} for s in (0, 5)]
        _, spor = self.kjor({"session": [{"start_time": self.START}], "record": rec})
        self.assertEqual(set(spor["punkter"]), {"t", "puls"})
        self.assertEqual(spor["runder"], [])


class IngenKoordinater(unittest.TestCase):
    """garmin_aktiviteter.json er offentlig og skal aldri inneholde posisjoner."""

    FORBUDT = ("lat", "lon", "lng", "latitude", "longitude", "position", "posisjon", "koordinat", "spor", "punkter")

    def test_aktivitetsfila(self):
        fil = ROT / "data" / "garmin_aktiviteter.json"
        if not fil.exists():
            self.skipTest("data/garmin_aktiviteter.json finnes ikke")
        aktiviteter = json.loads(fil.read_text(encoding="utf-8"))
        nokler = {k for a in aktiviteter for k in a}
        mistenkelige = {k for k in nokler if k != "har_spor" and any(f in k.lower() for f in self.FORBUDT)}
        self.assertEqual(mistenkelige, set())
        for a in aktiviteter:
            for k, v in a.items():
                self.assertNotIsInstance(v, (list, dict), f"{a['garmin_id']}: {k}")


if __name__ == "__main__":
    unittest.main()
