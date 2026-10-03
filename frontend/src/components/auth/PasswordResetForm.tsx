import { MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { forgotPassword, resetPassword } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { Button } from '../ui/Button'
import { Field, FormError, Input, PasswordInput } from '../ui/Field'

/**
 * Two steps: request a 6-digit code, then enter it with a new password.
 * Used by the forgot-password page and by Settings (where the email is fixed).
 */
export function PasswordResetForm({
  fixedEmail,
  submitLabel = 'Reset password',
  onDone,
}: {
  fixedEmail?: string
  submitLabel?: string
  onDone: () => void
}) {
  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const request = async (event?: FormEvent) => {
    event?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await forgotPassword(email.trim())
      setStep('verify')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await resetPassword({ email: email.trim(), otp, new_password: password })
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  if (step === 'request') {
    return (
      <form onSubmit={request} className="space-y-4" noValidate>
        <FormError message={error} />
        {!fixedEmail && (
          <Field label="Email">
            {(p) => (
              <Input
                id={p.id}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            )}
          </Field>
        )}
        <Button type="submit" size={fixedEmail ? 'md' : 'lg'} className={fixedEmail ? '' : 'w-full'} loading={busy} disabled={!email}>
          Send code
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-2" role="status">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-ink" />
        <p>
          If <span className="font-medium text-ink">{email}</span> has an account, a 6-digit code is on its way. It
          expires in 10 minutes.{' '}
          <span className="text-muted">(In development, the code is printed in the backend console.)</span>
        </p>
      </div>
      <FormError message={error} />
      <Field label="6-digit code">
        {(p) => (
          <Input
            id={p.id}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center font-mono text-lg tracking-[0.5em]"
            placeholder="••••••"
          />
        )}
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        {(p) => (
          <PasswordInput
            id={p.id}
            aria-describedby={p.describedBy}
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={otp.length !== 6 || password.length < 8}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={() => request()} disabled={busy}>
          Send a new code
        </Button>
      </div>
    </form>
  )
}
