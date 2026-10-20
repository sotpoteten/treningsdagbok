import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { FILTERTYPER, type Filter, type Filtertype } from '../data/filter'
import { tall } from '../data/format'

interface Props {
  filter: Filter
  antallTreff: number | null
  /** Får en endring, ikke et ferdig filter, så raske endringer ikke overskriver hverandre. */
  onEndre: (endre: (f: Filter) => Filter) => void
  onTreff: (retning: 1 | -1) => void
}

export function Sok({ filter, antallTreff, onEndre, onTreff }: Props) {
  function byttType(t: Filtertype) {
    onEndre((f) => {
      const typer = new Set(f.typer)
      if (typer.has(t)) typer.delete(t)
      else typer.add(t)
      return { ...f, typer }
    })
  }

  return (
    <div className="sok" role="search">
      <label className="sokefelt">
        <Search className="ikon" aria-hidden />
        <input
          type="search"
          value={filter.sok}
          placeholder="Søk i økter og notater"
          aria-label="Søk i økter og notater"
          onChange={(e) => {
            const sok = e.target.value
            onEndre((f) => ({ ...f, sok }))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onTreff(e.shiftKey ? -1 : 1)
          }}
        />
        {filter.sok && (
          <button type="button" className="tom-sok" onClick={() => onEndre((f) => ({ ...f, sok: '' }))} aria-label="Tøm søket">
            <X className="ikon" />
          </button>
        )}
      </label>
      <div className="typer" role="group" aria-label="Filtrer på type">
        {FILTERTYPER.map((t) => (
          <button key={t.id} type="button" className="filterbrikke" aria-pressed={filter.typer.has(t.id)} onClick={() => byttType(t.id)}>
            {t.navn}
          </button>
        ))}
      </div>
      {antallTreff != null && (
        <div className="treff">
          <span aria-live="polite">{antallTreff ? `${tall(antallTreff)} treff` : 'Ingen treff'}</span>
          <button type="button" className="ikonknapp liten" onClick={() => onTreff(-1)} disabled={!antallTreff} aria-label="Nyere treff">
            <ChevronUp />
          </button>
          <button type="button" className="ikonknapp liten" onClick={() => onTreff(1)} disabled={!antallTreff} aria-label="Eldre treff">
            <ChevronDown />
          </button>
        </div>
      )}
    </div>
  )
}
