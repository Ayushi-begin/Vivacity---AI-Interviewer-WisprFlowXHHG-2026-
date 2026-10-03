import { History, LayoutGrid, Plus, Settings, Trophy } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { ButtonLink } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/Card'
import { useAuth } from '../../context/useAuth'

const TABS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/dashboard/history', label: 'History', icon: History, end: false },
  { to: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false },
]

export function DashboardLayout() {
  const { user } = useAuth()
  const firstName = user?.full_name?.split(' ')[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : 'Dashboard'}
        description="Track your progress and keep practising."
        action={
          <ButtonLink to="/interviews/new" className="w-full sm:w-auto">
            <Plus aria-hidden className="size-4" /> New interview
          </ButtonLink>
        }
      />

      <nav aria-label="Dashboard sections" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                  }`
                }
              >
                <Icon aria-hidden className="size-4" /> {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  )
}
