import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { AuthCard } from '../components/auth/AuthCard'
import { Divider, OAuthButtons } from '../components/auth/OAuthButtons'
import { Button } from '../components/ui/Button'
import { Field, FormError, Input, PasswordInput } from '../components/ui/Field'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // On success PublicOnlyRoute redirects (back to where the user was headed).
      await login(email.trim(), password)
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue practising."
      footer={
        <>
          New to Vivacity?{' '}
          <Link to="/signup" className="font-medium text-accent-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <OAuthButtons verb="Continue" />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
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
        <div className="space-y-1.5">
          <Field label="Password">
            {(p) => (
              <PasswordInput
                id={p.id}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          <div className="text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-accent-ink hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  )
}
