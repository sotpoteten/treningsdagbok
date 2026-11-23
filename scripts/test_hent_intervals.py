"""
Tester omformingen i hent_intervals.py.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_hent_intervals.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hent_intervals import aktivitetsnokkel, aktivitetstype, flett_helse, helse_fra_wellness, uten_gps, velg_aktiviteter


class TestAktivitetstype(unittest.TestCase):
    def test_kjente_typer(self):
        self.assertEqual(aktivitetstype("running", "generic"), "running")
        self.assertEqual(aktivitetstype("running", "treadmill"), "treadmill_running")
        self.assertEqual(aktivitetstype("cross_country_skiing", "skate_skiing"), "cross_country_skiing_ws")
        self.assertEqual(aktivitetstype("training", "strength_training"), "strength_training")

    def test_ukjent_undertype_faller_tilbake_til_sporten(self):
        self.assertEqual(aktivitetstype("running", "noe_nytt"), "running")
        self.assertEqual(aktivitetstype("rowing", "generic"), "rowing")
        self.assertEqual(aktivitetstype("rowing", "indoor_rowing"), "rowing_indoor_rowing")
        self.assertEqual(aktivitetstype(None, None), "ukjent")


def garmin(gid, start, iid="i1"):
    return {"id": iid, "source": "GARMIN_CONNECT", "external_id": str(gid), "start_date_local": start}


def zwift(iid, start):
    return {"id": iid, "source": "ZWIFT", "external_id": "2277118617784991744", "start_date_local": start}


class TestUtvalg(unittest.TestCase):
    def test_nokkel_for_garmin_og_zwift(self):
        self.assertEqual(aktivitetsnokkel(garmin(25166932132, "2026-11-22T11:10:59")), 25166932132)
        self.assertEqual(aktivitetsnokkel(zwift("i213416410", "2026-11-22T16:45:12")), 213416410)
        self.assertIsNone(aktivitetsnokkel({"id": "i5", "source": "STRAVA", "start_date_local": "2026-11-22T10:00:00"}))

    def test_zwift_tas_med_og_kjente_hoppes_over(self):
        liste = [garmin(100, "2026-11-22T11:10:59"), zwift("i213416410", "2026-11-22T16:45:12"),
                 zwift("i213416416", "2026-11-21T10:43:54")]
        valgt = velg_aktiviteter(liste, {100}, [])
        self.assertEqual([n for n, _ in valgt], [213416416, 213416410])

    def test_zwift_som_klokka_ogsa_tok_opp_hoppes_over(self):
        # Klokka startet 3 min før Zwift: samme tur. Den kjente Garmin-økta teller også.
        liste = [garmin(200, "2026-11-20T17:17:30"), zwift("i3", "2026-11-20T17:20:11"),
                 zwift("i4", "2026-11-19T17:03:11")]
        self.assertEqual([n for n, _ in velg_aktiviteter(liste, set(), [])], [4, 200])
        self.assertEqual([n for n, _ in velg_aktiviteter(liste[1:], set(), ["2026-11-19T17:00:00"])], [3])

    def test_multisport_blir_en_aktivitet(self):
        liste = [garmin(300, "2026-06-01T10:30:00", "i8"), garmin(300, "2026-06-01T10:00:00", "i7")]
        valgt = velg_aktiviteter(liste, set(), [])
        self.assertEqual(len(valgt), 1)
        self.assertEqual(valgt[0][1][0]["id"], "i7")  # første etappe først

    def test_zwift_spor_uten_koordinater(self):
        punkter = {"t": [0, 5], "lat": [-11.6, -11.6], "lon": [166.9, 166.9], "puls": [120, 125]}
        spor = {"punkter": punkter, "runder": []}
        self.assertEqual(uten_gps(spor)["punkter"], {"t": [0, 5], "puls": [120, 125]})
        self.assertIsNone(uten_gps(None))


class TestHelse(unittest.TestCase):
    def test_wellness_til_vare_felt(self):
        w = {"id": "2026-10-20", "restingHR": 41, "hrv": 92.4, "sleepSecs": 28830, "sleepScore": 81, "steps": 9000}
        self.assertEqual(helse_fra_wellness(w), {"hvilepuls": 41, "hrv_natt": 92, "sovn_min": 480, "sovnscore": 81})

    def test_tomme_felt_tas_ikke_med(self):
        self.assertEqual(helse_fra_wellness({"id": "2026-10-20", "restingHR": None, "hrv": 0}), {})

    def test_fletting_overskriver_aldri(self):
        gamle = [{"dato": "2026-10-08", "hvilepuls": 40, "hrv_natt": 90}]
        nye = {
            "2026-10-08": {"hvilepuls": 43, "hrv_natt": 88, "sovn_min": 470},
            "2026-10-09": {"hvilepuls": 41},
            "2026-10-10": {},
        }
        flettet, lagt_til = flett_helse(gamle, nye)
        self.assertEqual(flettet, [
            {"dato": "2026-10-08", "hvilepuls": 40, "hrv_natt": 90, "sovn_min": 470},
            {"dato": "2026-10-09", "hvilepuls": 41},
        ])
        self.assertEqual(lagt_til, 2)
        self.assertEqual(gamle[0], {"dato": "2026-10-08", "hvilepuls": 40, "hrv_natt": 90})


if __name__ == "__main__":
    unittest.main()
