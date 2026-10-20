import { createContext, useContext } from 'react'

/** Datoen for siste importerte økt, så toppen av siden kan vise hvor langt dagboka går. */
export const SisteOkt = createContext<string | null>(null)
export const useSisteOkt = () => useContext(SisteOkt)
