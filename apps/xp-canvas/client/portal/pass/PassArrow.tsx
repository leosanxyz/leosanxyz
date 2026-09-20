export function PassArrow({
	direction = 'right',
	className = '',
}: {
	direction?: 'right' | 'left' | 'down'
	className?: string
}) {
	return (
		<svg
			className={`pass-arrow ${className}`}
			viewBox="0 0 32 32"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<g
				transform={`rotate(${direction === 'left' ? 180 : direction === 'down' ? 90 : 0} 16 16)`}
			>
				<path d="M5 16h22M18 7l9 9-9 9" />
			</g>
		</svg>
	)
}
