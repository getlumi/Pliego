// Pliego · helpers de horarios (compartidos entre cliente y panel de papelería)

export const DAY_KEYS  = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const DAY_LABELS = { sun: 'Domingo', mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves', fri: 'Viernes', sat: 'Sábado' }
export const DAY_SHORT  = { sun: 'Dom', mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb' }

export const DEFAULT_HOURS = {
  sun: [{ open: '09:00', close: '21:00' }],
  mon: [{ open: '09:00', close: '21:00' }],
  tue: [{ open: '09:00', close: '21:00' }],
  wed: [{ open: '09:00', close: '21:00' }],
  thu: [{ open: '09:00', close: '21:00' }],
  fri: [{ open: '09:00', close: '21:00' }],
  sat: [{ open: '09:00', close: '21:00' }],
}

function nowParts() {
  const now = new Date()
  const day = DAY_KEYS[now.getDay()]
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  return { day, hhmm }
}

// ¿Está abierta ahora mismo, considerando el día y posibles turnos partidos?
export function isOpenNow(hours) {
  const h = hours || DEFAULT_HOURS
  const { day, hhmm } = nowParts()
  const periods = h[day] ?? []
  return periods.some(p => p.open <= hhmm && p.close >= hhmm)
}

// Texto corto tipo "Abierto hasta 21:00" o "Abre a las 16:00" para la tarjeta
export function todayLabel(hours) {
  const h = hours || DEFAULT_HOURS
  const { day, hhmm } = nowParts()
  const periods = h[day] ?? []
  if (periods.length === 0) return 'Cerrado hoy'

  const active = periods.find(p => p.open <= hhmm && p.close >= hhmm)
  if (active) return `Abierto hasta ${active.close}`

  const next = periods.find(p => p.open > hhmm)
  if (next) return `Abre a las ${next.open}`

  return 'Cerrado'
}
