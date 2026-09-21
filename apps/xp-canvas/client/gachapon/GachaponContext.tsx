import { createContext, useContext } from 'react'
import type { GachaponResult, GachaponShape } from '../../shared/gachaponShape'
export const GachaponContext = createContext<{
	userId?: string; isTeacher: boolean; canUse: boolean; pending: boolean; results: GachaponResult[]
	spin: (shape: GachaponShape) => void; edit: (shape: GachaponShape) => void
}>({ isTeacher: false, canUse: false, pending: false, results: [], spin: () => {}, edit: () => {} })
export const useGachapon = () => useContext(GachaponContext)
