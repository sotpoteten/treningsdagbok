# Treningsdagbok – nettside

En nettside som visualiserer Isaks treningsdata, eksportert fra treningsdagboka til
Olympiatoppen (dagbok.olympiatoppen.no), supplert med en full Garmin-eksport. Isak er
orienteringsløper. Han skriver på norsk, så svar på norsk og bruk norske tekster på siden.

- **Repo:** privat på github.com/sotpoteten/treningsdagbok. Commit direkte på `main`, og
  bare når Isak ber om det. Felles regler står i `../CLAUDE.md`.
- **Brukerdokumentasjon:** `README.md` beskriver oppstart, dataoppdatering og struktur.
- **Design og produkt:** `DESIGN.md` er designsystemet, `PRODUCT.md` er produktfaktaene.

## Status (okt. 2026)

1. **Dagbok:** ukeskalender med søk, filter og øktpanel.
2. **Analyse** med sesonger fra 1. nov. til 31. okt.: Oversikt, Volum, Sesonger,
   Intensitet og aktivitet, Rekorder, og Helse og belastning.
3. **Garmin:** Aktivitetene er koblet til øktene. Øktpanelet har kart, kurver og runder.
   Hvilepuls, HRV, søvn og belastning brukes i analysen.
4. **Mulig senere:**
   - importere Excel-dagboka for 2017–2019
   - publisere siden
   - flere analyseverktøy

## Filer

| Fil | Innhold |
|---|---|
| `data/raw/workoutSessions.json` | Rå eksport av treningsøktene (14 MB). Dette er kilden, og den skal ikke endres. |
| `data/raw/userData.json` | Rå eksport av profil, pulssoner og dagsrapporter. Inneholder e-post og fødselsdato. |
| `data/raw/weekComments.json` | Rå eksport av ukeskommentarer. |
| `scripts/konverter.py` | Gjør den rå eksporten om til de ryddige filene under. Krever bare Python 3. |
| `data/okter.json` | Én post per økt med blokkene nøstet inn, beregnede summer og lesbare navn. **Hovedkilden for nettsiden.** |
| `data/blokker.csv` | Flat tabell med én rad per måling (semikolon som skilletegn, UTF-8). Til analyse og Excel. |
| `data/dager.json` | Dagsrapporter: syk, skadet, reise, høyde, fridag, konkurranse, dagsnotat, sykdoms- og skadedetaljer. |
| `data/uker.json` | Ukeskommentarer per ISO-uke. |
| `data/profil.json` | Navn, idrett, klubb og pulssoner. Uten e-post og fødselsdato. |
| `data/garmin_*.json`, `data/garmin_spor/` | Garmin-data, se seksjonen «Garmin-data» under. |
| `scripts/konverter_garmin.py`, `scripts/garmin_kobling.py` | Garmin-eksport → `data/garmin_*`. Krever `.venv` (Python 3.12 med `fitdecode` og `tzdata`). |

Ved ny eksport legger du filene i `data/raw/` med navnene over og kjører
`python scripts/konverter.py`. Skriptet skriver ut advarsler hvis det dukker opp ukjente
koder, eller hvis varighetsregelen under ikke stemmer.

## Avgrensning

- **Bare økter fra og med 1. november 2019 brukes.** Eldre økter i eksporten (2015–2016)
  er importert fra et annet verktøy og mangler data. Fra 2017–2019 førte Isak dagbok
  i et Excel-ark. Det kan importeres senere, og da må det mappes til samme format.
- Fra 1. nov. 2019 til 5. okt. 2026 er det 3 929 økter, 8 603 blokker og 14 734 målinger.
  Alle øktene er gjennomførte (`IsDone`), og ingen er planlagte eller hoppet over.
  Plan-feltene er tomme. Alle har `SportId` 1.

## Struktur i den rå eksporten

```
[ Økt
  ├─ Id, Date (ÅÅÅÅ-MM-DD), Order (rekkefølge samme dag, 0–3), Name, Description
  ├─ Duration (minutter), MaxIZone ("I1"–"I8" eller null)
  ├─ Comments[]                 → Text, AuthorId, CreatedAt  (Isaks dagboknotat, nesten alle økter har ett)
  ├─ ReportedSessionMetrics[]   → SessionMetricId (1|2), Value
  ├─ ReportedUserDefinedMetrics[] (alltid tom)
  └─ ReportedSessionActivities[]  = «blokker» (f.eks. oppvarming / hoveddel / nedjogg)
       ├─ ActivityId, Position (rekkefølge i økta)
       └─ ReportedActivityMetrics[] → ActivityMetricId, Value
]
```

