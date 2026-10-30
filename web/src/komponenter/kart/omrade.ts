// Kartverket og MapAnt dekker bare hvert sitt land. Utenfor blir bakgrunnen blank, så
// kartvalgene avhenger av hvor sporet er. Omrissene er grove (riksgrensene og et stykke ut
// i havet), men skiller godt mellom landene og stedene rundt, som Falun, Älvdalen og Tallinn.

/** [lengdegrad, breddegrad], med klokka fra sørspissen. */
const NORGE: [number, number][] = [
  [7.0, 57.6],
  [4.2, 58.8],
  [4.0, 61.5],
  [4.8, 62.6],
  [8.0, 63.8],
  [10.5, 65.5],
  [12.5, 67.8],
  [15.0, 69.3],
  [18.0, 70.3],
  [21.0, 70.6],
  [25.0, 71.4],
  [28.5, 71.2],
  [31.2, 70.5],
  [30.9, 69.6],
  [28.9, 69.05],
  [26.0, 69.9],
  [24.9, 68.6],
  [21.0, 69.2],
  [20.5, 69.06],
  [18.1, 68.5],
  [16.2, 67.5],
  [14.5, 66.1],
  [13.6, 64.6],
  [12.1, 63.3],
  [12.3, 62.25],
  [12.6, 61.0],
  [12.3, 59.9],
  [11.4, 59.0],
  [11.1, 58.9],
  [10.5, 58.7],
  [8.5, 57.9],
]

/** Med klokka fra sørvest for Åland. Grensa mot Norge følger samme punkter som NORGE. */
const FINLAND: [number, number][] = [
  [19.2, 59.7],
  [19.3, 60.6],
  [21.0, 63.6],
  [22.5, 64.6],
  [24.15, 65.8],
  [23.65, 67.2],
  [22.4, 68.45],
  [20.5, 69.06],
  [21.0, 69.2],
  [24.9, 68.6],
  [26.0, 69.9],
  [28.9, 69.05],
  [30.0, 67.7],
  [29.1, 66.9],
  [30.1, 65.7],
  [29.7, 64.8],
  [30.6, 64.2],
  [31.6, 62.9],
  [28.8, 61.2],
  [27.8, 60.5],
  [24.5, 59.85],
  [22.5, 59.6],
  [20.5, 59.45],
]

/** Strålekasting mot et omriss. */
function innenfor(omriss: [number, number][], lat: number, lon: number): boolean {
  let inne = false
  for (let i = 0, j = omriss.length - 1; i < omriss.length; j = i++) {
    const [xi, yi] = omriss[i]
    const [xj, yj] = omriss[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inne = !inne
  }
  return inne
}

/** Om et punkt ligger innenfor Norge. */
export function iNorge(lat: number, lon: number): boolean {
  return innenfor(NORGE, lat, lon)
}

export type Land = 'norge' | 'finland'

/** Landet punktet ligger i, når det er et land med egne kartlag. */
export function land(lat: number, lon: number): Land | null {
  if (iNorge(lat, lon)) return 'norge'
  if (innenfor(FINLAND, lat, lon)) return 'finland'
  return null
}

/** Midtpunktet i sporet (punktet halvveis i serien), eller null uten posisjoner. */
export function midtpunkt(lat: (number | null)[], lon: (number | null)[]): [number, number] | null {
  const med = lat.flatMap((la, i) => (la != null && lon[i] != null ? [[la, lon[i] as number] as [number, number]] : []))
  return med.length ? med[Math.floor(med.length / 2)] : null
}
