// Kartverkets topografiske kart dekker bare Norge. Utenfor blir bakgrunnen blank, så
// kartet starter på OSM der. Omrisset er grovt (riksgrensa og et stykke ut i havet),
// men skiller godt mellom Norge og stedene rundt, som Falun, Älvdalen og Finland.

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

/** Om et punkt ligger innenfor Norge (strålekasting mot omrisset). */
export function iNorge(lat: number, lon: number): boolean {
  let inne = false
  for (let i = 0, j = NORGE.length - 1; i < NORGE.length; j = i++) {
    const [xi, yi] = NORGE[i]
    const [xj, yj] = NORGE[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inne = !inne
  }
  return inne
}

/** Midtpunktet i sporet (punktet halvveis i serien), eller null uten posisjoner. */
export function midtpunkt(lat: (number | null)[], lon: (number | null)[]): [number, number] | null {
  const med = lat.flatMap((la, i) => (la != null && lon[i] != null ? [[la, lon[i] as number] as [number, number]] : []))
  return med.length ? med[Math.floor(med.length / 2)] : null
}
