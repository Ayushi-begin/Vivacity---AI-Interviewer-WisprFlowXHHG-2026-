import { Compass, TriangleAlert } from 'lucide-react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <Compass aria-hidden className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-2">That link doesn’t go anywhere. It may be mistyped or out of date.</p>
      <ButtonLink to="/" className="mt-6">
        Go home
      </ButtonLink>
    </div>
  )
}

/** Last-resort boundary for errors thrown while rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  console.error(error)
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center" role="alert">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-bad-soft text-bad-ink">
        <TriangleAlert aria-hidden className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-ink-2">An unexpected error occurred. Reloading usually fixes it.</p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
        >
          Reload
        </button>
        <ButtonLink to="/" variant="secondary" reloadDocument>
          Go home
        </ButtonLink>
      </div>
    </div>
  )
}
