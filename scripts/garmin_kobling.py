"""
Kobler Garmin-aktiviteter til økter i dagboka.

Garmin tar ofte opp oppvarming, hoveddel og nedjogg som egne aktiviteter, mens dagboka
har én økt med flere blokker. Derfor kan en økt kobles til 1–3 påfølgende aktiviteter
samme dag. Koblingen er grådig: de beste parene (minst avvik) velges først.

En økt med styrke har ofte bare løpingen eller sykkelturen på klokka. Derfor prøves økter og
aktiviteter som står igjen etter første runde, en gang til med varigheten uten styrke.
"""
from collections import defaultdict

MAKS_GRUPPE = 3


def toleranse_min(varighet: float) -> float:
    """Tillatt avvik i minutter: minst 5 min, ellers 15 % av økta."""
    return max(5.0, 0.15 * varighet)


def _poeng(okt, gruppe, krev_km=False):
    """Avvik for en økt mot en gruppe aktiviteter, eller None hvis de ikke passer. Med krev_km
    må gruppen ha løpedistanse når økta har det."""
    varighet = sum(a["varighet_min"] for a in gruppe)
    avvik = abs(varighet - okt["varighet_min"])
    if avvik > toleranse_min(okt["varighet_min"]):
        return None
    # Distanse sjekkes bare når begge har løpedistanse (dagboka har km bare for løping).
    km_okt = okt.get("distanse_km") or 0
    km_g = sum(a.get("distanse_km") or 0 for a in gruppe if a.get("loping"))
    if krev_km and km_okt > 0 and km_g == 0:
        return None
    if km_okt > 0 and km_g > 0:
        km_avvik = abs(km_g - km_okt)
        if km_avvik > max(1.5, 0.2 * km_okt):
            return None
        avvik += km_avvik * 2  # 1 km ≈ 2 min i straff
    # Små tillegg så færre aktiviteter foretrekkes ved likt avvik.
    return avvik + 0.01 * (len(gruppe) - 1)


def koble(okter, aktiviteter):
    """
    okter:       [{id, dato, varighet_min, distanse_km, styrke_min (valgfri)}]
    aktiviteter: [{garmin_id, dato, start, varighet_min, distanse_km, loping}]
    Gir {garmin_id: okt_id} for aktivitetene som ble koblet.
    """
    resultat = _koble_runde(okter, aktiviteter)
    brukte = set(resultat.values())
    uten_styrke = [
        {**o, "varighet_min": o["varighet_min"] - o["styrke_min"]}
        for o in okter
        if o["id"] not in brukte and 0 < (o.get("styrke_min") or 0) < o["varighet_min"]
    ]
    igjen = [a for a in aktiviteter if a["garmin_id"] not in resultat]
    resultat.update(_koble_runde(uten_styrke, igjen, krev_km=True))
    return resultat


def _koble_runde(okter, aktiviteter, krev_km=False):
    per_dato_o = defaultdict(list)
    for o in okter:
        per_dato_o[o["dato"]].append(o)
    per_dato_a = defaultdict(list)
    for a in aktiviteter:
        per_dato_a[a["dato"]].append(a)

    resultat = {}
    for dato, dagens_okter in per_dato_o.items():
        akt = sorted(per_dato_a.get(dato, []), key=lambda a: a["start"])
        if not akt:
            continue
        kandidater = []
        for i in range(len(akt)):
            for n in range(1, MAKS_GRUPPE + 1):
                gruppe = akt[i : i + n]
                if len(gruppe) < n:
                    break
                for o in dagens_okter:
                    p = _poeng(o, gruppe, krev_km)
                    if p is not None:
                        kandidater.append((p, o["id"], [a["garmin_id"] for a in gruppe]))
        kandidater.sort(key=lambda k: k[0])
        brukte_okter = set()
        brukte_akt = set()
        for _, okt_id, ids in kandidater:
            if okt_id in brukte_okter or any(g in brukte_akt for g in ids):
                continue
            brukte_okter.add(okt_id)
            brukte_akt.update(ids)
            for g in ids:
                resultat[g] = okt_id
    return resultat
