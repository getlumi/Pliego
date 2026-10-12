import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────
// Filas del desglose por archivo, cada una con su propio botón "Abrir"
// (12/10/2026). Un pedido con varios archivos guarda en image_items[i].path
// la ruta de CADA archivo por separado (ver sendOrder.js → planUnitUploads),
// así la papelería abre cada documento de forma independiente.
//
// - Los enlaces firmados se piden TODOS juntos al mostrar la tarjeta (un solo
//   viaje), y se renuevan antes de que venzan — así abrir un archivo es UN
//   toque. (Pedirlos al tocar obligaba a dos toques por archivo en iOS:
//   Safari bloquea window.open() tras un await.)
// - Pedidos anteriores a este cambio no traen `path`: se muestra la fila
//   igual que antes, sin botón (el "Descargar" general sigue funcionando).
// - Un componente propio para no mezclar este estado con el de OrdersTab
//   (Regla 3: el canal Realtime y sus recargas no deben interferir).
// ─────────────────────────────────────────────────────────────────────
const UNIT_URL_TTL = 600            // 10 min de validez de cada enlace
const UNIT_URL_REFRESH_MS = 8 * 60 * 1000 // se renuevan a los 8 min

export default function OrderItemRows({ order }) {
  const items = order.image_items ?? []
  const paths = [...new Set(items.map(it => it.path).filter(Boolean))]
  const pathsKey = paths.join('|')
  const finished = order.status === 'entregado'
  const [urls, setUrls] = useState({})   // path -> signedUrl | null (null = no disponible)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!pathsKey || finished) return
    let cancelled = false
    setUrls({}) // otro pedido / otras rutas: nunca mostrar enlaces del anterior
    const list = pathsKey.split('|')
    const fetchUrls = async () => {
      setLoading(true)
      const { data, error } = await supabase.storage.from('documents').createSignedUrls(list, UNIT_URL_TTL)
      if (cancelled) return
      setLoading(false)
      if (error || !Array.isArray(data)) return // se queda con lo que ya había; reintenta en el siguiente ciclo
      const next = {}
      data.forEach(r => { next[r.path] = r.error ? null : r.signedUrl })
      setUrls(next)
    }
    fetchUrls()
    const t = setInterval(fetchUrls, UNIT_URL_REFRESH_MS)
    return () => { cancelled = true; clearInterval(t) }
  }, [order.id, pathsKey, finished])

  return items.map((it, i) => {
    const url = it.path ? urls[it.path] : undefined
    return (
      <div key={i} style={{
        display:'flex', alignItems:'center', gap:8,
        paddingTop: i > 0 ? 6 : 0,
        borderTop: i > 0 ? '1px solid var(--border-light)' : 'none',
        marginTop: i > 0 ? 6 : 0,
      }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {i + 1}. {it.name ?? `Archivo ${i + 1}`}{it.pages > 1 ? ` (${it.pages} pág.)` : ''}
          </p>
          <p style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)' }}>
            {it.label ?? it.service_type ?? '—'}
            {it.shared_sheet ? ' · comparte hoja con otras imágenes' : ''}
          </p>
        </div>
        {it.path && !finished && (
          url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{
              flexShrink:0, padding:'7px 12px', fontSize:12, fontWeight:700,
              borderRadius:'var(--radius-md)', background:'var(--green)', color:'#fff',
              textDecoration:'none', display:'flex', alignItems:'center', gap:4,
            }}>
              <i className="ti ti-external-link" style={{ fontSize:14 }} /> Abrir
            </a>
          ) : (
            <span style={{
              flexShrink:0, padding:'7px 12px', fontSize:12, fontWeight:700,
              borderRadius:'var(--radius-md)', background:'var(--border)', color:'var(--text-muted)',
            }}>
              {url === null ? 'No disponible' : (loading ? 'Cargando…' : '…')}
            </span>
          )
        )}
      </div>
    )
  })
}
