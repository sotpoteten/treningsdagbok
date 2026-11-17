"""Tester konverteringen av Excel-dagboka (konverter_excel.py) på en liten, oppdiktet arbeidsbok.

Kjør fra prosjektmappen:  .venv/Scripts/python -m unittest scripts/test_konverter_excel.py
"""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from konverter_excel import Feil, bygg, del_kommentar, kontroller, konverter_excel, les_arbeidsbok

TYPER = ["OL", "SOL", "Lø", "SkS", "RsS", "Sy", "Al", "St"]
MIN = timedelta(minutes=1)


def rad(type, ny=None, lag=0, mod=0, hog=0, km=None, fo=None, puls=(None, None), kontroller=(None, None),
        flyt=None, tavl=None, strekk=()):
    return {"type": type, "ny": ny, "lag": lag, "mod": mod, "hog": hog, "km": km, "fo": fo, "puls": puls,
            "kontroller": kontroller, "flyt": flyt, "tavl": tavl, "strekk": strekk}


# Tre dager: to økter med flere rader, en hviledag med notat, og ski-o ført som ski med kontroller.
DAGER = [
    {"rader": [rad("Lø", 1, lag=15, km=3, fo=6),
               rad("OL", lag=40, hog=20, km=10.5, puls=(185, 160), kontroller=(20, 17), flyt=7, tavl=1,
                   strekk=(2, 5, 1, 0)),
               rad("St", 1, lag=20, km=2.5, fo=7),
               rad("Lø", lag=10)],
     "kommentar": "Godt løp i skogen.  Styrke og jogg på kvelden. Reiste hjem etterpå.", "skadad": 1},
    {"rader": [], "kommentar": "Hviledag på hytta.", "vilodag": 1, "sjuk": 1},
    {"rader": [rad("SkS", 1, lag=30, mod=25, km=12, kontroller=(9, 9)),
               rad("Al", 1, lag=45, km=6.4)],
     "kommentar": None},
]


