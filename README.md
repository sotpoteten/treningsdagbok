# Treningsdagbok

[![Bygg og tester](https://github.com/sotpoteten/treningsdagbok/actions/workflows/pages.yml/badge.svg)](https://github.com/sotpoteten/treningsdagbok/actions/workflows/pages.yml)

En nettside som gjør Isak Jonssons treningsdagbok lesbar, søkbar og analyserbar: sju år
med orienteringstrening, rundt 3 900 økter. Dataene kommer fra dagboka til Olympiatoppen
(dagbok.olympiatoppen.no), fra 1. november 2019, og fra en full Garmin-eksport.

**Se den kjørende siden: [sotpoteten.github.io/treningsdagbok](https://sotpoteten.github.io/treningsdagbok/)**

![Ukeskalenderen med en åpen økt: blokker, Garmin-nøkkeltall og GPS-spor på Kartverkets kart](docs/bilder/dagbok.png)

![Analysesiden Volum: timer per uke fordelt på intensitetssoner, og km løping per uke](docs/bilder/analyse.png)

## Teknikk

- **Nettsiden:** Vite, React og TypeScript, uten UI-bibliotek. Grafene er egne
  SVG-komponenter med d3, med tastaturstyring og tabellvisning. Kartet bruker MapLibre med
  Kartverkets topografiske kart.
- **Data:** Python-skript gjør eksportene om til ryddige JSON-filer. Garmin-skriptet
  dekoder rundt 5 900 FIT-filer parallelt og kobler aktivitetene til dagbokøktene.
- **Assistenten:** Claude Agent SDK med fem egne verktøy som regner tallene i kode, pluss
  nettsøk etter kilder.
- **Design:** Et eget designsystem, «Kartbladet», beskrevet i [`DESIGN.md`](DESIGN.md).
  Sonefargene er validert for fargeblindhet.
- **Tester:** vitest og Pythons unittest. Summene sjekkes mot kontrolltall fra dagboka.
  oxlint og ruff stopper bygget ved advarsler, og testfilene typesjekkes også.

Prosjektet er utviklet sammen med Claude Code. [`CLAUDE.md`](CLAUDE.md),
[`DESIGN.md`](DESIGN.md) og [`PRODUCT.md`](PRODUCT.md) er arbeidsdokumentene som styrer
det arbeidet.

## Innhold

- **Dagbok:** Ukeskalender med alle økter og soner, km og notater. Den har ukesummer,
  ukeskommentarer og dagsmarkører (syk, skadet, reise, høydedøgn, konkurranse) og en
  årsnavigasjon som viser treningsvolum per uke.
- **Øktpanel:** Blokker, soner, notat og Garmin-data. Garmin-dataene er kart med
  GPS-spor (Kartverket topo/OSM), puls- og tempokurve og runder.
- **Analyse:** Oversikt mot forrige sesong, volum over tid, sesongsammenligning,
  intensitet og aktivitet, rekorder, og helse og belastning (hvilepuls, HRV, søvn og
  Garmins treningsbelastning).
- **Spør:** En AI-assistent som svarer på spørsmål om treningen. Den henter tallene fra
  dagboka og ser dem opp mot treningslære og forskning, med lenker til kilder, uker og
  økter. Den virker bare når siden kjøres lokalt.

Siden er statisk (Vite, React og TypeScript) og leser JSON-filer. Bare «Spør» trenger
utviklingsserveren.
Treningsåret regnes fra 1. november til 31. oktober.

## Kom i gang

Krever Node.js (LTS) og Python 3.12.

```
cd web
npm install
npm run dev        # http://localhost:5180
```

`npm run dev` kopierer først dataene fra `data/` til `web/public/`. Andre kommandoer:

```
npm test           # vitest: summer mot kontrolltall, sesonger, søk, helseserier
npm run lint       # oxlint, der advarsler regnes som feil
npm run build      # typesjekk (også testfilene) og bygg til web/dist/
```

## Spør (AI-assistenten)

![«Spør»: et spørsmål om intensitetsfordeling, besvart med en tabell fra dagboka](docs/bilder/spor.png)

Assistenten kjører i utviklingsserveren og starter sammen med `npm run dev`. Den bruker
Claude gjennom innloggingen fra Claude Code, så du må være innlogget der. Spørsmålene
teller mot bruksgrensene i Claude-abonnementet.

- **Hva den kan:** lese summer per uke, måned, sesong og år, søke i øktene, lese enkeltøkter
  med Garmin-runder, dager med helsedata og ukeskommentarene, og søke på nettet etter
  kilder. Den kan ikke lese filer, kjøre kommandoer eller endre noe.
- **Hva som sendes ut:** Spørsmålet og de tallene og notatene svaret trenger, sendes til
  Anthropic. GPS-spor sendes aldri.
- **Innstillinger** (valgfrie) i `web/.env.local`, som holdes utenfor git:
  - `ASSISTENT_MODELL`: en annen modell enn `claude-opus-5-5`
  - `ANTHROPIC_API_KEY`: bruk en API-nøkkel i stedet for abonnementet

## Oppdatere dataene

### Olympiatoppen-dagboka

Kjør dette for å hente en fersk eksport og konvertere den:

```
.venv\Scripts\python scripts/hent_olt.py
```

- **Hva skriptet gjør:**
  - Det åpner Min side → Admin i Chrome og trykker «Eksporter data».
  - Det pakker ut `workoutSessions.json`, `userData.json` og `weekComments.json` fra
    `UserDataExport.zip`.
  - Det sjekker filene før de erstatter dem i `data/raw/`. De forrige filene legges i
    `data/raw/forrige/`.
  - Til slutt kjører det `konverter.py`.
- **Innlogging:** Første gang, og når innloggingen har gått ut, åpnes et vindu der du
  logger inn med Idrettens ID. Økta lagres i `data/raw/olt-innlogging.json`. Passordet
  lagres aldri.
- **Førstegangsoppsett:** `.venv\Scripts\python -m pip install playwright`. Skriptet
  bruker Chrome-en som er installert på maskinen.
- **Valg:**
  - `--fil <zip>` bruker en eksport du har lastet ned selv.
  - `--vis` viser vinduet.
  - `--tving` godtar en eksport med færre økter enn forrige.

Alternativet er å gjøre det for hånd:
1. Eksporter fra dagboka, og legg de tre filene i `data/raw/`.
2. Kjør `python scripts/konverter.py`. Det lager `data/okter.json`, `dager.json`,
   `uker.json`, `profil.json` og `blokker.csv`, og varsler hvis det finner ukjente koder.

### Garmin

Nye data hentes hver uke fra [intervals.icu](https://intervals.icu), som er koblet til
Garmin Connect:

```
.venv\Scripts\python scripts/hent_intervals.py
```

Mandagskjøringen gjør dette selv etter OLT-importen. Skriptet trenger en API-nøkkel fra
intervals.icu (Settings → Developer Settings) i `data/raw/intervals.json`:
`{"api_nokkel": "…"}`. Det henter:
- nye aktiviteter, med originalfila fra klokka (sammendrag og spor)
- hvilepuls, HRV, søvntid og søvnscore til og med i går

Full historikk kommer fra Garmins GDPR-eksport:

1. Be om full eksport fra Garmin-kontoen (Data Management → Export Your Data).
2. Kopier mappa `DI_CONNECT/` fra eksporten til `data/raw/garmin/`.
3. Sett opp Python-miljøet første gang:
   ```
   python -m venv .venv
   .venv\Scripts\pip install fitdecode tzdata
   ```
4. Kjør konverteringen:
   ```
   .venv\Scripts\python scripts/konverter_garmin.py
   ```
   Første kjøring dekoder rundt 5 900 FIT-filer og tar omtrent en time. Senere kjøringer
   bruker en buffer og går raskt.

Skriptet lager:
- `data/garmin_aktiviteter.json`: aktivitetene, koblet til dagbokøktene
- `data/garmin_helse.json`: hvilepuls, HRV, søvntid og søvnscore per dag. HRV-normalområdet
  og belastningen regnes ut på nettsiden, likt for alle data.
- `data/garmin_spor/`: GPS-spor, bare lokalt

Det skriver også ut hvor stor andel av øktene som ble koblet. Ved forrige eksport var det
94 %.

### Konkurranser (Eventor)

Resultater og strekktider hentes fra norsk Eventor:

```
.venv\Scripts\python scripts/hent_eventor.py            # oppdater og skriv
.venv\Scripts\python scripts/hent_eventor.py --lagret   # uten å hente egne resultater på nytt
```

Mandagskjøringen gjør dette selv etter Garmin. Skriptet trenger en Eventor-nøkkel og
person-id-en i `data/raw/eventor.json`: `{"api_nokkel": "…", "person_id": …}`. Nøkkelen er en
klubbnøkkel og skal aldri publiseres. Svarene fra Eventor bufres i `data/raw/eventor/`, fordi
de har navn og fødselsdato for alle løperne. Et løp hentes på nytt bare til resultatet er
endelig (14 dager etter løpet).

Skriptet lager `data/konkurranser.json` med egne resultater: plass, tid, prosent bak vinner,
strekktider med referansetid per strekk, strekkfart og bomtid, lenker til Eventor og Livelox,
og hvilke dagbokøkter løpet hører til. Andre løpere står aldri i fila, bare avledede tall
(vinnertid, beste og referanse per strekk og antall startende). Stafetter står i en egen liste
uten strekk.

## Struktur

```
data/                 ryddige data (kilden for nettsiden)
  raw/                rå eksporter – holdt utenfor git
  garmin_spor/        GPS-spor per aktivitet – holdt utenfor git
scripts/
  hent_olt.py         henter eksporten fra Olympiatoppen og kjører konverter.py
  konverter.py        Olympiatoppen-eksport → data/*.json
  konverter_garmin.py Garmin-eksport → data/garmin_*.json og spor
  hent_intervals.py   nye Garmin-data fra intervals.icu hver uke
  hent_eventor.py     resultater og strekktider fra Eventor → data/konkurranser.json
  garmin_kobling.py   kobler Garmin-aktiviteter til dagbokøkter (+ test_garmin_kobling.py)
web/                  nettsiden (Vite + React + TypeScript)
  assistent/          «Spør»: Vite-tillegg, agent, systemprompt og dagbokverktøy
  src/data/           lasting, summer, sesonger, statistikk, søk
  src/komponenter/    kalender, øktpanel, grafer (graf/), kart (kart/)
  src/sider/          Dagbok, Analyse (analyse/) og Spør
  src/stil/           fargetokens og stiler
```

## Tester

```
cd web && npm test                                   # nettsiden
cd web && npm run lint                               # oxlint, uten advarsler
.venv\Scripts\ruff check scripts                     # Python-lint, oppsett i pyproject.toml
.venv\Scripts\python -m unittest discover -s scripts -p "test_*.py"   # skriptene
.venv\Scripts\python scripts/personvern.py           # ingen koordinater, e-post eller nøkler i data/
```

Testene sjekker at summene per år stemmer med kontrolltallene i `CLAUDE.md`, at sesonger og
ISO-uker regnes riktig, og at koblingen mot Garmin håndterer flere aktiviteter per økt.

## Personvern

Repoet er offentlig. Dagboknotatene, ukeskommentarene og helsedataene i `data/` ligger
åpent, og det har Isak valgt selv. Tre ting holdes utenfor git:
- **Rådataene** (`data/raw/`), fordi de inneholder blant annet e-post og fødselsdato.
- **Eventor-svarene** (`data/raw/eventor/`), fordi de har navn og fødselsdato for andre
  løpere. `data/konkurranser.json` har bare Isaks egne resultater og avledede tall, og
  `personvern.py` stopper alle felt som ikke står på hvitelista.
- **GPS-sporene** (`data/garmin_spor/`), fordi de viser hvor Isak bor. Den publiserte
  siden har derfor ikke kart og kurver per økt. De vises når siden kjøres lokalt.

## Lisens

Koden er lisensiert under [MIT](LICENSE). Dataene i `data/` er personlige og omfattes
ikke av lisensen.

## Dokumentasjon

- [`CLAUDE.md`](CLAUDE.md): datamodell, koder, regler for beregninger, kontrolltall,
  Garmin-detaljer og oppbyggingen av nettsiden
- [`PRODUCT.md`](PRODUCT.md): hvem siden er for og hva den skal gjøre
- [`DESIGN.md`](DESIGN.md): designsystemet «Kartbladet» med farger, typografi,
  komponenter, diagrammer og kart
