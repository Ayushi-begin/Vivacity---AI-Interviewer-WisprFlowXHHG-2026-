import { api } from './client'
import type { Interview, InterviewList, Roadmap } from './types'

export async function startInterview(input: { resume: File; role: string; company: string }) {
  const form = new FormData()
  form.append('resume', input.resume)
  form.append('role', input.role)
  form.append('company', input.company)
  const { data } = await api.post<Interview>('/interviews', form)
  return data
}

export async function getInterview(id: string) {
  const { data } = await api.get<Interview>(`/interviews/${id}`)
  return data
}

export async function listInterviews(params: { limit: number; offset: number }) {
  const { data } = await api.get<InterviewList>('/interviews', { params })
  return data
}

export async function submitAnswer(id: string, input: { question_id: string; answer: string }) {
  const { data } = await api.post<Interview>(`/interviews/${id}/answers`, input)
  return data
}

export async function retryInterview(id: string) {
  const { data } = await api.post<Interview>(`/interviews/${id}/retry`)
  return data
}

export async function getRoadmap(id: string) {
  const { data } = await api.get<Roadmap>(`/interviews/${id}/roadmap`)
  return data
}

/** A failed start returns 502 with "... Interview id: <uuid>" so the user can retry it. */
export function interviewIdFromError(message: string): string | null {
  return /Interview id: ([0-9a-f-]{36})/i.exec(message)?.[1] ?? null
}
