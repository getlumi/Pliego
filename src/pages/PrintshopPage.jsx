import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import SupportPage  from './SupportPage'
import TutorialPage from './TutorialPage'
import { DAY_KEYS, DAY_LABELS, DEFAULT_HOURS } from '../lib/hours'

const SERVICE_OPTIONS = [
  { type: 'bn_bond',       icon: 'ti-file-text', label: 'B/N · Bond carta',     defaultPrice: 1 },
  { type: 'color_bond',    icon: 'ti-palette',   label: 'Color · Bond carta',   defaultPrice: 5 },
  { type: 'opalina_bn',    icon: 'ti-sparkles',  label: 'Opalina · B/N',        defaultPrice: 3 },
  { type: 'opalina_color', icon: 'ti-sparkles',  label: 'Opalina · Color',      defaultPrice: 8 },
  { type: 'doble_carta',   icon: 'ti-files',     label: 'Doble carta / oficio', defaultPrice: 2 },
]

const STATUS_LABEL = { nuevo: 'Nuevo', en_proceso: 'En proceso', listo: 'Listo', entregado: 'Entregado' }
const STATUS_BADGE = { nuevo: 'badge-green', en_proceso: 'badge-amber', listo: 'badge-green', entregado: 'badge' }

function deriveCustom(services) {
  return services
    .filter(s => !SERVICE_OPTIONS.some(opt => opt.type === s.service_type))
    .map(s => ({ id: s.id, service_type: s.service_type, label: s.label ?? s.service_type, price: s.price_per_sheet, enabled: s.enabled }))
}

export default function PrintshopPage({ session }) {
  const [loading, setLoading] = useState(true)
  const [shop, setShop]       = useState(null)
  const [services, setServices] = useState([])
  const [orders, setOrders]   = useState([])
  const [tab, setTab]         = useState('orders')
  const [showWelcome, setShowWelcome] = useState(false)
  const [showSupport,  setShowSupport]  = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  useEffect(() => {
    loadShop()
  }, [])

  useEffect(() => {
    if (!shop?.id) return

    // Canal 1: cambios en printshops (aprobación KYC)
    const shopChannel = supabase
      .channel(`shop:${shop.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'printshops',
        filter: `id=eq.${shop.id}`,
      }, payload => {
        const wasNotVerified = !shop.verified
        const nowVerified = payload.new.verified === true
        setShop(prev => ({ ...prev, ...payload.new }))
        if (wasNotVerified && nowVerified) setShowWelcome(true)
      })
      .subscribe()

    // Canal 2: pedidos nuevos — vive en el padre para persistir entre tabs
    let ordersChannel
    const setupOrdersChannel = () => {
      if (ordersChannel) supabase.removeChannel(ordersChannel)
      ordersChannel = supabase
        .channel(`orders:shop:${shop.id}:${Date.now()}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'orders',
        }, (payload) => {
          const shopId = payload.new?.printshop_id ?? payload.old?.printshop_id
          if (shopId !== shop.id) return
          if (payload.eventType === 'INSERT') {
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)()
              const play = (freq, t) => {
                const o = ctx.createOscillator()
                const g = ctx.createGain()
                o.connect(g); g.connect(ctx.destination)
                o.frequency.value = freq
                g.gain.setValueAtTime(0.3, ctx.currentTime + t)
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.4)
                o.start(ctx.currentTime + t)
                o.stop(ctx.currentTime + t + 0.4)
              }
              play(880, 0); play(1100, 0.15)
            } catch (_) {}
          }
          loadOrders(shop.id)
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            supabase.removeChannel(ordersChannel)
            setTimeout(setupOrdersChannel, 3000)
          }
        })
    }
    setupOrdersChannel()

    // Reconexión cuando la app vuelve al foreground (iOS mata WebSockets en background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setupOrdersChannel()   // reconectar canal
        loadOrders(shop.id)    // cargar pedidos que llegaron mientras estaba en background
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      supabase.removeChannel(shopChannel)
      if (ordersChannel) supabase.removeChannel(ordersChannel)
    }
  }, [shop?.id, shop?.verified])

  const loadShop = async () => {
    const { data } = await supabase
      .from('printshops')
      .select('*, printshop_services(*)')
      .eq('owner_id', session.user.id)
      .maybeSingle()
    setShop(data)
    setServices(data?.printshop_services ?? [])
    if (data) await loadOrders(data.id)

    // Si recién fue aprobada y aún no vio el mensaje, mostrarlo
    if (data?.verified && !data?.welcome_shown) {
      if (data.reviewed_at) {
        const reviewedAt = new Date(data.reviewed_at)
        const hoursSinceReview = (Date.now() - reviewedAt.getTime()) / 1000 / 3600
        if (hoursSinceReview < 48) {
          setShowWelcome(true)
          // Marcar como visto en DB para no volver a mostrar
          await supabase.from('printshops')
            .update({ welcome_shown: true })
            .eq('id', data.id)
        }
      }
    }

    setLoading(false)
  }

  const loadOrders = async (shopId) => {
    const { data } = await supabase
      .from('orders')
      .select('id, created_at, status, file_name, file_url, file_count, copies, orientation, color_mode, paper_size, service_type, estimated_cost, special_instructions, ready_at, delivered_at, user_name, expires_at')
      .eq('printshop_id', shopId)
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
  }

  if (loading) {
    return (
      <div className="page" style={{ paddingBottom: 0 }}>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
      </div>
    )
  }

  if (!shop) return <RegisterShop session={session} onRegistered={loadShop} />

  // Si ya tiene datos pero nunca subió documentos, mostrar paso 2
  if (!shop.submitted_at) return (
    <RegisterShop
      session={session}
      existingShopId={shop.id}
      onRegistered={loadShop}
    />
  )


  if (showTutorial) return (
    <TutorialPage type="printshop" onClose={() => setShowTutorial(false)} />
  )

  if (showSupport) return (
    <SupportPage
      session={session}
      fromType="printshop"
      printshopId={shop?.id}
      onBack={() => setShowSupport(false)}
    />
  )

  return (
    <div className="page" style={{ paddingBottom: 0 }}>

      {/* Modal de bienvenida cuando es aprobada */}
      {showWelcome && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:24,
        }}>
          <div style={{ background:'#fff', borderRadius:24, padding:32, width:'100%', maxWidth:340, textAlign:'center' }}>
            <p style={{ fontSize:52, marginBottom:12 }}>🎉</p>
            <p style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>¡Felicidades!</p>
            <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6, marginBottom:24 }}>
              Tu documentación fue verificada y tu papelería <strong>{shop?.name}</strong> ya está activa en Pliego. ¡Mucho éxito!
            </p>
            <button onClick={() => setShowWelcome(false)} className="btn-primary">
              <i className="ti ti-rocket" style={{ fontSize:16 }} />
              ¡Vamos!
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 20px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="ti ti-printer" style={{ fontSize:18, color:'#fff' }} />
            </div>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Pliego · Negocio</p>
          </div>
          <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff' }}>
            {shop.name?.[0]?.toUpperCase() ?? 'P'}
          </div>
        </div>
        <p style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{shop.name}</p>
      </div>

      {/* Banner de verificación pendiente */}
      {!shop.verified && (
        <div style={{ margin:'0 16px', marginTop: 8 }}>
          {shop.verification_status === 'rejected' ? (
            <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:'var(--radius-md)', padding:'12px 14px' }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--red)', marginBottom:4 }}>
                <i className="ti ti-x" style={{ fontSize:14, verticalAlign:-1 }} /> Verificación rechazada
              </p>
              <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>{shop.rejection_reason ?? 'Uno o más documentos no fueron aceptados.'}</p>
              <button
                onClick={async () => {
                  // Limpiar submitted_at para que vuelva al paso 2
                  await supabase.from('printshops').update({
                    submitted_at: null,
                    verification_status: 'pending',
                    ine_url: null, selfie_url: null, address_proof_url: null,
                    doc_ine_status: 'pending', doc_selfie_status: 'pending', doc_address_status: 'pending',
                  }).eq('id', shop.id)
                  loadShop()
                }}
                style={{ fontSize:12, fontWeight:700, color:'var(--red)', background:'none', border:'1px solid var(--red)', borderRadius:'var(--radius-md)', padding:'6px 12px', cursor:'pointer' }}
              >
                <i className="ti ti-upload" style={{ fontSize:12, marginRight:4 }} />
                Volver a subir documentos
              </button>
            </div>
          ) : (
            <div style={{ background:'var(--amber-light)', border:'1px solid var(--amber)', borderRadius:'var(--radius-md)', padding:'12px 14px' }}>
              <p style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>
                <i className="ti ti-clock" style={{ fontSize:14, verticalAlign:-1 }} /> Verificación en proceso
              </p>
              <p style={{ fontSize:12, color:'var(--text-secondary)' }}>
                Estamos revisando tus documentos. Te avisaremos por WhatsApp en menos de 24 horas. Mientras tanto puedes configurar tu papelería.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:5, padding:'14px 12px 0' }}>
        {[
          {id:'orders',   label:'Pedidos',   icon:'ti-list-details'},
          {id:'earnings', label:'Ganancias', icon:'ti-cash'},
          {id:'reviews',  label:'Reseñas',   icon:'ti-star'},
          {id:'config',   label:'Config',    icon:'ti-settings'},
          {id:'profile',  label:'Perfil',    icon:'ti-user'},
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:'9px 2px', borderRadius:'var(--radius-md)',
            border: tab === t.id ? 'none' : '1px solid var(--border)',
            background: tab === t.id ? 'var(--gradient)' : '#fff',
            color: tab === t.id ? '#fff' : 'var(--text-secondary)',
            fontSize:11, fontWeight:700, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize:15 }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'orders'
        ? <OrdersTab shop={shop} orders={orders} setOrders={setOrders} onReload={loadShop} onReloadOrders={() => loadOrders(shop.id)} />
        : tab === 'earnings'
        ? <EarningsTab shop={shop} />
        : tab === 'reviews'
        ? <ReviewsTab shop={shop} />
        : tab === 'profile'
        ? <PrintshopProfileTab shop={shop} session={session} onSupport={() => setShowSupport(true)} onTutorial={() => setShowTutorial(true)} />
        : <ConfigTab shop={shop} services={services}
            onServicesChange={setServices}
            onSaved={async () => {
              // Recargar services frescos del padre para que al remontar ConfigTab
              // el prop `services` ya tenga los datos actualizados de DB
              const { data: freshServices } = await supabase
                .from('printshop_services')
                .select('*')
                .eq('printshop_id', shop.id)
              if (freshServices) setServices(freshServices)
            }} />}
    </div>
  )
}

