import { LayoutDashboard, LogOut, Monitor, Palette, Plus, Settings } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '../../context/useAuth'
import { useTheme } from '../../context/useTheme'
import { THEMES } from '../../theme/themes'
import { ThemeDots } from '../theme/ThemePreview'
import { ButtonLink } from '../ui/Button'
import { Logo } from '../ui/Logo'
import { DropdownMenu, MenuButton, MenuLabel, MenuLink, MenuRadio, MenuSeparator } from '../ui/Menu'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
    isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
  }`

const iconButton =
  'flex size-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink aria-expanded:bg-surface-2 aria-expanded:text-ink'

function initials(name: string | null, email: string) {
  const source = name?.trim() || email
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

function ThemeMenu() {
  const { preference, setPreference } = useTheme()
  return (
    <DropdownMenu
      label="Choose theme"
      trigger={<Palette className="size-[18px]" aria-hidden />}
      triggerClassName={iconButton}
      menuClassName="w-60"
    >
      <MenuLabel>Theme</MenuLabel>
      <MenuRadio checked={preference === 'system'} onSelect={() => setPreference('system')}>
        <span className="flex size-5 items-center justify-center" aria-hidden>
          <Monitor className="size-4" />
        </span>
        Match system
      </MenuRadio>
      {THEMES.map((theme) => (
        <MenuRadio key={theme.id} checked={preference === theme.id} onSelect={() => setPreference(theme.id)}>
          <ThemeDots id={theme.id} mode={theme.mode} />
          {theme.label}
        </MenuRadio>
      ))}
    </DropdownMenu>
  )
}

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6" aria-label="Main">
        <Logo to={user ? '/dashboard' : '/'} />

        {user && (
          <div className="ml-6 hidden items-center gap-1 md:flex">
            <NavLink to="/dashboard" className={navLinkClass}>
              <LayoutDashboard aria-hidden className="size-4" /> Dashboard
            </NavLink>
            <NavLink to="/interviews/new" className={navLinkClass}>
              <Plus aria-hidden className="size-4" /> New interview
            </NavLink>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ThemeMenu />
          {user ? (
            <DropdownMenu
              label="Account menu"
              menuClassName="w-64"
              triggerClassName="ml-1 flex items-center rounded-full p-0.5 transition-shadow hover:ring-2 hover:ring-line-strong aria-expanded:ring-2 aria-expanded:ring-accent"
              trigger={
                user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="size-9 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink"
                  >
                    {initials(user.full_name, user.email)}
                  </span>
                )
              }
            >
              <div className="px-2.5 pt-1.5 pb-2.5">
                <p className="truncate text-sm font-semibold text-ink">{user.full_name || 'Your account'}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              <MenuSeparator />
              <div className="md:hidden">
                <MenuLink to="/dashboard">
                  <LayoutDashboard aria-hidden className="size-4" /> Dashboard
                </MenuLink>
                <MenuLink to="/interviews/new">
                  <Plus aria-hidden className="size-4" /> New interview
                </MenuLink>
              </div>
              <MenuLink to="/dashboard/settings">
                <Settings aria-hidden className="size-4" /> Settings
              </MenuLink>
              <MenuSeparator />
              <MenuButton onSelect={signOut}>
                <LogOut aria-hidden className="size-4" /> Sign out
              </MenuButton>
            </DropdownMenu>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost" size="sm" className="ml-1">
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