En økt har 1–8 blokker. De fleste har 1, 3 eller 4.

## Dagsrapporter (`userData.json` → `HealthStatuses`)

Dagboka lagrer bare en rapport for dager der noe er registrert. **En dag uten rapport
er en vanlig dag**, altså ikke syk, ikke skadet, ingen reise og så videre. Fra 1. nov. 2019
er det 785 rapporter. 175 av dem er helt tomme (alle flagg av, ingen tekst; mest 2019–2020)
og fjernes i konverteringen, så `dager.json` har 610 dager.

| Felt i `dager.json` | Rått felt | Antall dager |
|---|---|---|
| `konkurranse` | IsCompetitionDay | 278 |
| `reise` | IsTraveling | 133 |
| `fridag` | IsDayOff | 96 (aldri en dag med økt) |
| `skadet` | IsInjured | 83 |
| `syk` | IsSick | 66 |
| `hoyde` | IsAltitudeDay (høydedøgn) | 43 |
| `notat` | Comment (fritekst for dagen, ofte om reise) | 133 |
| `sykdom` | ReportedSickness: symptomer, kommentar, påvirkning på deltagelse og prestasjon | 20 (bare fra 2025) |
| `skade` | ReportedInjury: type, kroppsdel, påvirkning | 13 (høyre skulder, aug. 2026) |

De detaljerte sykdoms- og skadeskjemaene ble tatt i bruk først i 2025. Før det finnes
bare flaggene `syk` og `skadet`. Feltene for hvilepuls, HRV, søvn, beredskap, smerte og
menstruasjon er aldri brukt og er utelatt.

Flaggene egner seg godt som markører i en kalender eller tidslinje, for eksempel for å
forklare hvorfor treningsvolumet falt en uke.

## Ukeskommentarer (`weekComments.json`)

357 kommentarer fordelt på 349 uker, fra uke 44 i 2019 til uke 40 i 2026. Alle er skrevet av Isak.
Ukenumrene følger ISO 8601 (uke 1 er uka med årets første torsdag, og 2020 har uke 53).
`mandag` i `uker.json` er datoen uka starter. Noen uker har flere kommentarer, og da ligger
de i lista `kommentarer` sortert etter når de ble skrevet. En typisk kommentar er rundt
400 tegn, og noen er lange oppsummeringer etter mesterskap.

**Kjent feil:** En kommentar skrevet 14. jan. 2025 er lagret på 2024 uke 1 på grunn av en
feil i dagboka. Teksten begynner med «Bug i OLT». Den hører egentlig til en uke i januar 2025.
Den ligger urørt i dataene, så spør Isak om den skal flyttes.

## Pulssoner (`profil.json`)

Isaks nåværende pulssoner, oppdatert 29. jan. 2026, i slag/min: I1 126–150, I2 151–171,
I3 172–182, I4 183–192, I5 193–210. Eksporten har bare de nåværende verdiene, ingen historikk.
Bruk dem gjerne som forklaring til sonene på siden.

## Koder (bekreftet mot dataene)

**ActivityId – hva blokken er**

| Id | Navn | Kategori |
|---|---|---|
| 1 | Løping terreng | bevegelsesform |
| 2 | Løping sti/vei | bevegelsesform |
| 3 | Løping mølle | bevegelsesform |
| 4 | Ski klassisk | bevegelsesform |
| 5 | Ski skøyting | bevegelsesform |
| 6 | Rulleski | bevegelsesform |
| 7 | Sykling (mest spinning) | bevegelsesform |
| 8 | Annet (mest ellipsemaskin) | bevegelsesform |
| 9 | O-teknikk nordisk | o-teknikk |
| 10 | O-teknikk kontinentalt | o-teknikk |
| 11 | O-teknikk sprint | o-teknikk |
| 12 | Generell styrke | styrke |
| 13 | Spesifikk styrke | styrke |
| 14 | Maksimal styrke | styrke |
| 15 | Spenst | styrke |
| 16 | Annen styrketrening (ikke brukt etter 2019) | styrke |
| 17 | Bevegelighet/tøying | bevegelighet |

