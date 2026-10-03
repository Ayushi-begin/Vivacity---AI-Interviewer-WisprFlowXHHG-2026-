import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { HistoryPage } from './pages/dashboard/HistoryPage'
import { LeaderboardPage } from './pages/dashboard/LeaderboardPage'
import { OverviewPage } from './pages/dashboard/OverviewPage'
import { SettingsPage } from './pages/dashboard/SettingsPage'
import { NotFoundPage, RouteErrorPage } from './pages/ErrorPages'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { InterviewPage } from './pages/InterviewPage'
import { LoginPage } from './pages/LoginPage'
import { NewInterviewPage } from './pages/NewInterviewPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { SignupPage } from './pages/SignupPage'
import { ProtectedRoute, PublicOnlyRoute } from './routes/guards'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/oauth/callback', element: <OAuthCallbackPage /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/interviews/new', element: <NewInterviewPage /> },
          { path: '/interviews/:id', element: <InterviewPage /> },
          {
            path: '/dashboard',
            element: <DashboardLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'history', element: <HistoryPage /> },
              { path: 'leaderboard', element: <LeaderboardPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