// ============================================================
// REGISTRO
// ============================================================
export function RegisterShop({ session, onRegistered, onCancel, existingShopId }) {
  const [step, setStep]         = useState(existingShopId ? 2 : 1)
  const [shopId, setShopId]     = useState(existingShopId ?? null)
  const [name, setName]         = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [coords, setCoords]     = useState(null)
  const [locating, setLocating] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Documentos KYC
  const [ineFile, setIneFile]           = useState(null)
  const [selfieFile, setSelfieFile]     = useState(null)
  const [addressFile, setAddressFile]   = useState(null)
  const [uploading, setUploading]       = useState(false)

  const getLocation = () => {
    setError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      ()  => { setError('No pudimos obtener tu ubicación. Revisa los permisos del navegador.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submitStep1 = async () => {
    setError('')
    if (!name.trim())     return setError('Escribe el nombre de tu negocio')
    if (!whatsapp.trim()) return setError('Escribe tu número de WhatsApp')
    if (!coords)          return setError('Necesitamos tu ubicación para registrarte')

    setSaving(true)
    const { data: shop, error: shopError } = await supabase
      .from('printshops')
      .insert({
        name: name.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        whatsapp: whatsapp.replace(/\s/g,''),
        owner_id: session.user.id,
        hours: DEFAULT_HOURS,
        verified: false,
        verification_status: 'pending',
      })
      .select()
      .single()

    if (shopError) {
      setError('No se pudo registrar tu papelería. Intenta de nuevo.')
      setSaving(false)
      return
    }

    await supabase.from('printshop_services').insert(
      SERVICE_OPTIONS.map(s => ({
        printshop_id: shop.id,
        service_type: s.type,
        price_per_sheet: s.defaultPrice,
        enabled: s.type === 'bn_bond',
      }))
    )

    setShopId(shop.id)
    setSaving(false)
    setStep(2)
  }

  const uploadDoc = async (file, type) => {
    const ext = file.name.split('.').pop()
    const path = `${session.user.id}/${type}.${ext}`
    const { error } = await supabase.storage
      .from('verification-docs')
      .upload(path, file, { upsert: true })
    if (error) throw error
    return path
  }

  const submitStep2 = async () => {
    setError('')
    if (!ineFile)     return setError('Sube tu identificación oficial (INE o pasaporte)')
    if (!selfieFile)  return setError('Sube tu selfie sosteniendo tu identificación')
    if (!addressFile) return setError('Sube tu comprobante de domicilio')

    setUploading(true)
    try {
      const [ineUrl, selfieUrl, addressUrl] = await Promise.all([
        uploadDoc(ineFile, 'ine'),
        uploadDoc(selfieFile, 'selfie'),
        uploadDoc(addressFile, 'domicilio'),
      ])

      await supabase.from('printshops').update({
        ine_url:          ineUrl,
        selfie_url:       selfieUrl,
        address_proof_url: addressUrl,
        submitted_at:     new Date().toISOString(),
      }).eq('id', shopId)

      onRegistered()
    } catch (e) {
      setError('Error al subir documentos. Verifica tu conexión e intenta de nuevo.')
    }
    setUploading(false)
  }

  if (step === 2) return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 24px' }}>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Verificación de identidad</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Paso 2 de 2 — Documentos</p>
      </div>
      <div className="scroll-content">
        <div className="card" style={{ background: 'var(--green-light)', border: '1px solid var(--green)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            <i className="ti ti-shield-check" style={{ fontSize: 15, verticalAlign: -2, marginRight: 6 }} />
            ¿Por qué pedimos esto?
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Verificamos la identidad de cada papelería para proteger a nuestros usuarios. Tus documentos se guardan de forma segura y solo el equipo de Pliego puede verlos.
          </p>
        </div>

        {/* INE */}
        <DocUpload
          icon="ti-id-badge"
          label="Identificación oficial"
          hint="INE o pasaporte vigente · Foto clara del frente"
          file={ineFile}
          onChange={setIneFile}
        />

        {/* Selfie */}
        <DocUpload
          icon="ti-camera-selfie"
          label="Selfie con tu identificación"
          hint="Tómate una foto sosteniendo tu INE o pasaporte"
          file={selfieFile}
          onChange={setSelfieFile}
        />

        {/* Comprobante */}
        <DocUpload
          icon="ti-home"
          label="Comprobante de domicilio"
          hint="Recibo de luz, agua o teléfono — máx. 3 meses de antigüedad"
          file={addressFile}
          onChange={setAddressFile}
        />

        {error && (
          <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, alignItems:'center' }}>
            <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
            <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{error}</p>
          </div>
        )}

        <button onClick={submitStep2} disabled={uploading} className="btn-primary">
          <i className="ti ti-send" style={{ fontSize:16 }} />
          {uploading ? 'Subiendo documentos...' : 'Enviar para revisión'}
        </button>

        <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center' }}>
          Tu solicitud será revisada en menos de 24 horas. Te avisaremos por WhatsApp.
        </p>
      </div>
    </div>
  )

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div style={{ background: 'var(--gradient-dark)', padding: '48px 20px 24px' }}>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Registra tu papelería</p>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Paso 1 de 2 — Datos del negocio</p>
      </div>
      <div className="scroll-content">
        <div className="card">
          {/* Instrucción importante */}
          <div style={{ background:'var(--amber-light)', border:'1px solid var(--amber)', borderRadius:'var(--radius-md)', padding:'10px 14px', marginBottom:14, display:'flex', gap:8 }}>
            <i className="ti ti-map-pin" style={{ fontSize:16, color:'#92530a', flexShrink:0, marginTop:1 }} />
            <p style={{ fontSize:13, color:'#92530a', lineHeight:1.5 }}>
              <strong>Importante:</strong> Presiona el botón de ubicación estando <strong>dentro de tu local</strong> para que tu dirección sea exacta.
            </p>
          </div>

          <button onClick={getLocation} disabled={locating} className={coords ? 'btn-outline' : 'btn-primary'} style={{ marginBottom: 14 }}>
            <i className={`ti ${coords ? 'ti-circle-check' : 'ti-current-location'}`} style={{ fontSize:16 }} />
            {locating ? 'Obteniendo ubicación...' : coords ? '✓ Ubicación registrada' : 'Capturar mi ubicación ahora'}
          </button>

          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>NOMBRE DE TU PAPELERÍA</label>
          <input type="text" placeholder="Ej. Papelería Lupita" value={name} onChange={e => setName(e.target.value)}
            style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>WHATSAPP PARA AVISOS DE PEDIDOS</label>
          <input type="tel" placeholder="998 123 4567" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
            style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

          {error && (
            <div style={{ background:'var(--red-light)', border:'1px solid #F09595', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', gap:8, alignItems:'center' }}>
              <i className="ti ti-alert-circle" style={{ fontSize:16, color:'var(--red)', flexShrink:0 }} />
              <p style={{ fontSize:13, color:'var(--red)', fontWeight:600 }}>{error}</p>
            </div>
          )}

          <button onClick={submitStep1} disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : 'Continuar'}
            {!saving && <i className="ti ti-arrow-right" style={{ fontSize:16 }} />}
          </button>

          {onCancel && (
            <button onClick={onCancel} style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'var(--text-muted)', fontSize:13, cursor:'pointer', textAlign:'center' }}>
              No tengo papelería, soy cliente
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DocUpload({ icon, label, hint, file, onChange }) {
  const inputRef = React.useRef(null)
  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <i className={`ti ${icon}`} style={{ fontSize:22, color:'var(--green)' }} />
        <div>
          <p style={{ fontSize:14, fontWeight:700 }}>{label}</p>
          <p style={{ fontSize:11, color:'var(--text-secondary)' }}>{hint}</p>
        </div>
      </div>
      {file ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--green-light)', borderRadius:'var(--radius-md)', padding:'10px 12px' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--green)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
            <i className="ti ti-circle-check-filled" style={{ fontSize:15, verticalAlign:-2, marginRight:6 }} />
            {file.name}
          </span>
          <button onClick={() => onChange(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', flexShrink:0 }}>
            <i className="ti ti-x" style={{ fontSize:14 }} />
          </button>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} style={{
          width:'100%', padding:'12px', border:'1.5px dashed var(--border)', borderRadius:'var(--radius-md)',
          background:'#fff', cursor:'pointer', fontSize:13, color:'var(--text-secondary)',
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          <i className="ti ti-upload" style={{ fontSize:16 }} />
          Elegir archivo
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*,.pdf"
        onChange={e => { if (e.target.files[0]) onChange(e.target.files[0]); e.target.value = '' }}
        style={{ display:'none' }} />
    </div>
  )
}


// ============================================================
// TAB: PEDIDOS
// ============================================================
function OrdersTab({ shop, orders, setOrders, onReload, onReloadOrders }) {
  const [toggling, setToggling] = useState(false)

  // Solicitar permiso de notificaciones al montar
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const playAlert = () => {
    try {
      // Sonido corto generado con Web Audio API — sin archivo externo
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {}
  }

  const notifyNewOrder = (payload) => {
    // Solo notificar si es un pedido NUEVO (INSERT)
    if (payload.eventType !== 'INSERT') return
    playAlert()
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nuevo pedido en Pliego 🖨️', {
        body: `Llegó un documento para imprimir`,
        icon: '/icon-192.png',
      })
    }
    // Push al dueño de la papelería (para cuando no tiene la app abierta)
    supabase.functions.invoke('send-push', {
      body: {
        user_id: shop.owner_id,
        title:   '🖨️ Nuevo pedido',
        body:    'Tienes un documento listo para imprimir en Pliego',
        tag:     'new-order',
        url:     '/',
      }
    }).catch(() => {})
  }

  // Realtime: llegan pedidos nuevos sin refresh
  // Realtime vive en el componente padre PrintshopPage para persistir
  // independientemente del tab activo. OrdersTab solo recibe los datos.

  const pending = orders.filter(o => o.status === 'nuevo' || o.status === 'en_proceso')
  const today = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString())
  const cashToCollect = pending.reduce((sum, o) => sum + (o.estimated_cost ?? 0), 0)
  const delivered = orders.filter(o => o.status === 'entregado')
  const activeOrders = orders.filter(o => o.status !== 'entregado')

  const toggleAvailable = async () => {
    setToggling(true)
    await supabase.from('printshops').update({ is_available: !shop.is_available }).eq('id', shop.id)
    await onReload()
    setToggling(false)
  }

  const updateStatus = async (orderId, status, order) => {
    const extra = status === 'listo' ? { ready_at: new Date().toISOString() }
      : status === 'entregado' ? { delivered_at: new Date().toISOString() } : {}
    await supabase.from('orders').update({ status, ...extra }).eq('id', orderId)

    // Push al usuario cuando su impresión está lista
    if (status === 'listo' && order?.user_id) {
      supabase.functions.invoke('send-push', {
        body: {
          user_id: order.user_id,
          title:   '✅ Tu impresión está lista',
          body:    `Pasa a recogerla en ${shop.name}`,
          tag:     'order-ready',
          url:     '/',
        }
      }).catch(() => {})
    }

    await onReload()
  }

  const [downloadUrls, setDownloadUrls] = useState({}) // orderId -> signedUrl

  const download = async (order) => {
    // Si ya tenemos la URL, no hacer nada (el enlace ya está visible)
    if (downloadUrls[order.id]) return
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(order.file_url, 300) // 5 minutos
    if (!error && data?.signedUrl) {
      setDownloadUrls(prev => ({ ...prev, [order.id]: data.signedUrl }))
    } else {
      alert('No se pudo generar el enlace')
    }
  }

  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
    : null

  return (
    <div className="scroll-content">
      <div style={{ display:'flex', gap:8 }}>
        <SummaryCard label="Pendientes" value={pending.length} />
        <SummaryCard label="Hoy" value={today.length} />
        <SummaryCard label="Por cobrar" value={`$${cashToCollect.toFixed(0)}`} highlight />
      </div>

      <div className="card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:14, fontWeight:700 }}>Recibiendo pedidos</span>
        <ToggleSwitch checked={shop.is_available} onChange={toggleAvailable} disabled={toggling} />
      </div>

      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>Pedidos</p>

      {orders.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-inbox" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Todavía no te ha llegado ningún pedido</p>
        </div>
      ) : (
        <>
          {activeOrders.length === 0 && delivered.length > 0 && (
            <div className="card" style={{ textAlign:'center', padding:16, background:'var(--green-light)' }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--green-dark)' }}>
                <i className="ti ti-circle-check" style={{ fontSize:14, marginRight:6 }} />
                ¡Todo al día! · {delivered.length} pedido{delivered.length>1?'s':''} entregado{delivered.length>1?'s':''}
              </p>
            </div>
          )}
          {delivered.length > 0 && activeOrders.length > 0 && (
            <p style={{ fontSize:11, color:'var(--text-muted)', textAlign:'right' }}>
              {delivered.length} entregado{delivered.length>1?'s':''} oculto{delivered.length>1?'s':''}
            </p>
          )}
          {activeOrders.map(o => (
        <div key={o.id} className="card" style={{
          border: o.status === 'nuevo' ? '1.5px solid var(--amber)' :
                  o.status === 'en_proceso' ? '1.5px solid var(--green)' : undefined,
        }}>

          {/* Nombre del cliente — prominente arriba */}
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            background: o.status === 'nuevo' ? 'var(--amber-light)' : 'var(--green-light)',
            borderRadius:'var(--radius-md)', padding:'8px 12px', marginBottom:10,
          }}>
            <div style={{
              width:32, height:32, borderRadius:'50%',
              background: o.status === 'nuevo' ? 'var(--amber)' : 'var(--green)',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              <i className="ti ti-user" style={{ fontSize:16, color:'#fff' }} />
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:900 }}>{o.user_name ?? 'Cliente'}</p>
              <p style={{ fontSize:11, color:'var(--text-secondary)' }}>
                Llegó: {fmtTime(o.created_at)}
              </p>
            </div>
            <span className={`badge ${STATUS_BADGE[o.status]}`} style={{ marginLeft:'auto' }}>
              {STATUS_LABEL[o.status]}
            </span>
          </div>

          {/* Nombre del archivo */}
          <p style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'var(--text-secondary)' }}>
            <i className="ti ti-file-text" style={{ fontSize:14, verticalAlign:-2 }} /> {o.file_name ?? 'Documento'}
          </p>

          {/* Chips de detalle */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
            <Chip icon="ti-file-text" label={`${o.file_count} hoja${o.file_count > 1 ? 's' : ''}`} />
            <Chip icon="ti-copy" label={`${o.copies} copia${o.copies > 1 ? 's' : ''}`} />
            <Chip icon={o.color_mode === 'color' ? 'ti-palette' : 'ti-file-text'} label={`${o.color_mode === 'color' ? 'Color' : 'B/N'} · ${o.paper_size}`} />
            {o.estimated_cost != null && <Chip label={`$${o.estimated_cost}`} bold />}
          </div>

          {/* Tiempos discretos */}
          {(o.ready_at || o.delivered_at) && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, display:'flex', flexDirection:'column', gap:2 }}>
              {o.ready_at && <span><i className="ti ti-clock" style={{ fontSize:11 }} /> Listo a las {fmtTime(o.ready_at)}</span>}
              {o.delivered_at && <span><i className="ti ti-circle-check" style={{ fontSize:11 }} /> Entregado: {fmtTime(o.delivered_at)}</span>}
            </div>
          )}

          {/* 3 botones independientes, siempre visibles */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>

            {/* Botón 1: Descargar — siempre activo */}
            {downloadUrls[o.id] ? (
              <a href={downloadUrls[o.id]} target="_blank" rel="noopener noreferrer" style={{
                flex:1, padding:'8px 4px', fontSize:12, fontWeight:700,
                borderRadius:'var(--radius-md)', border:'1px solid var(--green)',
                background:'var(--green)', color:'#fff',
                display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                textDecoration:'none',
              }}>
                <i className="ti ti-external-link" style={{ fontSize:14 }} /> Abrir archivo
              </a>
            ) : (
              <button onClick={() => download(o)} style={{
                flex:1, padding:'8px 4px', fontSize:12, fontWeight:700, cursor:'pointer',
                borderRadius:'var(--radius-md)', border:'1px solid var(--border)', background:'#fff',
                color:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              }}>
                <i className="ti ti-download" style={{ fontSize:14 }} /> Descargar
              </button>
            )}

            {/* Botón 2: Imprimiendo — activo cuando es 'nuevo' */}
            <button
              onClick={() => o.status === 'nuevo' && updateStatus(o.id, 'en_proceso', o)}
              style={{
                padding:'8px 4px', fontSize:12, fontWeight:700,
                borderRadius:'var(--radius-md)', border:'none',
                cursor: o.status === 'nuevo' ? 'pointer' : 'default',
                background: o.status === 'nuevo' ? 'var(--amber)' :
                            ['en_proceso','listo','entregado'].includes(o.status) ? 'var(--green-light)' : 'var(--border)',
                color: o.status === 'nuevo' ? '#fff' :
                       ['en_proceso','listo','entregado'].includes(o.status) ? 'var(--green-dark)' : 'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              }}>
              <i className={`ti ${['en_proceso','listo','entregado'].includes(o.status) ? 'ti-circle-check-filled' : 'ti-printer'}`} style={{ fontSize:14 }} />
              {o.status === 'nuevo' ? 'Imprimir' : 'Impreso ✓'}
            </button>

            {/* Botón 3: Listo / Entregado */}
            <button
              onClick={() => {
                if (o.status === 'en_proceso') updateStatus(o.id, 'listo', o)
                else if (o.status === 'listo') updateStatus(o.id, 'entregado', o)
              }}
              style={{
                padding:'8px 4px', fontSize:12, fontWeight:700,
                borderRadius:'var(--radius-md)', border:'none',
                cursor: ['en_proceso','listo'].includes(o.status) ? 'pointer' : 'default',
                background: o.status === 'entregado' ? 'var(--green-light)' :
                            o.status === 'listo' ? '#2A2A2A' :
                            o.status === 'en_proceso' ? 'var(--green)' : 'var(--border)',
                color: o.status === 'entregado' ? 'var(--green-dark)' :
                       ['listo','en_proceso'].includes(o.status) ? '#fff' : 'var(--text-muted)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:4,
              }}>
              <i className={`ti ${o.status === 'entregado' ? 'ti-circle-check-filled' : o.status === 'listo' ? 'ti-hand-stop' : 'ti-check'}`} style={{ fontSize:14 }} />
              {o.status === 'entregado' ? 'Entregado ✓' : o.status === 'listo' ? 'Entregar' : 'Listo'}
            </button>
          </div>
        </div>
      ))}</>
      )}
    </div>
  )
}

