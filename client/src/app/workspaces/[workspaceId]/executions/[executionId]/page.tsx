"use client"

import { use, useEffect, useState } from "react"
import { ExecutionStatusBadge } from "../../../../components/ExecutionStatusBadge"
import { ExecutionAttemptTimeline } from "../../../../components/ExecutionAttemptTimeline"

export default function ExecutionPage({
	params,
}: {
	params: Promise<{ workspaceId: string; executionId: string }>
}) {
	const { workspaceId, executionId } = use(params)
	const [execution, setExecution] = useState<any>(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let isMounted = true

		const fetchExecution = async () => {
			try {
				const res = await fetch(`http://localhost:3000/api/v1/workspaces/${workspaceId}/executions/${executionId}`)
				if (res.ok) {
					const data = await res.json()
					if (isMounted) {
						setExecution(data.data)
					}
				}
			} catch (error) {
				console.error("Failed to fetch execution:", error)
			} finally {
				if (isMounted) setLoading(false)
			}
		}

		fetchExecution()
		const interval = setInterval(fetchExecution, 2000)

		return () => {
			isMounted = false
			clearInterval(interval)
		}
	}, [workspaceId, executionId])

	if (loading) return <div className="p-8">Loading execution details...</div>
	if (!execution) return <div className="p-8 text-red-500">Execution not found.</div>

	return (
		<div className="p-8 max-w-4xl mx-auto">
			<div className="flex justify-between items-start mb-8 border-b pb-4">
				<div>
					<h1 className="text-2xl font-bold mb-2">Execution Details</h1>
					<p className="text-sm text-gray-500 font-mono">{execution.id}</p>
				</div>
				<ExecutionStatusBadge status={execution.status} />
			</div>

			<div className="grid grid-cols-2 gap-8 mb-8">
				<div>
					<h3 className="font-semibold mb-2 text-gray-700">Metadata</h3>
					<ul className="text-sm space-y-2">
						<li><strong>Job ID:</strong> <span className="font-mono">{execution.jobId}</span></li>
						<li><strong>Trigger Type:</strong> {execution.triggerType}</li>
						<li><strong>Nominal Run At:</strong> {new Date(execution.nominalRunAt).toLocaleString()}</li>
						<li><strong>Attempts:</strong> {execution.attemptCount} / {execution.maxRetries + 1}</li>
					</ul>
				</div>
				<div>
					<h3 className="font-semibold mb-2 text-gray-700">Lifecycle</h3>
					<ul className="text-sm space-y-2">
						<li><strong>Created At:</strong> {new Date(execution.createdAt).toLocaleString()}</li>
						<li><strong>Next Retry:</strong> {execution.nextRetryAt ? new Date(execution.nextRetryAt).toLocaleString() : 'N/A'}</li>
						<li><strong>Terminal At:</strong> {execution.terminalAt ? new Date(execution.terminalAt).toLocaleString() : 'N/A'}</li>
					</ul>
				</div>
			</div>

			<div>
				<h2 className="text-xl font-bold mb-4">Delivery Timeline</h2>
				<ExecutionAttemptTimeline attempts={execution.attempts} />
			</div>
		</div>
	)
}
