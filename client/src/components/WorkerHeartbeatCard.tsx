import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ServerIcon } from 'lucide-react'

export function WorkerHeartbeatCard({ worker }: { worker: any }) {
	const lastSeen = new Date(worker.lastHeartbeat)
	const isStale = Date.now() - lastSeen.getTime() > 2 * 60 * 1000

	return (
		<Card className={isStale ? "opacity-60" : ""}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					<ServerIcon className="h-4 w-4" />
					{worker.hostname}
				</CardTitle>
				<div className={`h-2 w-2 rounded-full ${isStale ? 'bg-red-500' : 'bg-green-500'}`} />
			</CardHeader>
			<CardContent>
				<div className="text-xs space-y-1 mt-2">
					<p><strong>Worker ID:</strong> <span className="font-mono text-[10px]">{worker.workerId}</span></p>
					<p><strong>PID:</strong> {worker.processId}</p>
					<p><strong>Version:</strong> {worker.version}</p>
					<p><strong>Concurrency:</strong> {worker.concurrency}</p>
					<p><strong>Last Heartbeat:</strong> {lastSeen.toLocaleTimeString()}</p>
				</div>
			</CardContent>
		</Card>
	)
}
