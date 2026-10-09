import { Compass, Dumbbell } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { km, varighet } from '../data/format'
import type { Okt } from '../data/typer'
import { Sonestolpe } from './Sonestolpe'

interface Props {
  okt: Okt
  dempet: boolean
  valgt: boolean
}

export function Oktkort({ okt, dempet, valgt }: Props) {
  const { search } = useLocation()
  const klasser = ['oktkort', dempet && 'dempet', valgt && 'valgt'].filter(Boolean).join(' ')
  return (
    <Link to={{ pathname: `/okt/${okt.id}`, search }} className={klasser} aria-current={valgt || undefined}>
      <span className="okt-navn">{okt.navn}</span>
      <span className="okt-tall">
        {varighet(okt.varighet_min)}
        {okt.distanse_km > 0 && <> · {km(okt.distanse_km)} km</>}
        {okt.otek_min > 0 && <Compass className="ikon" aria-label="O-teknikk" />}
        {okt.styrke_min > 0 && <Dumbbell className="ikon" aria-label="Styrke" />}
      </span>
      <Sonestolpe sone={okt.sone_min} styrke={okt.styrke_min} tynn />
    </Link>
  )
}
