import { Bot, CornerDownLeft, User as UserIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

export const MAX_ANSWER_CHARS = 5000
const MIN_ANSWER_CHARS = 20

export function InterviewerBubble({ children, topic, label }: { children: ReactNode; topic?: string | null; label: string }) {
  return (
    <div className="flex animate-slide-up gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden>
        <Bot className="size-4" />
      </span>
      <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">{label}</span>
          {topic && <Badge tone="accent">{topic}</Badge>}
        </div>
        <div className="rounded-2xl rounded-tl-sm border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink">
          {children}
        </div>
      </div>
    </div>
  )
}

export function CandidateBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex animate-slide-up flex-row-reverse gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
        <UserIcon className="size-4" />
      </span>
      <div className="min-w-0 max-w-[85%] sm:max-w-[75%]">
        <p className="mb-1 text-right text-xs font-medium text-muted">You</p>
        <div className="rounded-2xl rounded-tr-sm bg-accent-soft px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
          {children}
        </div>
      </div>
    </div>
  )
}

// Drafts survive refreshes and tab closes. Storage can throw, so every access is guarded.
const draftKey = (interviewId: string, questionId: string) => `vivacity.draft.${interviewId}.${questionId}`

function loadDraft(key: string) {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* drafts are a convenience */
  }
}

export function AnswerComposer({
  interviewId,
  questionId,
  isLast,
  onSubmit,
}: {
  interviewId: string
  questionId: string
  isLast: boolean
  onSubmit: (answer: string) => Promise<boolean>
}) {
  const key = draftKey(interviewId, questionId)
  const [value, setValue] = useState(() => loadDraft(key))
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // The parent keys this component by question, so each question mounts fresh with its own draft.
  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  // Grow with the content, up to a limit.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
  }, [value])

  const trimmed = value.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_ANSWER_CHARS

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!trimmed || submitting) return
    setSubmitting(true)
    const ok = await onSubmit(trimmed)
    if (ok) saveDraft(key, '')
    else setSubmitting(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit()
  }

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface sm:p-3"
    >
      <label htmlFor="answer" className="sr-only">
        Your answer
      </label>
      <textarea
        ref={textareaRef}
        id="answer"
        value={value}
        maxLength={MAX_ANSWER_CHARS}
        rows={3}
        disabled={submitting}
        onChange={(e) => {
          setValue(e.target.value)
          saveDraft(key, e.target.value)
        }}
        onKeyDown={onKeyDown}
        placeholder="Type your answer as you'd say it out loud…"
        className="block w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none disabled:opacity-60 sm:border-0 sm:bg-transparent sm:px-2 sm:focus:ring-0"
      />
      <div className="mt-2 flex items-center gap-3">
        <p className="flex-1 text-xs text-muted" aria-live="polite">
          {tooShort
            ? 'A few sentences will get you much better feedback.'
            : value
              ? `${value.length.toLocaleString()} / ${MAX_ANSWER_CHARS.toLocaleString()} · Draft saved`
              : 'Your draft is saved as you type.'}
        </p>
        <span className="hidden text-xs text-muted sm:inline">Ctrl + Enter</span>
        <Button type="submit" loading={submitting} disabled={!trimmed}>
          {isLast ? 'Submit & get feedback' : 'Send answer'}
          {!submitting && <CornerDownLeft aria-hidden className="size-4" />}
        </Button>
      </div>
    </form>
  )
}
