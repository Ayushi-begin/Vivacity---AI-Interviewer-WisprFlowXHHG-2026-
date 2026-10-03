import { LogOut } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { updateMe } from '../../api/auth'
import { getErrorMessage } from '../../api/errors'
import { PasswordResetForm } from '../../components/auth/PasswordResetForm'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, FormError, Input } from '../../components/ui/Field'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useAuth } from '../../context/AuthContext'
import { useTheme, type ThemePreference } from '../../context/ThemeContext'
import { useToast } from '../../context/ToastContext'

export function SettingsPage() {
  const { user, setUser, logout } = useAuth()
  const { preference, setPreference } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()

  const [name, setName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordFormKey, setPasswordFormKey] = useState(0)

  if (!user) return null
  const dirty = name.trim() !== (user.full_name ?? '')

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const updated = await updateMe({ full_name: name.trim() || null })
      setUser(updated)
      setName(updated.full_name ?? '')
      toast.success('Profile saved.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader title="Profile" description="Your name is what others see on the leaderboard." />
        <form onSubmit={saveProfile} className="space-y-4 p-5" noValidate>
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" hint="Leave blank to appear as “Anonymous”.">
              {(p) => (
                <Input
                  id={p.id}
                  aria-describedby={p.describedBy}
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              )}
            </Field>
            <Field label="Email" hint="Never shown to other users.">
              {(p) => <Input id={p.id} aria-describedby={p.describedBy} value={user.email} readOnly disabled />}
            </Field>
          </div>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Appearance" description="Choose light, dark, or match your device." />
        <div className="p-5">
          <SegmentedControl<ThemePreference>
            label="Theme"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title={user.has_password ? 'Change password' : 'Set a password'}
          description={
            user.has_password
              ? 'We’ll send a 6-digit code to your email to confirm it’s you.'
              : 'You signed up with Google or GitHub. Add a password to also sign in with your email.'
          }
        />
        <div className="p-5">
          <PasswordResetForm
            key={passwordFormKey}
            fixedEmail={user.email}
            submitLabel={user.has_password ? 'Update password' : 'Set password'}
            onDone={() => {
              // Resetting a password signs out every session, this one included.
              toast.success('Password updated. Please sign in again.')
              setPasswordFormKey((k) => k + 1)
              void logout().then(() => navigate('/login', { replace: true }))
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Session" description="Sign out of Vivacity on this device." />
        <div className="p-5">
          <Button
            variant="danger"
            onClick={async () => {
              await logout()
              navigate('/', { replace: true })
            }}
          >
            <LogOut aria-hidden className="size-4" /> Sign out
          </Button>
        </div>
      </Card>
    </div>
  )
}
