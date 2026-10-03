import { ArrowRight, Lightbulb } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { getErrorMessage, getStatus } from '../api/errors'
import { interviewIdFromError, startInterview } from '../api/interviews'
import { LoadingScreen } from '../components/interview/LoadingScreen'
import { ResumeDropzone } from '../components/interview/ResumeDropzone'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Field, FormError, Input } from '../components/ui/Field'
import { useToast } from '../context/useToast'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const ROLE_SUGGESTIONS = [
  'Software Engineer',
  'Backend Engineer',
  'Frontend Engineer',
  'Full Stack Engineer',
  'Data Scientist',
  'Machine Learning Engineer',
  'Product Manager',
  'DevOps Engineer',
  'Data Analyst',
]

export function NewInterviewPage() {
  useDocumentTitle('New interview')
  const navigate = useNavigate()
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const ready = file && !fileError && role.trim().length >= 2 && company.trim().length >= 2

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!file) {
      setFileError('Please choose your resume.')
      return
    }
    if (!ready) return
    setError(null)
    setSubmitting(true)
    try {
      const interview = await startInterview({ resume: file, role: role.trim(), company: company.trim() })
      navigate(`/interviews/${interview.id}`, { replace: true })
    } catch (err) {
      const message = getErrorMessage(err)
      // The interview was created but question generation failed: open it so the user can retry.
      const createdId = getStatus(err) === 502 ? interviewIdFromError(message) : null
      if (createdId) {
        toast.error("Questions couldn't be generated yet. You can retry from here.")
        navigate(`/interviews/${createdId}`, { replace: true })
        return
      }
      setError(message)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      {submitting && (
        <LoadingScreen
          title="Preparing your interview"
          steps={['Uploading your resume', 'Reading your experience', `Thinking like a ${company.trim() || 'hiring'} interviewer`, 'Writing your three questions']}
          note="This usually takes 5–15 seconds."
        />
      )}

      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">New mock interview</h1>
      <p className="mt-1 text-ink-2">Three questions based on your resume, for the role you want.</p>

      <Card className="mt-6 p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <FormError message={error} />
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink">Resume</span>
            <ResumeDropzone
              file={file}
              error={fileError}
              onChange={(picked, problem) => {
                setFile(picked)
                setFileError(problem)
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role">
              {(p) => (
                <>
                  <Input
                    id={p.id}
                    list="role-suggestions"
                    value={role}
                    maxLength={100}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Backend Engineer"
                    autoComplete="off"
                  />
                  <datalist id="role-suggestions">
                    {ROLE_SUGGESTIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </>
              )}
            </Field>
            <Field label="Company">
              {(p) => (
                <Input
                  id={p.id}
                  value={company}
                  maxLength={100}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Stripe"
                  autoComplete="organization"
                />
              )}
            </Field>
          </div>

          <div className="flex gap-3 rounded-xl bg-surface-2 p-4 text-sm text-ink-2">
            <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-ink" />
            <p>
              Answer like you would out loud: be specific, mention trade-offs and results. All three answers are
              scored together at the end.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={!ready} loading={submitting}>
            Start interview <ArrowRight aria-hidden className="size-4" />
          </Button>
        </form>
      </Card>
    </div>
  )
}
