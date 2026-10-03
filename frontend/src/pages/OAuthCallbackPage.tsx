import { CircleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { ButtonLink } from '../components/ui/Button'
import { PageLoader } from '../components/ui/States'
import { useAuth } from '../context/AuthContext'

/** The backend redirects here with `#access_token=…&refresh_token=…` or `#error=…`. */
export function OAuthCallbackPage() {
  const { completeOAuth } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return // React StrictMode runs effects twice in development
    handled.current = true

    const params = new URLSearchParams(window.location.hash.slice(1))
    // Drop the tokens from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname)

    const access = params.get('access_token')
    const refresh = params.get('refresh_token')
    if (!access || !refresh) {
      setError(params.get('error') ?? 'Sign-in did not complete. Please try again.')
      return
    }
    completeOAuth({ access_token: access, refresh_token: refresh })
      .then(() => navigate('/dashboard', { replace: true }))
      .catch((err) => setError(getErrorMessage(err)))
  }, [completeOAuth, navigate])

  if (!error) return <PageLoader label="Signing you in…" />

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-bad-soft text-bad-ink">
        <CircleAlert aria-hidden className="size-6" />
      </div>
      <h1 className="text-xl font-semibold text-ink">Couldn't sign you in</h1>
      <p className="mt-2 text-sm text-ink-2">{error}</p>
      <ButtonLink to="/login" className="mt-6">
        Back to sign in
      </ButtonLink>
    </div>
  )
}
