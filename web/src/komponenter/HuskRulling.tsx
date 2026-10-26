import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { hentPosisjoner, kanRulleTil, lagrePosisjoner, lagringsnokkel, type Posisjoner } from '../data/rulling'

const LAGER = 'husk-rull'
/** Rulleflater med denne attributten (og en id som verdi) huskes per historikkoppføring. */
export const HUSK_RULL = 'data-husk-rull'
/** Så lenge ventes det på at innholdet (data, målte grafer) blir høyt nok. */
const VENT_MS = 1500

function lesLager(): string | null {
  try {
    return sessionStorage.getItem(LAGER)
  } catch {
    return null
  }
}

function skriv(key: string, pos: Posisjoner) {
  try {
    sessionStorage.setItem(LAGER, lagrePosisjoner(lesLager(), key, pos))
  } catch {
    /* lagring er bare en bekvemmelighet */
  }
}

function flate(id: string) {
  return document.querySelector<HTMLElement>(`[${HUSK_RULL}="${CSS.escape(id)}"]`)
}

/**
 * Husker rulleposisjonen til flatene merket med `data-husk-rull` for hver oppføring i
 * historikken. Tilbake og Fram (POP) gir posisjonene tilbake når innholdet er tegnet, nye
 * navigasjoner (PUSH) starter øverst, og valg som erstatter oppføringen (REPLACE) beholder dem.
 * Dagboka styrer sin egen rulling og er ikke merket.
 */
export function HuskRulling() {
  const { key: ruterKey, pathname, search } = useLocation()
  // Oppføringer uten egen tilstand i historikken (skrevet inn eller åpnet fra et bokmerke) heter
  // alle «default». Adressen skiller dem fra hverandre.
  const key = lagringsnokkel(ruterKey, pathname + search)
  const type = useNavigationType()
  const naa = useRef<{ key: string; pos: Posisjoner }>({ key, pos: {} })
  const startet = useRef(false)
  // Flater som Isak har rullet i. Ved PUSH nullstilles de som står igjen fra forrige side.
  const rullet = useRef(new WeakSet<Element>())

  useEffect(() => {
    let ramme = 0
    const vedRull = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      const id = el.getAttribute(HUSK_RULL)
      if (!id) return
      rullet.current.add(el)
      naa.current.pos[id] = el.scrollTop
      if (!ramme)
        ramme = requestAnimationFrame(() => {
          ramme = 0
          skriv(naa.current.key, naa.current.pos)
        })
    }
    // Rullehendelser kommer først i neste bilde. Les derfor av alle flatene før et klikk eller
    // en tast kan navigere bort, så posisjonen er med selv om hendelsen ikke har kommet ennå.
    const lesAv = () => {
      document.querySelectorAll<HTMLElement>(`[${HUSK_RULL}]`).forEach((el) => {
        naa.current.pos[el.getAttribute(HUSK_RULL)!] = el.scrollTop
      })
    }
    document.addEventListener('scroll', vedRull, { capture: true, passive: true })
    document.addEventListener('click', lesAv, { capture: true })
    document.addEventListener('keydown', lesAv, { capture: true })
    return () => {
      document.removeEventListener('scroll', vedRull, { capture: true })
      document.removeEventListener('click', lesAv, { capture: true })
      document.removeEventListener('keydown', lesAv, { capture: true })
      cancelAnimationFrame(ramme)
    }
  }, [])

  useLayoutEffect(() => {
    const gammel = naa.current
    if (startet.current && gammel.key === key) return // StrictMode kjører effekten to ganger
    const forste = !startet.current
    startet.current = true

    if (!forste) skriv(gammel.key, gammel.pos)
    if (type === 'REPLACE') {
      naa.current = { key, pos: gammel.pos }
      return
    }
    if (type === 'PUSH') {
      naa.current = { key, pos: {} }
      document.querySelectorAll<HTMLElement>(`[${HUSK_RULL}]`).forEach((el) => {
        if (rullet.current.has(el)) el.scrollTop = 0
      })
      return
    }
    // POP: Tilbake, Fram eller ny innlasting av siden.
    const mal = hentPosisjoner(lesLager(), key) ?? {}
    naa.current = { key, pos: { ...mal } }
    // Hver flate får posisjonen når den er høy nok. Grafer over kan fortsatt vokse når de er
    // målt, så posisjonen settes på nytt til høyden har ligget i ro noen bilder. Imens er
    // nettleserens rulleanker av, ellers ville den flyttet posisjonen for å følge innholdet.
    const igjen = Object.keys(mal).filter((id) => mal[id] > 0)
    const satt = new Map<string, { el: HTMLElement; hoyde: number; rolig: number }>()
    const slutt = performance.now() + VENT_MS
    const ferdig = (el: HTMLElement) => el.style.removeProperty('overflow-anchor')
    const forsok = () => {
      if (naa.current.key !== key) {
        satt.forEach((s) => ferdig(s.el))
        return // ny navigasjon før innholdet ble klart
      }
      const forSent = performance.now() > slutt
      for (let i = igjen.length - 1; i >= 0; i--) {
        const id = igjen[i]
        const el = flate(id)
        if (!el) continue
        const s = satt.get(id)
        if (s && s.el !== el) satt.delete(id)
        if (!satt.has(id) && !(forSent || kanRulleTil(el.scrollHeight, el.clientHeight, mal[id]))) continue
        const naaS = satt.get(id) ?? { el, hoyde: -1, rolig: 0 }
        satt.set(id, naaS)
        el.style.setProperty('overflow-anchor', 'none')
        if (el.scrollHeight !== naaS.hoyde) {
          naaS.hoyde = el.scrollHeight
          naaS.rolig = 0
        } else naaS.rolig++
        // Settes hvert bilde i den korte perioden: sider som ruller selv når de vises (Spør
        // går til bunnen), gjør det på nytt etter oss når StrictMode kjører effektene to ganger.
        el.scrollTop = mal[id]
        if (naaS.rolig >= 5 || forSent) {
          ferdig(el)
          igjen.splice(i, 1)
        }
      }
      if (igjen.length && !forSent) requestAnimationFrame(forsok)
      else satt.forEach((s) => ferdig(s.el))
    }
    forsok()
  }, [key, type])

  return null
}
