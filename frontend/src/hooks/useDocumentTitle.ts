import { useEffect } from 'react'

const APP = 'Vivacity'

/** Unique, descriptive page titles (WCAG 2.4.2). The route announcer reads them out. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : `${APP} — AI mock interviews`
  }, [title])
}
