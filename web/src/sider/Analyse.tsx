import { useMemo } from 'react'
import { perAr, summerEtter } from '../data/aggregat'
import { km, timer, tall } from '../data/format'
import type { Dagbok } from '../data/last'
import { SONER } from '../data/typer'
import { Topplinje } from '../komponenter/Topplinje'

/** Plass for analyseverktøyene som kommer. Foreløpig bare årstotalene. */
export function Analyse({ dagbok }: { dagbok: Dagbok }) {
  const ar = useMemo(() => [...summerEtter(dagbok.okter, perAr).entries()].reverse(), [dagbok])
  return (
    <>
      <Topplinje />
      <main className="analyse">
        <h1>Analyse</h1>
        <p className="ingress">Analyseverktøyene bygges her etter hvert. Foreløpig står årstotalene.</p>
        <table className="arstabell">
          <thead>
            <tr>
              <th scope="col">År</th>
              <th scope="col">Økter</th>
              <th scope="col">Timer</th>
              <th scope="col">Km</th>
              {SONER.map((s) => (
                <th key={s} scope="col">
                  {s}
                </th>
              ))}
              <th scope="col">Styrke</th>
              <th scope="col">O-teknikk</th>
            </tr>
          </thead>
          <tbody>
            {ar.map(([a, s]) => (
              <tr key={a}>
                <th scope="row">{a === '2019' ? '2019 (nov.–des.)' : a}</th>
                <td>{tall(s.okter)}</td>
                <td>{timer(s.minutter)}</td>
                <td>{km(s.km)}</td>
                {SONER.map((z) => (
                  <td key={z}>{timer(s.sone[z])}</td>
                ))}
                <td>{timer(s.styrke)}</td>
                <td>{timer(s.otek)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fotnote">O-teknikk inngår i løpetiden og er ikke lagt til i timene.</p>
      </main>
    </>
  )
}
