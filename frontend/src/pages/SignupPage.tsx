import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { getErrorMessage } from '../api/errors'
import { AuthCard } from '../components/auth/AuthCard'
import { Divider, OAuthButtons } from '../components/auth/OAuthButtons'
import { Button } from '../components/ui/Button'
import { Field, FormError, Input, PasswordInput } from '../components/ui/Field'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'

const MIN_PASSWORD = 8

export function SignupPage() {
  const { register } = useAuth()
  const toast = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordError =
    touched && password.length > 0 && password.length < MIN_PASSWORD
      ? `Use at least ${MIN_PASSWORD} characters.`
      : null

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (password.length < MIN_PASSWORD) return
    setError(null)
    setSubmitting(true)
    try {
      await register({ email: email.trim(), password, full_name: name.trim() || undefined })
      // On success PublicOnlyRoute redirects to the first interview.
      toast.success('Account created. Welcome to Vivacity!')
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Practise interviews tailored to your resume."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons verb="Sign up" />
      <Divider />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Name" hint="Shown on the leaderboard. You can change it later.">
          {(p) => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              autoComplete="name"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          )}
        </Field>
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
        <Field label="Password" hint={`At least ${MIN_PASSWORD} characters.`} error={passwordError}>
          {(p) => (
            <PasswordInput
              id={p.id}
              aria-describedby={p.describedBy}
              invalid={p.invalid}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!email || !password}>
          Create account
        </Button>
      </form>
    </AuthCard>
  )
}
