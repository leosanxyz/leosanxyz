import { createContext, useContext } from 'react'
import type { ParejasShape } from '../../shared/parejasShape'

export const ParejasContext = createContext<{ isTeacher: boolean; edit: (shape: ParejasShape) => void }>({ isTeacher: false, edit: () => {} })
export const useParejas = () => useContext(ParejasContext)
