# Vivacity — AI Mock Interviewer: Build Plan

The user uploads a resume and picks a role and a company. The app asks 3 questions based on the resume. After the third answer, it scores each answer out of 10 (what was good, what was missing, a better answer) and builds a study roadmap by topic for the weak areas. It also has an analytics dashboard and a leaderboard.

## Stack

- **Backend:** FastAPI, SQLAlchemy 2.x (async) + asyncpg, Alembic, PostgreSQL on Neon
- **AI:** LangGraph + OpenAI (structured output), Postgres checkpointer (psycopg 3)
- **Auth:** JWT (access + refresh), Google OAuth, GitHub OAuth
- **Frontend:** React + Vite + Tailwind

## 1. Folder structure

```
Vivacity/
├── CLAUDE.md
├── PLAN.md
├── .env.example                  # kept in sync; .env is owned by the user
├── backend/
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py                # async engine; ignores LangGraph's checkpoint tables
│   │   └── versions/
│   ├── requirements.txt / requirements-dev.txt
│   ├── app/
│   │   ├── main.py               # app, CORS, lifespan (opens checkpointer, builds graph)
│   │   ├── core/                 # config, security (JWT/passwords/OTP), exceptions
│   │   ├── api/                  # LAYER 1: routes (HTTP only, no logic)
│   │   │   ├── deps.py           # DBSession, CurrentUser, InterviewGraph
│   │   │   └── v1/               # health, auth, oauth, users, interviews, analytics
│   │   ├── services/             # LAYER 2: business logic, owns commits
│   │   │   ├── auth_service.py, oauth_service.py, notification_service.py
│   │   │   ├── interview_service.py  # drives the graph, syncs results to SQL
│   │   │   └── analytics_service.py  # analytics + leaderboard
│   │   ├── repositories/         # LAYER 3: database access only
│   │   │   ├── user_repo, oauth_account_repo, refresh_token_repo, password_reset_repo
│   │   │   ├── resume_repo, interview_repo
│   │   │   └── analytics_repo.py # all the maths in SQL (aggregates, window functions)
│   │   ├── db/                   # engine/session, Declarative Base
│   │   ├── models/               # SQLAlchemy ORM
│   │   ├── schemas/              # Pydantic request/response
│   │   ├── integrations/         # Google/GitHub OAuth, PDF text extraction, file storage
│   │   └── agents/               # LangGraph + OpenAI (called only by services, no DB)
│   │       ├── interview_graph.py   # generate → answer ×3 (interrupt) → evaluate → roadmap
│   │       ├── checkpointer.py      # AsyncPostgresSaver on a psycopg pool
│   │       ├── llm.py               # StructuredLLM protocol + OpenAI implementation
│   │       ├── schemas.py           # structured-output schemas for the LLM
│   │       ├── state.py
│   │       └── prompts/             # editable *.system.md / *.user.md templates
│   ├── uploads/                  # local resume storage (gitignored)
│   └── tests/                    # SQLite + FakeLLM + InMemorySaver; no network
└── frontend/                     # Vite + React 19 + TypeScript + Tailwind v4 + React Router
    ├── vite.config.ts            # envDir '..' → reads VITE_* from the root .env
    ├── e2e/run.mjs               # Playwright (installed Edge) desktop + mobile tests
    └── src/
        ├── main.tsx, App.tsx     # providers + route table
        ├── index.css             # design tokens (light/dark), shared with charts
        ├── api/                  # ALL HTTP calls: client (JWT, refresh, 401 logout), auth, interviews, analytics
        ├── context/              # AuthContext, ThemeContext, ToastContext
        ├── hooks/useApi.ts       # loading / error / data for page loads
        ├── routes/guards.tsx     # ProtectedRoute, PublicOnlyRoute (owns post-login redirect)
        ├── components/           # ui/, layout/ (Navbar), auth/, interview/ (chat, results), dashboard/ (chart)
        └── pages/                # Home, Login, Signup, ForgotPassword, OAuthCallback, NewInterview,
                                  # Interview (chat → results), dashboard/{Overview, History, Leaderboard, Settings}
```

**Layer rule:** routes → services → repositories → DB. Agents and integrations are called only from services and never touch the DB.

## 2. Tables

| Table | Key columns |
|---|---|
| **users** | id (uuid PK), email (unique), full_name, avatar_url, hashed_password (nullable, null for OAuth-only users), is_active, created_at, updated_at |
| **oauth_accounts** | id, user_id → users, provider (`google`/`github`), provider_user_id, created_at · unique(provider, provider_user_id) |
| **refresh_tokens** | id, user_id → users, token_hash, expires_at, revoked_at |
| **password_reset_otps** | id, user_id → users, otp_hash (HMAC), expires_at, attempts, used_at, created_at |
| **resumes** | id, user_id → users, filename, storage_path, parsed_text, parsed_data (JSONB, unused for now), created_at |
| **interviews** | id, user_id → users, resume_id → resumes (SET NULL), role, company, status (`in_progress`/`completed`), total_score (0–30, summed in SQL), created_at, completed_at · index(user_id), index(status, total_score), index(user_id, completed_at) |
| **questions** | id, interview_id → interviews, position (1–3), question_text, focus_area (topic), what_it_tests · unique(interview_id, position) |
| **answers** | id, question_id → questions (unique), answer_text, score (0–10, null until evaluated), what_was_good, what_was_missing, better_answer, weak_topics (JSONB), evaluated_at, created_at |
| **roadmaps** | id, interview_id → interviews (unique), summary, weak_areas (JSONB), items (JSONB: topic, priority, why, study_steps, resources, estimated_hours), created_at |

