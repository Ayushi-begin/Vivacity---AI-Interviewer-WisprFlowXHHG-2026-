import { FileText, UploadCloud, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'

const MAX_RESUME_MB = 5

function validateResume(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return 'Please choose a PDF file.'
  if (file.size > MAX_RESUME_MB * 1024 * 1024) return `That file is over ${MAX_RESUME_MB} MB.`
  if (file.size === 0) return 'That file is empty.'
  return null
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ResumeDropzone({
  file,
  onChange,
  error,
}: {
  file: File | null
  onChange: (file: File | null, error: string | null) => void
  error: string | null
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (picked: File | undefined) => {
    if (!picked) return
    onChange(picked, validateResume(picked))
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    pick(event.dataTransfer.files[0])
  }

  if (file && !error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
          <FileText aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
          <p className="text-xs text-muted">{formatSize(file.size)} · PDF</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null, null)
            if (inputRef.current) inputRef.current.value = ''
          }}
          className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
          aria-label="Remove resume"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : error ? 'border-bad/50 bg-bad-soft/40' : 'border-line bg-surface hover:border-accent/60 hover:bg-surface-2'
        }`}
      >
        <UploadCloud aria-hidden className={`size-8 ${dragging ? 'text-accent' : 'text-muted'}`} />
        <span className="mt-3 text-sm font-medium text-ink">
          <span className="text-accent-ink">Choose a PDF</span>
          <span className="hidden sm:inline"> or drag it here</span>
        </span>
        <span className="mt-1 text-xs text-muted">Text-based PDF, up to {MAX_RESUME_MB} MB</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Resume PDF"
          aria-invalid={Boolean(error) || undefined}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p className="mt-2 text-xs text-bad-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
