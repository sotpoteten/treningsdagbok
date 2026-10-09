"""
Kobler Garmin-aktiviteter til økter i dagboka.

Garmin tar ofte opp oppvarming, hoveddel og nedjogg som egne aktiviteter, mens dagboka
har én økt med flere blokker. Derfor kan en økt kobles til 1–3 påfølgende aktiviteter
samme dag. Koblingen er grådig: de beste parene (minst avvik) velges først.
"""
from collections import defaultdict

MAKS_GRUPPE = 3


def toleranse_min(varighet: float) -> float:
    """Tillatt avvik i minutter: minst 5 min, ellers 15 % av økta."""
    return max(5.0, 0.15 * varighet)


def _poeng(okt, gruppe):
    """Avvik for en økt mot en gruppe aktiviteter, eller None hvis de ikke passer."""
    varighet = sum(a["varighet_min"] for a in gruppe)
    avvik = abs(varighet - okt["varighet_min"])
    if avvik > toleranse_min(okt["varighet_min"]):
        return None
    # Distanse sjekkes bare når begge har løpedistanse (dagboka har km bare for løping).
    km_okt = okt.get("distanse_km") or 0
    km_g = sum(a.get("distanse_km") or 0 for a in gruppe if a.get("loping"))
    if km_okt > 0 and km_g > 0:
        km_avvik = abs(km_g - km_okt)
        if km_avvik > max(1.5, 0.2 * km_okt):
            return None
        avvik += km_avvik * 2  # 1 km ≈ 2 min i straff
    # Små tillegg så færre aktiviteter foretrekkes ved likt avvik.
    return avvik + 0.01 * (len(gruppe) - 1)


def koble(okter, aktiviteter):
    """
    okter:       [{id, dato, varighet_min, distanse_km}]
    aktiviteter: [{garmin_id, dato, start, varighet_min, distanse_km, loping}]
    Gir {garmin_id: okt_id} for aktivitetene som ble koblet.
    """
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
                    p = _poeng(o, gruppe)
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
