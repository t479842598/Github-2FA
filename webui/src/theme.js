const THEME_KEY = 'ghvault_theme'

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark'
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

export function initTheme() {
  setTheme(getTheme())
}
