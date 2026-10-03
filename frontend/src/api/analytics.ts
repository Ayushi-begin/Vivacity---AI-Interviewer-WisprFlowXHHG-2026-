import { api } from './client'
import type { Analytics, Leaderboard, LeaderboardPeriod } from './types'

export async function getMyAnalytics() {
  const { data } = await api.get<Analytics>('/analytics/me')
  return data
}

export async function getLeaderboard(params: {
  period: LeaderboardPeriod
  role?: string
  company?: string
  limit?: number
}) {
  const { data } = await api.get<Leaderboard>('/leaderboard', {
    params: {
      period: params.period,
      role: params.role || undefined,
      company: params.company || undefined,
      limit: params.limit ?? 20,
    },
  })
  return data
}
