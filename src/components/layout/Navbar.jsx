import React from 'react'

const items = [
  { id: 'home',    icon: 'ti-home',        label: 'Inicio'   },
  { id: 'history', icon: 'ti-clock',       label: 'Historial'},
  { id: 'upload',  icon: 'ti-upload',      label: 'Imprimir', center: true },
  { id: 'wallet',  icon: 'ti-wallet',      label: 'Saldo'    },
  { id: 'profile', icon: 'ti-user-circle', label: 'Perfil'   },
]

export default function Navbar({ active, onNavigate }) {
  return (
    <nav className="navbar">
      {items.map(item => item.center ? (
        <div key={item.id} className="nav-center">
          <button className="nav-center-btn" onClick={() => onNavigate(item.id)}>
            <i className={`ti ${item.icon}`} />
          </button>
          <span>{item.label}</span>
        </div>
      ) : (
        <button
          key={item.id}
          className={`nav-item${active === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <i className={`ti ${item.icon}`} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
