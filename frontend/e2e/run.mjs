// Browser end-to-end tests: desktop and mobile, against a throwaway backend.
//
//   npm run e2e
//
// Starts backend/tests/e2e_server.py (SQLite + fake LLM, never Neon/OpenAI) and a
// Vite dev server, drives the app in your installed Microsoft Edge (or Chrome with
// E2E_BROWSER=chrome), checks every flow, and saves screenshots to e2e/screenshots/.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..')
const BACKEND = resolve(FRONTEND, '../backend')
const SHOTS = join(HERE, 'screenshots')
const API_PORT = 8001
const WEB_PORT = 5174
const API = `http://localhost:${API_PORT}/api/v1`
const WEB = `http://localhost:${WEB_PORT}`

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

// ---------- tiny test harness ----------
const failures = []
let section = ''
function check(condition, message) {
  const label = `${section} › ${message}`
  if (condition) console.log(`  ✓ ${message}`)
  else {
    failures.push(label)
    console.log(`  ✗ ${message}`)
  }
}
function title(text) {
  section = text
  console.log(`\n${text}`)
}

// ---------- a small real PDF (same as backend/tests/fakes.make_pdf) ----------
function makePdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const content = `BT /F1 11 Tf 72 720 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
const RESUME = makePdf([
  'Ada Lovelace - Senior Backend Engineer',
  'Built a payments platform in Python and FastAPI serving 2M users.',
  'Designed a sharded PostgreSQL cluster and cut p99 latency by 40 percent.',
  'Skills: Python, SQL, System Design, Kubernetes, Redis.',
])

// The e2e fake LLM scores answers by length: about 25 characters per point above 2.
const answerOfScore = (score) => `I would ${'explain my reasoning '.repeat(Math.ceil(((score - 2) * 25) / 21))}`.slice(0, (score - 2) * 25 + 24)

// ---------- servers ----------
const apiLog = []
function startServers() {
  const python = existsSync(join(BACKEND, '.venv/Scripts/python.exe'))
    ? join(BACKEND, '.venv/Scripts/python.exe')
    : join(BACKEND, '.venv/bin/python')
  const api = spawn(python, ['-m', 'tests.e2e_server', '--port', String(API_PORT), '--frontend', WEB], {
    cwd: BACKEND,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  api.stdout.on('data', (d) => apiLog.push(String(d)))
  api.stderr.on('data', (d) => apiLog.push(String(d)))

  const web = spawn(process.execPath, [join(FRONTEND, 'node_modules/vite/bin/vite.js'), '--port', String(WEB_PORT), '--strictPort'], {
    cwd: FRONTEND,
    env: { ...process.env, VITE_API_BASE_URL: API },
  })
  web.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))
  return [api, web]
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${label} did not start: ${url}\n${apiLog.join('')}`)
}

