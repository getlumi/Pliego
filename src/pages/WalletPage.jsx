import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function WalletPage({ session, onNavigate }) {
  const [balance, setBalance] = useState(null)

  useEffect(() => {
    if (!session) return
    supabase.from('users').select('wallet_balance').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setBalance(data?.wallet_balance ?? 0))
  }, [session])

  const packages = [
    { amount: 20, services: 10 },
    { amount: 50, services: 30 },
  ]

  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 32px' }}>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.6)', fontWeight:600 }}>Tu saldo</p>
        <p style={{ fontSize:32, fontWeight:900, color:'#fff' }}>
          ${balance === null ? '...' : balance.toFixed(2)}
        </p>
      </div>
      <div className="scroll-content">
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-wallet" style={{ fontSize:40, color:'var(--green)', display:'block', marginBottom:12 }} />
          <p style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Elige tu recarga</p>
          <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:20 }}>Cada impresión usa $2 de tu saldo</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {packages.map(p => (
              <button key={p.amount} style={{
                border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)',
                padding:16, textAlign:'center', background:'#fff', cursor:'pointer',
                position:'relative',
              }}>
                {p.amount === 50 && (
                  <span style={{
                    position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)',
                    fontSize:11, background:'var(--green-light)', color:'var(--green-dark)',
                    padding:'2px 8px', borderRadius:'var(--radius-full)', fontWeight:700,
                    whiteSpace:'nowrap',
                  }}>Mejor precio</span>
                )}
                <p style={{ fontSize:22, fontWeight:900 }}>${p.amount}</p>
                <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:2 }}>{p.services} impresiones</p>
                <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                  ${(p.amount / p.services).toFixed(2)} c/u
                </p>
              </button>
            ))}
          </div>
          <button className="btn-primary" style={{ marginTop:16 }}>Recargar con tarjeta</button>
          <button className="btn-outline" style={{ marginTop:10 }}>Pagar en efectivo (OXXO)</button>
        </div>
      </div>
    </div>
  )
}
