import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { PageLoader } from './components/ui/States'
import { NotFoundPage, RouteErrorPage } from './pages/ErrorPages'
import { HomePage } from './pages/HomePage'
import { ProtectedRoute, PublicOnlyRoute } from './routes/guards'

// The home page ships in the main bundle; every other page is its own chunk,
// fetched the first time someone navigates to it.
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <PageLoader />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/oauth/callback',
        lazy: async () => ({ Component: (await import('./pages/OAuthCallbackPage')).OAuthCallbackPage }),
      },
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', lazy: async () => ({ Component: (await import('./pages/LoginPage')).LoginPage }) },
          { path: '/signup', lazy: async () => ({ Component: (await import('./pages/SignupPage')).SignupPage }) },
          {
            path: '/forgot-password',
            lazy: async () => ({ Component: (await import('./pages/ForgotPasswordPage')).ForgotPasswordPage }),
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/interviews/new',
            lazy: async () => ({ Component: (await import('./pages/NewInterviewPage')).NewInterviewPage }),
          },
          {
            path: '/interviews/:id',
            lazy: async () => ({ Component: (await import('./pages/InterviewPage')).InterviewPage }),
          },
          {
            path: '/dashboard',
            lazy: async () => ({ Component: (await import('./pages/dashboard/DashboardLayout')).DashboardLayout }),
            children: [
              {
                index: true,
                lazy: async () => ({ Component: (await import('./pages/dashboard/OverviewPage')).OverviewPage }),
              },
              {
                path: 'history',
                lazy: async () => ({ Component: (await import('./pages/dashboard/HistoryPage')).HistoryPage }),
              },
              {
                path: 'leaderboard',
                lazy: async () => ({ Component: (await import('./pages/dashboard/LeaderboardPage')).LeaderboardPage }),
              },
              {
                path: 'settings',
                lazy: async () => ({ Component: (await import('./pages/dashboard/SettingsPage')).SettingsPage }),
              },
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