// ---------- API seeding (fast setup for dashboard data) ----------
async function apiJson(path, { token, ...init } = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function seedUser(email, name) {
  return apiJson('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: 'password-123', full_name: name }) })
}

async function seedInterview(token, { role, company, score, answers = 3 }) {
  const form = new FormData()
  form.append('resume', new Blob([RESUME], { type: 'application/pdf' }), 'resume.pdf')
  form.append('role', role)
  form.append('company', company)
  let interview = await apiJson('/interviews', { method: 'POST', body: form, token })
  for (let i = 0; i < answers && interview.next_question; i++) {
    interview = await apiJson(`/interviews/${interview.id}/answers`, {
      method: 'POST',
      token,
      body: JSON.stringify({ question_id: interview.next_question.id, answer: answerOfScore(score) }),
    })
  }
  // Scoring runs on the server after the last answer: wait for it like the app does.
  while (interview.processing) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    interview = await apiJson(`/interviews/${interview.id}`, { token })
  }
  return interview
}

// ---------- page helpers ----------
function watchPage(page) {
  const problems = []
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  page.on('console', (msg) => {
    // Expected network failures (404 page, expired session) are logged by the browser itself.
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`)
  })
  return problems
}

const AXE_PATH = join(FRONTEND, 'node_modules/axe-core/axe.min.js')
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Run axe-core (WCAG 2.2 AA rules) on the current page and fail on any violation. */
async function axeCheck(page, label) {
  await page.waitForTimeout(350) // let entrance animations finish (opacity affects contrast)
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE_PATH })
  const violations = await page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } })
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' -> ' + (n.failureSummary || '').split('\n').slice(1, 2).join('').trim()),
    }))
  }, AXE_TAGS)
  check(violations.length === 0, label + ': no axe WCAG 2.2 AA violations')
  for (const v of violations) {
    console.log('      [' + v.impact + '] ' + v.id + ': ' + v.help)
    v.nodes.forEach((n) => console.log('        - ' + n))
  }
}

async function noHorizontalScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 1, `${label}: no horizontal scroll (${overflow}px)`)
}

async function answerQuestion(page, text, { last = false } = {}) {
  await page.getByLabel('Your answer').fill(text)
  await page.getByRole('button', { name: last ? 'Submit & get feedback' : 'Send answer' }).click()
}

// ---------- the suites ----------
async function runSuite(browser, vp) {
  const state = {}
  try {
    await suiteSteps(browser, vp, state)
  } catch (error) {
    await state.page?.screenshot({ path: join(SHOTS, `${vp.name}-CRASH.png`), fullPage: true }).catch(() => {})
    if (state.problems?.length) console.log('  page problems:', state.problems.join(' | '))
    throw error
  }
}

async function suiteSteps(browser, vp, state) {
  const context = await browser.newContext({
    viewport: vp.viewport,
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    colorScheme: 'light',
  })
  const page = await context.newPage()
  const problems = watchPage(page)
  Object.assign(state, { page, problems })
  // Let fade/slide-in animations (≤220ms) settle so screenshots show the final state.
  const shot = async (name, fullPage = false) => (await page.waitForTimeout(400), page.screenshot({ path: join(SHOTS, `${vp.name}-${name}.png`), fullPage }))
  const email = `${vp.name}-${Date.now()}@example.com`
  const name = vp.name === 'desktop' ? 'Ada Lovelace' : 'Mo Bile'

  title(`[${vp.name}] Home and route protection`)
  await page.goto(WEB)
  check(await page.getByRole('heading', { level: 1 }).isVisible(), 'homepage hero renders')
  await noHorizontalScroll(page, 'home')
  await shot('01-home', true)
  await axeCheck(page, 'home')
  await page.goto(`${WEB}/dashboard`)
  await page.waitForURL('**/login')
  check(page.url().endsWith('/login'), 'anonymous /dashboard redirects to /login')

  title(`[${vp.name}] OAuth buttons`)
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  const oauthToast = page.getByText('Google sign-in is not configured')
  await oauthToast.waitFor({ timeout: 10_000 })
  check(await oauthToast.isVisible(), 'unconfigured provider shows a friendly toast (no raw JSON page)')
  check(page.url().endsWith('/login'), 'stays on the login page')
  await shot('02-login')
  await axeCheck(page, 'login')

  title(`[${vp.name}] Sign up`)
  await page.goto(`${WEB}/signup`)
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Password', { exact: true }).blur()
  check(await page.getByText('Use at least 8 characters.').isVisible(), 'short password shows inline error')
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await noHorizontalScroll(page, 'signup')
  await shot('03-signup')
  await axeCheck(page, 'signup')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('**/interviews/new')
  await page.getByLabel('Resume PDF').waitFor()
  check(page.url().endsWith('/interviews/new'), 'sign up lands (and stays) on the new interview page')

  if (vp.name === 'mobile') {
    title(`[${vp.name}] Empty states`)
    await page.goto(`${WEB}/dashboard`)
    await page.getByText('No results yet').waitFor()
    check(true, 'overview empty state')
    await noHorizontalScroll(page, 'empty dashboard')
    await shot('04-dashboard-empty')
  await axeCheck(page, 'empty dashboard')
    await page.goto(`${WEB}/dashboard/history`)
    await page.getByText('No interviews yet').waitFor()
    check(true, 'history empty state')
    await shot('05-history-empty')
    await page.goto(`${WEB}/interviews/new`)
  }

  title(`[${vp.name}] Resume upload`)
  await page.getByLabel('Resume PDF').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  check(await page.getByText('Please choose a PDF file.').isVisible(), 'non-PDF rejected before upload')
  await page.getByLabel('Resume PDF').setInputFiles({ name: 'ada-resume.pdf', mimeType: 'application/pdf', buffer: RESUME })
  check(await page.getByText('ada-resume.pdf').isVisible(), 'chosen file is shown')
  await page.getByLabel('Role').fill('Backend Engineer')
  await page.getByLabel('Company').fill('Stripe')
  await noHorizontalScroll(page, 'new interview')
  await shot('06-new-interview')
  await axeCheck(page, 'new interview')
  await page.getByRole('button', { name: 'Start interview' }).click()
  await page.getByText('Preparing your interview').waitFor()
  check(true, 'loading screen appears while questions are generated')
  await shot('07-loading-questions')
  await page.waitForURL(/\/interviews\/[0-9a-f-]{36}$/)
  await page.getByText('Question 1 of 3').waitFor()
  check(true, 'first question shown')
  const interviewUrl = page.url()

  title(`[${vp.name}] Chat survives refresh`)
  const draft = 'A draft answer that should survive a page refresh.'
  await page.getByLabel('Your answer').fill(draft)
  await page.reload()
  await page.getByText('Question 1 of 3').waitFor()
  check((await page.getByLabel('Your answer').inputValue()) === draft, 'unsent draft restored after refresh')
  await answerQuestion(page, answerOfScore(9))
  await page.getByText('Question 2 of 3').waitFor()
  await page.reload()
  await page.getByText('Question 2 of 3').waitFor()
  check(await page.getByText('1 of 3 answered').isVisible(), 'progress restored after refresh')
  check(await page.getByText(answerOfScore(9)).isVisible(), 'previous answer still in the transcript')
  await answerQuestion(page, answerOfScore(6))
  await page.getByText('Question 3 of 3').waitFor()
  await noHorizontalScroll(page, 'chat')
  await shot('08-chat')
  await axeCheck(page, 'chat')

  title(`[${vp.name}] Scoring, feedback and roadmap`)
  await answerQuestion(page, answerOfScore(4), { last: true })
  await page.getByText('Evaluating your interview').waitFor()
  check(true, 'evaluation loading screen appears')
  check(await page.getByRole('link', { name: 'Go to your interviews' }).isVisible(), 'can leave while scoring runs on the server')
  await shot('09-loading-evaluation')
  // The page polls until the background scoring finishes.
  await page.getByText('Overall score').waitFor({ timeout: 30_000 })
  check(await page.getByText('Your feedback is ready.').isVisible(), 'toast when feedback is ready')
  check((await page.locator('main').innerText()).includes('19 out of 30'), 'total score 19 out of 30 shown (9 + 6 + 4)')
  check((await page.getByText('What was good').count()) === 3, 'feedback for all three answers')
  check(await page.getByRole('heading', { name: 'Your study roadmap' }).isVisible(), 'roadmap shown')
  await page.getByRole('button', { name: 'A stronger answer' }).first().click()
  check(await page.getByText(/A stronger .* answer/).first().isVisible(), 'better answer expands')
  await noHorizontalScroll(page, 'results')
  await shot('10-results', true)
  await axeCheck(page, 'results')
  await page.reload()
  await page.getByText('Overall score').waitFor()
  check(true, 'results survive refresh')

  title(`[${vp.name}] Dashboard`)
  const token = await page.evaluate(() => localStorage.getItem('vivacity.access_token'))
  if (vp.name === 'desktop') {
    // Two more interviews for a real trend line, and rivals for the leaderboard.
    await seedInterview(token, { role: 'Backend Engineer', company: 'Netflix', score: 7 })
    await seedInterview(token, { role: 'Staff Engineer', company: 'Shopify', score: 9 })
    const grace = await seedUser(`grace-${Date.now()}@example.com`, 'Grace Hopper')
    await seedInterview(grace.access_token, { role: 'Backend Engineer', company: 'Stripe', score: 10 })
    const anon = await seedUser(`anon-${Date.now()}@example.com`, null)
    await seedInterview(anon.access_token, { role: 'Data Scientist', company: 'Netflix', score: 3 })
  }
  await page.goto(`${WEB}/dashboard`)
  await page.getByText('Score over time').waitFor()
  const svg = page.getByRole('img', { name: /Score over time/ })
  // The chart draws once it has measured its container.
  check(await svg.waitFor({ timeout: 10_000 }).then(() => true, () => false), 'score chart renders')
  const box = await svg.boundingBox()
  if (vp.hasTouch) await page.touchscreen.tap(box.x + box.width - 50, box.y + box.height / 2)
  else await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  // Score and percentage are separate spans, so match the tooltip as a whole.
  const tooltip = page.locator('[role=status]').filter({ hasText: /\d+\/30/ })
  check(await tooltip.first().waitFor({ timeout: 5_000 }).then(() => true, () => false), 'chart tooltip appears on hover/tap')
  await noHorizontalScroll(page, 'dashboard')
  await shot('11-dashboard', true)
  await axeCheck(page, 'dashboard')
  await page.getByRole('radio', { name: 'Table' }).click()
  const rows = await page.locator('table tbody tr').count()
  check(rows === (vp.name === 'desktop' ? 3 : 1), `table view lists every interview (${rows})`)
  await page.getByRole('radio', { name: 'Chart' }).click()

  await page.goto(`${WEB}/dashboard/history`)
  await page.getByText('Completed').first().waitFor()
  check((await page.locator('main ul > li').count()) >= 1, 'history lists interviews')
  await noHorizontalScroll(page, 'history')
  await shot('12-history')
  await axeCheck(page, 'history')

  title(`[${vp.name}] Delete an interview`)
  const doomed = `Doomed Co ${vp.name}`
  await seedInterview(token, { role: 'QA Engineer', company: doomed, score: 5, answers: 1 })
  await page.reload()
  const deleteButton = page.getByRole('button', { name: `Delete interview: QA Engineer at ${doomed}` })
  await deleteButton.click()
  const dialog = page.getByRole('dialog', { name: 'Delete this interview?' })
  check(await dialog.isVisible(), 'delete asks for confirmation')
  check((await page.evaluate(() => document.activeElement?.textContent)) === 'Cancel', 'focus starts on Cancel')
  await shot('12b-delete-dialog')
  await axeCheck(page, 'delete dialog')
  await page.keyboard.press('Escape')
  check(!(await dialog.isVisible()), 'Escape cancels')
  check(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Delete interview')), 'focus returns to the delete button')
  await deleteButton.click()
  await dialog.getByRole('button', { name: 'Delete interview' }).click()
  await page.getByText('Interview deleted.').waitFor()
  const gone = await page.getByRole('link', { name: new RegExp(doomed) }).waitFor({ state: 'detached', timeout: 5_000 }).then(() => true, () => false)
  check(gone, 'deleted interview disappears from history')

  await page.goto(`${WEB}/dashboard/leaderboard`)
  await page.getByText('Ranked by best score').waitFor()
  const boardText = await page.locator('main').innerText()
  check(boardText.includes(name), 'your name is on the leaderboard')
  check(!boardText.includes('@example.com'), 'leaderboard never shows emails')
  if (vp.name === 'desktop') {
    check(boardText.includes('Grace Hopper') && boardText.includes('Anonymous'), 'other users appear by name, or as Anonymous')
    await page.getByLabel('Filter by company').fill('netflix')
    await page.getByRole('button', { name: 'Filter' }).click()
    const narrowed = await page.getByText('Grace Hopper').waitFor({ state: 'detached', timeout: 10_000 }).then(() => true, () => false)
    check(narrowed && (await page.getByText('Anonymous').isVisible()), 'company filter narrows the leaderboard (case-insensitive)')
    await shot('13b-leaderboard-filtered')
    await page.getByRole('button', { name: 'Clear filters' }).click()
  }
  await noHorizontalScroll(page, 'leaderboard')
  await shot('13-leaderboard')
  await axeCheck(page, 'leaderboard')

  title(`[${vp.name}] Settings and theme`)
  await page.goto(`${WEB}/dashboard/settings`)
  await page.getByLabel('Display name').fill(`${name} Jr`)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByText('Profile saved.').waitFor()
  check(true, 'display name saved')
  await noHorizontalScroll(page, 'settings')
  await shot('14-settings', true)
  await axeCheck(page, 'settings')
  await page.getByRole('radio', { name: /^Dark:/ }).click()
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied')
  await page.goto(interviewUrl)
  await page.getByText('Overall score').waitFor()
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'theme persists across pages')
  await shot('15-results-dark')
  await page.goto(`${WEB}/dashboard`)
  await page.getByText('Score over time').waitFor()
  await shot('16-dashboard-dark', true)
  await page.goto(`${WEB}/dashboard/settings`)
  await page.getByRole('radio', { name: /^Light:/ }).click()

  title(`[${vp.name}] Keyboard: theme menu, account menu, theme picker`)
  await page.getByRole('button', { name: 'Choose theme' }).focus()
  await page.keyboard.press('Enter')
  check(await page.getByRole('menu', { name: 'Choose theme' }).isVisible(), 'Enter opens the theme menu')
  check((await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'menuitemradio', 'focus moves into the menu')
  // Order: Match system, Light, Dark, Solarized Light, Solarized Dark, Parchment.
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'parchment', 'End + Enter picks Parchment')
  check((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Choose theme', 'focus returns to the menu button')
  await page.keyboard.press('ArrowDown')
  check(await page.getByRole('menu', { name: 'Choose theme' }).isVisible(), 'ArrowDown reopens the menu')
  await page.keyboard.press('Escape')
  check(!(await page.getByRole('menu').isVisible().catch(() => false)), 'Escape closes the menu')
  await page.getByRole('radio', { name: /^Parchment:/ }).focus()
  await page.keyboard.press('ArrowLeft')
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'solarized-dark', 'arrow keys move through the theme cards')
  await page.keyboard.press('Home')
  check((await page.evaluate(() => localStorage.getItem('vivacity.theme'))) === 'system', 'Home selects Match system')
  await page.getByRole('radio', { name: /^Light:/ }).click()
  await page.getByRole('button', { name: 'Account menu' }).focus()
  await page.keyboard.press('ArrowDown')
  check(await page.getByRole('menu', { name: 'Account menu' }).isVisible(), 'ArrowDown opens the account menu')
  await page.keyboard.press('Escape')

  if (vp.name === 'desktop') {
    title(`[${vp.name}] Every theme: contrast and screenshots`)
    for (const theme of ['light', 'dark', 'solarized-light', 'solarized-dark', 'parchment']) {
      await page.evaluate((t) => localStorage.setItem('vivacity.theme', t), theme)
      await page.goto(`${WEB}/dashboard`)
      await page.getByRole('img', { name: /Score over time/ }).waitFor()
      check((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, `${theme}: applied on load`)
      await shot(`T-${theme}-dashboard`, true)
      await axeCheck(page, `${theme} dashboard`)
      await page.goto(interviewUrl)
      await page.getByText('Overall score').waitFor()
      await shot(`T-${theme}-results`)
      await axeCheck(page, `${theme} results`)
      await page.goto(`${WEB}/dashboard/settings`)
      await page.getByRole('radiogroup', { name: 'Theme' }).waitFor()
      await axeCheck(page, `${theme} settings`)
    }
    for (const theme of ['parchment', 'solarized-dark']) {
      await page.evaluate((t) => localStorage.setItem('vivacity.theme', t), theme)
      await page.goto(`${WEB}/`)
      await shot(`T-${theme}-home`, true)
      await axeCheck(page, `${theme} home`)
    }
    await page.evaluate(() => localStorage.setItem('vivacity.theme', 'light'))
  }

  if (vp.isMobile) {
    title(`[${vp.name}] Mobile menu`)
    await page.getByRole('button', { name: 'Account menu' }).click()
    check(await page.getByRole('menuitem', { name: 'New interview' }).isVisible(), 'menu shows navigation links')
    await shot('17-menu')
    await page.getByRole('menuitem', { name: 'Dashboard' }).click()
    await page.waitForURL(`${WEB}/dashboard`)
    check(!(await page.getByRole('menu').isVisible().catch(() => false)), 'menu closes after navigating')
  }

  title(`[${vp.name}] Error states`)
  await page.goto(`${WEB}/interviews/00000000-0000-0000-0000-000000000000`)
  await page.getByText('Interview not found').waitFor()
  check(true, 'missing interview shows a not-found state')
  await shot('18-interview-not-found')
  await axeCheck(page, 'not found')
  await page.goto(`${WEB}/this/does/not/exist`)
  check(await page.getByText('Page not found').isVisible(), 'unknown route shows 404 page')

  title(`[${vp.name}] Auto logout on 401`)
  await page.goto(`${WEB}/dashboard`)
  await page.getByText('Score over time').waitFor()
  await page.evaluate(() => {
    localStorage.setItem('vivacity.access_token', 'expired.or.tampered')
    localStorage.setItem('vivacity.refresh_token', 'also-invalid')
  })
  await page.getByRole('link', { name: 'History' }).click()
  await page.waitForURL('**/login', { timeout: 10_000 })
  check(page.url().endsWith('/login'), 'invalid session is logged out and sent to /login')
  check(await page.getByText('Your session has expired').isVisible(), 'session-expired toast shown')
  check((await page.evaluate(() => localStorage.getItem('vivacity.access_token'))) === null, 'tokens cleared')
  await shot('19-session-expired')

  title(`[${vp.name}] Sign back in returns to the same page`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/dashboard/history', { timeout: 10_000 })
  check(page.url().endsWith('/dashboard/history'), 'login redirects back to the page the user was on')
  await page.evaluate(() => localStorage.removeItem('vivacity.access_token'))
  await page.evaluate(() => localStorage.removeItem('vivacity.refresh_token'))

  if (vp.name === 'desktop') {
    title(`[${vp.name}] Forgot password with OTP`)
    await page.goto(`${WEB}/forgot-password`)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Send code' }).click()
    await page.getByLabel('6-digit code').waitFor()
    await new Promise((r) => setTimeout(r, 300))
    const otp = new RegExp(`OTP for ${email.replace(/[.+]/g, '\\$&')}: (\\d{6})`).exec(apiLog.join(''))?.[1]
    check(Boolean(otp), 'OTP printed in the backend console')
    await page.getByLabel('6-digit code').fill(otp ?? '000000')
    await page.getByLabel('New password').fill('brand-new-password')
    await shot('20-reset-password')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await page.waitForURL('**/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('brand-new-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL('**/dashboard')
    check(true, 'signed in with the new password')
  }

  check(problems.length === 0, `no console or page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
  await context.close()
}

// ---------- main ----------
rmSync(SHOTS, { recursive: true, force: true })
mkdirSync(SHOTS, { recursive: true })
const servers = startServers()
let browser
try {
  await waitFor(`${API}/health`, 'API')
  await waitFor(WEB, 'Vite')
  browser = await chromium.launch({ channel: process.env.E2E_BROWSER === 'chrome' ? 'chrome' : 'msedge', headless: true })
  for (const vp of VIEWPORTS) await runSuite(browser, vp)
} catch (error) {
  failures.push(`crashed in "${section}": ${error.message}`)
  console.error(error)
} finally {
  await browser?.close()
  for (const server of servers) server.kill()
}

console.log(`\nScreenshots: ${SHOTS}`)
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed:\n - ${failures.join('\n - ')}`)
  process.exit(1)
}
console.log('\nAll e2e checks passed.')
process.exit(0)