- **LangGraph checkpoint tables** (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) are created by the checkpointer's own `setup()` at startup, not by Alembic. The thread_id is the interview id.
- The leaderboard and analytics are SQL queries over completed interviews, not their own tables.

## 3. Endpoint build order

All routes are under `/api/v1`.

| # | Phase | Endpoints |
|---|---|---|
| 0 | Foundation ✅ | `GET /health` · config, async DB session (Neon), CORS, all models, Alembic |
| 1 | Email auth ✅ | `POST /auth/register` · `/login` · `/refresh` · `/logout` · `/forgot-password` · `/reset-password` (OTP printed to console) · `GET /users/me` |
| 2 | OAuth ✅ | `GET /auth/{google\|github}/login` · `/callback` (redirects to `{FRONTEND_URL}/oauth/callback#access_token=…`, or `#error=…`) |
| 3–6 | Interview flow ✅ | `POST /interviews` (multipart: resume PDF, role, company) creates the 3 questions · `POST /interviews/{id}/answers` {question_id, answer} (the 3rd answer starts scoring and the roadmap in the background, `processing: true`) · `POST /interviews/{id}/retry` (resumes after an AI failure, also in the background) · `GET /interviews/{id}` (poll while `processing`) · `GET /interviews/{id}/roadmap` · `DELETE /interviews/{id}` (also removes the resume file and the LangGraph checkpoint) |
| 7 | History + analytics ✅ | `GET /interviews?limit=&offset=` · `GET /analytics/me` (summary, scores over time, strong/weak topics) |
| 8 | Leaderboard ✅ | `GET /leaderboard?period=week\|month\|all&role=&company=&limit=` |
| 9 | Profile ✅ | `PATCH /users/me` {full_name} (display name for the leaderboard) · `/users/me` returns `has_password` |
| 10 | Frontend ✅ | All pages above, desktop + mobile, five themes + system |
| 11 | Hardening ✅ | Background scoring, interview deletion, rate limits, security headers, strict CORS, JWT secret ≥ 32 chars, prompt-delimiter defanging, route-level code splitting |

## 4. Decisions

- **Leaderboard metric:** each user's best total score (out of 30), with ties broken by average score and ties sharing a rank. It can be filtered by role, company (case-insensitive) and period. It shows **names only**, never emails or ids, with "Anonymous" when there's no name. The response also includes your own row even if you're outside the top N.
- **Strong/weak topics:** average answer score per topic (in SQL). A topic averaging 7 or more is strong; below 7 is weak. That matches the cut-off the graph uses for weak areas.
- **Roadmap weak areas:** topics of answers scoring below 7 come first, then the evaluator's suggested topics. The list is de-duplicated and capped at 6.
- **Interview durability:** answers are committed to SQL as they arrive, and the graph is checkpointed in Postgres. After the 3rd answer a background task feeds the stored answers to the graph, scores them and writes the roadmap; the API reports `processing: true` until it's done and the client polls. If an LLM step fails, nothing is lost: the interview shows as needing a retry, and `/retry` resumes from that step without re-running finished steps. Which interviews are processing is tracked in-process (one API instance); after a restart they simply show as retryable.
- **Deleting an interview** removes its questions, answers and roadmap (cascade), its resume row and PDF file, and its LangGraph checkpoint thread. It's refused (409) while scoring is running.
- **Abuse protection:** in-memory sliding-window rate limits: per IP on login (10/min), signup (10/h), refresh (30/min), forgot-password (5/15 min), reset-password (10/15 min) and OAuth; per user on starting interviews (10/h), answering (30/min) and retrying (10/10 min). Toggle with `RATE_LIMIT_ENABLED`. With several API instances, move this to Redis.
- **Ownership:** every interview lookup filters by the current user. Other users' interviews return 404, not 403, so ids can't be probed.
- **Resume storage:** local `backend/uploads/<user_id>/<uuid>.pdf` for now. Only PDFs with real text are accepted (5 MB max, scanned PDFs are rejected).
- **Tokens:** the access token is a JWT (30 min). The refresh token is an opaque string stored hashed. It rotates on every refresh, and replaying an old one revokes all of the user's sessions.
- **OAuth account linking:** a Google/GitHub login links to an existing account only when the provider reports the email as verified.
- **Password reset:** OTPs expire after 10 minutes, lock after 5 wrong tries, and are single-use. A new request invalidates the previous code, and a successful reset signs out every session.
