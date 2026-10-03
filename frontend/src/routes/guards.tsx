import { Navigate, Outlet, useLocation } from 'react-router'
import { PageLoader } from '../components/ui/States'
import { useAuth } from '../context/AuthContext'

/** Signed-in users only. Others go to /login and come back here afterwards. */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader label="Checking your session…" />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <Outlet />
}

/**
 * Login/signup pages. Once signed in (already, or by submitting the form) the user is
 * sent on from here. This is the only redirect after auth, so the pages never race it:
 * back to the page they were trying to reach, else new accounts go to their first
 * interview and returning users to the dashboard.
 */
export function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from
    const fallback = location.pathname === '/signup' ? '/interviews/new' : '/dashboard'
    return <Navigate to={from ?? fallback} replace />
  }
  return <Outlet />
}
