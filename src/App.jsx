import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import AuthPage        from './pages/AuthPage'
import OnboardingPage  from './pages/OnboardingPage'
import HomePage        from './pages/HomePage'
import UploadPage      from './pages/UploadPage'
import WalletPage      from './pages/WalletPage'
import HistoryPage     from './pages/HistoryPage'
import ProfilePage     from './pages/ProfilePage'
import Navbar          from './components/layout/Navbar'

export default function App() {
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [onboarded, setOnboarded] = useState(false)
  const [page,     setPage]     = useState('home')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else { setOnboarded(false); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const checkOnboarding = async (userId) => {
    const { data } = await supabase
      .from('users')
      .select('onboarding_seen')
      .eq('id', userId)
      .single()
    setOnboarded(data?.onboarding_seen ?? false)
    setLoading(false)
  }

  const navigate = (target) => setPage(target)

  const renderPage = () => {
    switch (page) {
      case 'home':    return <HomePage   session={session} onNavigate={navigate} />
      case 'upload':  return <UploadPage session={session} onNavigate={navigate} />
      case 'wallet':  return <WalletPage session={session} onNavigate={navigate} />
      case 'history': return <HistoryPage session={session} onNavigate={navigate} />
      case 'profile': return <ProfilePage session={session} onNavigate={navigate} />
      default:        return <HomePage   session={session} onNavigate={navigate} />
    }
  }

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: 'var(--gradient-dark)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid rgba(255,255,255,0.3)',
      }}>
        <i className="ti ti-file-text" style={{ fontSize: 32, color: '#fff' }} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600 }}>
        Cargando Pliego...
      </p>
    </div>
  )

  if (!session) return (
    <div className="app-shell"><div className="phone-frame">
      <AuthPage onAuth={() => {}} />
    </div></div>
  )

  if (!onboarded) return (
    <div className="app-shell"><div className="phone-frame">
      <OnboardingPage session={session} onComplete={() => setOnboarded(true)} />
    </div></div>
  )

  return (
    <div className="app-shell">
      <div className="phone-frame">
        {renderPage()}
        <Navbar active={page} onNavigate={navigate} session={session} />
      </div>
    </div>
  )
}
