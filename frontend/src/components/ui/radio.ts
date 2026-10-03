import { useRef, type KeyboardEvent } from 'react'

/**
 * Keyboard support for custom radio groups (WAI-ARIA radio pattern): only the
 * selected option is in the tab order; arrow keys move and select, Home/End jump.
 */
export function useRadioGroup<T extends string>(values: readonly T[], value: T, onChange: (value: T) => void) {
  const refs = useRef(new Map<T, HTMLElement>())

  const move = (to: T) => {
    onChange(to)
    refs.current.get(to)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const index = values.indexOf(value)
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % values.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + values.length) % values.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = values.length - 1
    if (next === null) return
    event.preventDefault()
    move(values[next]!)
  }

  const optionProps = (option: T) => ({
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(option, el)
      else refs.current.delete(option)
    },
    role: 'radio' as const,
    'aria-checked': option === value,
    tabIndex: option === value ? 0 : -1,
    onClick: () => onChange(option),
  })

  return { onKeyDown, optionProps }
}
