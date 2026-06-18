import React, { useState } from 'react'

// ============================================================
// CONTENIDO DEL TUTORIAL POR PERFIL
// ============================================================

const TUTORIAL_USER = [
  {
    icon:    'ti-printer',
    color:   '#1A1A1A',
    title:   '¡Bienvenido a Pliego!',
    desc:    'Imprime tus documentos en papelerías cercanas sin complicaciones. Todo desde tu celular.',
    tip:     null,
  },
  {
    icon:    'ti-map-pin',
    color:   '#1A1A1A',
    title:   '1. Elige una papelería',
    desc:    'En la pantalla de inicio verás las papelerías disponibles cerca de ti, con sus precios y calificaciones.',
    tip:     '💡 Toca "Elegir" en la papelería que prefieras antes de subir tu documento.',
  },
  {
    icon:    'ti-upload',
    color:   '#1A1A1A',
    title:   '2. Sube tu documento',
    desc:    'Toca el botón central de la barra inferior. Puedes subir PDF, Word, imágenes o cualquier documento.',
    tip:     '💡 La app detecta automáticamente el número de páginas y calcula el precio.',
  },
  {
    icon:    'ti-send',
    color:   '#1A1A1A',
    title:   '3. Envía tu pedido',
    desc:    'Revisa el resumen con el precio total y toca "Enviar pedido". Se descuentan $2 de tu saldo por el servicio.',
    tip:     '💡 Recarga saldo desde la sección "Saldo" con tarjeta o en OXXO.',
  },
  {
    icon:    'ti-bell',
    color:   '#1A1A1A',
    title:   '4. Espera el aviso',
    desc:    'Cuando tu impresión esté lista, recibirás una notificación. También puedes revisar el estado en "Historial".',
    tip:     '💡 El estado cambia de "Enviado" → "Imprimiendo" → "Listo para recoger".',
  },
  {
    icon:    'ti-cash',
    color:   '#1A1A1A',
    title:   '5. Recoge y paga',
    desc:    'Ve a la papelería, recoge tu documento y paga en efectivo el costo de impresión directamente al negocio.',
    tip:     '💡 El pago en efectivo lo haces directo en la papelería, no en la app.',
  },
  {
    icon:    'ti-star',
    color:   '#F59E0B',
    title:   '6. Califica el servicio',
    desc:    'Después de recoger, te pediremos que califiques la experiencia. Tu opinión ayuda a otros usuarios.',
    tip:     '💡 Las calificaciones ayudan a las mejores papelerías a destacar.',
  },
]

const TUTORIAL_PRINTSHOP = [
  {
    icon:    'ti-printer',
    color:   '#1A1A1A',
    title:   '¡Bienvenido a Pliego!',
    desc:    'Con Pliego recibes pedidos de impresión de clientes cercanos, directamente en tu celular.',
    tip:     null,
  },
  {
    icon:    'ti-bell',
    color:   '#1A1A1A',
    title:   '1. Así llegan los pedidos',
    desc:    'Cuando un cliente envía un documento, aparece instantáneamente en tu pantalla de "Pedidos" con un aviso sonoro.',
    tip:     '💡 No necesitas recargar la página — los pedidos llegan solos en tiempo real.',
  },
  {
    icon:    'ti-download',
    color:   '#1A1A1A',
    title:   '2. Descarga el documento',
    desc:    'Toca "Descargar" para ver el archivo. La primera vez genera el enlace; toca "Abrir archivo" para abrirlo.',
    tip:     '💡 El archivo se elimina automáticamente en 3 días por privacidad del cliente.',
  },
  {
    icon:    'ti-printer',
    color:   '#1A1A1A',
    title:   '3. Los 3 botones del pedido',
    desc:    'Cada pedido tiene 3 botones independientes:\n• "Imprimir" → confirma que empezaste a imprimir\n• "Listo" → avisa al cliente que puede pasar\n• "Entregar" → cierra el pedido al hacer entrega',
    tip:     '💡 Cuando tocas "Listo", el cliente recibe una notificación automática.',
  },
  {
    icon:    'ti-cash',
    color:   '#1A1A1A',
    title:   '4. Tus ganancias',
    desc:    'En la tab "Ganancias" ves el total que has cobrado en efectivo. Ese dinero es 100% tuyo — los clientes te pagan directo.',
    tip:     '💡 Pliego cobra $2 al cliente por el servicio de la plataforma, tú no pierdes nada.',
  },
  {
    icon:    'ti-star',
    color:   '#F59E0B',
    title:   '5. Tus reseñas',
    desc:    'En la tab "Reseñas" ves las calificaciones y comentarios de tus clientes. Un buen promedio te da más visibilidad.',
    tip:     '💡 Las papelerías con mejor calificación aparecen primero en la lista.',
  },
  {
    icon:    'ti-settings',
    color:   '#1A1A1A',
    title:   '6. Configura tu papelería',
    desc:    'En "Config" puedes cambiar tus horarios, precios por tipo de impresión y agregar servicios personalizados.',
    tip:     '💡 Mantén actualizado el toggle "Recibiendo pedidos" para que los clientes sepan si estás disponible.',
  },
]

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function TutorialPage({ type = 'user', onClose }) {
  const [step, setStep] = useState(0)
  const steps = type === 'printshop' ? TUTORIAL_PRINTSHOP : TUTORIAL_USER
  const current = steps[step]
  const isLast  = step === steps.length - 1

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'var(--gradient-dark)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 28, textAlign: 'center',
    }}>
      {/* Botón skip */}
      <button onClick={onClose} style={{
        position: 'absolute', top: 52, right: 20,
        background: 'rgba(255,255,255,0.15)', border: 'none',
        borderRadius: 20, padding: '6px 14px',
        color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600,
      }}>
        Saltar
      </button>

      {/* Ícono */}
      <div style={{
        width: 88, height: 88, borderRadius: 28,
        background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 28, border: '2px solid rgba(255,255,255,0.25)',
      }}>
        <i className={`ti ${current.icon}`} style={{ fontSize: 44, color: '#fff' }} />
      </div>

      {/* Paso */}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 2, marginBottom: 10 }}>
        {step + 1} / {steps.length}
      </p>

      {/* Título */}
      <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 14, lineHeight: 1.2 }}>
        {current.title}
      </p>

      {/* Descripción */}
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, marginBottom: 16, maxWidth: 300, whiteSpace: 'pre-line' }}>
        {current.desc}
      </p>

      {/* Tip */}
      {current.tip && (
        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: 12,
          padding: '10px 16px', marginBottom: 24, maxWidth: 300,
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{current.tip}</p>
        </div>
      )}

      {/* Dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {steps.map((_, i) => (
          <div key={i} onClick={() => setStep(i)} style={{
            width: i === step ? 22 : 6, height: 6, borderRadius: 3,
            background: i === step ? '#fff' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.25s', cursor: 'pointer',
          }} />
        ))}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 300 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            flex: 1, padding: '13px 0',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 14, color: '#fff', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}>
            ← Anterior
          </button>
        )}
        {isLast ? (
          <button onClick={onClose} className="btn-primary" style={{ flex: 1 }}>
            ¡Entendido!
          </button>
        ) : (
          <button onClick={() => setStep(s => s + 1)} style={{
            flex: 1, padding: '13px 0',
            background: '#fff', border: 'none',
            borderRadius: 14, color: '#1A1A1A', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  )
}
