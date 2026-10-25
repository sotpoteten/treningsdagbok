"""
Tester kontrollene i hent_olt.py: sjekk() av eksporten og commit_data(), med kjor() byttet ut
så ingen kommandoer kjøres på ordentlig.

Kjør fra prosjektmappen:  .venv\\Scripts\\python -m unittest scripts/test_hent_olt.py
"""
import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hent_olt
from hent_olt import DATAFILER, Avbrutt, commit_data, sjekk


class TestSjekk(unittest.TestCase):
    gammel = {"okter": 100, "siste": "2026-10-19", "uker": 10, "dager": 5}

    def test_godtar_flere_okter(self):
        sjekk(self.gammel, {**self.gammel, "okter": 101, "siste": "2026-10-26"}, tving=False)

    def test_godtar_forste_import(self):
        sjekk(None, {**self.gammel, "okter": 1}, tving=False)

    def test_avviser_tom_eksport_selv_med_tving(self):
        with self.assertRaises(Avbrutt):
            sjekk(self.gammel, {**self.gammel, "okter": 0}, tving=True)

    def test_avviser_faerre_okter_uten_tving(self):
        with self.assertRaises(Avbrutt):
            sjekk(self.gammel, {**self.gammel, "okter": 99}, tving=False)
        sjekk(self.gammel, {**self.gammel, "okter": 99}, tving=True)

    def test_avviser_eldre_siste_dato(self):
        with self.assertRaises(Avbrutt):
            sjekk(self.gammel, {**self.gammel, "siste": "2026-10-18"}, tving=False)


class FalskKjor:
    """Står i for kjor(): husker kommandoene og svarer som git ville gjort."""

    def __init__(self, gren="main", endret=True, feiler=None):
        self.gren, self.endret, self.feiler = gren, endret, feiler
        self.kommandoer = []

    def __call__(self, kommando, mappe=None):
        self.kommandoer.append(list(kommando))
        if self.feiler and self.feiler in kommando:
            raise Avbrutt(f"«{' '.join(kommando)}» feilet")
        if kommando[:2] == ["git", "rev-parse"]:
            return self.gren + "\n"
        if kommando[:2] == ["git", "status"]:
            return " M data/okter.json\n" if self.endret else ""
        return ""

    def git(self, underkommando):
        return [k for k in self.kommandoer if k[:2] == ["git", underkommando]]


class TestCommitData(unittest.TestCase):
    def kjor_commit(self, kjor, problemer=()):
        with (
            mock.patch.object(hent_olt, "kjor", kjor),
            mock.patch.object(hent_olt.personvern, "sjekk", return_value=list(problemer)) as pv,
            redirect_stdout(io.StringIO()),
        ):
            try:
                return commit_data("2026-10-26", 3)
            finally:
                self.personvern_kjort = pv.called

    def test_nekter_utenfor_main(self):
        kjor = FalskKjor(gren="eksperiment")
        with self.assertRaises(Avbrutt):
            self.kjor_commit(kjor)
        self.assertEqual(kjor.git("commit") + kjor.git("push"), [])

    def test_gjor_ingenting_uten_endringer(self):
        kjor = FalskKjor(endret=False)
        self.assertFalse(self.kjor_commit(kjor))
        self.assertFalse(self.personvern_kjort)
        self.assertEqual([k[:2] for k in kjor.kommandoer], [["git", "rev-parse"], ["git", "status"]])

    def test_status_spor_bare_etter_datafilene(self):
        kjor = FalskKjor(endret=False)
        self.kjor_commit(kjor)
        status = kjor.git("status")[0]
        self.assertEqual(status[status.index("--") + 1:], DATAFILER)

    def test_kjorer_kontrollene_for_commit(self):
        kjor = FalskKjor()
        self.assertTrue(self.kjor_commit(kjor))
        self.assertTrue(self.personvern_kjort)
        tekst = [" ".join(k) for k in kjor.kommandoer]
        commit = next(i for i, t in enumerate(tekst) if t.startswith("git commit"))
        for forventet in ("-m unittest", "npm.cmd test", "npm.cmd run build"):
            i = next(i for i, t in enumerate(tekst) if forventet in t)
            self.assertLess(i, commit, forventet)
        unittest_kommando = next(k for k in kjor.kommandoer if "unittest" in k)
        self.assertIn("scripts/test_hent_olt.py", unittest_kommando)
        self.assertIn("scripts/test_personvern.py", unittest_kommando)
        self.assertEqual(kjor.git("push"), [["git", "push", "origin", "main"]])

    def test_commit_tar_bare_med_datafilene(self):
        kjor = FalskKjor()
        self.kjor_commit(kjor)
        commits = kjor.git("commit")
        self.assertEqual(len(commits), 1)
        commit = commits[0]
        self.assertEqual(commit[:3], ["git", "commit", "-m"])
        self.assertEqual(commit[4], "--")
        self.assertEqual(commit[5:], DATAFILER)
        self.assertTrue(all(sti.startswith("data/") and not sti.startswith("data/raw/") for sti in DATAFILER))
        self.assertEqual(kjor.git("add"), [])

    def test_personvernfunn_stopper_commiten(self):
        kjor = FalskKjor()
        with self.assertRaises(Avbrutt):
            self.kjor_commit(kjor, problemer=["data/okter.json: koordinat i feltet «lat»"])
        self.assertEqual(kjor.git("commit") + kjor.git("push"), [])

    def test_feilende_kontroll_stopper_commiten(self):
        for feiler in ("unittest", "test", "build"):
            kjor = FalskKjor(feiler=feiler)
            with self.assertRaises(Avbrutt, msg=feiler):
                self.kjor_commit(kjor)
            self.assertEqual(kjor.git("commit") + kjor.git("push"), [], feiler)


if __name__ == "__main__":
    unittest.main()
