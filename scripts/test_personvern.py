"""
Tester personvernsjekken i personvern.py, både på små eksempler og på filene git sporer.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_personvern.py
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from personvern import finn_problemer, sjekk, sjekk_innhold, sjekk_sti

UUID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b"


class TestStier(unittest.TestCase):
    def test_forbudte_mapper(self):
        for sti in ("data/raw/userData.json", "data/garmin_spor/123.json", "web/public/garmin_spor/123.json"):
            self.assertTrue(sjekk_sti(sti), sti)

    def test_env_filer(self):
        for sti in ("web/.env.local", ".env", "scripts/prod.env"):
            self.assertTrue(sjekk_sti(sti), sti)

    def test_bilder_bare_i_docs_bilder(self):
        self.assertEqual(sjekk_sti("docs/bilder/dagbok.png"), [])
        self.assertTrue(sjekk_sti("data/kart.png"))
        self.assertTrue(sjekk_sti("docs/skjerm.JPG"))
        self.assertEqual(sjekk_sti("web/public/favicon.svg"), [])

    def test_vanlige_filer(self):
        for sti in ("data/okter.json", "web/src/main.tsx", "scripts/hent_olt.py", "README.md"):
            self.assertEqual(sjekk_sti(sti), [], sti)


class TestInnhold(unittest.TestCase):
    def json(self, objekt) -> list[str]:
        return sjekk_innhold("data/x.json", json.dumps(objekt, ensure_ascii=False))

    def test_koordinater_uansett_store_bokstaver_og_dybde(self):
        for nokkel in ("lat", "Lon", "LATITUDE", "longitude", "position_lat", "Position_Long"):
            self.assertTrue(self.json([{"spor": {"punkter": [{nokkel: 63.4}]}}]), nokkel)

    def test_fodselsdato(self):
        self.assertTrue(self.json({"BirthDate": "2000-01-01"}))
        self.assertTrue(self.json({"profil": {"fodselsdato": "2000-01-01"}}))

    def test_nokkelfelt(self):
        self.assertTrue(self.json({"api_nokkel": "x"}))
        self.assertTrue(self.json({"Email": "x"}))

    def test_epost(self):
        self.assertTrue(sjekk_innhold("data/x.csv", "navn;notat\nIsak;skriv til isak.j+test@eksempel.no"))

    def test_krollalfa_er_ikke_epost(self):
        self.assertEqual(sjekk_innhold("data/x.csv", "8 x 1000m @ Bislett;4x300m @NIH;a@b"), [])

    def test_tokens(self):
        self.assertTrue(sjekk_innhold("data/x.txt", "sk-ant-abc"))
        self.assertTrue(sjekk_innhold("data/x.txt", "API_NOKKEL=hemmelig"))
        self.assertTrue(sjekk_innhold("data/x.txt", "nøkkel: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b"))
        self.assertTrue(sjekk_innhold("data/x.txt", "x QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1Njc4OTA= y"))

    def test_uuid_lange_ord_og_tall_er_ikke_tokens(self):
        tekst = json.dumps([{"id": UUID, "okt_id": UUID, "garmin_id": 12345678901,
                             "kommentar": "Ettermiddagsjogg-og-styrketrening-med-intervaller-i-bakken",
                             "tall": "12345678901234567890123456789012345"}])
        self.assertEqual(sjekk_innhold("data/x.json", tekst), [])
        self.assertEqual(sjekk_innhold("data/x.csv", f"okt_id;dato\n{UUID};2026-10-05\n"), [])

    def test_ugyldig_json(self):
        self.assertTrue(sjekk_innhold("data/x.json", "{ikke json"))


class TestFiler(unittest.TestCase):
    def test_finner_problemer_i_filer_under_data(self):
        with tempfile.TemporaryDirectory() as mappe:
            rot = Path(mappe)
            (rot / "data").mkdir()
            (rot / "data/ok.json").write_text(json.dumps([{"id": UUID}]), encoding="utf-8")
            (rot / "data/spor.json").write_text(json.dumps({"punkter": [{"lat": 1, "lon": 2}]}), encoding="utf-8")
            (rot / "annet.json").write_text(json.dumps({"lat": 1}), encoding="utf-8")  # utenfor data/
            problemer = finn_problemer(["data/ok.json", "data/spor.json", "annet.json", "data/slettet.json"], rot)
            self.assertEqual(len(problemer), 2, problemer)
            self.assertTrue(all(p.startswith("data/spor.json") for p in problemer))

    def test_sporede_filer_i_repoet_er_i_orden(self):
        self.assertEqual(sjekk(), [])


if __name__ == "__main__":
    unittest.main()
