"""
Tester publiser_spor.py: hvilke filer som kommer med i zip-fila, at den blir lik hver gang,
og at ingenting lastes opp når hashen er uendret. gh byttes ut, så ingenting kjøres på ordentlig.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_publiser_spor.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publiser_spor
from publiser_spor import HASHFIL, Feil, oppdater, pakk, pakk_ut


def _svar(kode: int = 0, ut: str = "", feil: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess([], kode, ut, feil)


class MedMappe(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.rot = Path(self._tmp.name)
        self.spor = self.rot / "garmin_spor"
        self.spor.mkdir()
        for navn in ("200.json", "100.json"):
            (self.spor / navn).write_text('{"punkter": {}}', encoding="utf-8")
        # Disse skal ikke med.
        (self.spor / "liste.json").write_text("[]", encoding="utf-8")
        (self.spor / "100.json.bak").write_text("x", encoding="utf-8")
        (self.spor / "300.txt").write_text("x", encoding="utf-8")
        (self.spor / "400.json").mkdir()
        self.zip = self.rot / "raw" / "garmin_spor.zip"

    def tearDown(self):
        self._tmp.cleanup()


class TestPakk(MedMappe):
    def test_bare_id_json_sortert(self):
        _, antall = pakk(self.spor, self.zip)
        self.assertEqual(antall, 2)
        with zipfile.ZipFile(self.zip) as z:
            self.assertEqual(z.namelist(), ["100.json", "200.json"])
            self.assertEqual({i.date_time for i in z.infolist()}, {(1980, 1, 1, 0, 0, 0)})

    def test_lik_hver_gang(self):
        hash1, _ = pakk(self.spor, self.zip)
        innhold1 = self.zip.read_bytes()
        # Nye endringstider på filene skal ikke endre zip-fila.
        ny_tid = time.time() + 3600
        for p in self.spor.glob("*.json"):
            if p.is_file():
                os.utime(p, (ny_tid, ny_tid))
        hash2, _ = pakk(self.spor, self.zip)
        self.assertEqual(hash1, hash2)
        self.assertEqual(innhold1, self.zip.read_bytes())

    def test_endret_innhold_gir_ny_hash(self):
        hash1, _ = pakk(self.spor, self.zip)
        (self.spor / "300.json").write_text("{}", encoding="utf-8")
        hash2, antall = pakk(self.spor, self.zip)
        self.assertNotEqual(hash1, hash2)
        self.assertEqual(antall, 3)

    def test_pakk_ut_hopper_over_andre_navn(self):
        self.zip.parent.mkdir()
        with zipfile.ZipFile(self.zip, "w") as z:
            z.writestr("5.json", "{}")
            z.writestr("../6.json", "{}")
            z.writestr("mappe/7.json", "{}")
            z.writestr("8.exe", "x")
        ut = self.rot / "ut"
        self.assertEqual(pakk_ut(self.zip, ut), 1)
        self.assertEqual(sorted(p.name for p in ut.iterdir()), ["5.json"])
        self.assertFalse((self.rot / "6.json").exists())


class TestOppdater(MedMappe):
    def _kjor(self, svar):
        """Kjører oppdater() med gh byttet ut. svar(args) gir CompletedProcess. Gir kallene."""
        kall = []

        def falsk_gh(*args):
            kall.append(args)
            return svar(args)

        with mock.patch.object(publiser_spor, "gh", side_effect=falsk_gh), \
             mock.patch.object(publiser_spor, "ZIP", self.zip):
            resultat = oppdater(self.spor, self.zip)
        return resultat, kall

    def _med_hash(self, hash_publisert):
        assets = json.dumps({"assets": [{"name": "garmin_spor.zip"}, {"name": HASHFIL}]})

        def svar(args):
            if args[:2] == ("release", "view"):
                return _svar(ut=assets)
            if args[:2] == ("release", "download"):
                mappe = Path(args[args.index("--dir") + 1])
                (mappe / HASHFIL).write_text(f"{hash_publisert}  garmin_spor.zip\n", encoding="utf-8")
                return _svar()
            return _svar()
        return svar

    def test_uendret_hash_laster_ikke_opp(self):
        hash_na, _ = pakk(self.spor, self.zip)
        resultat, kall = self._kjor(self._med_hash(hash_na))
        self.assertIn("uendret", resultat)
        self.assertFalse([k for k in kall if k[:2] in {("release", "upload"), ("release", "create")}])

    def test_endret_hash_laster_opp_zip_for_hash(self):
        resultat, kall = self._kjor(self._med_hash("0" * 64))
        opplastinger = [Path(k[3]).name for k in kall if k[:2] == ("release", "upload")]
        self.assertEqual(opplastinger, ["garmin_spor.zip", HASHFIL])
        self.assertTrue(all("--clobber" in k for k in kall if k[:2] == ("release", "upload")))
        self.assertFalse([k for k in kall if k[:2] == ("release", "create")])
        self.assertIn("2 spor publisert", resultat)
        hash_na = publiser_spor.sha256(self.zip)
        self.assertEqual((self.zip.parent / HASHFIL).read_text(encoding="utf-8").split()[0], hash_na)

    def test_lager_utgivelsen_som_forhandsutgivelse(self):
        def svar(args):
            if args[:2] == ("release", "view"):
                return _svar(1, feil="release not found")
            return _svar()
        _, kall = self._kjor(svar)
        lag = [k for k in kall if k[:2] == ("release", "create")]
        self.assertEqual(len(lag), 1)
        self.assertIn("--prerelease", lag[0])
        self.assertIn("--latest=false", lag[0])
        self.assertLess(kall.index(lag[0]), kall.index(next(k for k in kall if k[:2] == ("release", "upload"))))

    def test_feil_fra_gh_kaster(self):
        def svar(args):
            if args[:2] == ("release", "view"):
                return _svar(1, feil="HTTP 401: Bad credentials")
            return _svar()
        with self.assertRaises(Feil):
            self._kjor(svar)

    def test_feilet_opplasting_kaster(self):
        def svar(args):
            if args[:2] == ("release", "view"):
                return _svar(ut=json.dumps({"assets": []}))
            if args[:2] == ("release", "upload"):
                return _svar(1, feil="upload failed")
            return _svar()
        with self.assertRaises(Feil):
            self._kjor(svar)

    def test_ingen_spor(self):
        tom = self.rot / "tom"
        with mock.patch.object(publiser_spor, "gh") as falsk:
            self.assertIn("ingen", oppdater(tom, self.zip))
        falsk.assert_not_called()


if __name__ == "__main__":
    unittest.main()
