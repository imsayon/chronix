import React from 'react'

export function ExecutionAttemptTimeline({ attempts }: { attempts: any[] }) {
	if (!attempts || attempts.length === 0) {
		return <p className="text-sm text-gray-500">No attempts yet.</p>
	}

	return (
		<div className="space-y-4">
			{attempts.map((attempt) => (
				<div key={attempt.id} className="p-4 border rounded-md bg-white shadow-sm">
					<div className="flex justify-between items-center mb-2">
						<h4 className="font-medium text-sm">Attempt #{attempt.attemptNumber}</h4>
						<span className="text-xs text-gray-500">
							{new Date(attempt.startedAt).toLocaleString()}
						</span>
					</div>

					<div className="text-sm flex gap-4 text-gray-600 mb-2">
						<span><strong>Outcome:</strong> {attempt.outcome}</span>
						<span><strong>Status:</strong> {attempt.httpStatusCode || 'N/A'}</span>
						<span><strong>Duration:</strong> {attempt.durationMs}ms</span>
					</div>

					{attempt.errorMessage && (
						<div className="text-sm text-red-600 bg-red-50 p-2 rounded">
							{attempt.errorMessage}
						</div>
					)}

					{attempt.responseBodySample && (
						<div className="mt-2">
							<p className="text-xs font-semibold mb-1">Response Sample</p>
							<pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
								{attempt.responseBodySample}
							</pre>
						</div>
					)}
				</div>
			))}
		</div>
	)
}
