import React from 'react'

// Reemplaza el alert() nativo del navegador (feo, rompe la identidad
// visual) por un modal con el estilo de Pliego. Mismo comportamiento
// bloqueante que alert() — el usuario debe tocar el botón para cerrarlo —
// pero se ve como parte de la app, no como un error del navegador.
export default function AppModal({ open, type = 'info', title, message, onClose, actionLabel = 'Entendido' }) {
  if (!open) return null

  const config = {
    success: { icon: 'ti-printer',             color: '#16803C', bg: 'var(--accent-light)' },
    error:   { icon: 'ti-alert-circle',        color: 'var(--red)', bg: 'var(--red-light)' },
    info:    { icon: 'ti-info-circle',         color: 'var(--text-secondary)', bg: 'var(--bg)' },
  }[type] ?? { icon: 'ti-info-circle', color: 'var(--text-secondary)', bg: 'var(--bg)' }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ maxWidth: 320, width: '100%', textAlign: 'center', padding: 28 }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: config.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <i className={`ti ${config.icon}`} style={{ fontSize: 28, color: config.color }} />
        </div>
        {title && <p style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{title}</p>}
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>{message}</p>
        <button onClick={onClose} className="btn-primary">{actionLabel}</button>
      </div>
    </div>
  )
}
