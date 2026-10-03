# CLAUDE.md

Vivacity is an AI mock interviewer. The full plan (folder structure, tables, endpoint build order) is in [PLAN.md](PLAN.md). Follow it.

## Stack

FastAPI · async SQLAlchemy 2.x + asyncpg · Alembic · PostgreSQL (Neon) · LangGraph + OpenAI · JWT + Google/GitHub OAuth · React + Vite + Tailwind

## Rules

1. **Never read, create, edit or delete `.env`.** The user manages it. Keep `.env.example` in sync with every new env var, using placeholder values only and never real secrets.
2. **Keep the layering strict: routes → services → repositories → database.**
   - `app/api/` (routes) handles HTTP only: validation, dependencies, and calling services. No business logic and no DB access.
   - `app/services/` holds the business logic. It calls repositories, integrations and agents. Services own the transaction: they call `session.commit()`, and nothing else does.
   - `app/repositories/` is the only place that runs queries. It adds, flushes and selects, but never commits.
   - Routes never import repositories. The only ORM model they touch is the `CurrentUser` type from `app/api/deps.py`.
   - Services signal failures by raising `AppError` subclasses from `app/core/exceptions.py`. Routes don't catch or translate them.
   - Slow AI work (scoring, retries) runs after the response as a FastAPI `BackgroundTasks` job. The route schedules a service function and passes it the `SessionFactory` dependency, because the request's session is closed by then. The API reports `processing: true` meanwhile and the client polls.
   - Abuse-prone endpoints get a limit from `app/api/rate_limits.py` (`per_ip` for anonymous auth endpoints, `per_user` for anything that calls the LLM).
3. **LangGraph agents live in `app/agents/`, and third-party clients (OAuth, PDF, file storage) live in `app/integrations/`.** Only services call them, and they never access the database.
   - LLM prompts are Markdown files in `app/agents/prompts/` (`<step>.system.md` and `<step>.user.md`, with `$placeholder` syntax). Edit prompts there, never inline in Python. Wrap untrusted text (resume, answers) in tags such as `<resume>…</resume>`; `prompts.render` defangs any of the template's tags that appear inside values, so they can't break out.
   - LLM output always goes through structured-output schemas in `app/agents/schemas.py`. These are strict JSON schemas: every field is required, with no defaults and no numeric bounds. Ranges are enforced in the graph.
   - Graph nodes call the model only through the `StructuredLLM` protocol (`app/agents/llm.py`), so tests can swap in `tests/fakes.FakeLLM`.
4. **All DB access is async** (SQLAlchemy 2.x `AsyncSession` + asyncpg). The one exception is the LangGraph checkpointer, which uses its own psycopg pool.
5. **Every schema change goes through an Alembic migration.** Never edit tables by hand. The exception is LangGraph's checkpoint tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`): its `setup()` manages them, and `alembic/env.py` ignores them.
6. **Users only ever see their own data.** Every interview lookup goes through `interview_repo.get_for_user` (filtered by owner). Return 404, not 403, for other users' resources. Public listings such as the leaderboard expose names only, never emails or ids.
7. **Do the maths in SQL** (sums, averages, ranks) in `app/repositories/analytics_repo.py`. Keep queries portable (aggregates, CASE, FILTER, window functions) so they also run on the SQLite test DB. Cast to `Numeric` before `round()`, because Postgres has no `round(double precision, int)`.
8. **Build endpoints in the order given in PLAN.md** (phases 0–8). Build the frontend pages alongside each phase.
9. Pydantic schemas live in `app/schemas/` and ORM models in `app/models/`. Keep them separate.
10. Config is read only through `app/core/config.py` (pydantic-settings), never through `os.environ` scattered across the code.
11. Dependencies are pinned in `backend/requirements.txt`, and test-only ones in `requirements-dev.txt`. Add new ones with an exact version.
12. **Every endpoint gets tests** in `backend/tests/`. Tests use in-memory SQLite through `get_session` and `get_session_factory` overrides (background tasks finish before the test client returns). They mock the LLM with `FakeLLM` and replace the checkpointer with `InMemorySaver` (the `interview_graph` fixture, which overrides `get_optional_interview_graph`), and they stub external HTTP calls with monkeypatch or `httpx.MockTransport`. Rate limits reset before every test. They must never need `.env`, Neon, OpenAI or network access. SQLite can't catch Postgres-only SQL errors, so smoke-test new SQL against Neon too.

