"""
Tester omformingen i hent_intervals.py.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_hent_intervals.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hent_intervals import aktivitetstype, flett_helse, helse_fra_wellness


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
