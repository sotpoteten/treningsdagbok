import { format, parseISO } from 'date-fns'
import { nb } from 'date-fns/locale'

const km1 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const heltall = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 })

/** 380 → "6:20" (timer:minutter). */
export function timer(min: number): string {
  // Rund av til hele minutter først, så 59,6 min blir «1:00» og ikke «0:60».
  const totalt = Math.round(min)
  const t = Math.floor(totalt / 60)
  return `${t}:${String(totalt - t * 60).padStart(2, '0')}`
}

/** Varighet på et øktkort: 43 → "43′", 110 → "1:50". */
export function varighet(min: number): string {
  return min < 60 ? `${min}′` : timer(min)
}

/** Lang varighet til panelet: 110 → "1 t 50 min". */
export function varighetLang(min: number): string {
  const t = Math.floor(min / 60)
  const m = min - t * 60
  if (!t) return `${m} min`
  return m ? `${t} t ${m} min` : `${t} t`
}

export const km = (v: number) => km1.format(v)
export const tall = (v: number) => heltall.format(v)

/** Min/km som "5:21". */
export function tempo(minPerKm: number): string {
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

export const dato = (iso: string, mal: string) => format(parseISO(iso), mal, { locale: nb })

/** "28. sep.–4. okt. 2026" eller "21.–27. sep. 2026". */
export function ukespenn(mandag: string, sondag: string): string {
  const [a, b] = [parseISO(mandag), parseISO(sondag)]
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${dato(sondag, 'd. MMM yyyy')}`
  if (a.getFullYear() === b.getFullYear()) return `${dato(mandag, 'd. MMM')}–${dato(sondag, 'd. MMM yyyy')}`
  return `${dato(mandag, 'd. MMM yyyy')}–${dato(sondag, 'd. MMM yyyy')}`
}

export const UKEDAG = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']

/** Høydelagstrinn 0–6 for et ukevolum i minutter (grenser i timer: 5, 9, 12, 15, 18). */
export function hoydelag(min: number): number {
  if (min <= 0) return 0
  const t = min / 60
  if (t < 5) return 1
  if (t < 9) return 2
  if (t < 12) return 3
  if (t < 15) return 4
  if (t < 18) return 5
  return 6
}
export const HOYDELAG_ETIKETT = ['0', '< 5', '5–9', '9–12', '12–15', '15–18', '18+']
