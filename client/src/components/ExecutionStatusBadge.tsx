import React from 'react'
import { Badge } from './ui/badge'

export function ExecutionStatusBadge({ status }: { status: string }) {
	const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
		pending: 'secondary',
		claimed: 'secondary',
		running: 'default',
		succeeded: 'default', // Actually, should be success colored
		failed: 'destructive',
		dead_lettered: 'destructive'
	}

	const variant = variants[status] || 'outline'

	return (
		<Badge variant={variant} className={status === 'succeeded' ? 'bg-green-600 hover:bg-green-700' : ''}>
			{status.replace('_', ' ').toUpperCase()}
		</Badge>
	)
}
