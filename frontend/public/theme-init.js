// Apply the saved theme before first paint so there's no flash of the wrong theme.
// Loaded as a blocking <script> in index.html (a file, not inline, so the
// Content Security Policy can forbid inline scripts). Keep the ids in sync with
// src/theme/themes.ts.
;(function () {
  var themes = { light: 'light', dark: 'dark', 'solarized-light': 'light', 'solarized-dark': 'dark', parchment: 'light' }
  var id = 'light'
  try {
    var pref = localStorage.getItem('vivacity.theme')
    id = themes[pref] ? pref : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch (e) {}
  document.documentElement.dataset.theme = id
  document.documentElement.dataset.mode = themes[id]
})()
