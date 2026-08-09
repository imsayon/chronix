import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Cookie-based auth guard.
 *
 * Public routes: /login, /register, and Next.js internals.
 * All other routes require the `chronix_access` cookie to be present.
 *
 * NOTE: Phase 0 — this guard is a structural placeholder only.
 * JWT signature verification is added in Phase 1 when the auth feature ships.
 * For now, presence of the cookie is sufficient (allows the scaffold to work
 * without a running auth service).
 */

const PUBLIC_PATHS = ["/login", "/register"]

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl

	// Allow Next.js internals and static files
	if (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon") ||
		pathname.includes(".")
	) {
		return NextResponse.next()
	}

	// Allow public auth pages
	if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
		return NextResponse.next()
	}

	// Check for access token cookie
	const hasToken = request.cookies.has("chronix_access")
	if (!hasToken) {
		const loginUrl = new URL("/login", request.url)
		loginUrl.searchParams.set("redirect", pathname)
		return NextResponse.redirect(loginUrl)
	}

	return NextResponse.next()
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
