/**
 * Auth context.
 * Provides the authenticated account, auth state, login, logout, and token refresh.
 */
"use client"

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	type ReactNode,
} from "react"
import { apiFetch } from "@/lib/api/client"
import { setSession, clearSession, getAccessToken } from "@/lib/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthAccount {
	id: string
	email: string
	displayName: string
	isActive: boolean
	createdAt: string
}

export interface AuthState {
	account: AuthAccount | null
	isLoading: boolean
	isAuthenticated: boolean
}

export interface AuthContextValue extends AuthState {
	login: (email: string, password: string) => Promise<void>
	register: (
		email: string,
		password: string,
		displayName: string,
	) => Promise<void>
	logout: () => Promise<void>
	refreshToken: () => Promise<boolean>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
	const [account, setAccount] = useState<AuthAccount | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	const refreshToken = useCallback(async (): Promise<boolean> => {
		try {
			const res = await apiFetch<{ accessToken: string }>(
				"/api/v1/auth/refresh",
				{
					method: "POST",
				},
			)
			setSession(res.data.accessToken)
			return true
		} catch {
			clearSession()
			setAccount(null)
			return false
		}
	}, [])

	// On mount: try to restore session via the refresh cookie
	useEffect(() => {
		let cancelled = false
		;(async () => {
			const ok = await refreshToken()
			if (!ok || cancelled) {
				setIsLoading(false)
				return
			}

			try {
				const meRes = await apiFetch<{
					auth: { accountId: string; workspaceId: string }
				}>("/api/v1/auth/me", {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				})
				if (!cancelled) {
					// We have auth context — fetch the full account detail if needed
					// For now, we store the accountId; full account comes from a /accounts/me endpoint (Phase 2+)
					setAccount({
						id: meRes.data.auth.accountId,
						email: "",
						displayName: "",
						isActive: true,
						createdAt: new Date().toISOString(),
					})
				}
			} catch {
				clearSession()
				setAccount(null)
			} finally {
				if (!cancelled) setIsLoading(false)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [refreshToken])

	const login = useCallback(async (email: string, password: string) => {
		const res = await apiFetch<{
			accessToken: string
			account: AuthAccount
		}>("/api/v1/auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		})
		setSession(res.data.accessToken)
		setAccount(res.data.account)
	}, [])

	const register = useCallback(
		async (email: string, password: string, displayName: string) => {
			const res = await apiFetch<{
				accessToken: string
				account: AuthAccount
			}>("/api/v1/auth/register", {
				method: "POST",
				body: JSON.stringify({ email, password, displayName }),
			})
			setSession(res.data.accessToken)
			setAccount(res.data.account)
		},
		[],
	)

	const logout = useCallback(async () => {
		try {
			await apiFetch("/api/v1/auth/logout", { method: "POST" })
		} finally {
			clearSession()
			setAccount(null)
		}
	}, [])

	return (
		<AuthContext.Provider
			value={{
				account,
				isLoading,
				isAuthenticated: account !== null,
				login,
				register,
				logout,
				refreshToken,
			}}
		>
			{children}
		</AuthContext.Provider>
	)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (ctx === null) {
		throw new Error("useAuth must be used inside <AuthProvider>")
	}
	return ctx
}
