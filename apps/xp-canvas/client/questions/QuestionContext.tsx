import { createContext, useContext } from 'react'
import type { QuestionFeedback, QuestionShape } from '../../shared/questionShape'

export const QuestionContext = createContext<{
	feedback: QuestionFeedback[]
	isTeacher: boolean
	canAnswer: boolean
	pending: boolean
	answer: (shape: QuestionShape, index: number) => void
	edit: (shape: QuestionShape) => void
}>({ feedback: [], isTeacher: false, canAnswer: false, pending: false, answer: () => {}, edit: () => {} })
export const useQuestion = () => useContext(QuestionContext)
