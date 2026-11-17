"""Tester koblingen mellom Garmin-aktiviteter og dagbokøkter.

Kjør fra prosjektmappen:  python -m unittest scripts/test_garmin_kobling.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from garmin_kobling import koble


def okt(id, dato, minutter, km=0.0, styrke=0):
    return {"id": id, "dato": dato, "varighet_min": minutter, "distanse_km": km, "styrke_min": styrke}


def akt(gid, dato, start, minutter, km=0.0, loping=True):
    return {"garmin_id": gid, "dato": dato, "start": start, "varighet_min": minutter, "distanse_km": km,
            "loping": loping}


class Kobling(unittest.TestCase):
    def test_en_aktivitet_en_okt(self):
        r = koble([okt("a", "2025-01-01", 42, 7.9)], [akt(1, "2025-01-01", "10:00", 42.3, 7.95)])
        self.assertEqual(r, {1: "a"})

    def test_tre_aktiviteter_en_okt(self):
        # Oppvarming + intervaller + nedjogg tatt opp hver for seg
        r = koble(
            [okt("a", "2025-01-01", 61, 11.1)],
            [
                akt(1, "2025-01-01", "17:00", 20, 3.5),
                akt(2, "2025-01-01", "17:21", 30, 6.0),
                akt(3, "2025-01-01", "17:52", 11, 1.6),
            ],
        )
        self.assertEqual(r, {1: "a", 2: "a", 3: "a"})

    def test_to_okter_samme_dag(self):
        r = koble(
            [okt("morgen", "2025-01-01", 49, 9.8), okt("kveld", "2025-01-01", 42, 7.9)],
            [akt(1, "2025-01-01", "08:00", 49.2, 9.8), akt(2, "2025-01-01", "18:00", 41.8, 7.9)],
        )
        self.assertEqual(r, {1: "morgen", 2: "kveld"})

    def test_lop_og_styrke_med_bare_lopingen_pa_klokka(self):
        # 93 min, hvorav 45 min styrke: klokka har bare løpeturen på 48 min
        r = koble([okt("a", "2017-01-02", 93, 6.6, styrke=45)], [akt(1, "2017-01-02", "16:00", 48.3, 6.59)])
        self.assertEqual(r, {1: "a"})

    def test_uten_styrke_tar_ikke_en_annen_okts_aktivitet(self):
        # Joggen passer på hele økta b, så den skal ikke gå til a i andre runde
        r = koble(
            [okt("a", "2017-01-02", 75, 6.0, styrke=35), okt("b", "2017-01-02", 40, 6.0)],
            [akt(1, "2017-01-02", "08:00", 40, 6.0)],
        )
        self.assertEqual(r, {1: "b"})

    def test_uten_styrke_krever_lopedistanse(self):
        # Løp + styrke med km skal ikke kobles til en skitur uten løpedistanse
        r = koble([okt("a", "2023-12-20", 89, 9.9, styrke=18)],
                  [akt(1, "2023-12-20", "18:00", 72.9, 13.6, loping=False)])
        self.assertEqual(r, {})

    def test_styrke_uten_garmin(self):
        okter = [okt("styrke", "2025-01-01", 45), okt("jogg", "2025-01-01", 40, 8)]
        r = koble(okter, [akt(1, "2025-01-01", "10:00", 40, 8)])
        self.assertEqual(r, {1: "jogg"})

    def test_for_stort_avvik(self):
        self.assertEqual(koble([okt("a", "2025-01-01", 90)], [akt(1, "2025-01-01", "10:00", 40)]), {})

    def test_feil_distanse_avvises(self):
        # Samme varighet, men løpedistansen stemmer ikke
        r = koble([okt("a", "2025-01-01", 60, 14.0)], [akt(1, "2025-01-01", "10:00", 60, 8.0)])
        self.assertEqual(r, {})

    def test_sykkel_teller_ikke_mot_lopedistanse(self):
        r = koble([okt("a", "2025-01-01", 75, 0)], [akt(1, "2025-01-01", "10:00", 75, 30.0, loping=False)])
        self.assertEqual(r, {1: "a"})


if __name__ == "__main__":
    unittest.main()