**ActivityMetricId – hva målingen er**

| Id | Betydning | Finnes på |
|---|---|---|
| 1–8 | **Minutter** i intensitetssone I1–I8 (Olympiatoppens skala) | bevegelsesformer (1–8) |
| 9 | **Distanse i km** | bare løping (1–3) |
| 11 | **Minutter** o-teknikk | bare o-teknikk (9–11), alltid nøyaktig én |
| 12 | **Minutter** styrke/bevegelighet | bare styrke/bevegelighet (12–17), alltid nøyaktig én |

En blokk kan ha minutter i flere soner. Det gjelder 709 blokker. Etter 2019 er bare
sonene I1–I5 brukt.

**SessionMetricId** (per økt, bekreftet av Isak), begge på skala 1–10:

| Id | Betydning | I `okter.json` | Brukte verdier |
|---|---|---|---|
| 1 | Opplevd belastning | `opplevd_belastning` | 1–10, oftest 3 |
| 2 | Dagsform | `dagsform` | 3–8, oftest 6 |

Noen få økter mangler disse verdiene, og da er feltet `null`.

## Viktige regler for beregninger

1. **Varighet = minutter i sone (1–8) + minutter styrke (12).** Dette stemmer for alle
   3 929 øktene.
2. **O-teknikk (11) skal ikke legges til i totaltiden.** Den foregår samtidig med
   løpingen og er allerede med i sonetiden. O-teknikk er altså et «delsett» av løpetiden.
3. **`MaxIZone` er ikke alltid riktig.** I 128 økter er den lavere enn den høyeste
   registrerte sonen. Bruk heller `hoyeste_sone` i `okter.json`, som er beregnet fra
   sonedataene.
4. Distanse finnes bare for løping. Snittfart (min/km) kan regnes per løpeblokk ut fra
   blokkens minutter og km.

## Format på `data/okter.json`

```json
{
  "id": "…", "dato": "2026-10-05", "rekkefolge": 1, "navn": "Jogg",
  "beskrivelse": null, "kommentar": "Ettermiddagsjogg rundt gruva. …", "kommentarer_andre": [],
  "varighet_min": 42,
  "hoyeste_sone": "I1", "hoyeste_sone_registrert": "I1",
  "sone_min": {"I1": 42}, "distanse_km": 7.9,
  "loping_min": 42, "otek_min": 0, "styrke_min": 0,
  "opplevd_belastning": 3, "dagsform": 5,
  "blokker": [
    {"posisjon": 0, "aktivitet_id": 2, "aktivitet": "Løping sti/vei", "kategori": "bevegelse",
     "soner": {"I1": 42}, "distanse_km": 7.9, "minutter": 42}
  ]
}
```

## Kontrolltall (fra 1. nov. 2019)

| År | Økter | Timer | Km |
|---|---|---|---|
| 2019 (nov–des) | 86 | 113 | 399 |
| 2020 | 456 | 550 | 3 138 |
| 2021 | 578 | 734 | 3 052 |
| 2022 | 581 | 690 | 3 626 |
| 2023 | 560 | 659 | 4 163 |
| 2024 | 578 | 634 | 5 006 |
| 2025 | 634 | 730 | 6 152 |
| 2026 (t.o.m. 5. okt.) | 456 | 519 | 4 051 |

Totalt er det om lag 4 630 timer og 29 588 km. Timer per sone: I1 3 565, I2 100,
I3 410, I4 184 og I5 43. O-teknikk utgjør 897 timer (inkludert i sonetiden) og styrke 328 timer.

## Kommentarer på økter

`kommentar` er Isaks eget notat. To økter har i tillegg en kommentar fra andre, typisk
en trener. Den ligger i `kommentarer_andre` og vises ikke uten videre som Isaks tekst.

## Personvern

Kommentarene (dagboknotatene) kan vises på nettsiden. Det har Isak bekreftet. Den rå
eksporten (`data/raw/`) er likevel holdt utenfor git via `.gitignore`, blant annet
fordi `userData.json` inneholder e-post og fødselsdato. De ryddige filene i `data/` har
ikke med disse opplysningene. GPS-sporene (`data/garmin_spor/`, `web/public/garmin_spor/`)
holdes også utenfor git, fordi de viser hvor Isak bor. `garmin_aktiviteter.json` har ingen
koordinater.

## Garmin-data

