import type { CSSProperties } from 'react'

const paths = {
	back: 'm14 6-6 6 6 6',
	arrowLeft: 'M19 12H5m7-7-7 7 7 7',
	close: 'm6 6 12 12M18 6 6 18',
	plus: 'M12 5v14M5 12h14',
	folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z',
	folderPlus: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3ZM12 10v6m-3-3h6',
	boards: 'M7 3h13v13H7ZM4 7H2v15h15v-3',
	recent: 'M12 8v5l3 2M21 12a9 9 0 1 1-3-6.7',
	star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
	trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7',
	more: 'M5 12h.01M12 12h.01M19 12h.01',
	edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z',
	cursor: 'M4 3l7.5 18 2.5-7 7-2.5Z',
	rotate: 'M3 11a9 9 0 0 1 15.36-6.36L21 7M21 3v4h-4M21 13a9 9 0 0 1-15.36 6.36L3 17M3 21v-4h4',
	download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
	user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2Z',
	users: 'M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM3 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3M17 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3',
	logout: 'M10 4H4v16h6M10 12h11m-4-4 4 4-4 4',
	lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5ZM12 14v3',
	chevron: 'm9 5 7 7-7 7',
	smile: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01',
	menu: 'M4 6h16M4 12h16M4 18h16',
	play: 'm8 5 11 7-11 7Z',
	pause: 'M8 5v14M16 5v14',
	file: 'M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h5',
	image: 'M3 3h18v18H3ZM3 17l6-6 4 4 3-3 5 5M15 7h.01',
	audio: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 3-6 3-6 0s6-3 6 0ZM20 16c0 3-6 3-6 0s6-3 6 0Z',
} as const

export function Icon({ name, size = 22, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
	return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>
}
