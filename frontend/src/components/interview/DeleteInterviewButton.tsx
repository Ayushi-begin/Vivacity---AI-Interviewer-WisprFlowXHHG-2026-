import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { getErrorMessage } from '../../api/errors'
import { deleteInterview } from '../../api/interviews'
import { useToast } from '../../context/useToast'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'

/** A delete button plus its confirmation dialog. `compact` shows only the icon. */
export function DeleteInterviewButton({
  interview,
  onDeleted,
  compact = false,
}: {
  interview: { id: string; role: string; company: string }
  onDeleted: () => void
  compact?: boolean
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = `${interview.role} at ${interview.company}`

  const confirm = async () => {
    setBusy(true)
    try {
      await deleteInterview(interview.id)
      toast.success('Interview deleted.')
      setOpen(false)
      onDeleted()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant={compact ? 'ghost' : 'danger'}
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={compact ? `Delete interview: ${name}` : undefined}
        className={compact ? 'size-11 shrink-0 px-0 text-muted hover:text-bad-ink' : ''}
      >
        <Trash2 aria-hidden className="size-4" />
        {!compact && 'Delete'}
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this interview?"
        confirmLabel="Delete interview"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <strong className="font-medium text-ink">{name}</strong> will be removed with its answers, scores,
        roadmap and uploaded resume. This can't be undone.
      </ConfirmDialog>
    </>
  )
}
