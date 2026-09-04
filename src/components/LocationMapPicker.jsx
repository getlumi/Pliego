import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Arregla un problema conocido de Leaflet con bundlers (Vite/Webpack): las
// rutas por default de los íconos del pin apuntan a archivos que el
// bundler no expone tal cual, y el pin sale invisible o roto. Se
// reemplazan explícitamente por las URLs reales que Vite ya procesó.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow })

// Mapa con un pin que se puede arrastrar a mano para ajustar la ubicación
// exacta — pensado para corregir los casos donde el GPS del celular se
// equivoca (ej. "Ubicación precisa" desactivada en iOS, mala señal
// dentro de un local). Arranca centrado en `coords` (normalmente ya
// viene del GPS) y avisa la posición final cada vez que se suelta el pin.
export default function LocationMapPicker({ coords, onChange, height = 260 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!coords) {
      // Si la ubicación llegara a vaciarse mientras el mapa ya existe,
      // se destruye por completo aquí — así, si más adelante vuelve a
      // haber una ubicación, Leaflet puede crear el mapa de cero sin
      // toparse con uno "fantasma" en el mismo contenedor.
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null }
      return
    }
    if (!containerRef.current) return

    if (!mapRef.current) {
      const map = L.map(containerRef.current, { zoomControl: true }).setView([coords.lat, coords.lng], 18)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChange({ lat: pos.lat, lng: pos.lng })
      })

      mapRef.current = map
      markerRef.current = marker
    } else {
      // Ya existe el mapa — solo mover el pin si las coords cambiaron
      // desde afuera (ej. el usuario volvió a tocar "Capturar ubicación").
      // No recrear el mapa completo, sería lento y perdería el zoom.
      const current = markerRef.current.getLatLng()
      if (Math.abs(current.lat - coords.lat) > 1e-9 || Math.abs(current.lng - coords.lng) > 1e-9) {
        markerRef.current.setLatLng([coords.lat, coords.lng])
        mapRef.current.setView([coords.lat, coords.lng])
      }
    }
  }, [coords?.lat, coords?.lng])

  useEffect(() => () => {
    // Limpieza al desmontar — evita fugas si el usuario navega fuera
    // antes de terminar el registro.
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
  }, [])

  if (!coords) return null

  return (
    <div>
      <div ref={containerRef} style={{ height, borderRadius: 12, overflow: 'hidden', border: '1.5px solid var(--border)' }} />
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>
        Arrastra el pin si no cae exacto en tu local.
      </p>
    </div>
  )
}
