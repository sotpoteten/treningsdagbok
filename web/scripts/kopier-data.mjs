// Kopierer de ryddige datafilene fra ../data/ til public/data/, så Vite kan servere dem.
// Garmin-sporene (../data/garmin_spor/) synkroniseres til public/garmin_spor/: bare nye eller
// endrede filer kopieres. Kjøres automatisk før `npm run dev` og `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fra = resolve(web, '../data')
const til = resolve(web, 'public/data')

mkdirSync(til, { recursive: true })
for (const fil of ['okter.json', 'dager.json', 'uker.json', 'profil.json']) {
  copyFileSync(resolve(fra, fil), resolve(til, fil))
}
// Garmin-filene er valgfrie; siden virker uten dem.
for (const fil of ['garmin_aktiviteter.json', 'garmin_helse.json']) {
  if (existsSync(resolve(fra, fil))) copyFileSync(resolve(fra, fil), resolve(til, fil))
}

const sporFra = resolve(fra, 'garmin_spor')
const sporTil = resolve(web, 'public/garmin_spor')
let kopiert = 0
if (existsSync(sporFra)) {
  mkdirSync(sporTil, { recursive: true })
  for (const fil of readdirSync(sporFra)) {
    const a = resolve(sporFra, fil)
    const b = resolve(sporTil, fil)
    if (!existsSync(b) || statSync(b).mtimeMs < statSync(a).mtimeMs) {
      copyFileSync(a, b)
      kopiert++
    }
  }
}
console.log(`Data kopiert til public/data/${kopiert ? `, ${kopiert} nye GPS-spor` : ''}`)
