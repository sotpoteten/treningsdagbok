// Kopierer de ryddige datafilene fra ../data/ til public/data/, så Vite kan servere dem.
// Kjøres automatisk før `npm run dev` og `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fra = resolve(web, '../data')
const til = resolve(web, 'public/data')

mkdirSync(til, { recursive: true })
for (const fil of ['okter.json', 'dager.json', 'uker.json', 'profil.json']) {
  copyFileSync(resolve(fra, fil), resolve(til, fil))
}
console.log('Data kopiert til public/data/')
