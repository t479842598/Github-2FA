import { useEffect, useState } from 'react'
import { api, setToken, getToken, setUnauthorizedHandler } from './api.js'
import Login from './components/Login.jsx'
import ChangePasswordScreen from './components/ChangePasswordScreen.jsx'
import DashboardShell from './components/DashboardShell.jsx'

export default function App() {
  const [phase, setPhase] = useState('loading') // loading | login | mustChange | app
  const [token, setTokenState] = useState(getToken())

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setTokenState(null)
    })
    api.status()
      .then(() => setPhase('login'))
      .catch(() => setPhase('login'))
  }, [])

  const handleAuthed = (t, mustChange) => {
    setToken(t)
    setTokenState(t)
    setPhase(mustChange ? 'mustChange' : 'app')
  }

  const handlePasswordChanged = (newToken) => {
    setToken(newToken)
    setTokenState(newToken)
    setPhase('app')
  }

  const handleLogout = () => {
    setToken(null)
    setTokenState(null)
    setPhase('login')
  }

  if (phase === 'loading') {
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    )
  }
  if (phase === 'login' || !token) {
    return <Login onAuthed={handleAuthed} />
  }
  if (phase === 'mustChange') {
    return <ChangePasswordScreen onChanged={handlePasswordChanged} />
  }
  return <DashboardShell token={token} onLogout={handleLogout} />
}
