import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../themeProvider.jsx'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className={
        compact
          ? 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors'
          : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-secondary/50 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors'
      }
      title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {!compact && (theme === 'dark' ? '浅色' : '深色')}
    </button>
  )
}
