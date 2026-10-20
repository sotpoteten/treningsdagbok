---
name: Treningsdagbok
description: Sju års orienteringstrening lest som et topografisk kartblad.
colors:
  papir: "#fafaf5"
  papir-2: "#f1f1ea"
  blekk: "#1d1d1b"
  blekk-2: "#4a4a45"
  blekk-3: "#6b6b64"
  rute: "#2f6fa8"
  rute-svak: "#c9daea"
  rute-flate: "#e8f0f7"
  kote: "#9a5a2a"
  stempel: "#b0362a"
  i1: "#86bfa9"
  i2: "#e9be45"
  i3: "#d4732e"
  i4: "#9b3c2a"
  i5: "#4e1f2a"
  styrke: "#6b6b64"
  sovn-lett: "#c9c9c0"
  h0: "#f1f1ea"
  h1: "#dde8f2"
  h2: "#bcd3e8"
  h3: "#93b7d8"
  h4: "#6496c2"
  h5: "#3a74a8"
  h6: "#1f4f7e"
  papir-mork: "#16181a"
  papir-2-mork: "#1e2124"
  blekk-mork: "#e9e7df"
  blekk-2-mork: "#c2c0b8"
  blekk-3-mork: "#9a9890"
  rute-mork: "#7fb0dc"
  rute-svak-mork: "#2a3a4a"
  rute-flate-mork: "#1b2733"
  kote-mork: "#d79a62"
  stempel-mork: "#ef7a6c"
  i1-mork: "#6fb59e"
  i2-mork: "#e9c34f"
  i3-mork: "#e46f2e"
  i4-mork: "#bf3350"
  i5-mork: "#a77bda"
  styrke-mork: "#a3a199"
  sovn-lett-mork: "#4a4a46"
  h1-mork: "#1d2b38"
  h2-mork: "#24405a"
  h3-mork: "#2f5b80"
  h4-mork: "#3f78a6"
  h5-mork: "#5b97c8"
  h6-mork: "#8cbbe3"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
  headline:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.1
  title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "0.01em"
  numeral:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.1
    fontFeature: "tnum"
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-strong:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
  note:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  note-week:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  note-day:
    fontFamily: "Source Serif 4 Variable, Georgia, serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.06em"
  caption:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.07em"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
  marg: "40px"
components:
  filterbrikke:
    backgroundColor: "transparent"
    textColor: "{colors.blekk}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "30px"
  filterbrikke-aktiv:
    backgroundColor: "{colors.rute}"
    textColor: "{colors.papir}"
    rounded: "{rounded.none}"
  sokefelt:
    backgroundColor: "{colors.papir}"
    textColor: "{colors.blekk}"
    rounded: "{rounded.none}"
    padding: "0 4px 0 10px"
    height: "34px"
    width: "260px"
  oktkort:
    backgroundColor: "transparent"
    textColor: "{colors.blekk}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "5px 4px 8px"
  oktkort-hover:
    backgroundColor: "{colors.rute-flate}"
  oktkort-valgt:
    backgroundColor: "{colors.rute-flate}"
  markor:
    backgroundColor: "transparent"
    textColor: "{colors.kote}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 4px"
  markor-konkurranse:
    backgroundColor: "{colors.kote}"
    textColor: "{colors.papir}"
    rounded: "{rounded.none}"
  stempel:
    backgroundColor: "transparent"
    textColor: "{colors.stempel}"
    rounded: "{rounded.none}"
    padding: "1px 7px"
  tallcelle:
    textColor: "{colors.blekk}"
    typography: "{typography.numeral}"
    padding: "4px 12px"
  lenkeknapp:
    backgroundColor: "transparent"
    textColor: "{colors.rute}"
    padding: "0"
  ikonknapp:
    backgroundColor: "transparent"
    textColor: "{colors.blekk}"
    rounded: "{rounded.none}"
    size: "32px"
  ikonknapp-hover:
    backgroundColor: "{colors.rute-flate}"
---

# Design System: Treningsdagbok

## Overview

**Creative North Star: "Kartbladet"**

