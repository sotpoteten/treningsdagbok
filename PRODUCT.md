# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript i `web/`. Statisk side som leser JSON fra `data/`; ingen server.
Kjøres lokalt (`npm run dev`). Publisering er ikke bestemt.

## Users

- **Isak Jonsson**, orienteringsløper, er hovedbruker. Han bruker siden ved PC-en i rolige
  stunder for å se tilbake på trening (finne igjen økter, uker og mesterskap) og for å se
  mønstre fra tidligere sesonger når neste sesong planlegges.
- **Trener og andre** skal kunne få vist siden. De er sekundærbrukere.

## Product Purpose

Siden gjør nesten sju års treningsdagbok (fra 1. nov. 2019) lesbar og søkbar. Dataene er
eksportert fra Olympiatoppens dagbok (dagbok.olympiatoppen.no). Første versjon viser alle
økter på en oversiktlig måte i en ukeskalender. Analyseverktøy kommer senere. Siden
lykkes når Isak raskt kan svare på spørsmål som «hva gjorde jeg uka før NM i fjor?» og
«hvordan så vinteren 2024 ut sammenlignet med 2025?».

## Positioning

Siden bygger på Isaks egne data: rundt 3 900 økter med soner (Olympiatoppens skala I1–I5),
o-teknikk, styrke og distanse, og med hans egne dagboknotater. Garmin Connect og
Olympiatoppen-dagboka viser én økt eller én periode av gangen. Denne siden viser hele
historikken samlet, med både notater og tall.

## Operating Context

- Det er en personlig dagbok som skal leses og blas i, ikke et verktøy for å registrere
  økter. Nye data kommer ved ny eksport fra Olympiatoppen og `python scripts/konverter.py`.
- Garmin-data (GPS-spor, HRV, hvilepuls, søvn) kommer senere fra en full Garmin-eksport.
  HRV, søvn og hvilepuls finnes bare fra høsten 2023.

## Capabilities and Constraints

- Datamodell og regler for beregninger står i `CLAUDE.md`. De viktigste: varighet er
  sonetid pluss styrke, o-teknikk er en del av løpetiden og legges ikke til, og distanse
  finnes bare for løping.
- Begrepene er norske og fra treningsfaget: økt, blokk, sone I1–I5, o-teknikk
  (nordisk/kontinentalt/sprint), opplevd belastning og dagsform (1–10), ukeskommentar,
  og dagsmarkører (syk, skadet, reise, høydedøgn, fridag, konkurranse).
- All tekst på siden er norsk (bokmål).
- Dagboknotatene kan vises. Det har Isak bekreftet. Kommentarer fra andre (trener)
  skal ikke presenteres som Isaks tekst.

## Brand Commitments

Ingen identitet er bestemt. Isak har lagt to krav: **notatene og tallene skal begge stå
sentralt**. Ingen av dem skal gjemmes bak den andre.

## Evidence on Hand

- `data/okter.json` har 3 929 økter, `data/dager.json` 610 dagsrapporter,
  `data/uker.json` 357 ukeskommentarer og `data/profil.json` pulssonene.
- Kontrolltall per år står i `CLAUDE.md`.
- Det finnes ingen bilder eller logo, og ingen Garmin-data ennå. Slikt skal ikke diktes opp.

## Product Principles

1. Ekte data alltid. Ingen eksempeltall eller plassholdere.
2. Ord og tall er likeverdige. En økt er både «42 min, 7,9 km, I1» og det Isak skrev om den.
3. Oversikt først, detaljer ved ett klikk: uke → økt → blokker.
4. Tallene må stemme med kontrolltallene i `CLAUDE.md` og følge reglene der.
5. Strukturen skal tåle nye datakilder (Garmin) og analyseverktøy uten omskriving.
