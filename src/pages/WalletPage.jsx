import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PACKAGES = [
  {
    id: 'basic',
    amount: 20,
    prints: 10,
    pricePerPrint: '2.00',
    label: '10 impresiones',
  },
  {
    id: 'popular',
    amount: 50,
    prints: 30,
    pricePerPrint: '1.67',
    label: '30 impresiones',
    badge: 'Mejor precio',
  },
]

export default function WalletPage({ session }) {
  const [balance, setBalance] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState('popular')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return
    loadData()

    // Realtime: saldo se actualiza cuando llega confirmación de pago
    const channel = supabase
      .channel(`wallet:${session.user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users',
        filter: `id=eq.${session.user.id}`,
      }, payload => setBalance(payload.new.wallet_balance))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [session])

  const loadData = async () => {
    const { data: user } = await supabase
      .from('users').select('wallet_balance').eq('id', session.user.id).maybeSingle()
    setBalance(user?.wallet_balance ?? 0)

    const { data: txs } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setTransactions(txs ?? [])
  }

  const handlePay = async (method) => {
    setError('')
    setLoading(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const { data, error: fnError } = await supabase.functions.invoke('create-payment', {
        body: { package_id: selectedPkg },
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      })

      if (fnError || data?.error) {
        setError(data?.error ?? 'No se pudo iniciar el pago. Intenta de nuevo.')
        setLoading(false)
        return
      }

      // Redirigir en la misma pestaña — funciona en iOS y Android sin bloqueos
      const url = data.sandbox_init_point ?? data.init_point
      window.location.href = url

    } catch (e) {
      setError('Error al conectar con el servidor de pagos.')
      setLoading(false)
    }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="page">
      {/* Header con saldo */}
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 32px' }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginBottom: 4 }}>
          Tu saldo disponible
        </p>
        <p style={{ fontSize: 40, fontWeight: 900, color: '#fff' }}>
          ${balance === null ? '...' : Number(balance).toFixed(2)}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
          Cada impresión usa $2.00 de tu saldo
        </p>
      </div>

      <div className="scroll-content">

        {/* Selector de paquete */}
        <div className="card">
          <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Recargar saldo</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Elige tu paquete
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {PACKAGES.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPkg(pkg.id)}
                style={{
                  border: selectedPkg === pkg.id ? '2px solid var(--green)' : '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center',
                  background: selectedPkg === pkg.id ? 'var(--green-light)' : '#fff',
                  cursor: 'pointer', position: 'relative',
                }}
              >
                {pkg.badge && (
                  <span style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 11, background: 'var(--green)', color: '#fff',
                    padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}>{pkg.badge}</span>
                )}
                <p style={{ fontSize: 26, fontWeight: 900, color: selectedPkg === pkg.id ? 'var(--green)' : 'var(--text-primary)' }}>
                  ${pkg.amount}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {pkg.prints} impresiones
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  ${pkg.pricePerPrint} c/u
                </p>
              </button>
            ))}
          </div>

          {error && (
            <div style={{
              background: 'var(--red-light)', border: '1px solid #F09595',
              borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 12,
              display: 'flex', gap: 8, alignItems: 'center',
            }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 16, color: 'var(--red)', flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>
            </div>
          )}

          {/* Botón tarjeta */}
          <button
            onClick={() => handlePay('card')}
            disabled={loading}
            className="btn-primary"
            style={{ marginBottom: 10 }}
          >
            <i className="ti ti-credit-card" style={{ fontSize: 18 }} />
            {loading ? 'Iniciando pago...' : `Pagar $${PACKAGES.find(p => p.id === selectedPkg)?.amount} con tarjeta`}
          </button>

          {/* Botón OXXO */}
          <button
            onClick={() => handlePay('oxxo')}
            disabled={loading}
            className="btn-outline"
          >
            <i className="ti ti-building-store" style={{ fontSize: 18 }} />
            {loading ? 'Iniciando pago...' : 'Pagar en OXXO'}
          </button>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10 }}>
            Pagos seguros procesados por Mercado Pago
          </p>
        </div>

        {/* Historial de transacciones */}
        {transactions.length > 0 && (
          <div className="card">
            <p style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>Movimientos recientes</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {transactions.map(tx => (
                <div key={tx.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingBottom: 10, borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: tx.amount > 0 ? 'var(--green-light)' : 'var(--red-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className={`ti ${tx.amount > 0 ? 'ti-arrow-down-left' : 'ti-printer'}`}
                        style={{ fontSize: 16, color: tx.amount > 0 ? 'var(--green)' : 'var(--red)' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>
                        {tx.amount > 0 ? 'Recarga' : 'Impresión'}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(tx.created_at)}</p>
                    </div>
                  </div>
                  <p style={{
                    fontSize: 15, fontWeight: 700,
                    color: tx.amount > 0 ? 'var(--green)' : 'var(--text-primary)',
                  }}>
                    {tx.amount > 0 ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
