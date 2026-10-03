import { Link, useNavigate } from 'react-router'
import { AuthCard } from '../components/auth/AuthCard'
import { PasswordResetForm } from '../components/auth/PasswordResetForm'
import { useToast } from '../context/useToast'

export function ForgotPasswordPage() {
  const toast = useToast()
  const navigate = useNavigate()
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll send you a 6-digit code to set a new one."
      footer={
        <Link to="/login" className="font-medium text-accent-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <PasswordResetForm
        onDone={() => {
          toast.success('Password updated. Sign in with your new password.')
          navigate('/login', { replace: true })
        }}
      />
    </AuthCard>
  )
}