// ============================================================
// TAB: RESEÑAS
// ============================================================
function ReviewsTab({ shop }) {
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('ratings')
      .select('*, users(name)')
      .eq('printshop_id', shop.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setRatings(data ?? []); setLoading(false) })
  }, [shop.id])

  const avg   = ratings.length > 0 ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : 0
  const count = ratings.length

  const stars = (n, size = 16) => Array.from({ length: 5 }, (_, i) => (
    <span key={i} style={{ fontSize: size, color: i < n ? '#F59E0B' : '#E5E7EB' }}>★</span>
  ))

  const dist = [5, 4, 3, 2, 1].map(s => ({
    s, count: ratings.filter(r => r.stars === s).length,
    pct: count > 0 ? Math.round(ratings.filter(r => r.stars === s).length / count * 100) : 0,
  }))

  const fmtDate = iso => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="scroll-content">
      {/* Resumen */}
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{avg > 0 ? Number(avg).toFixed(1) : '—'}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 2, margin: '6px 0' }}>
          {stars(Math.round(avg), 22)}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {count === 0 ? 'Sin reseñas aún' : `${count} reseña${count !== 1 ? 's' : ''}`}
        </p>

        {/* Distribución */}
        {count > 0 && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            {dist.map(d => (
              <div key={d.s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 16, textAlign: 'right' }}>{d.s}</span>
                <span style={{ fontSize: 13, color: '#F59E0B' }}>★</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border-light)' }}>
                  <div style={{ height: '100%', width: `${d.pct}%`, background: '#F59E0B', borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 24 }}>{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de reseñas */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Cargando...</p>
      ) : count === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <i className="ti ti-star" style={{ fontSize: 40, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cuando entregues pedidos, aquí verás las calificaciones de tus clientes</p>
        </div>
      ) : (
        ratings.map(r => (
          <div key={r.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700 }}>{r.users?.name ?? 'Cliente'}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(r.created_at)}</p>
              </div>
              <div style={{ display: 'flex', gap: 1 }}>{stars(r.stars, 14)}</div>
            </div>
            {r.comment && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{r.comment}"
              </p>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ============================================================
// TAB: GANANCIAS
// ============================================================
function EarningsTab({ shop }) {
  const [orders, setOrders] = useState([])
  const [period, setPeriod] = useState('week') // 'today' | 'week' | 'month' | 'all'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEarnings()
  }, [period])

  const loadEarnings = async () => {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('id, created_at, delivered_at, status, estimated_cost, file_name, file_count, copies, color_mode, user_name, service_fee')
      .eq('printshop_id', shop.id)
      .eq('status', 'entregado')
      .order('delivered_at', { ascending: false })

    const now = new Date()
    if (period === 'today') {
      const start = new Date(now); start.setHours(0,0,0,0)
      query = query.gte('delivered_at', start.toISOString())
    } else if (period === 'week') {
      const start = new Date(now); start.setDate(now.getDate() - 7)
      query = query.gte('delivered_at', start.toISOString())
    } else if (period === 'month') {
      const start = new Date(now); start.setDate(1); start.setHours(0,0,0,0)
      query = query.gte('delivered_at', start.toISOString())
    }

    const { data } = await query
    setOrders(data ?? [])
    setLoading(false)
  }

  const totalBruto = orders.reduce((sum, o) => sum + (o.estimated_cost ?? 0), 0)

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'short' }) : '-'
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' }) : '-'

  const PERIODS = [
    { id:'today', label:'Hoy' },
    { id:'week',  label:'7 días' },
    { id:'month', label:'Este mes' },
    { id:'all',   label:'Todo' },
  ]

  return (
    <div className="scroll-content">

      {/* Selector de periodo */}
      <div style={{ display:'flex', gap:6 }}>
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)} style={{
            flex:1, padding:'8px 0', fontSize:12, fontWeight:700, borderRadius:'var(--radius-md)',
            border: period === p.id ? 'none' : '1px solid var(--border)',
            background: period === p.id ? 'var(--green)' : '#fff',
            color: period === p.id ? '#fff' : 'var(--text-secondary)',
            cursor:'pointer',
          }}>{p.label}</button>
        ))}
      </div>

      {/* Resumen */}
      <div className="card" style={{ background:'var(--gradient-dark)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
          <div>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:2 }}>Pedidos entregados</p>
            <p style={{ fontSize:28, fontWeight:900, color:'#fff' }}>{orders.length}</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:2 }}>Total cobrado en efectivo</p>
            <p style={{ fontSize:28, fontWeight:900, color:'#fff' }}>${totalBruto.toFixed(2)}</p>
          </div>
        </div>
        <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:8 }}>
          El cliente paga directamente en tu mostrador. Este total es tuyo al 100%.
        </p>
      </div>

      {/* Lista de pedidos entregados */}
      <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
        Detalle de pedidos
      </p>

      {loading ? (
        <div className="card" style={{ textAlign:'center', padding:24 }}>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Cargando...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-cash" style={{ fontSize:40, color:'var(--text-muted)', display:'block', marginBottom:12 }} />
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>No hay pedidos entregados en este periodo</p>
        </div>
      ) : orders.map(o => (
        <div key={o.id} className="card" style={{ padding:'12px 14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
            <div>
              <p style={{ fontSize:13, fontWeight:700 }}>{o.user_name ?? 'Cliente'}</p>
              <p style={{ fontSize:11, color:'var(--text-muted)' }}>
                {fmtDate(o.delivered_at)} · {fmtTime(o.delivered_at)}
              </p>
            </div>
            <div style={{ textAlign:'right' }}>
              <p style={{ fontSize:15, fontWeight:900, color:'var(--green)' }}>${(o.estimated_cost ?? 0).toFixed(2)}</p>
              <p style={{ fontSize:10, color:'var(--text-muted)' }}>-$2.00 cuota</p>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <Chip icon="ti-file-text" label={`${o.file_count} hoja${o.file_count > 1 ? 's' : ''}`} />
            <Chip icon="ti-copy" label={`${o.copies} copia${o.copies > 1 ? 's' : ''}`} />
            <Chip icon={o.color_mode === 'color' ? 'ti-palette' : 'ti-file-text'} label={o.color_mode === 'color' ? 'Color' : 'B/N'} />
            <Chip label={`$${(o.estimated_cost ?? 0).toFixed(2)}`} bold />
          </div>
        </div>
      ))}

    </div>
  )
}


