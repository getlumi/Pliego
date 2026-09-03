import React, { useState } from 'react'

// ============================================================
// CONTENIDO DEL TUTORIAL POR PERFIL
// ============================================================

const TUTORIAL_USER = [
  {
    icon:  'ti-printer',
    title: '¡Bienvenido a Pliego!',
    desc:  'Imprime tus documentos en papelerías cercanas sin complicaciones. Todo desde tu celular en minutos.',
    tip:   null,
  },
  {
    icon:  'ti-map-pin',
    title: '1. Elige una papelería',
    desc:  'En la pantalla de inicio verás las papelerías abiertas cerca de ti con sus precios y calificaciones. Toca "Elegir" en la que prefieras.',
    tip:   '💡 La papelería elegida aparece destacada arriba. Puedes cambiarla cuando quieras.',
  },
  {
    icon:  'ti-upload',
    title: '2. Sube tu documento',
    desc:  'Toca el botón central ⬆️ de la barra inferior. Puedes subir PDF, Word o imágenes. La app detecta el número de páginas automáticamente.',
    tip:   '💡 Tus archivos se eliminan automáticamente en 3 días por tu privacidad.',
  },
  {
    icon:  'ti-send',
    title: '3. Envía tu pedido',
    desc:  'Revisa el precio y toca "Enviar pedido". Se descuenta 1 crédito de tu saldo como cuota de servicio (o nada si tienes el plan Ilimitado). El resto lo pagas en efectivo al recoger.',
    tip:   '💡 Necesitas créditos disponibles para enviar. Recarga desde la sección "Saldo".',
  },
  {
    icon:  'ti-wallet',
    title: '4. Elige cómo pagar la cuota',
    desc:  'En "Saldo" puedes comprar paquetes de créditos ($26.5 por 2, $55 por 5) que se gastan uno por pedido, o suscribirte al plan Ilimitado por $75/mes — el plan de quienes no se complican: pagas una vez y ya, sin volver a pensar en tu saldo.',
    tip:   '💡 Para OXXO: genera el voucher, ve a cualquier OXXO y muestra el número de referencia al cajero.',
  },
  {
    icon:  'ti-bell',
    title: '5. Espera el aviso',
    desc:  'Cuando tu impresión esté lista, te avisamos por WhatsApp desde nuestro número — si por algo no llega, lo mandamos por SMS como respaldo automático. También puedes ver el estado en "Historial": Enviado → Imprimiendo → Listo para recoger.',
    tip:   '📱 Guarda nuestro número en tus contactos apenas te llegue el primer mensaje, así no te lo pierdes la próxima vez.',
    tipColor: '#25D366',
  },
  {
    icon:  'ti-shield-check',
    title: '6. La garantía: imprime antes de llegar',
    desc:  'Cuando tu pedido cabe en tu saldo (o cuesta $50 o menos con el plan Ilimitado), la papelería lo imprime antes de que llegues — no esperas en la fila. A cambio, tienes 24 horas desde que está "Listo" para pasar por él.\n\nSi usas créditos y no pasas a tiempo: se descuenta el crédito de tu cuenta.\nSi tienes el plan Ilimitado y no pasas a tiempo: tu cuenta se suspende hasta pagar una multa de $50 para reactivarla.',
    tip:   '💡 Puedes pedir 2 horas más una sola vez, desde el aviso en "Historial", si se te complica llegar a tiempo.',
  },
  {
    icon:  'ti-cash',
    title: '7. Recoge y paga',
    desc:  'Ve a la papelería y paga el costo de impresión en efectivo directamente al negocio. El cajero entregará tu documento impreso.',
    tip:   '💡 El pago de impresión es directo a la papelería, no a Pliego.',
  },
  {
    icon:  'ti-star',
    title: '8. Califica el servicio',
    desc:  'Después de recoger te pediremos que califiques con estrellas y dejes un comentario. Tu opinión ayuda a otros usuarios y mejora el servicio.',
    tip:   '💡 En "Perfil" también tienes Soporte y este tutorial disponibles siempre.',
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
    desc:    'Cuando un cliente envía un documento, aparece instantáneamente en tu pantalla de "Pedidos" con un aviso sonoro. También te avisamos por WhatsApp desde nuestro número por si no tienes la app abierta — con SMS como respaldo automático si no llega.',
    tip:     '📱 Agrega nuestro número a tus contactos para no perderte ningún aviso de pedido nuevo.',
    tipColor: '#25D366',
  },
  {
    icon:    'ti-download',
    color:   '#1A1A1A',
    title:   '2. Descarga el documento',
    desc:    'Toca "Descargar" para ver el archivo. La primera vez genera el enlace; toca "Abrir archivo" para abrirlo.',
    tip:     '💡 El archivo se elimina automáticamente en 3 días por privacidad del cliente.',
  },
  {
    icon:    'ti-shield-check',
    color:   '#1A1A1A',
    title:   '3. La garantía anti-no-show',
    desc:    'Cada pedido te dice si está cubierto por la garantía. Si NO lo está, verás una alerta roja — no imprimas hasta que el cliente esté físicamente en tu local. Si SÍ está cubierto, puedes imprimir con confianza: si el cliente no pasa a recoger en 24 horas, se le descuenta el crédito (o se suspende su cuenta si tiene el plan Ilimitado) y tú puedes reclamar tu pago por Soporte.',
    tip:     '💡 Escribe a Soporte con el tema "Cliente no pasó por su pedido" para reclamar tu pago en esos casos.',
  },
  {
    icon:    'ti-printer',
    color:   '#1A1A1A',
    title:   '4. Los 3 botones del pedido',
    desc:    'Cada pedido tiene 3 botones: "Imprimir" confirma que empezaste, "Listo" avisa al cliente que puede pasar a recoger (y arranca las 24 horas de la garantía), y "Entregar" cierra el pedido al hacer la entrega.',
    tip:     '📱 Cuando tocas "Listo", el cliente recibe el aviso por WhatsApp (con SMS de respaldo si no llega).',
    tipColor: '#25D366',
  },
  {
    icon:    'ti-cash',
    color:   '#1A1A1A',
    title:   '5. Tus ganancias',
    desc:    'En la tab "Ganancias" ves el total que has cobrado en efectivo. Ese dinero es 100% tuyo — los clientes te pagan directo, sin comisión de Pliego sobre lo que cobras.',
    tip:     '💡 Pliego cobra una cuota de servicio al cliente (o su mensualidad), tú no pierdes nada de tus ventas.',
  },
  {
    icon:    'ti-star',
    color:   '#F59E0B',
    title:   '6. Tus reseñas',
    desc:    'En la tab "Reseñas" ves las calificaciones y comentarios de tus clientes. Un buen promedio te da más visibilidad.',
    tip:     '💡 Las papelerías con mejor calificación aparecen primero en la lista.',
  },
  {
    icon:    'ti-settings',
    color:   '#1A1A1A',
    title:   '7. Configura tu papelería',
    desc:    'En "Config" puedes cambiar tus horarios, precios por tipo de impresión y agregar servicios personalizados como cartulina, adhesivo o fotográfico.',
    tip:     null,
  },
  {
    icon:    'ti-toggle-right',
    color:   '#1A1A1A',
    title:   '8. Activa y desactiva cuando quieras',
    desc:    'El toggle "Recibiendo pedidos" en Config te permite pausar temporalmente sin desaparecer de la app. Úsalo cuando estés lleno, en descanso o fuera del local.',
    tip:     '💡 Los clientes ven si estás disponible u ocupado antes de elegirte.',
  },
  {
    icon:    'ti-gift',
    color:   '#1A1A1A',
    title:   '9. Tu periodo de gracia',
    desc:    'Pliego funciona con una mensualidad fija de $75 — sin comisión sobre lo que cobras, nunca. Si estás entre las primeras 10 papelerías de la zona, tienes 3 meses gratis para probarlo sin compromiso; si te registras después, 1 mes. Puedes suscribirte cuando quieras desde "Perfil", sin esperar a que se acabe tu gracia.',
    tip:     '💡 Si tu periodo de gracia termina sin suscribirte, dejas de recibir pedidos hasta que te suscribas — no se borra nada de tu información.',
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

      {/* Tip — si el paso trae tipColor (ej. verde WhatsApp), resalta distinto
          de los demás para que un aviso importante no se pierda entre los otros */}
      {current.tip && (
        <div style={{
          background: current.tipColor ? `${current.tipColor}22` : 'rgba(255,255,255,0.1)',
          border: current.tipColor ? `1.5px solid ${current.tipColor}` : 'none',
          borderRadius: 12,
          padding: '10px 16px', marginBottom: 24, maxWidth: 300,
        }}>
          <p style={{ fontSize: 13, color: current.tipColor || 'rgba(255,255,255,0.8)', lineHeight: 1.5, fontWeight: current.tipColor ? 700 : 400 }}>{current.tip}</p>
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

