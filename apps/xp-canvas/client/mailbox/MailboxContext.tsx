import { createContext, useContext } from 'react'
import type { MailboxShape } from '../../shared/mailboxShape'

export const MailboxContext = createContext<{
	isTeacher: boolean
	/** Solo con el portal y la conexión activa se pueden mandar o sacar cartas. */
	enabled: boolean
	/** Quién escribió cada carta que sacó el maestro, o '' si llegó sin nombre. Solo existe en su pantalla. */
	authors: Record<string, string>
	/** Cartas que este dispositivo mandó, por buzón y ronda. */
	sent: Record<string, number>
	write: (shape: MailboxShape) => void
	draw: (shape: MailboxShape) => Promise<void>
	edit: (shape: MailboxShape) => void
}>({ isTeacher: false, enabled: false, authors: {}, sent: {}, write: () => {}, draw: async () => {}, edit: () => {} })
export const useMailbox = () => useContext(MailboxContext)
export const sentKey = (shape: MailboxShape) => `${shape.id}:${shape.props.round}`

/** Buzones hacia los que vuela una carta de este dispositivo. Su conteo espera a que la carta entre por la ranura. */
export const flying = new Set<string>()
