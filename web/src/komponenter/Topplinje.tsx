import { Moon, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'

type Tema = 'light' | 'dark'

function lesTema(): Tema | null {
  try {
    const t = localStorage.getItem('tema')
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

export function Topplinje({ children }: { children?: ReactNode }) {
  const [tema, setTema] = useState<Tema | null>(lesTema)

  useEffect(() => {
    if (tema) document.documentElement.dataset.theme = tema
    else delete document.documentElement.dataset.theme
  }, [tema])

  const morkNa = tema ? tema === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  function bytt() {
    const ny: Tema = morkNa ? 'light' : 'dark'
    setTema(ny)
    try {
      localStorage.setItem('tema', ny)
    } catch {
      /* lagring er bare en bekvemmelighet */
    }
  }

  return (
    <header className="topplinje">
      <span className="merke">
        Treningsdagbok<small>Isak Jonsson · fra nov. 2019</small>
      </span>
      <nav className="hovedmeny" aria-label="Hovedmeny">
        <NavLink to="/" end>
          Dagbok
        </NavLink>
        <NavLink to="/analyse">Analyse</NavLink>
        <NavLink to="/spor">Spør</NavLink>
      </nav>
      <div className="verktoy">{children}</div>
      <button type="button" className="ikonknapp" onClick={bytt} aria-label={morkNa ? 'Bytt til lyst kart' : 'Bytt til mørkt kart'}>
        {morkNa ? <Sun /> : <Moon />}
      </button>
    </header>
  )
}
