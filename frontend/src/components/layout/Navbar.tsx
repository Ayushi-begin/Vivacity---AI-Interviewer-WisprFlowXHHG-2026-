import { LayoutDashboard, LogOut, Menu, Moon, Plus, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { ButtonLink } from '../ui/Button'
import { Logo } from '../ui/Logo'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
  }`

function initials(name: string | null, email: string) {
  const source = name?.trim() || email
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  )
}

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The menu remembers which page it was opened on, so navigating closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const menuOpen = openedOn === location.pathname
  const setMenuOpen = (open: boolean) => setOpenedOn(open ? location.pathname : null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on Escape and on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false)
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  const signOut = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6" aria-label="Main">
        <Logo to={user ? '/dashboard' : '/'} />

        {user && (
          <div className="ml-6 hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" className={navLinkClass}>
              <LayoutDashboard className="size-4" /> Dashboard
            </NavLink>
            <NavLink to="/interviews/new" className={navLinkClass}>
              <Plus className="size-4" /> New interview
            </NavLink>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface-2"
              >
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="size-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                    {initials(user.full_name, user.email)}
                  </span>
                )}
                <Menu className="size-4 text-muted md:hidden" aria-hidden />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 animate-fade-in rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
                >
                  <div className="border-b border-line px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-ink">{user.full_name || 'Your account'}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="py-1 md:hidden">
                    <NavLink role="menuitem" to="/dashboard" className={navLinkClass} end>
                      <LayoutDashboard className="size-4" /> Dashboard
                    </NavLink>
                    <NavLink role="menuitem" to="/interviews/new" className={navLinkClass}>
                      <Plus className="size-4" /> New interview
                    </NavLink>
                  </div>
                  <NavLink role="menuitem" to="/dashboard/settings" className={navLinkClass}>
                    <Settings className="size-4" /> Settings
                  </NavLink>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm">
                Log in
              </ButtonLink>
              <ButtonLink to="/signup" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

