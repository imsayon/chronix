import { redirect } from 'next/navigation';

/**
 * Root page — redirects authenticated users to their workspace list.
 * Unauthenticated users are intercepted by the middleware and sent to /login.
 */
export default function RootPage() {
  redirect('/workspaces');
}