// ============================================================
// TAB: PERFIL (papelería)
// ============================================================
function PrintshopProfileTab({ shop, session, onSupport, onTutorial }) {
  const initial = shop?.name?.[0]?.toUpperCase() ?? 'P'
  const [pushStatus, setPushStatus] = React.useState('idle')

  React.useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported'); return
    }
    if (Notification.permission === 'granted') setPushStatus('granted')
    else if (Notification.permission === 'denied') setPushStatus('denied')
  }, [])

  const activatePush = async () => {
    const { registerPush } = await import('../lib/push.js')
    setPushStatus('requesting')
    const result = await registerPush(session.user.id)
    if (result?.ok) setPushStatus('granted')
    else if (result?.reason === 'denied') setPushStatus('denied')
    else setPushStatus('idle')
  }

  const isIOSNotPWA = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches

  return (
    <div className="scroll-content">
      <div style={{ textAlign:'center', padding:'24px 0 8px' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--green)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:28, fontWeight:900, color:'#fff' }}>
          {initial}
        </div>
        <p style={{ fontSize:18, fontWeight:800 }}>{shop?.name}</p>
        <p style={{ fontSize:13, color:'var(--text-secondary)' }}>Panel de papelería</p>
      </div>

      {pushStatus === 'granted' ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
          background:'var(--green-light)', borderRadius:'var(--radius-md)', marginBottom:8 }}>
          <i className="ti ti-bell-check" style={{ fontSize:20, color:'var(--green-dark)' }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--green-dark)' }}>Notificaciones activas</p>
            <p style={{ fontSize:11, color:'var(--green-dark)', opacity:0.8 }}>Te avisamos cuando llegue un pedido nuevo</p>
          </div>
        </div>
      ) : pushStatus === 'denied' ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
          background:'var(--red-light)', borderRadius:'var(--radius-md)', marginBottom:8 }}>
          <i className="ti ti-bell-off" style={{ fontSize:20, color:'var(--red)' }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--red)' }}>Notificaciones bloqueadas</p>
            <p style={{ fontSize:11, color:'var(--red)', opacity:0.8 }}>Actívalas en configuración de tu navegador</p>
          </div>
        </div>
      ) : isIOSNotPWA ? (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px',
          background:'#FFF8E1', border:'1px solid #F59E0B', borderRadius:'var(--radius-md)', marginBottom:8 }}>
          <i className="ti ti-device-mobile" style={{ fontSize:20, color:'#854F0B' }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'#854F0B' }}>Instala la app para notificaciones</p>
            <p style={{ fontSize:11, color:'#854F0B', opacity:0.8 }}>Toca Compartir → "Añadir a inicio" en Safari</p>
          </div>
        </div>
      ) : (
        <button className="btn-primary" onClick={activatePush}
          disabled={pushStatus === 'requesting'} style={{ marginBottom:8 }}>
          <i className="ti ti-bell" style={{ fontSize:18 }} />
          {pushStatus === 'requesting' ? 'Activando...' : '🔔 Activar notificaciones de pedidos'}
        </button>
      )}

      <button className="btn-primary" onClick={onTutorial}>
        <i className="ti ti-help" style={{ fontSize:18 }} /> Ver tutorial
      </button>
      <button className="btn-primary" onClick={onSupport} style={{ marginTop:8 }}>
        <i className="ti ti-headset" style={{ fontSize:18 }} /> Soporte
      </button>
      <button className="btn-outline" onClick={() => { if (window.confirm('¿Seguro que quieres cerrar sesión?')) supabase.auth.signOut() }} style={{ marginTop:8 }}>
        <i className="ti ti-logout" style={{ fontSize:18 }} /> Cerrar sesión
      </button>
    </div>
  )
}

