import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { lastDagbok, type Dagbok as DagbokData } from './data/last'
import { Analyse } from './sider/Analyse'
import { Dagbok } from './sider/Dagbok'
import { Spor } from './sider/Spor'

export function App() {
  const [dagbok, setDagbok] = useState<DagbokData | null>(null)
  const [feil, setFeil] = useState<string | null>(null)

  useEffect(() => {
    lastDagbok().then(setDagbok, (e: Error) => setFeil(e.message))
  }, [])

  if (feil)
    return (
      <div className="status">
        <h1>Klarte ikke å laste dagboka</h1>
        <p>{feil}</p>
      </div>
    )
  if (!dagbok)
    return (
      <div className="status" aria-busy="true">
        <p>Laster dagboka …</p>
      </div>
    )

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dagbok dagbok={dagbok} />} />
        <Route path="/okt/:id" element={<Dagbok dagbok={dagbok} />} />
        <Route path="/analyse/*" element={<Analyse dagbok={dagbok} />} />
        <Route path="/spor" element={<Spor />} />
      </Routes>
    </HashRouter>
  )
}