Treningsdagboka leses som et N50 topografisk kartblad. Uker er ruter i et rutenett, volum er høydelag, og dagsmarkørene står i kotebrunt som stedsnavn på kartet. Papiret er lyst og varmt, blekket nesten svart, og et blått rutenett med 1 px hårstreker holder alt på plass. Ukesummene står i faste tabellceller, slik at tallene alltid er på samme sted fra uke til uke.

Flatene er flate og umodulerte: ingen radius, ingen skygger, ingen fargeoverganger. Dybde og hierarki kommer fra strekens tykkelse og farge (blekk for struktur, svak rutenettblå for underdeling), fra papirtonen og fra typografien. Siden er tett, men rolig. Notatene i serif og tallene i smal sans står likeverdig side om side; ingen av dem gjemmes bak den andre.

Ingenting forsvinner. Et filter eller søk demper det som ikke treffer, i stedet for å fjerne det, så kartbladet beholder formen. Syk og skadet stemples skrått over dagen som et stempel på papir.

**Key Characteristics:**
- Kartpapir, blekk og blått rutenett med 1 px hårstreker.
- Sonene I1–I5 som flate høydelag fra lys grønn via gult og oransje til mørk rødbrun.
- Styrke er skravert, aldri en egen flatfarge.
- Ukevolum i årsnavigasjonen er én blå tone, holdt adskilt fra sonefargene.
- Barlow for grensesnittet, Barlow Condensed for tall og etiketter, Source Serif 4 for notater.
- Filtrert dempes, fjernes aldri.
- Lyst og mørkt tema med egne, validerte verdier.
- Grafer i samme språk: firkantede stolper, blekklinjer, ingen ny kategoripalett. Valgt
  sesong er rutenettblå, og alt annet står i blekk eller er dempet.
- Kart med Kartverkets topografiske kart som bakgrunn, og sporet tegnet i blekk, som et
  løp tegnet inn på kartbladet.

## Colors

En kartpalett: varmt papir og blekk, rutenettblått som eneste aksent for samhandling, kotebrunt for dagsmarkører, og en egen, CVD-validert sonerampe for intensitet.

### Primary
- **Rutenettblå** (rute): Kartbladets rutenett og grensesnittets eneste samhandlingsfarge. Fokusring, aktiv meny, aktiv filterbrikke, valgt øktkort, dagdato, koordinatmerker i margen, seksjonstitler i panelet, lenkeknapper og utsnittsrammen i høydelagsstripen.
- **Svak rutenettblå** (rute-svak): Hårstreker som deler opp inne i en flate: mellom dagkolonner, mellom tallceller, under tabellrader, kant på filterbrikker i hvile.
- **Rutenettflate** (rute-flate): Hover og valgt-bakgrunn, og det svake 96 px UTM-nettet under kalenderen.