Kilden er Garmins fullstendige GDPR-eksport. Mappa `DI_CONNECT/` fra eksporten
kopieres til `data/raw/garmin/` (794 MB, holdt utenfor git). Ved ny eksport erstattes
mappa, og så kjøres:

```
.venv\Scripts\python scripts/konverter_garmin.py     # krever fitdecode og tzdata i .venv
```

Første kjøring dekoder rundt 5 900 FIT-filer parallelt og tar omtrent en time. Resultatet
bufres i `data/raw/garmin/fit_indeks.json`, så senere kjøringer bare tar nye filer.
API-skriptene (`garmin_login.py`, `hent_garmin.py`) virket ikke i 2026 fordi Garmin
blokkerte innloggingen. De er beholdt, men eksporten er kilden.

| Fil | Innhold | Git |
|---|---|---|
| `data/garmin_aktiviteter.json` | Én post per Garmin-aktivitet fra 1.11.2019: tid, type, varighet, distanse, puls, høydemeter, kadens, Training Effect, belastning, `har_spor` og `okt_id` (koblet dagbokøkt). Ingen koordinater. | ja |
| `data/garmin_helse.json` | Én post per dag: `hvilepuls`, `hrv_natt`, `hrv_ukesnitt`, `hrv_baseline_lav/hoy`, `hrv_status`, søvn (`sovn_min`, `dyp_min`, `lett_min`, `rem_min`, `vaken_min`, `sovnscore`, `respirasjon`, `sovn_start/slutt`) og belastning (`belastning_akutt`, `belastning_kronisk`, `acwr`). | ja |
| `data/garmin_spor/<garmin_id>.json` | GPS-spor, puls, fart, høyde og distanse, tynnet til hvert 5. sekund (kolonnevis), samt runder. Avslører hvor Isak bor. | **nei** |

**Kilder og enheter i eksporten**

- **Aktiviteter:** `summarizedActivities`. Varighet er i ms, distanse og høyde i cm.
  `startTimeLocal` er lokal tid uttrykt som ms.
- **FIT-filer:** `UploadedFiles_*.zip`.
  - Type `activity` gir spor. Den kobles til aktiviteten via `session.start_time` =
    `startTimeGmt` (±2 s).
  - Type 68 er `hrv_status_summary`, med HRV fra høsten 2023.
- **Hvilepuls:** `UDSFile` (`restingHeartRate`).
- **Søvn:** `sleepData`. Søvnscore og REM finnes fra ca. 2023.
- **HRV med baseline fra sept. 2025:** `healthStatusData`. Brukes bare der FIT mangler.
- **Belastning:** `MetricsAcuteTrainingLoad`, der `calendarDate` er i ms. Finnes fra aug. 2023.

**Resultat (eksport fra 9.10.2026):**
- **Aktiviteter:** 4 886 Garmin-aktiviteter fra 1.11.2019, hvorav 3 528 med GPS-spor
  (132 MB lokalt).
- **Kobling:** 94 % av dagbokøktene har Garmin-data, og minst 92 % hvert år. Øktene som
  mangler, er mest styrke og noen mølleøkter.
- **Helsedata:** hvilepuls for 2 259 dager, HRV for 1 109 netter (fra 6.9.2023), søvn
  for 1 246 netter og belastning for 1 163 dager.
- `hvilepuls` er Garmins `restingHeartRate` (UDS). Helsestatusens «HR» er snittpuls om
  natta og brukes ikke.

**Kobling til dagboka** (`scripts/garmin_kobling.py`, testet i `scripts/test_garmin_kobling.py`):
- En økt kobles til 1–3 påfølgende Garmin-aktiviteter samme dag, siden oppvarming og
  hoveddel ofte er tatt opp hver for seg.
- Varigheten må stemme innen maks(5 min, 15 %), og løpedistansen innen maks(1,5 km, 20 %).
- Parene med minst avvik velges først.
- `okter.json` endres ikke. Koblingen ligger som `okt_id` i `garmin_aktiviteter.json`.

## Nettsiden (`web/`)

Vite + React + TypeScript. Statisk side som leser JSON-filene i `data/`, ingen server.
Kjøres lokalt på **port 5180**. Porten er fast fordi 5173 brukes av en annen app.

```
cd web
npm install        # første gang
npm run dev        # http://localhost:5180 (kopierer data/*.json til public/data/ først)
npm test           # vitest: kontrolltall, ISO-uker, sesonger, søk, formatering, helseserier
npm run build      # typesjekk og bygg til web/dist/
```