13. **Frontend rules** (`frontend/`):
   - All HTTP goes through `src/api/` (one file per backend area). Pages and components never call axios/fetch directly.
   - Pages are lazy-loaded routes in `App.tsx` (each page is its own chunk); only `HomePage` is bundled up front. `.tsx` files export only components: context objects and hooks live in `src/context/useX.ts`, and helpers in plain `.ts` files (oxlint `only-export-components`). `npm run lint` should report zero warnings.
   - Destructive actions ask first with `ConfirmDialog` (`components/ui/ConfirmDialog.tsx`, native `<dialog>`).
   - The axios client attaches the access token, refreshes once on a 401, then logs out (`setSessionExpiredHandler`). Don't add per-page 401 handling.
   - Post-login redirects belong to `PublicOnlyRoute` only. Pages must not `navigate()` after login/signup (it races the guard).
   - Every data view handles loading (skeleton), empty (`EmptyState`) and error (`ErrorState` with retry) states.
   - Use the design tokens in `src/index.css` (`bg-surface`, `text-ink`, `text-muted`, `bg-primary`, …), never raw hex, so every theme keeps working. Status colours always come with an icon and a label.
   - Themes: light, dark, solarized-light, solarized-dark, parchment (plus "system"). To add one: add a `[data-theme='id']` block in `src/index.css`, add it to `src/theme/themes.ts` and to the pre-paint map in `index.html`, then run `npm run check:contrast` and the dataviz validator on its `--accent`.
   - `bg-primary` + `text-on-primary` for solid buttons and fills behind text. `accent` is for charts, icons and outlines. Never put text on `bg-accent`.
   - Don't lower text contrast with `opacity-*`. Use `text-muted` instead (axe catches this).
   - Interactive widgets follow WAI-ARIA patterns: use `DropdownMenu` (`components/ui/Menu.tsx`) for menus and `useRadioGroup` for custom radio groups. Every page calls `useDocumentTitle`.
   - Effects must use block bodies: `useEffect(() => { … })`. In newer browsers, `window.scrollTo` returns a Promise, which React treats as a cleanup function and crashes on.
   - Run `npm run e2e` after UI changes and look at the screenshots in `frontend/e2e/screenshots/`.

## Commands (run from `backend/`)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest              # run tests
.venv/Scripts/alembic upgrade head          # apply migrations to Neon
.venv/Scripts/alembic revision --autogenerate -m "msg"   # new migration
.venv/Scripts/uvicorn app.main:app --reload # http://localhost:8000/api/v1/health
```

The settings load `.env` from the repo root. `DATABASE_URL` and `JWT_SECRET_KEY` are required, or the app won't start. Without `OPENAI_API_KEY` the app still runs, but the interview endpoints return 503.

## Frontend commands (run from `frontend/`)

```bash
npm install
npm run dev        # http://localhost:5173 (API URL from VITE_API_BASE_URL in the root .env)
npm run build      # typecheck + production build
npm run lint
npm run e2e        # throwaway backend (SQLite + fake LLM) + Vite: desktop & mobile flows, keyboard checks, axe WCAG 2.2 AA in every theme
npm run check:contrast   # WCAG AA contrast for every theme's tokens
```

**Windows event loop:** psycopg (the checkpointer) can't run on Windows' default `ProactorEventLoop`. `uvicorn --reload` already uses the selector loop. Without `--reload`, add `--loop asyncio:SelectorEventLoop`. Otherwise startup fails with a message saying so.

**Local Windows note:** Smart App Control blocks SQLAlchemy's compiled Cython extension (`_result_cy`). If the import fails with "An Application Control policy has blocked this file", reinstall SQLAlchemy as pure Python:
`DISABLE_SQLALCHEMY_CEXT=1 .venv/Scripts/python -m pip install --force-reinstall --no-deps --no-binary sqlalchemy sqlalchemy==<pinned version>`