### Secondary
- **Kotebrun** (kote): Dagsmarkører (konkurranse, reise, høyde, fri) og ikonet foran dagsnotat. Mørkere enn kartets originale kotefarge (#B26A34) slik at 11 px etiketter holder 4,5:1 mot papiret. Konkurranse er den eneste fylte markøren.

### Tertiary
- **Stempelrød** (stempel): Bare for syk og skadet: det skrå stempelet og helsenotatet under dagdatoen.

### Intensitetssoner (data)
- **I1 Lys myr** (i1): Rolig grunntrening, dominerer volumet.
- **I2 Gulbrun lyng** (i2), **I3 Oransje** (i3), **I4 Rødbrun** (i4), **I5 Mørk vinrød** (i5): stigende intensitet. Nabotrinn har ΔE ≥ 15 for normalt syn og ≥ 8 ved fargesvakhet. I mørkt tema går I4 mot karmin og I5 mot lilla (i4-mork, i5-mork) for å holde skillet mot mørkt papir.
- **Styrke** (styrke): Grå blekktone, tegnes alltid som 135° skravur med 1 px innvendig kant.

### Ukevolum (høydelag)
- **Dybdelag h0–h6**: Én blå tone fra papir til dyp blå, som dybdekurver på kartet. Brukes bare i årsnavigasjonen for timer per uke.

### Neutral
- **Kartpapir** (papir): Bakgrunn for side, ukerader og panel.
- **Skyggepapir** (papir-2): Syke og skadde dager, trenerkommentarer, tom uke i høydelagene.
- **Blekk** (blekk): Tekst og strukturelle streker (ukerammer, topplinje, panelkant).
- **Blekk 2** (blekk-2): Sekundærtekst, dagsnotater, tall på øktkort.
- **Blekk 3** (blekk-3): Etiketter, enheter, plassholdere, pulsverdier.

### Named Rules
**The One Meaning Rule.** En farge betyr én ting. Sonefargene brukes bare for intensitet, blått bare for samhandling og ukevolum (som én egen tone), kotebrunt bare for dagsmarkører, rødt bare for syk og skadet.

**The Hatched Strength Rule.** Styrke er alltid skravert (135°, 2 px strek, 2 px luft) med 1 px kant i styrkefargen, aldri en flat farge. Da kan den aldri forveksles med I5, heller ikke ved fargesvakhet.

**The Separate Ramp Rule.** Ukevolum tegnes med den blå h0–h6-rampen, aldri med sonefargene, så en uke med mye trening aldri leses som en uke med hard trening.

## Typography

**Display Font:** Barlow Condensed (med Barlow, system-ui)
**Body Font:** Barlow (med system-ui)
**Notatfont:** Source Serif 4 Variable (med Georgia)

**Character:** Barlow er kartets saklige tegnsett, og den smale varianten bærer tall og etiketter tett som på en avgangstavle. Source Serif gir Isaks egne notater stemme som håndskrevet dagbok i boktrykk. Alle fonter er selvhostet via fontsource. Tall er alltid tabulære.

### Hierarchy
- **Display** (600, 30px, 1.1, Barlow Condensed): Øktnavnet øverst i panelet, med balansert linjebryting. Analyseoverskriften bruker 32px.
- **Headline** (600, 21px, 1.1, Barlow Condensed): «Uke N» i ukehodet, fulgt av datospennet i 14px Barlow blekk-3.
- **Title** (600, 17px, Barlow Condensed): Månedsskille i kalenderen, med en blå hårstrek som fyller resten av linja.
- **Numeral** (600, 20px, 1.1, Barlow Condensed): Ukesummer (timer, km, økter) og nøkkeltall i panelet. Tabelltall i 500 15px.
- **Body** (400, 15px, 1.45, Barlow): Grunntekst. Øktnavn på kort i 600 14px/1.3, maks to linjer med orddeling.
- **Notat** (400, 17px, 1.6, Source Serif 4, maks 65ch): Hele dagboknotatet i panelet. Ukeskommentar 16px/1.55 (maks 75ch, to linjer til den åpnes), dagsnotat 13px/1.4 (maks fire linjer).
- **Label** (500, 11–12px, 0.05–0.1em, versaler, Barlow Condensed): Dagdato, markører, tabellhoder, panelseksjoner, koordinatmerker.
- **Caption** (400, 10px, 0.07em, versaler, Barlow): Enhet under et tall («timer», «km», «økter»).

### Named Rules
**The Two Voices Rule.** Isaks egen tekst står i serif, alt annet i Barlow. Kommentarer fra andre står også i serif, men på skyggepapir under egen overskrift, så de aldri leses som Isaks tekst.

**The Fixed Cell Rule.** Tall som sammenlignes over tid står i faste celler med tabulære sifre, høyrejustert, med enheten under. Kolonnebreddene endres ikke fra uke til uke.

## Layout

Tre kolonner på desktop: høydelagsstripen (152 px) til venstre, kalenderen i midten og øktpanelet (360–440 px) til høyre når en økt er åpen. Topplinjen er minst 56 px høy. Kalenderen har 40 px venstremarg for koordinatmerket (år · uke, lest nedenfra) og 28 px høyre. Under ukene ligger et svakt rutenett med 96 px ruter.

Hver uke er en ramme med hode (uke og datoer til venstre, faste celler for timer 78 px, km 78 px, økter 60 px og sonestolpe 232 px til høyre), sju like dagkolonner skilt med svake hårstreker (minst 132 px høye), og ukeskommentaren under. Høydelagsstripen har én kolonne per år og én 8 px celle per uke.

Rytmen bygger på 4 og 8 px: 4, 8, 12, 20 og 28 px er de mest brukte avstandene, 20 px mellom uker.

- **Under 1180 px** med panel åpent: høydelagsstripen skjules, tallcellene smalner (70/70/52/180 px).
- **Under 720 px**: én kolonne. Søket tar full bredde, filterbrikkene ruller vannrett. Ukehodet stables, tallene står i tre celler med sonestolpen under. Dagene blir rader med dato til venstre (68 px), og sammenhengende tomme dager slås sammen til én linje. Panelet dekker hele skjermen. Sidemargen er 16 px.

## Elevation & Depth

Systemet er helt flatt. Ingen skygger, ingen løftede flater. Dybde vises med strek og tone: blekkstrek for ytre struktur, svak blå hårstrek for underdeling, skyggepapir for flater som skal skilles ut (syk/skadet dag, trenerkommentar). Valgt og fokusert vises med 2 px blå ring, hover med rutenettflate. Panelet skilles fra kalenderen med én blekkstrek, ikke med skygge eller overlegg; på mobil legger det seg over hele skjermen.

### Named Rules
**The Hairline Rule.** Strukturlinjer er 1 px. Bare tilstand får tykkere strek: 2 px fokus- og valgtring, 2 px understrek på aktiv meny, 1,5 px stempel og utsnittsramme.

**The Flat Fill Rule.** Fargeflater er umodulerte. Gradientsyntaks brukes bare som tegneteknikk (rutenettet, skravuren, den myke kanten på brikkeraden på mobil), aldri som fargeovergang på en flate.

## Shapes

Rette hjørner overalt (0 px). Formene er kartets: rektangulære ruter, rammer og celler, tynne sonestolper (10 px i ukehodet, 4 px på øktkort, 2 px mellomrom mellom segmenter). Eneste skrå form er stempelet for syk og skadet, rotert −4°. Ikoner er tynne strekikoner (lucide) i 13–18 px.

## Components

### Øktkort
Kortet er en rad på kartet, ikke en boks: blekkstrek over, ingen ramme rundt.
- **Shape:** Rette hjørner, 1 px blekkstrek øverst, utfallende 4 px til sidene.
- **Innhold:** Navn (600 14px, maks to linjer), varighet · km i Barlow Condensed blekk-2 med kompass- og manualikon for o-teknikk og styrke, og en 4 px sonestolpe.
- **Hover:** Rutenettflate. **Valgt:** rutenettflate og 2 px blå ring innenfor kanten.
- **Filtrert bort:** Opasitet 0,25. En uke uten treff dempes til 0,5 som helhet.

### Sonestolpe
Horisontal stolpe med ett segment per sone, bredde etter minutter, 2 px mellomrom, minst 2 px per segment. Styrke er skravert. Brukes i ukehodet (10 px), på øktkort (4 px) og i tegnforklaringen.

### Tallcelle
Høyrejustert tall i 600 20px Barlow Condensed med enhet under i 10px versaler blekk-3. Cellene skilles med svak blå hårstrek til venstre. Samme mønster brukes for nøkkeltall i panelet (tre kolonner, to på mobil).

### Filterbrikke
- **Shape:** Rette hjørner, 30 px høy, 0 10px, 1 px svak blå kant.
- **Hover:** Kanten blir rutenettblå. **Aktiv:** fylt rutenettblå med papirtekst.

### Søkefelt
- **Style:** 34 px høyt, 260 px bredt (full bredde på mobil), 1 px blekkstrek, papirbakgrunn, søkeikon i blekk-3.
- **Focus:** 2 px blå ring med 1 px avstand rundt hele feltet.

### Navigasjon
Topplinje med merke (600 16px), hovedmeny (Dagbok, Analyse) i 500 Barlow og verktøy til høyre. Aktiv side har 2 px blå understrek som ligger på topplinjens blekkstrek, hover gir blå tekst. Treff vises som blått tall med pil-ikonknapper.

### Dagsmarkør og stempel
- **Markør:** 500 11px Barlow Condensed versaler i kotebrunt med 1 px kant i samme farge. Konkurranse er fylt kotebrun med papirtekst.
- **Stempel:** 600 13px versaler, 0,14em sperring, 1,5 px stempelrød kant, rotert −4°. Dagen får skyggepapir.

### Høydelagsstripe (signatur)
Årsnavigasjonen: ett 8 px felt per uke, farget med h0–h6 etter timer, månedsforkortelser i 9px i første kolonne. Hover gir 1 px blekkramme og viser uke og timer under; klikk ruller kalenderen dit. Utsnittet som vises markeres med 1,5 px blå ramme som følger scrollen. Uker uten treff dempes til 0,2 ved filtrering.

### Ikonknapp og lenkeknapp
- **Ikonknapp:** 32 px (26 px liten), gjennomsiktig, 18 px ikon. Hover gir rutenettflate, deaktivert 0,3 opasitet.
- **Lenkeknapp:** 500 13px rutenettblå med understrek 3 px under. Brukes for «Vis mer» på ukeskommentarer.

### Bevegelse
Bare bakgrunn og opasitet animeres: 120 ms ease-out for bakgrunn og 160 ms ease-out for opasitet, på øktkort, filterbrikker og høydelagsceller, og bare når brukeren ikke har bedt om redusert bevegelse.

### Diagrammer (analysesiden)
Grafene tegnes som egne SVG-er (`web/src/komponenter/graf/`) i samme språk som resten:
- **Stolper:** rette og uten radius, maks 24 px brede, med 2 px papirmellomrom mellom
  stablede segmenter. Styrke og skadet skraveres med SVG-mønstre (`#skravur-styrke`,
  `#skravur-skadet`). Aktiv stolpe får en 1 px blekkramme i stedet for at de andre dempes.
- **Linjer:** 2–2,5 px. Valgt sesong er rutenettblå, forrige sesong blekk og resten
  `blekk-3` med 45 % opasitet. Navn står ved linjeenden, eller over endepunktet hvis en
  annen linje krysser der. Navnene flyttes aldri bort fra linja si.
- **Akser:** 1 px `rute-svak` for rutenett og 1 px blekk for grunnlinjen. Aksetekst står
  i Barlow Condensed 11 px `blekk-3`, med enhet på y-aksen («t», «km»). Det brukes aldri
  to y-akser.
- **Merker over stolper:** 6 px kvadrater. Syk er fylt stempelrød, skadet er skravert
  stempelrød og konkurranse er kotebrun.
- **Ingen ny kategoripalett:**
  - Aktiviteter vises som små multipler i `blekk-2`, og valgt sesong i rutenettblå.
  - Kvalitetsøkter bruker I3.
  - Løpe-km bruker volumtrinnet `h4`.
- **Grafkort:**
  - 1 px blekkramme med tittel, forklaring og segmentvalg.
  - «Graf | Tabell» bytter til tabellvisning.
  - Tegnforklaring vises ved to serier eller flere.
- **Verktøytips:** papir med 1 px blekkramme, Barlow Condensed for tall og fargeprikker
  ved siden av teksten. Teksten har aldri seriefargen.
- **Tastatur:** Grafen kan fokuseres. Piltastene flytter aktiv stolpe eller trådkors, og
  Enter åpner uka. På berøringsskjerm viser første trykk verktøytipset, og andre trykk åpner.
- **Endring mot i fjor:** Tellinger (dager, økter) vises som differanse, for eksempel «+13».
  Timer og km vises i prosent.

### Kart og øktkurver (Garmin)
- **Kartet:**
  - MapLibre med rasterfliser: Kartverket topo som standard i Norge, OSM som alternativ.
    Utenfor Norge starter kartet på OSM, fordi Kartverkets kart er blankt der.
  - Kartet ligger i en 1 px blekkramme.
  - Kontrollene (Topo/OSM og utvid) er firkantede på papir med 1 px blekkant. Det
    gjelder også MapLibres attribusjon, uten runde hjørner.
- **Sporet og merkene:**
  - Sporet tegnes 3 px i blekk på en 6 px papirkant, så det leses på alle kartfarger.
  - Startpunktet er papir med blekkant, sluttpunktet er fylt blekk.
  - Hover-merket er rutenettblått, fordi det er samhandling. Ingen andre farger brukes
    på kartet.
- **Tidsserier (`Tidsserie`):**
  - Én serie i blekk, med enheten i tittelen («Puls (slag/min)», «Tempo (min/km)»).
  - Tette serier (1 punkt per 5 s eller per dag) tegnes 1,5 px. Det er et uttalt unntak
    fra linjeregelen på 2–2,5 px. Snittlinjer er 2,5 px.
  - Kurvene glattes med median over 3 punkter. Verdier utenfor aksen blir hull, aldri
    loddrette vegger.
  - Tempoaksen er snudd, så raskere er høyere.
- **Bånd og merker:**
  - Normalområder (HRV-baseline, ACWR 0,8–1,3) er et flatt bånd i blekk med 8 % opasitet.
  - Syke og skadde dager markeres med en 2 px loddrett strek i stempelrødt (skadet
    skravert). De står også i tegnforklaringen.
- **Søvnfaser:** De følger en nøytral lyshetsskala:
  - dyp = blekk
  - REM = `blekk-3`
  - lett = `sovn-lett`
  - våken = skravert `blekk-3`

  Identiteten bæres av lyshet, tegnforklaring og tabell, ikke av farge (One Meaning).
- **Rundetabellen:** Pauser og rolige drag (≤ 100 m, eller mer enn 40 % tregere enn
  midtrunden) dempes til `blekk-3`, så dragene kan leses rett nedover.

### Spør (samtalen med assistenten)
- **To stemmer:** Isaks spørsmål står i Source Serif 4 (19 px), som notatene hans. Svaret
  står i Barlow 16 px, fordi det ikke er Isaks tekst.
- **Ingen bobler:** En utveksling er en rad i en spalte på 760 px, skilt fra den forrige
  med en blekkstrek. Forslagene i tom tilstand er rader med hårstreker, ikke kort.
- **Tabeller i svaret:** blekkstrek over og under, svake hårstreker mellom radene, tall i
  Barlow Condensed og versaler i `blekk-3` i hodet.
- **Lenker:** rutenettblå med 1 px understrek. Uker og økter åpnes i dagboka, kilder i ny
  fane.
- **Status:** én linje i etikettstil med et 6 px blått kvadrat som pulserer i opasitet
  mens assistenten arbeider.
- **Skrivefeltet:** fast nederst, 1 px blekkramme, serif, 2 px blå fokusring. Sendknappen
  er fylt rutenettblå når det står noe i feltet, og blir en stoppknapp mens svaret skrives.

## Do's and Don'ts

### Do:
- **Do** bruk 1 px hårstreker: blekk for ytre struktur, svak rutenettblå for underdeling.
- **Do** bruk sonefargene I1–I5 bare for intensitet, med de validerte verdiene for hvert tema.
- **Do** tegn styrke som 135° skravur med 1 px kant.
- **Do** bruk den blå h0–h6-rampen for volum, aldri sonefargene.
- **Do** demp det et filter eller søk ikke treffer (0,25 for kort, 0,5 for uker, 0,2 for høydelagsceller) i stedet for å fjerne det.
- **Do** sett tall i Barlow Condensed med tabulære sifre i faste celler, og notater i Source Serif 4.
- **Do** hold kotebrun på #9a5a2a i lyst tema, så små etiketter holder 4,5:1.
- **Do** gi hver ny farge en mørk variant i både `prefers-color-scheme`-blokken og `[data-theme='dark']`.

### Don't:
- **Don't** bruk avrundede hjørner, skygger eller fargeoverganger på flater.
- **Don't** bruk sonefargene som pynt, kategorifarger eller sportsetiketter.
- **Don't** gi styrke en egen flat farge.
- **Don't** fjern uker, dager eller økter fra kalenderen når et filter er aktivt.
- **Don't** vis en kommentar fra trener eller andre som Isaks tekst.
- **Don't** bruk rutenettblått for noe annet enn samhandling, rutenett og volum.
