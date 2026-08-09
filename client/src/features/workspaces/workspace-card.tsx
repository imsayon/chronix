"use client"

import Link from "next/link"

export interface Workspace {
	id: string
	name: string
	slug: string
	createdAt: string
}

interface WorkspaceCardProps {
	workspace: Workspace
}

export function WorkspaceCard({ workspace }: WorkspaceCardProps) {
	return (
		<Link href={`/workspaces/${workspace.id}`} className="ws-card">
			<div className="ws-card__icon" aria-hidden>
				{workspace.name.slice(0, 2).toUpperCase()}
			</div>
			<div className="ws-card__body">
				<strong className="ws-card__name">{workspace.name}</strong>
				<span className="ws-card__slug">/{workspace.slug}</span>
			</div>
			<svg
				className="ws-card__arrow"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				aria-hidden
			>
				<path d="M5 12h14M12 5l7 7-7 7" />
			</svg>

			<style>{`.ws-card{display:flex;align-items:center;gap:14px;padding:16px 18px;border:1px solid var(--line);border-radius:10px;background:var(--surface);transition:border-color 140ms ease,box-shadow 140ms ease,background 140ms ease}.ws-card:hover{border-color:var(--line-strong);background:#fffdf9;box-shadow:0 2px 10px rgb(56 39 25/.06)}.ws-card__icon{flex-shrink:0;width:42px;height:42px;display:grid;place-items:center;border-radius:9px;background:#5f3522;color:#fffaf2;font-size:14px;font-weight:700;letter-spacing:-.04em}.ws-card__body{flex:1;min-width:0}.ws-card__name{display:block;font-size:15px;font-weight:640;letter-spacing:-.02em;color:var(--ink)}.ws-card__slug{display:block;margin-top:2px;font-size:12px;color:var(--ink-muted);font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}.ws-card__arrow{flex-shrink:0;color:var(--ink-muted)}`}</style>
		</Link>
	)
}