function ConfigTab({ shop, services, onServicesChange, onSaved }) {
  const [name, setName] = useState(shop.name)
  const [hours, setHours] = useState(() => {
    const h = shop.hours ?? DEFAULT_HOURS
    // copia profunda para no mutar el prop
    const copy = {}
    DAY_KEYS.forEach(d => { copy[d] = (h[d] ?? []).map(p => ({ ...p })) })
    return copy
  })
  const [svcState, setSvcState] = useState(() => {
    const byType = {}
    services.forEach(s => { byType[s.service_type] = { enabled: s.enabled, price: s.price_per_sheet } })
    SERVICE_OPTIONS.forEach(opt => {
      if (!byType[opt.type]) byType[opt.type] = { enabled: false, price: opt.defaultPrice }
    })
    return byType
  })

  // Tipos personalizados (cualquier service_type que no sea de los 5 predefinidos)
  const [customServices, setCustomServices] = useState(() => deriveCustom(services))
  const [removedCustomIds, setRemovedCustomIds] = useState([])
  const [newCustomLabel, setNewCustomLabel] = useState('')
  const [newCustomPrice, setNewCustomPrice] = useState('')

  // No re-sincronizamos desde el prop services para evitar que el useEffect
  // sobreescriba el estado local después de guardar. Los ids se actualizan en save().

  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [locating, setLocating] = useState(false)
  const [locSaved, setLocSaved] = useState(false)

  const updateLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    setLocSaved(false)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await supabase.from('printshops').update({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
        }).eq('id', shop.id)
        setLocating(false)
        setLocSaved(true)
        setTimeout(() => setLocSaved(false), 3000)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const toggleService = (type) => {
    setSvcState(prev => ({ ...prev, [type]: { ...prev[type], enabled: !prev[type].enabled } }))
  }
  const setPrice = (type, price) => {
    setSvcState(prev => ({ ...prev, [type]: { ...prev[type], price } }))
  }

  const toggleCustomService = (idx) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, enabled: !s.enabled } : s))
  }
  const setCustomPrice = (idx, price) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, price } : s))
  }
  const updateCustomLabel = (idx, label) => {
    setCustomServices(prev => prev.map((s,i) => i===idx ? { ...s, label } : s))
  }
  const addCustomService = () => {
    if (!newCustomLabel.trim()) return
    setCustomServices(prev => [...prev, {
      id: null, service_type: `custom_${Date.now()}`, label: newCustomLabel.trim(),
      price: newCustomPrice || 0, enabled: true,
    }])
    setNewCustomLabel('')
    setNewCustomPrice('')
  }
  const removeCustomService = (idx) => {
    const item = customServices[idx]
    if (item.id) setRemovedCustomIds(prev => [...prev, item.id])
    setCustomServices(prev => prev.filter((_, i) => i !== idx))
  }

  const save = async () => {
    setSaving(true)
    setSaved(false)

    await supabase.from('printshops').update({
      name: name.trim(),
      hours,
    }).eq('id', shop.id)

    for (const opt of SERVICE_OPTIONS) {
      const s = svcState[opt.type]
      await supabase.from('printshop_services').upsert({
        printshop_id: shop.id,
        service_type: opt.type,
        price_per_sheet: Number(s.price) || 0,
        enabled: s.enabled,
      }, { onConflict: 'printshop_id,service_type' })
    }

    const updatedCustoms = [...customServices]
    for (let i = 0; i < updatedCustoms.length; i++) {
      const cs = updatedCustoms[i]
      if (cs.id) {
        await supabase.from('printshop_services').update({
          label: cs.label.trim(),
          price_per_sheet: Number(cs.price) || 0,
          enabled: cs.enabled,
        }).eq('id', cs.id)
      } else {
        const { data: inserted } = await supabase.from('printshop_services').insert({
          printshop_id: shop.id,
          service_type: cs.service_type,
          label: cs.label.trim(),
          price_per_sheet: Number(cs.price) || 0,
          enabled: cs.enabled,
        }).select().single()
        if (inserted) updatedCustoms[i] = { ...cs, id: inserted.id }
      }
    }
    setCustomServices(updatedCustoms)

    for (const id of removedCustomIds) {
      await supabase.from('printshop_services').delete().eq('id', id)
    }
    setRemovedCustomIds([])

    setSaving(false)
    setSaved(true)
    // Notificar al padre para que actualice su prop `services` desde DB
    // Esto garantiza que al remontar ConfigTab (cambio de tab), los datos sean correctos
    await onSaved()
  }

  return (
    <div className="scroll-content">
      <div className="card">
        <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:6 }}>NOMBRE DEL NEGOCIO</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          style={{ width:'100%', marginBottom:14, padding:'12px 14px', border:'1.5px solid var(--border)', borderRadius:'var(--radius-md)' }} />

        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:2 }}>HORARIOS</label>
          {DAY_KEYS.map(day => (
            <DayHours
              key={day}
              label={DAY_LABELS[day]}
              periods={hours[day]}
              onChange={periods => setHours(prev => ({ ...prev, [day]: periods }))}
            />
          ))}
          <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
            Si abres en dos turnos (ej. mañana y tarde), usa "+ Agregar turno".
          </p>
        </div>
      </div>

      <div className="card">
        <p style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Tipos de impresión disponibles</p>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12 }}>Selecciona y define el precio por hoja</p>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {SERVICE_OPTIONS.map(opt => {
            const s = svcState[opt.type]
            return (
              <label key={opt.type} style={{
                display:'flex', alignItems:'center', gap:10,
                border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
                padding:'10px 12px', cursor:'pointer',
                opacity: s.enabled ? 1 : 0.55,
              }}>
                <input type="checkbox" checked={s.enabled} onChange={() => toggleService(opt.type)} style={{ width:'auto' }} />
                <i className={`ti ${opt.icon}`} style={{ fontSize:18, color:'var(--text-secondary)' }} />
                <span style={{ flex:1, fontSize:14 }}>{opt.label}</span>
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
                <input type="number" min="0" step="0.5" value={s.price} disabled={!s.enabled}
                  onChange={e => setPrice(opt.type, e.target.value)}
                  style={{ width:56, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }} />
              </label>
            )
          })}

          {customServices.map((s, idx) => (
            <div key={s.id ?? `new-${idx}`} style={{
              display:'flex', alignItems:'center', gap:10,
              border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
              padding:'10px 12px', opacity: s.enabled ? 1 : 0.55,
            }}>
              <input type="checkbox" checked={s.enabled} onChange={() => toggleCustomService(idx)} style={{ width:'auto' }} />
              <i className="ti ti-file" style={{ fontSize:18, color:'var(--text-secondary)' }} />
              <input type="text" value={s.label} onChange={e => updateCustomLabel(idx, e.target.value)}
                placeholder="Nombre del tipo"
                style={{ flex:1, fontSize:16, border:'none', background:'transparent', padding:0, color:'var(--text-primary)' }} />
              <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
              <input type="number" min="0" step="0.5"
                value={s.price === 0 || s.price === '0' || s.price === '' ? '' : s.price}
                placeholder="0"
                disabled={!s.enabled}
                onChange={e => setCustomPrice(idx, e.target.value)}
                style={{ width:56, padding:'6px 8px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)' }} />
              <button onClick={() => removeCustomService(idx)} aria-label="Eliminar tipo" style={{
                width:24, height:24, borderRadius:'50%', border:'none', background:'var(--red-light)',
                color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0,
              }}>
                <i className="ti ti-x" style={{ fontSize:13 }} />
              </button>
            </div>
          ))}
        </div>

        {/* Agregar tipo personalizado */}
        <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
          <input type="text" placeholder="Ej. Cartulina, Adhesivo..." value={newCustomLabel}
            onChange={e => setNewCustomLabel(e.target.value)}
            style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:16 }} />
          <span style={{ fontSize:13, color:'var(--text-secondary)' }}>$</span>
          <input type="number" min="0" step="0.5" placeholder="0" value={newCustomPrice}
            onChange={e => setNewCustomPrice(e.target.value)}
            style={{ width:56, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:16 }} />
          <button onClick={addCustomService} disabled={!newCustomLabel.trim()} aria-label="Agregar tipo" style={{
            width:32, height:32, borderRadius:'var(--radius-sm)', border:'none', flexShrink:0,
            background: newCustomLabel.trim() ? 'var(--green)' : 'var(--border)',
            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
          }}>
            <i className="ti ti-plus" style={{ fontSize:16 }} />
          </button>
        </div>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
          Agrega aquí otros tipos de hoja que manejes (cartulina, adhesivo, fotográfico, etc.) con su precio por hoja.
        </p>
      </div>

      {/* Ubicación */}
      <div className="card">
        <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:8 }}>
          UBICACIÓN DEL NEGOCIO
        </label>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10, lineHeight:1.5 }}>
          Toca estando dentro de tu local para mayor precisión.
        </p>
        <button
          onClick={updateLocation}
          disabled={locating}
          className={locSaved ? 'btn-outline' : 'btn-primary'}
        >
          <i className={`ti ${locSaved ? 'ti-circle-check' : 'ti-current-location'}`} style={{ fontSize:16 }} />
          {locating ? 'Obteniendo ubicación...' : locSaved ? '✓ Ubicación actualizada' : 'Actualizar ubicación'}
        </button>
      </div>

      <button onClick={save} disabled={saving} className="btn-primary">
        <i className="ti ti-check" style={{ fontSize:16 }} />
        {saving ? 'Guardando...' : saved ? 'Guardado ✓' : 'Guardar configuración'}
      </button>
    </div>
  )
}

