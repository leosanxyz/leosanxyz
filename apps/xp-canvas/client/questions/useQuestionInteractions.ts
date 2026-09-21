import { useCallback, useEffect, useRef, useState } from 'react'
import { isStudentDraw, type StudentDraw } from '../../shared/studentDraw'
import { useQuestionSounds } from './useQuestionSounds'
import { boardRequest } from '../boards/api'
import type { InteractionState, QuestionCommand, QuestionFeedback, QuestionShape } from '../../shared/questionShape'

export function useQuestionInteractions(roomId: string, enabled: boolean, connected: boolean, userId?: string) {
	const playSound = useQuestionSounds(enabled)
	const [draw, setDraw] = useState<StudentDraw | null>(null)
	const [feedback, setFeedback] = useState<QuestionFeedback[]>([])
	const feedbackTimers = useRef(new Set<ReturnType<typeof setTimeout>>())
	useEffect(() => () => { for (const timer of feedbackTimers.current) clearTimeout(timer) }, [])
	const [allowedUserIds, setAllowedUserIds] = useState<string[]>([])
	const [pending, setPending] = useState(false)
	const [error, setError] = useState('')
	const busy = useRef(false)
	const updates = useRef(0)
	const receive = useCallback((data: unknown) => {
		if (isStudentDraw(data)) { setDraw((current) => current?.id === data.id ? current : data); return }
		const event = data as Partial<QuestionFeedback> | null
		if (event?.type === 'question-result' && typeof event.id === 'string' && typeof event.shapeId === 'string' && typeof event.revision === 'string' && typeof event.answer === 'number' && typeof event.correct === 'boolean') {
			if (document.hidden) return
			setError('')
			playSound(event.id, event.correct)
			setFeedback((current) => [...current.filter((item) => item.id !== event.id), event as QuestionFeedback].slice(-8))
			const timer = setTimeout(() => {
				setFeedback((current) => current.filter((item) => item.id !== event.id))
				feedbackTimers.current.delete(timer)
			}, 3400)
			feedbackTimers.current.add(timer)
			return
		}

		if (data && typeof data === 'object' && 'type' in data && data.type === 'question-permissions' && 'allowedUserIds' in data && Array.isArray(data.allowedUserIds) && data.allowedUserIds.every((id) => typeof id === 'string')) {
			updates.current++; setAllowedUserIds(data.allowedUserIds)
		}
	}, [playSound])
	useEffect(() => {
		if (!enabled || !connected) { setAllowedUserIds([]); return }
		const abort = new AbortController(), before = updates.current
		void boardRequest<InteractionState>(`boards/${roomId}/interactions`, 'GET', undefined, abort.signal).then((state) => { if (!abort.signal.aborted && updates.current === before) receive(state) }).catch(() => {})
		return () => abort.abort()
	}, [roomId, enabled, connected, receive])
	const send = useCallback(async (command: QuestionCommand) => {
		if (busy.current) return
		busy.current = true; setPending(true); setError('')
		const before = updates.current
		try {
			const state = await boardRequest<InteractionState>(`boards/${roomId}/interactions`, 'POST', command)
			// A later socket update takes precedence over an in-flight HTTP response.
			if (updates.current === before) receive(state)
		}
		catch (cause) { setError(cause instanceof Error ? cause.message : 'No pude guardar la respuesta.') }
		finally { busy.current = false; setPending(false) }
	}, [roomId, receive])
	return { receive, feedback, draw, drawStudent: () => { void send({ action: 'draw' }) }, allowedUserIds, canAnswer: connected && Boolean(userId && allowedUserIds.includes(userId)), pending, error,
		answer: (shape: QuestionShape, answer: number) => { void send({ action: 'answer', shapeId: shape.id, revision: shape.props.revision, answer }) },
		permission: (userId: string, allowed: boolean) => { void send({ action: 'permission', userId, allowed }) },
	}
}
