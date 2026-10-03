// WCAG contrast check for every theme in src/index.css.
//
//   npm run check:contrast
//
// Reads each [data-theme='…'] block and checks every foreground/background pair the
// UI actually uses. Text needs 4.5:1 (WCAG 1.4.3 AA); graphics and input borders
// need 3:1 (WCAG 1.4.11). Exits non-zero if any pair fails.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

const themes = {}
for (const [, selector, body] of css.matchAll(/([^{}]*\[data-theme='[\w-]+'\][^{}]*)\{([^}]*)\}/g)) {
  const id = /\[data-theme='([\w-]+)'\]/.exec(selector)[1]
  themes[id] = Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

const SURFACES = ['bg', 'surface', 'surface-2']
const TEXT = [
  ...['ink', 'ink-2', 'muted', 'accent-ink', 'good-ink', 'warn-ink', 'bad-ink'].flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['accent-ink', 'accent-soft'],
  ['ink', 'accent-soft'],
  ['ink-2', 'accent-soft'],
  ['muted', 'accent-soft'],
  ['good-ink', 'good-soft'],
  ['warn-ink', 'warn-soft'],
  ['bad-ink', 'bad-soft'],
  ['ink', 'warn-soft'],
  ['ink-2', 'warn-soft'],
]
const GRAPHICS = [
  ...['accent', 'line-strong'].flatMap((fg) => SURFACES.map((bg) => [fg, bg])),
  ['accent', 'accent-soft'],
]

let failures = 0
for (const [id, vars] of Object.entries(themes)) {
  const rows = []
  for (const [pairs, min] of [[TEXT, 4.5], [GRAPHICS, 3]]) {
    for (const [fg, bg] of pairs) {
      if (!vars[fg] || !vars[bg]) {
        rows.push(`  ✗ missing token --${!vars[fg] ? fg : bg}`)
        failures++
        continue
      }
      const r = ratio(vars[fg], vars[bg])
      if (r < min) {
        rows.push(`  ✗ ${fg} on ${bg}: ${r.toFixed(2)}:1 (needs ${min}:1)  ${vars[fg]} / ${vars[bg]}`)
        failures++
      }
    }
  }
  const worstText = Math.min(...TEXT.filter(([f, b]) => vars[f] && vars[b]).map(([f, b]) => ratio(vars[f], vars[b])))
  console.log(`${rows.length ? '✗' : '✓'} ${id.padEnd(16)} lowest text contrast ${worstText.toFixed(2)}:1`)
  rows.forEach((row) => console.log(row))
}

if (Object.keys(themes).length < 5) {
  console.log('Expected at least 5 themes in index.css')
  failures++
}
console.log(failures ? `\n${failures} contrast failure(s).` : '\nAll themes meet WCAG AA contrast.')
process.exit(failures ? 1 : 0)
