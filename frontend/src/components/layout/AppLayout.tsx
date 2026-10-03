import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../context/useAuth'
import { Logo } from '../ui/Logo'
import { Navbar } from './Navbar'

/**
 * Tells screen-reader users that the page changed (SPAs don't reload, so nothing
 * else announces it). Reads the new document title after the page has set it.
 */
function RouteAnnouncer() {
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = window.setTimeout(() => setMessage(document.title), 150)
    return () => window.clearTimeout(timer)
  }, [pathname])

  return (
    <p aria-live="assertive" aria-atomic="true" className="sr-only">
      {message}
    </p>
  )
}

function Footer() {
  const { user } = useAuth()
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-sm text-muted">AI mock interviews, tailored to your resume.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
          {user ? (
            <>
              <Link to="/dashboard" className="hover:text-ink hover:underline">Dashboard</Link>
              <Link to="/interviews/new" className="hover:text-ink hover:underline">New interview</Link>
              <Link to="/dashboard/settings" className="hover:text-ink hover:underline">Settings</Link>
            </>
          ) : (
            <>
              <Link to="/" className="hover:text-ink hover:underline">Home</Link>
              <Link to="/login" className="hover:text-ink hover:underline">Log in</Link>
              <Link to="/signup" className="hover:text-ink hover:underline">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  // Block body: in newer browsers scrollTo returns a Promise, which React would
  // mistake for a cleanup function.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-overlay focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <RouteAnnouncer />
      <Navbar />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