def arbeidsbok(sti: Path, borg: bool, dager=DAGER, typer=TYPER):
    """Arbeidsbok med samme oppsett som Isaks. Fila for 2018–19 mangler de to Borg-kolonnene."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Dag"
    hopp = 0 if borg else -2
    k = {"datum": 0, "type": 1, "ny": 2, "lag": 3, "km": 6, "fo": 8, "puls": 9, "kontroller": 13 + hopp,
         "flyt": 15 + hopp, "tavl": 16 + hopp, "strekk": 17 + hopp, "kommentar": 21 + hopp,
         "skadad": 25 + hopp, "sjuk": 26 + hopp, "vilodag": 27 + hopp, "pass": 28 + hopp}

    def sett(r, c, v):
        ws.cell(row=r, column=c + 1, value=v)

    sett(1, 0, "Träningsdagbok för Test Testesen, 01.11.2016 - 03.11.2016")
    for navn, felt in (("datum", "datum"), ("trän-\ntyp", "type"), ("ant\npa", "ny"), ("intensitet", "lag"),
                       ("km", "km"), ("fo", "fo"), ("puls", "puls"), ("kontroller", "kontroller"),
                       ("flyt", "flyt"), ("tävl", "tavl"), ("sträckplaceringar", "strekk"),
                       ("vilopuls", "kommentar"), ("skadad", "skadad"), ("sjuk", "sjuk"),
                       ("vilodag", "vilodag"), ("pass", "pass")):
        sett(3, k[felt], navn)
    sett(3, 7, "km-\ntid")
    if borg:
        sett(3, 11, "Borg")
    for i, t in enumerate(("låg", "mod", "hög")):
        sett(4, k["lag"] + i, t)
    sett(4, k["puls"], "max")
    sett(4, k["puls"] + 1, "med")
    sett(4, k["kontroller"], "tot")
    sett(4, k["kontroller"] + 1, "spik")
    for i, t in enumerate((3, 10, 20, ">20")):
        sett(4, k["strekk"] + i, t)
    sett(4, k["kommentar"], "beskrivning av dagens träning")

    # Arbeidsbokas egen tabell: én rad per dag med økter, tid og km per type.
    sett(4, k["pass"], "total tid")
    sett(4, k["pass"] + 1, "datum")
    for blokk in range(3):
        for i, t in enumerate(typer):
            sett(4, k["pass"] + 2 + blokk * len(typer) + i, t)

    for n, dag in enumerate(dager):
        topp = 5 + n * 4
        sett(topp, k["datum"], f"tirsdag\n{n + 1}\nnovember")
        for flagg in ("skadad", "sjuk", "vilodag"):
            if dag.get(flagg):
                sett(topp, k[flagg], 1)
        if dag["kommentar"]:
            sett(topp + 1, k["kommentar"], dag["kommentar"])
        sum_ = Counter()
        for i, r in enumerate(dag["rader"]):
            sett(topp + i, k["type"], r["type"])
            sett(topp + i, k["ny"], r["ny"])
            for j, f in enumerate(("lag", "mod", "hog")):
                if r[f]:
                    sett(topp + i, k["lag"] + j, r[f] * MIN)
            sett(topp + i, k["km"], r["km"])
            sett(topp + i, k["fo"], r["fo"])
            for j in range(2):
                sett(topp + i, k["puls"] + j, r["puls"][j])
                sett(topp + i, k["kontroller"] + j, r["kontroller"][j])
            sett(topp + i, k["flyt"], r["flyt"])
            sett(topp + i, k["tavl"], r["tavl"])
            for j, v in enumerate(r["strekk"]):
                sett(topp + i, k["strekk"] + j, v)
            t = typer.index(r["type"])
            sum_[0, t] += r["ny"] or 0
            sum_[1, t] += r["lag"] + r["mod"] + r["hog"]
            sum_[2, t] += r["km"] or 0
        sett(5 + n, k["pass"] + 1, datetime(2016, 11, 1 + n))
        for (blokk, t), v in sum_.items():
            sett(5 + n, k["pass"] + 2 + blokk * len(typer) + t, v * MIN if blokk == 1 else v)

    inn = wb.create_sheet("Inställningar")
    for i, t in enumerate(typer):
        for c, v in enumerate((None, i + 1, t, f"Beskrivelse av {t}")):
            inn.cell(row=4 + i, column=c + 1, value=v)
    wb.save(sti)


TEKST = {
    "2016-11-01": {
        "okter": [{"navn": "O-løp i skogen", "lop": "terreng"}, {"navn": "Styrke + jogg", "lop": "molle"}],
        "deler": [[1, ""], [2, "Styrke og jogg"], ["dag", "Reiste hjem"]],
    },
}


class Lesing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mappe = tempfile.TemporaryDirectory()
        rot = Path(cls.mappe.name)
        arbeidsbok(rot / "med_borg.xlsx", borg=True)
        arbeidsbok(rot / "uten_borg.xlsx", borg=False)
        cls.dager, cls.kontroll = les_arbeidsbok(rot / "med_borg.xlsx")
        cls.uten = les_arbeidsbok(rot / "uten_borg.xlsx")
        cls.rot = rot

    @classmethod
    def tearDownClass(cls):
        cls.mappe.cleanup()

    def test_begge_kolonneoppsett_gir_det_samme(self):
        self.assertEqual((self.dager, self.kontroll), self.uten)

    def test_dager_og_rader(self):
        self.assertEqual([d["dato"] for d in self.dager], ["2016-11-01", "2016-11-02", "2016-11-03"])
        r = self.dager[0]["rader"][1]
        self.assertEqual((r["type"], r["ny_okt"], r["lag"], r["hog"], r["km"]), ("OL", False, 2400, 1200, 10.5))
        self.assertEqual((r["puls_maks"], r["puls_snitt"], r["kontroller"], r["spikret"], r["flyt"], r["tavl"]),
                         (185, 160, 20, 17, 7, True))
        self.assertEqual(r["strekk"], [2, 5, 1, 0])

    def test_kommentar_og_flagg(self):
        self.assertTrue(self.dager[0]["kommentar"].startswith("Godt løp"))
        self.assertEqual([(d["skadad"], d["sjuk"], d["vilodag"]) for d in self.dager],
                         [(True, False, False), (False, True, True), (False, False, False)])
        self.assertIsNone(self.dager[2]["kommentar"])

    def test_stemmer_med_arbeidsbokas_egne_summer(self):
        self.assertEqual(self.kontroll["2016-11-01"]["Lø"], (1, 1500, 3))
        self.assertEqual(kontroller(self.dager, self.kontroll), [])

    def test_avvik_mot_summene_meldes(self):
        feil = json.loads(json.dumps(self.dager))
        feil[2]["rader"][0]["lag"] += 60
        avvik = kontroller(feil, self.kontroll)
        self.assertEqual(len(avvik), 1)
        self.assertIn("2016-11-03 SkS", avvik[0])

    def test_ukjent_type_stopper(self):
        dager = [{"rader": [rad("Ro", 1, lag=30)], "kommentar": None}, *DAGER[1:]]
        arbeidsbok(self.rot / "ukjent.xlsx", borg=True, dager=dager, typer=[*TYPER, "Ro"])
        with self.assertRaisesRegex(Feil, "ukjente treningstyper i Inställningar"):
            les_arbeidsbok(self.rot / "ukjent.xlsx")


class Bygging(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as d:
            arbeidsbok(Path(d) / "bok.xlsx", borg=True)
            cls.dager, _ = les_arbeidsbok(Path(d) / "bok.xlsx")
        okter, cls.helse, cls.advarsler = bygg(cls.dager, TEKST)
        cls.okter = {o["Id"]: o for o in okter}

    def blokker(self, id):
        return [(b["ActivityId"], {m["ActivityMetricId"]: m["Value"] for m in b["ReportedActivityMetrics"]})
                for b in self.okter[id]["ReportedSessionActivities"]]

    def test_ener_i_ant_pa_starter_ny_okt(self):
        self.assertEqual(list(self.okter), ["excel-2016-11-01-1", "excel-2016-11-01-2",
                                            "excel-2016-11-03-1", "excel-2016-11-03-2"])
        self.assertEqual([o["Order"] for o in self.okter.values()], [0, 1, 0, 1])

    def test_o_lop_gir_terreng_og_o_teknikk(self):
        # Oppvarmingen er løping i terreng fordi tekstfila sier det («lop»).
        self.assertEqual(self.blokker("excel-2016-11-01-1"), [
            (1, {1: 15, 9: 3}),
            (1, {1: 40, 4: 20, 9: 10.5}),
            (9, {11: 60}),
        ])
        o = self.okter["excel-2016-11-01-1"]
        self.assertEqual(o["Duration"], 75)  # o-teknikken er en del av løpetiden
        self.assertEqual([b["Position"] for b in o["ReportedSessionActivities"]], [0, 1, 2])

    def test_styrke_og_km_paa_styrkeraden(self):
        # Km ført på styrkeraden flyttes til løperaden, som er mølle ifølge tekstfila.
        self.assertEqual(self.blokker("excel-2016-11-01-2"), [(12, {12: 20}), (3, {1: 10, 9: 2.5})])
        self.assertEqual(self.okter["excel-2016-11-01-2"]["Duration"], 30)
        self.assertEqual(self.advarsler["km på styrkerad flyttet til løperaden"], 1)

    def test_ski_med_kontroller_er_ski_o(self):
        self.assertEqual(self.blokker("excel-2016-11-03-1"), [(5, {1: 30, 2: 25}), (11, {11: 55})])

    def test_km_utenom_loping_ligger_i_ekstra(self):
        self.assertEqual(self.blokker("excel-2016-11-03-2"), [(8, {1: 45})])
        self.assertEqual(self.okter["excel-2016-11-03-2"]["Ekstra"]["rader"], [{"type": "Al", "km": 6.4}])
        self.assertEqual(self.okter["excel-2016-11-03-1"]["Ekstra"]["rader"],
                         [{"type": "SkS", "km": 12, "kontroller": 9, "spikret": 9}])

    def test_ekstra_tar_vare_paa_det_olt_mangler(self):
        e = self.okter["excel-2016-11-01-1"]["Ekstra"]
        self.assertEqual((e["kilde"], e["navn_fra"]), ("excel", "forslag"))
        self.assertEqual(e["rader"], [
            {"type": "Lø"},
            {"type": "OL", "puls_maks": 185, "puls_snitt": 160, "kontroller": 20, "spikret": 17, "flyt": 7,
             "strekkplasseringer": [2, 5, 1, 0], "konkurranse": True},
        ])

    def test_form_og_tomme_felt(self):
        o = self.okter["excel-2016-11-01-1"]
        self.assertEqual(o["ReportedSessionMetrics"], [{"SessionMetricId": 2, "Value": 6}])
        self.assertIsNone(o["MaxIZone"])
        self.assertEqual(self.okter["excel-2016-11-03-1"]["ReportedSessionMetrics"], [])

    def test_navn_fra_tekstfila_ellers_fra_typene(self):
        self.assertEqual([o["Name"] for o in self.okter.values()],
                         ["O-løp i skogen", "Styrke + jogg", "Skate", "Alternativ"])
        self.assertEqual(self.okter["excel-2016-11-03-1"]["Ekstra"]["navn_fra"], "type")

    def test_kommentaren_deles_uten_aa_endres(self):
        tekst = [o["Comments"][0]["Text"] if o["Comments"] else None for o in self.okter.values()]
        self.assertEqual(tekst, ["Godt løp i skogen.", "Styrke og jogg på kvelden.", None, None])
        self.assertEqual(self.helse[0]["Comment"], "Reiste hjem etterpå.")

    def test_dagsrapporter(self):
        self.assertEqual([h["Date"] for h in self.helse], ["2016-11-01", "2016-11-02"])
        en, to = self.helse
        self.assertEqual((en["IsInjured"], en["IsCompetitionDay"], en["IsDayOff"]), (True, True, False))
        self.assertEqual((to["IsSick"], to["IsDayOff"], to["Comment"]), (True, True, "Hviledag på hytta."))

    def test_flerokt_uten_deler_gir_alt_til_forste_okt_og_advarsel(self):
        okter, helse, advarsler = bygg(self.dager, {})
        self.assertEqual(okter[0]["Comments"][0]["Text"], self.dager[0]["kommentar"])
        self.assertEqual(okter[1]["Comments"], [])
        self.assertEqual(advarsler["flerøktsdag uten delt kommentar (hele teksten på første økt)"], 1)
        self.assertEqual(okter[0]["Name"], "Løp + O-løp")

    def test_feil_i_tekstfila_stopper(self):
        for tekst, melding in (
            ({"2016-12-24": {}}, "datoer som ikke finnes"),
            ({"2016-11-01": {"okter": [{}, {}, {}]}}, "tekstfila har 3 økter"),
            ({"2016-11-01": {"okter": [{"lop": "asfalt"}]}}, "ukjent «lop»"),
            ({"2016-11-01": {"deler": [[1, ""], [3, "Styrke"]]}}, "ukjent mål 3"),
        ):
            with self.assertRaisesRegex(Feil, melding):
                bygg(self.dager, tekst)

    def test_forste_rad_uten_ener_stopper(self):
        dager = json.loads(json.dumps(self.dager))
        dager[2]["rader"][0]["ny_okt"] = False
        with self.assertRaisesRegex(Feil, "første rad mangler 1"):
            bygg(dager, {})


class Kommentardeling(unittest.TestCase):
    TEKST = "Jogg på morgenen. Intervaller på kvelden. Jogg hjem. Lang dag."

    def test_deler_dekker_hele_teksten(self):
        per_okt, dag = del_kommentar(self.TEKST, [[1, ""], [2, "Intervaller"], ["dag", "Lang dag"]], 2, "d")
        self.assertEqual(per_okt, {1: "Jogg på morgenen.", 2: "Intervaller på kvelden. Jogg hjem."})
        self.assertEqual(dag, "Lang dag.")

    def test_samme_okt_kan_faa_flere_deler(self):
        per_okt, dag = del_kommentar(self.TEKST, [[1, ""], [2, "Intervaller"], [1, "Lang dag"]], 2, "d")
        self.assertEqual(per_okt[1], "Jogg på morgenen. Lang dag.")
        self.assertIsNone(dag)

    def test_del_som_gjelder_alle_oktene(self):
        per_okt, dag = del_kommentar(self.TEKST, [["alle", ""], [2, "Jogg hjem"], ["dag", "Lang dag"]], 2, "d")
        self.assertEqual(per_okt, {1: "Jogg på morgenen. Intervaller på kvelden.",
                                   2: "Jogg på morgenen. Intervaller på kvelden. Jogg hjem."})
        self.assertEqual(dag, "Lang dag.")

    def test_uten_deler(self):
        self.assertEqual(del_kommentar(self.TEKST, None, 1, "d"), ({1: self.TEKST}, None))
        self.assertEqual(del_kommentar(self.TEKST, None, 0, "d"), ({}, self.TEKST))
        self.assertEqual(del_kommentar(None, None, 2, "d"), ({}, None))

    def test_ankeret_maa_staa_noyaktig_ett_sted(self):
        with self.assertRaisesRegex(Feil, "flere steder"):
            del_kommentar(self.TEKST, [[1, ""], [2, "på"]], 2, "d")
        with self.assertRaisesRegex(Feil, "finner ikke"):
            del_kommentar(self.TEKST, [[1, ""], [2, "Styrke"]], 2, "d")
        with self.assertRaisesRegex(Feil, "første del må ha tomt anker"):
            del_kommentar(self.TEKST, [[1, "Jogg på"]], 2, "d")
        with self.assertRaisesRegex(Feil, "ingen kommentar"):
            del_kommentar(None, [[1, ""]], 2, "d")

    def test_ankrene_maa_komme_i_rekkefolge(self):
        with self.assertRaisesRegex(Feil, "finner ikke"):
            del_kommentar(self.TEKST, [[1, ""], ["dag", "Lang dag"], [2, "Intervaller"]], 2, "d")


class HeleKjoringen(unittest.TestCase):
    def test_skriver_bare_de_to_filene(self):
        with tempfile.TemporaryDirectory() as d:
            mappe = Path(d) / "excel"
            mappe.mkdir()
            arbeidsbok(mappe / "bok.xlsx", borg=False)
            tekstfil = Path(d) / "tekst.json"
            tekstfil.write_text(json.dumps(TEKST, ensure_ascii=False), encoding="utf-8")
            logg = io.StringIO()
            with contextlib.redirect_stdout(logg):
                self.assertTrue(konverter_excel(mappe, tekstfil))
            self.assertEqual(sorted(p.name for p in mappe.iterdir()),
                             ["bok.xlsx", "healthStatuses.json", "workoutSessions.json"])
            okter = json.loads((mappe / "workoutSessions.json").read_text(encoding="utf-8"))
            self.assertEqual(len(okter), 4)
            self.assertIn("Alle dager stemmer", logg.getvalue())


if __name__ == "__main__":
    unittest.main()
