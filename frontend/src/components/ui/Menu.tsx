import { Check } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link, type LinkProps } from 'react-router'

/**
 * Accessible dropdown menu (WAI-ARIA menu button pattern):
 * - Enter/Space/ArrowDown on the button opens it and focuses the first (or checked) item.
 * - ArrowUp/ArrowDown/Home/End move between items. Escape closes and returns focus.
 * - Tab, outside clicks and choosing an item close it.
 */
const MenuContext = createContext<{ close: (refocus?: boolean) => void } | null>(null)

export function DropdownMenu({
  label,
  trigger,
  triggerClassName = '',
  menuClassName = 'w-56',
  children,
}: {
  label: string
  trigger: ReactNode
  triggerClassName?: string
  menuClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }, [])

  // On open, focus the checked item (for radio menus) or the first one.
  useEffect(() => {
    if (!open) return
    const list = items()
    ;(list.find((el) => el.getAttribute('aria-checked') === 'true') ?? list[0])?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const focus = (i: number) => list[(i + list.length) % list.length]?.focus()
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focus(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focus(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focus(0)
        break
      case 'End':
        event.preventDefault()
        focus(list.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        close()
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <MenuContext.Provider value={{ close }}>
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className={`absolute right-0 z-50 mt-2 origin-top-right animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-overlay ${menuClassName}`}
          >
            {children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  )
}

function useMenu() {
  const context = useContext(MenuContext)
  if (!context) throw new Error('Menu items must be inside <DropdownMenu>')
  return context
}

const itemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink-2 outline-none hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink focus-visible:outline-none'

export function MenuLink({ children, ...props }: LinkProps) {
  const { close } = useMenu()
  return (
    <Link role="menuitem" tabIndex={-1} className={itemClass} onClick={() => close(false)} {...props}>
      {children}
    </Link>
  )
}

export function MenuButton({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  const { close } = useMenu()
  return (
    <button
      role="menuitem"
      type="button"
      tabIndex={-1}
      className={itemClass}
      onClick={() => {
        close(false)
        onSelect()
      }}
    >
      {children}
    </button>
  )
}

export function MenuRadio({
  checked,
  children,
  onSelect,
}: {
  checked: boolean
  children: ReactNode
  onSelect: () => void
}) {
  const { close } = useMenu()
  return (
    <button
      role="menuitemradio"
      type="button"
      tabIndex={-1}
      aria-checked={checked}
      className={`${itemClass} ${checked ? 'text-ink' : ''}`}
      onClick={() => {
        onSelect()
        close()
      }}
    >
      {children}
      <Check aria-hidden className={`ml-auto size-4 text-accent-ink ${checked ? 'opacity-100' : 'opacity-0'}`} />
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{children}</div>
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />
}
