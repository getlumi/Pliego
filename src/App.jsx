import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import AuthPage        from './pages/AuthPage'
import OnboardingPage  from './pages/OnboardingPage'
import HomePage        from './pages/HomePage'
import UploadPage      from './pages/UploadPage'
import WalletPage      from './pages/WalletPage'
import HistoryPage     from './pages/HistoryPage'
import ProfilePage     from './pages/ProfilePage'
import PrintshopPage, { RegisterShop } from './pages/PrintshopPage'
import Navbar          from './components/layout/Navbar'
import { createEmptyDraft, revokeDraftUrls } from './lib/draft'

export default function App() {
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [onboarded, setOnboarded] = useState(false)
  const [ownsShop, setOwnsShop] = useState(false)
  const [businessIntent, setBusinessIntent] = useState(false)
  const [page,     setPage]     = useState('home')
  const [draft,    setDraft]    = useState(createEmptyDraft())

  const updateDraft = (partial) => setDraft(d => ({ ...d, ...partial }))
  const clearDraft = () => {
    revokeDraftUrls(draft)
    setDraft(createEmptyDraft())
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else {
        setOnboarded(false); setOwnsShop(false); setBusinessIntent(false); setLoading(false)
        setDraft(d => { revokeDraftUrls(d); return createEmptyDraft() })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const checkOnboarding = async (userId) => {
    let { data } = await supabase
      .from('users')
      .select('onboarding_seen')
      .eq('id', userId)
      .maybeSingle()

    if (!data) {
      // Perfil no existe (p.ej. el insert en el registro no se completó a tiempo).
      // Lo creamos aquí para que la cuenta nunca quede en un estado roto.
      const { data: authUser } = await supabase.auth.getUser()
      const meta = authUser?.user?.user_metadata ?? {}
      const { data: inserted } = await supabase
        .from('users')
        .insert({
          id: userId,
          name: meta.name ?? 'Usuario',
          phone: meta.phone ?? authUser?.user?.email?.split('@')[0] ?? '',
          wallet_balance: 0,
          privacy_accepted_at: new Date().toISOString(),
          onboarding_seen: false,
        })
        .select('onboarding_seen')
        .maybeSingle()
      data = inserted
    }

    setOnboarded(data?.onboarding_seen ?? false)

    const { data: shop } = await supabase
      .from('printshops')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle()
    setOwnsShop(!!shop)

    setLoading(false)
  }

  const navigate = (target) => setPage(target)

  const renderPage = () => {
    switch (page) {
      case 'home':    return <HomePage   session={session} onNavigate={navigate} draft={draft} onClearDraft={clearDraft} />
      case 'upload':  return <UploadPage session={session} onNavigate={navigate} draft={draft} onUpdateDraft={updateDraft} onClearDraft={clearDraft} />
      case 'wallet':  return <WalletPage session={session} onNavigate={navigate} />
      case 'history': return <HistoryPage session={session} onNavigate={navigate} />
      case 'profile': return <ProfilePage session={session} onNavigate={navigate} />
      default:        return <HomePage   session={session} onNavigate={navigate} draft={draft} onClearDraft={clearDraft} />
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
        <i className="ti ti-printer" style={{ fontSize: 32, color: '#fff' }} />
      </div>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600 }}>
        Cargando Pliego...
      </p>
    </div>
  )

  if (!session) return (
    <div className="app-shell"><div className="phone-frame">
      <AuthPage onAuth={(intent) => setBusinessIntent(intent === 'business')} />
    </div></div>
  )

  if (!onboarded) return (
    <div className="app-shell"><div className="phone-frame">
      <OnboardingPage session={session} onComplete={() => setOnboarded(true)} />
    </div></div>
  )

  // Cuenta de negocio: panel propio, sin la navegación de cliente
  if (ownsShop) return (
    <div className="app-shell"><div className="phone-frame">
      <PrintshopPage session={session} />
    </div></div>
  )

  // Llegó pidiendo "tengo una papelería" pero aún no la registra
  if (businessIntent) return (
    <div className="app-shell"><div className="phone-frame">
      <RegisterShop
        session={session}
        onRegistered={() => setOwnsShop(true)}
        onCancel={() => setBusinessIntent(false)}
      />
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
