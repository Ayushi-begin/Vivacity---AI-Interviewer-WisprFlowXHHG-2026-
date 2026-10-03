import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastContext, type ToastContextValue } from './useToast'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const DURATION_MS = { success: 3500, info: 4500, error: 6000 }
const MAX_VISIBLE = 3

const STYLES: Record<ToastKind, { icon: typeof Info; iconClass: string; label: string }> = {
  success: { icon: CircleCheck, iconClass: 'text-good-ink', label: 'Success' },
  error: { icon: CircleAlert, iconClass: 'text-bad-ink', label: 'Error' },
  info: { icon: Info, iconClass: 'text-accent-ink', label: 'Info' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++nextId.current
      setToasts((current) => {
        // The same message twice in a row (e.g. two failed requests) shows once.
        if (current.some((toast) => toast.message === message)) return current
        return [...current, { id, kind, message }].slice(-MAX_VISIBLE)
      })
      window.setTimeout(() => dismiss(id), DURATION_MS[kind])
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // One persistent live region announces each new toast once.
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => {
          const { icon: Icon, iconClass, label } = STYLES[toast.kind]
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-overlay"
            >
              <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${iconClass}`} />
              <p className="flex-1 text-sm text-ink">
                <span className="sr-only">{label}: </span>
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
