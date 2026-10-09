---
version: 1
slug: "web-src-sider-dagbok-tsx"
primary_target: "web/src/sider/Dagbok.tsx"
related_targets: []
---

## Scope
Dagbok-ruten (ukeskalender + øktpanel) i web/. Modus: Operate (bla, søke, lese). Kode-ledet.

## Audience and task
Isak ved PC i rolige stunder: bla bakover i uker, finne igjen økter/mesterskap, lese notater, sammenligne volum. Trener får den vist. Notater og tall er likeverdige.

## Direction contract
THESIS: Sju års trening lest som et kartblad: uker er ruter i et rutenett, volum er høydelag. Avviser kategoriens avrundede, grå kortkalender med fargede sportsetiketter.
OWN-WORLD: Kartpapir #FAFAF5, blekk #1D1D1B, rutenettblå #2F6FA8 (1 px hårstreker, koordinatmerker i margen), kotebrun #B26A34 for dagsmarkører, sonene I1–I5 som flate høydelag fra lys grønn til rødbrun. Barlow/Barlow Condensed for etiketter og tabelltall, Source Serif 4 for notater. Ingen radius, ingen skygger, ingen gradienter. Raises: 1 px hårstrek og maks tre verdier per flate (fra senterskinne); flate umodulerte farger (fra parkkart); ingenting forsvinner – filtrert dempes, syk/skadet stemples (fra billettmappe); ukesummer i faste tabellceller (fra avgangstavle).
STORY: Isak ser nyeste uke med summer og notat med en gang, skjønner sonefordelingen av fargene, hopper i tid via høydelagsstripen og åpner en økt for blokker og hele notatet.
FIRST VIEWPORT: Topplinje 56 px (merke, Dagbok/Analyse, søk, typefilter). Venstre 132 px: høydelagsstripe, én kolonne per år, én celle per uke farget etter timer, nåværende utsnitt markert med blå ramme. Høyre: ukerader med hode (uke, datoer, timer/km/økter i faste celler, sonestolpe), sju dagkolonner med blå hårstreker og øktkort (navn, tid·km, sonestripe), notat i serif under.
FORM: Kartbladet (N50 topografisk kartblad), kandidat 6 på listen; seed 32286b65.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction
Høydelagsstripen: hover viser uke og timer, klikk ruller kalenderen dit; utsnittsrammen følger scrollen.
