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
import AdminPage       from './pages/AdminPage'
import Navbar          from './components/layout/Navbar'
import { createEmptyDraft, revokeDraftUrls } from './lib/draft'

export default function App() {
  const [session,  setSession]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [onboarded, setOnboarded] = useState(false)
  const [ownsShop, setOwnsShop] = useState(false)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [businessIntent, setBusinessIntent] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [page,     setPage]     = useState(() => {
    // Detectar si Mercado Pago nos redirigió de vuelta
    const path = window.location.pathname
    if (path === '/payment/success') return 'payment_success'
    if (path === '/payment/failure') return 'payment_failure'
    if (path === '/payment/pending') return 'payment_pending'
    return 'home'
  })
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
        setOnboarded(false); setOwnsShop(false); setIsAdmin(false); setBusinessIntent(false); setLoading(false)
        setDraft(d => { revokeDraftUrls(d); return createEmptyDraft() })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const checkOnboarding = async (userId) => {
    let { data } = await supabase
      .from('users')
      .select('onboarding_seen, is_admin')
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
        .select('onboarding_seen, is_admin')
        .maybeSingle()
      data = inserted
    }

    setOnboarded(data?.onboarding_seen ?? false)
    setIsAdmin(data?.is_admin ?? false)

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
      case 'home':    return <HomePage   session={session} onNavigate={navigate} draft={draft} onUpdateDraft={updateDraft} onClearDraft={clearDraft} onShowTutorial={() => setShowTutorial(true)} />
      case 'upload':  return <UploadPage session={session} onNavigate={navigate} draft={draft} onUpdateDraft={updateDraft} onClearDraft={clearDraft} />
      case 'wallet':  return <WalletPage session={session} onNavigate={navigate} />
      case 'history': return <HistoryPage session={session} onNavigate={navigate} />
      case 'profile': return <ProfilePage session={session} onNavigate={navigate} />
      case 'payment_success': return <PaymentResult status="success" onNavigate={navigate} />
      case 'payment_failure': return <PaymentResult status="failure" onNavigate={navigate} />
      case 'payment_pending': return <PaymentResult status="pending" onNavigate={navigate} />
      default:        return <HomePage   session={session} onNavigate={navigate} draft={draft} onUpdateDraft={updateDraft} onClearDraft={clearDraft} onShowTutorial={() => setShowTutorial(true)} />
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

  // Admin: panel de administración de Pliego
  if (isAdmin) return (
    <div className="app-shell"><div className="phone-frame">
      <AdminPage session={session} onSignOut={() => supabase.auth.signOut()} />
    </div></div>
  )

  // Cuenta de negocio: panel propio, sin tutorial ni navegación de cliente
  if (ownsShop) return (
    <div className="app-shell"><div className="phone-frame">
      <PrintshopPage session={session} />
    </div></div>
  )

  if (!onboarded || showTutorial) return (
    <div className="app-shell"><div className="phone-frame">
      <OnboardingPage session={session} onComplete={() => { setOnboarded(true); setShowTutorial(false) }} />
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

function PaymentResult({ status, onNavigate }) {
  const config = {
    success: {
      icon: 'ti-circle-check-filled',
      color: '#22c55e',
      title: '¡Pago exitoso!',
      msg: 'Tu saldo fue acreditado. Ya puedes enviar tus documentos a imprimir.',
      btn: 'Ir a inicio',
      page: 'home',
    },
    failure: {
      icon: 'ti-circle-x-filled',
      color: 'var(--red)',
      title: 'Pago no completado',
      msg: 'No se pudo procesar tu pago. Puedes intentarlo de nuevo cuando quieras.',
      btn: 'Intentar de nuevo',
      page: 'wallet',
    },
    pending: {
      icon: 'ti-clock-filled',
      color: 'var(--amber)',
      title: 'Pago en proceso',
      msg: 'Tu pago está siendo procesado. Te avisaremos cuando se acredite tu saldo — puede tardar unos minutos.',
      btn: 'Ver mi saldo',
      page: 'wallet',
    },
  }
  const c = config[status] ?? config.pending

  // Limpiar la URL del navegador
  useEffect(() => {
    window.history.replaceState({}, '', '/')
  }, [])

  return (
    <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', padding: 32 }}>
        <i className={`ti ${c.icon}`} style={{ fontSize: 64, color: c.color, display:'block', marginBottom: 20 }} />
        <p style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>{c.title}</p>
        <p style={{ fontSize: 14, color:'var(--text-secondary)', lineHeight: 1.6, marginBottom: 28, maxWidth: 280 }}>{c.msg}</p>
        <button onClick={() => onNavigate(c.page)} className="btn-primary">
          {c.btn}
        </button>
      </div>
    </div>
  )
}
