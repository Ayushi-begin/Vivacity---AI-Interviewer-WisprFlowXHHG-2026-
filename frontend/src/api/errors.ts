import { isAxiosError } from 'axios'

/** Turn any thrown value into a sentence that's safe to show the user. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!isAxiosError(error)) return error instanceof Error ? error.message : fallback

  if (error.code === 'ECONNABORTED') return 'The request took too long. Please try again.'
  if (!error.response) return "Can't reach the server. Check your connection and that the API is running."

  const detail = (error.response.data as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string') return detail
  // FastAPI validation errors: [{ loc, msg, ... }]
  if (Array.isArray(detail) && detail[0]?.msg) {
    const field = detail[0].loc?.at(-1)
    const msg = String(detail[0].msg).replace(/^Value error, /, '')
    return field && typeof field === 'string' ? `${humanize(field)}: ${msg}` : msg
  }
  if (error.response.status >= 500) return 'The server had a problem. Please try again in a moment.'
  return fallback
}

export function getStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined
}

function humanize(field: string) {
  const text = field.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
