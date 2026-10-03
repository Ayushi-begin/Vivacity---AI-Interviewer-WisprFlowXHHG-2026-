// Mirrors the backend's Pydantic response schemas (backend/app/schemas).

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface User {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  has_password: boolean
  created_at: string
}

export type InterviewStatus = 'in_progress' | 'completed'

export interface Answer {
  answer_text: string
  score: number | null
  what_was_good: string | null
  what_was_missing: string | null
  better_answer: string | null
  weak_topics: string[] | null
}

export interface Question {
  id: string
  position: number
  question: string
  topic: string | null
  what_it_tests: string | null
  answer: Answer | null
}

export interface RoadmapItem {
  topic: string
  priority: 'high' | 'medium' | 'low'
  why: string
  study_steps: string[]
  resources: string[]
  estimated_hours: number
}

export interface Roadmap {
  summary: string | null
  weak_areas: string[]
  items: RoadmapItem[]
  created_at: string
}

export interface Interview {
  id: string
  role: string
  company: string
  status: InterviewStatus
  total_score: number | null
  max_score: number
  created_at: string
  completed_at: string | null
  next_question: { id: string; position: number; question: string } | null
  questions: Question[]
  roadmap: Roadmap | null
  /** True while scoring (or a retry) runs on the server. Poll until it's false. */
  processing: boolean
}

export interface InterviewSummary {
  id: string
  role: string
  company: string
  status: InterviewStatus
  total_score: number | null
  max_score: number
  answered_count: number
  created_at: string
  completed_at: string | null
}

export interface InterviewList {
  items: InterviewSummary[]
  total: number
  limit: number
  offset: number
}

export interface TopicStat {
  topic: string
  answers: number
  average_score: number
}

export interface ScorePoint {
  interview_id: string
  role: string
  company: string
  completed_at: string
  total_score: number
  percentage: number
}

export interface Analytics {
  summary: {
    interviews_completed: number
    interviews_in_progress: number
    average_total: number | null
    best_total: number | null
    max_total: number
    average_answer_score: number | null
    max_answer_score: number
  }
  score_history: ScorePoint[]
  strong_topics: TopicStat[]
  weak_topics: TopicStat[]
}

export type LeaderboardPeriod = 'week' | 'month' | 'all'

export interface LeaderboardEntry {
  rank: number
  name: string
  best_score: number
  average_score: number
  interviews_completed: number
  is_you: boolean
}

export interface Leaderboard {
  period: LeaderboardPeriod
  role: string | null
  company: string | null
  max_score: number
  entries: LeaderboardEntry[]
  you: LeaderboardEntry | null
}

export type OAuthProvider = 'google' | 'github'
