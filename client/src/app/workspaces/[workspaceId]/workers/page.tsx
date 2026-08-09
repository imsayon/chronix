"use client"

import { use, useEffect, useState } from "react"
import { WorkerHeartbeatCard } from "../../../../components/WorkerHeartbeatCard"

export default function WorkersPage({
	params,
}: {
	params: Promise<{ workspaceId: string }>
}) {
	const { workspaceId } = use(params)
	const [workers, setWorkers] = useState<any[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let isMounted = true

		const fetchWorkers = async () => {
			try {
				const res = await fetch(`http://localhost:3000/api/v1/workspaces/${workspaceId}/workers`)
				if (res.ok) {
					const data = await res.json()
					if (isMounted) {
						setWorkers(data.data)
					}
				}
			} catch (error) {
				console.error("Failed to fetch workers:", error)
			} finally {
				if (isMounted) setLoading(false)
			}
		}

		fetchWorkers()
		const interval = setInterval(fetchWorkers, 5000)

		return () => {
			isMounted = false
			clearInterval(interval)
		}
	}, [workspaceId])

	return (
		<div className="p-8 max-w-6xl mx-auto">
			<div className="mb-8 border-b pb-4">
				<h1 className="text-2xl font-bold mb-2">Fleet Status</h1>
				<p className="text-sm text-gray-500">Live dashboard of Chronix execution workers processing webhook deliveries.</p>
			</div>

			{loading && workers.length === 0 ? (
				<div>Loading workers...</div>
			) : workers.length === 0 ? (
				<div className="text-gray-500 italic p-8 border rounded-lg bg-gray-50 text-center">
					No active workers found. Is the execution engine running?
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{workers.map(worker => (
						<WorkerHeartbeatCard key={worker.workerId} worker={worker} />
					))}
				</div>
			)}
		</div>
	)
}