Node ligger i `C:\Program Files\nodejs`. Hvis skallet ikke finner `npm`, legg den mappa
først i PATH. Python-testene for Garmin-koblingen kjøres med
`.venv\Scripts\python -m unittest scripts/test_garmin_kobling.py`.

| Mappe/fil | Innhold |
|---|---|
| `src/data/` | Typer, lasting og indekser (`last.ts`), ISO-uker (`uker.ts`), summer etter reglene over (`aggregat.ts`), søk og filter (`filter.ts`) og formatering (`format.ts`) |
| `src/sider/Dagbok.tsx` | Ukeskalenderen: virtualisert liste med uker, nyeste først. `/okt/:id` åpner øktpanelet |
| `src/sider/Analyse.tsx` | Ramme for analysesiden: undermeny, sesongvelger (`?sesong=2025-26`) og felles `Analysekontekst` |
| `src/sider/analyse/` | Oversikt, Volum, Sesonger, Intensitet (og aktivitet), Rekorder, Helse (hvilepuls, HRV, søvn, belastning, syke- og skadedager) |
| `src/data/statistikk.ts` | Sesonger (1. nov.–31. okt.), kumulative kurver, glidende snitt (også med hull), dagserier, kvalitetsøkter (≥ 10 min i I3–I5), aktivitetsfordeling, rekorder og rekker, syke- og skadedager per sesong |
| `src/komponenter/graf/` | Egne SVG-grafer (`Stolper`, `Linjer`, `Tidsserie`) med d3, verktøytips, tastatur (piltaster, Enter), berøring og tabellvisning (`Grafkort`) |
| `src/komponenter/` | Ukerad, Oktkort, Oktpanel, Garminokt, Hoydelag (årsnavigasjonen), Sok, Topplinje, Sonestolpe, Dagsmarkorer, `kart/Kart.tsx` (MapLibre) |
| `src/stil/` | `tokens.css` (farger for lys og mørk modus, sonefargene er validert for fargeblindhet), `app.css` (dagboka), `analyse.css` (analyse og grafer), `garmin.css` (kart, kurver, helse) |

- **Ruter:** Hash-ruting (`#/`, `#/okt/<id>`, `#/analyse/...`). Søket ligger i URL-en
  (`?q=…&type=loping,konk`), så visninger kan lenkes. `#/?uke=2025-14` åpner dagboka på
  en bestemt uke. Analysegrafene bruker dette når du klikker på en uke.
- **Treningsår:** Analysen regner sesonger fra 1. november til 31. oktober. «Samme dato»
  betyr at inneværende sesong sammenlignes med sesongen før, fram til samme dag.
- **Farger i grafer:** Det er ingen egen kategoripalett. Valgt sesong er blå, forrige
  sesong er blekk, og resten er dempet. Aktiviteter vises som små multipler i blekk.
  Kvalitetsøkter bruker I3-fargen, konkurranser kotebrunt, og syk og skadet stempelrødt
  (skadet skravert).
- **Design:** Den visuelle retningen heter «Kartbladet» og er beskrevet i `DESIGN.md`.
  Retningskontrakten ligger i `.impeccable/surfaces/`, og produktfaktaene i `PRODUCT.md`.
  Skjermbilder fra gjennomgangene havner i `.impeccable/review/` (gitignored). Nye
  flater følger reglene i DESIGN.md: ingen radius, ingen skygger, flate farger, ingen ny
  kategoripalett, og hver farge har én betydning.
- **Garmin på siden:**
  - **Lasting:** `last.ts` laster `garmin_aktiviteter.json` og `garmin_helse.json` hvis
    de finnes, og bygger indeksene `garminPerOkt` og `helsePerDato`.
  - **Øktpanelet:** Det viser Garmin-delen (`Garminokt.tsx`) med nøkkeltall, kart, puls-
    og tempokurve og runder.
  - **Kartet:** `komponenter/kart/Kart.tsx` bruker MapLibre, lastes dynamisk og har
    Kartverket topo og OSM.
  - **Helsesiden:** `#/analyse/helse` viser hvilepuls, HRV, søvn og belastning.
  - **Sporfilene:** `npm run data` kopierer dem til `web/public/garmin_spor/`
    (gitignored).