// ============================================================
// Componentes auxiliares
// ============================================================
function SummaryCard({ label, value, highlight }) {
  return (
    <div className="card" style={{ flex:1, textAlign:'center', padding:12, background: highlight ? 'var(--green-light)' : '#fff' }}>
      <p style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:2 }}>{label}</p>
      <p style={{ fontSize:20, fontWeight:900 }}>{value}</p>
    </div>
  )
}

function Chip({ icon, label, bold }) {
  return (
    <span style={{
      display:'flex', alignItems:'center', gap:4, fontSize:12,
      background:'var(--bg)', color:'var(--text-secondary)',
      padding:'3px 8px', borderRadius:'var(--radius-full)',
      border:'1px solid var(--border-light)',
      fontWeight: bold ? 700 : 400,
    }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize:13 }} />}
      {label}
    </span>
  )
}

function DayHours({ label, periods, onChange }) {
  const closed = periods.length === 0

  const updatePeriod = (idx, key, value) => {
    const copy = periods.map((p, i) => i === idx ? { ...p, [key]: value } : p)
    onChange(copy)
  }
  const addPeriod = () => onChange([...periods, { open: '16:00', close: '20:00' }])
  const removePeriod = (idx) => onChange(periods.filter((_, i) => i !== idx))
  const toggleClosed = () => onChange(closed ? [{ open: '09:00', close: '21:00' }] : [])

  return (
    <div style={{ border:'1px solid var(--border-light)', borderRadius:'var(--radius-md)', padding:'8px 10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: closed ? 0 : 6 }}>
        <span style={{ fontSize:13, fontWeight:700, width:80 }}>{label}</span>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)', cursor:'pointer' }}>
          <input type="checkbox" checked={!closed} onChange={toggleClosed} style={{ width:'auto' }} />
          {closed ? 'Cerrado' : 'Abierto'}
        </label>
      </div>

      {!closed && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {periods.map((p, idx) => (
            <div key={idx} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="time" value={p.open} onChange={e => updatePeriod(idx, 'open', e.target.value)}
                style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:16 }} />
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>–</span>
              <input type="time" value={p.close} onChange={e => updatePeriod(idx, 'close', e.target.value)}
                style={{ flex:1, padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', fontSize:16 }} />
              {periods.length > 1 && (
                <button onClick={() => removePeriod(idx)} aria-label="Quitar turno" style={{
                  width:28, height:28, borderRadius:'50%', border:'none', background:'var(--red-light)',
                  color:'var(--red)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0,
                }}>
                  <i className="ti ti-x" style={{ fontSize:13 }} />
                </button>
              )}
            </div>
          ))}
          {periods.length < 2 && (
            <button onClick={addPeriod} style={{
              alignSelf:'flex-start', background:'none', border:'none',
              color:'var(--green)', fontSize:12, fontWeight:700, cursor:'pointer', padding:'2px 0',
            }}>
              <i className="ti ti-plus" style={{ fontSize:12, verticalAlign:-1 }} /> Agregar turno
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label style={{ position:'relative', display:'inline-block', width:44, height:24, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled}
        style={{ opacity:0, width:0, height:0 }} />
      <span style={{
        position:'absolute', inset:0, borderRadius:12,
        background: checked ? 'var(--green)' : '#D9D9D6',
        transition:'0.2s',
      }}>
        <span style={{
          position:'absolute', top:3, left: checked ? 23 : 3,
          width:18, height:18, borderRadius:'50%',
          background:'#fff', transition:'0.2s',
        }} />
      </span>
    </label>
  )
}







