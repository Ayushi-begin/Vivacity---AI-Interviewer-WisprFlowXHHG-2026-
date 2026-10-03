import { useState } from 'react'
import { checkOAuthProvider, oauthLoginUrl } from '../../api/auth'
import type { OAuthProvider } from '../../api/types'
import { useToast } from '../../context/useToast'
import { Button } from '../ui/Button'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.65z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.87-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.79-2.12-6.73-4.97H1.27v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.1z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.27 6.62l4 3.1C6.21 6.87 8.87 4.75 12 4.75z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57L9 21.07c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .32.21.69.82.57A12 12 0 0 0 12 .3" />
    </svg>
  )
}

const PROVIDERS: { id: OAuthProvider; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'github', label: 'GitHub', Icon: GitHubIcon },
]

export function OAuthButtons({ verb }: { verb: 'Continue' | 'Sign up' }) {
  const toast = useToast()
  const [pending, setPending] = useState<OAuthProvider | null>(null)

  const start = async (provider: OAuthProvider) => {
    setPending(provider)
    const problem = await checkOAuthProvider(provider)
    if (problem) {
      toast.error(problem)
      setPending(null)
      return
    }
    // Full-page navigation: the backend redirects to the provider and back to /oauth/callback.
    window.location.assign(oauthLoginUrl(provider))
  }

  return (
    <div className="grid gap-2.5">
      {PROVIDERS.map(({ id, label, Icon }) => (
        <Button
          key={id}
          variant="secondary"
          size="lg"
          className="w-full text-sm"
          loading={pending === id}
          disabled={pending !== null}
          onClick={() => start(id)}
        >
          {pending !== id && <Icon />}
          {verb} with {label}
        </Button>
      ))}
    </div>
  )
}

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted uppercase" role="separator">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
