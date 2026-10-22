# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + TypeScript i `web/`. Statisk side som leser JSON fra `data/`, uten server.
Unntaket er «Spør», en AI-assistent (Claude Agent SDK) som kjører i utviklingsserveren.
Siden har egne SVG-grafer med d3 og kart med MapLibre. Dataene konverteres med
Python-skript i `scripts/`. Siden kjøres lokalt (`npm run dev`, port 5180). Koden og
dataene ligger offentlig på GitHub (sotpoteten/treningsdagbok), og en statisk utgave uten
GPS-spor og assistent publiseres på GitHub Pages.

## Users

- **Isak Jonsson**, orienteringsløper, er hovedbruker. Han bruker siden ved PC-en i rolige
  stunder for å se tilbake på trening (finne igjen økter, uker og mesterskap) og for å se
  mønstre fra tidligere sesonger når neste sesong planlegges.
- **Trener og andre** skal kunne få vist siden. De er sekundærbrukere.

## Product Purpose

Siden gjør nesten sju års treningsdagbok (fra 1. nov. 2019) lesbar, søkbar og analyserbar.
Dataene kommer fra Olympiatoppens dagbok (dagbok.olympiatoppen.no) og fra en full
Garmin-eksport.
- **Dagbok:** ukeskalender med søk og et øktpanel. Panelet viser blokker og notat, og
  Garmin-data med kart, puls, tempo og runder.
- **Analyse:** Oversikt mot forrige sesong, volum, sesongsammenligning, intensitet og
  aktivitet, rekorder, og helse og belastning (hvilepuls, HRV, søvn og Garmins
  treningsbelastning).
- **Spør:** En AI-assistent som henter tall og notater fra dagboka og ser dem opp mot
  treningslære og forskning på eliteutøvere. Svarene skiller mellom data, litteratur og
  vurdering, og lenker til kilder, uker og økter. Den stiller ikke diagnoser og tar ikke
  avgjørelser om treningsopplegget.

Siden lykkes når Isak raskt kan svare på spørsmål som:
- «hva gjorde jeg uka før NM i fjor?»
- «hvordan så vinteren 2024 ut sammenlignet med 2025?»
- «hvordan var HRV og søvn i ukene før jeg ble syk?»
- «hvordan er intensitetsfordelingen min sammenlignet med det forskningen beskriver?»

## Positioning

Siden bygger på Isaks egne data: rundt 3 900 økter med soner (Olympiatoppens skala I1–I5),
o-teknikk, styrke og distanse, og med hans egne dagboknotater. Garmin Connect og
Olympiatoppen-dagboka viser én økt eller én periode av gangen. Denne siden viser hele
historikken samlet, med både notater og tall.

## Operating Context

- **Lese, ikke registrere:** Det er en personlig dagbok som skal leses og blas i, ikke et
  verktøy for å registrere økter.
- **Nye data fra Olympiatoppen:** Ny eksport, og så `python scripts/konverter.py`.
- **Nye data fra Garmin:** De hentes hver mandag fra intervals.icu
  (`scripts/hent_intervals.py`). Full historikk kommer fra Garmins GDPR-eksport
  (`scripts/konverter_garmin.py`).
- **Treningsåret:** Isak regner det fra 1. november til 31. oktober. Alle
  sesongsammenligninger følger det.
- **Helsedata:** HRV, søvnscore og belastning finnes fra høsten 2023 (Forerunner 255).
  Hvilepuls og søvnlengde går lenger tilbake. HRV-normalområdet og akutt og kronisk
  belastning regnes ut av dagboka, likt for hele perioden, og er ikke Garmins tall.

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
- GPS-sporene viser hvor Isak bor. De lagres bare lokalt og legges aldri i git.
  Rådataene (e-post, fødselsdato) holdes også utenfor git.
- Garmin-aktiviteter kobles til dagbokøkter ut fra dato, varighet og distanse (94 %
  koblet). Dagboka er fasit for soner og varighet, og Garmin supplerer med puls, spor og
  helsedata.

## Brand Commitments

Ingen identitet er bestemt. Isak har lagt to krav: **notatene og tallene skal begge stå
sentralt**. Ingen av dem skal gjemmes bak den andre.

## Evidence on Hand

- **Dagboka:** `data/okter.json` har 3 929 økter, `data/dager.json` 610 dagsrapporter,
  `data/uker.json` 357 ukeskommentarer og `data/profil.json` pulssonene.
- **Garmin:**
  - `data/garmin_aktiviteter.json` har 4 886 aktiviteter, hvorav 3 528 med GPS-spor.
  - `data/garmin_helse.json` har hvilepuls for 2 259 dager, HRV for 1 109 netter, søvn for
    1 246 netter og belastning for 1 163 dager.
- **Kontrolltall:** per år står i `CLAUDE.md`.
- **Ikke tilgjengelig:** Det finnes ingen bilder eller logo, og ingen dagbokdata før
  nov. 2019. Excel-dagboka for 2017–2019 er ikke importert. Slikt skal ikke diktes opp.

## Product Principles

1. Ekte data alltid. Ingen eksempeltall eller plassholdere.
2. Ord og tall er likeverdige. En økt er både «42 min, 7,9 km, I1» og det Isak skrev om den.
3. Oversikt først, detaljer ved ett klikk: uke → økt → blokker.
4. Tallene må stemme med kontrolltallene i `CLAUDE.md` og følge reglene der.
5. Strukturen skal tåle nye datakilder og analyseverktøy uten omskriving. Garmin er lagt
   til som et valgfritt lag, og siden virker også uten det.
6. Personvern først: posisjonsdata og personopplysninger blir aldri med i git.
