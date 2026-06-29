# Pliego — Estado Completo del Proyecto
**Fecha de última actualización:** 28 de Junio 2026, 11:40pm
**Último commit:** fix: links de aviso de privacidad apuntan a /privacidad.html

---

## ACCESOS Y CREDENCIALES

| Servicio | Dato | Valor |
|---|---|---|
| GitHub | Repo | `getlumi/Pliego` |
| GitHub | Token | `[ROTAR — ver chat anterior]` ⚠️ ROTAR |
| Supabase | URL | `hjrexcdtrzesdcfkhnpd.supabase.co` |
| Vercel | Deploy | Automático desde `main`, URL producción: `pliego.live` |
| Stripe | Public Key (live) | `pk_live_51Tj8GMHQh70WaLp1aV7y...` |
| Stripe | Secret Key (live) | `sk_live_51Tj8GMHQh70WaLp1r9E1...` |
| Stripe | Webhook Secret (prod) | `whsec_AdTuhh8cauMmFo3BlQouk8kQgwadzxRB` |
| Mercado Pago | Public Key | `APP_USR-76e2201d-f182-4b70-8c66-557cfffec96f` |
| Mercado Pago | Access Token | `APP_USR-5728927440984163-061600-cc50b203e34f0780d1d5019a700b0084-3353584735` |
| VAPID | Public Key | `BJnH-DA-m9JXu_V10TgZ-4EGEW5Hr7zeKRmZobyMnGjwoXAmrOfJBX_yhK57SMo0V2d2xYr1PFkDAMUo94nIqfY` |
| VAPID | Private Key | `2TqOmJxRpOyqyiq5QjJvKsNuPfVTQyumkQXJ2AI3qKs` |
| Twilio | Recovery Code | `[ver chat anterior]` (cuenta BLOQUEADA — ticket #27757493 pendiente) |

**Cuentas de prueba:**
- Admin: WhatsApp `9982168410`, `is_admin = true` en DB
- Usuario prueba: WhatsApp `9983941149`, email `9983941149@pliego.com`, saldo $124
- Papelería activa: `Heidi` (owner: `9981805519`) — verified: true, approved

---

## META WHATSAPP CLOUD API — ESTADO ACTUAL

| Dato | Valor |
|---|---|
| App ID | `273062452323664426` |
| App Name | Pliego |
| App Status | **PUBLICADA (modo live)** ✅ |
| Business ID | `1000311082804842` |
| WABA ID (prueba) | `1551671766302944` |
| WABA ID (producción) | `4506343626317089` |
| Phone Number ID (prueba) | `1238205789369369` — +1 (555) 676-7736 |
| Phone Number ID (producción) | `1093693860503768` — +52 19981806121 |
| Token permanente | En Supabase Secrets como META_WHATSAPP_TOKEN |
| Verificación del negocio | **EN REVISIÓN** (2-10 días hábiles) — constancia SAT subida |
| Webhook URL | `https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/whatsapp-webhook` |
| Webhook Verify Token | `pliego_webhook_2026` |

**Secrets en Supabase configurados:**
- `META_WHATSAPP_TOKEN` ✅
- `META_PHONE_NUMBER_ID` = `1093693860503768` ✅
- `META_WABA_ID` = `4506343626317089` ✅
- `META_WEBHOOK_VERIFY_TOKEN` = `pliego_webhook_2026` ✅

**Estado de mensajes:**
- La API envía mensajes exitosamente (confirmado por wamid en logs)
- Los mensajes NO llegan porque la verificación del negocio está en revisión
- Una vez aprobada la verificación, los mensajes llegarán a cualquier número automáticamente

**Plantillas de mensajes:** ⚠️ PENDIENTE CREAR
- `nuevo_pedido` — Categoría: Utilidad — para papelero
- `pedido_listo` — Categoría: Utilidad — para usuario
- `verificacion_otp` — Categoría: Autenticación — para registro
- Crear en: business.facebook.com/wa/manage/message-templates

---

## STACK TÉCNICO

- **Frontend**: Vite + React (sin Next.js), desplegado en Vercel
- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)
- **Pagos**: Stripe producción (tarjeta embedded + OXXO voucher)
- **Librería PDF**: `pdf-lib` (import estático — fix para Safari iOS)
- **Mensajería**: Meta WhatsApp Cloud API directa (sin intermediarios)
- **Iconos**: Tabler Icons `@3.44.0` CDN `/dist/tabler-icons.min.css`
- **Fuente**: Nunito (Google Fonts)

---

## ESTRUCTURA DEL REPO

```
/
├── index.html, vite.config.js, package.json
├── vercel.json                              ← excluye /assets/ y privacidad.html del rewrite
├── META_CREDENTIALS.md                      ← credenciales Meta (gitignored)
├── ESTADO_PROYECTO_28_06_2026.md            ← este archivo
├── public/
│   ├── sw.js                                ← Service Worker ACTIVO
│   ├── manifest.json
│   ├── privacidad.html                      ← Aviso de privacidad en pliego.live/privacidad.html
│   ├── icon-192.png
│   └── icon-512.png
├── supabase/functions/
│   ├── smart-task/                          ← SOLO EN SUPABASE, no en GitHub (registro usuarios)
│   ├── create-stripe-payment/
│   ├── stripe-webhook/
│   ├── send-push/                           ← obsoleto, reemplazado por send-whatsapp
│   ├── send-whatsapp/                       ← ✅ Meta Cloud API directa
│   ├── send-otp/                            ← ✅ OTP verificación al registro
│   └── whatsapp-webhook/                    ← ✅ recibe eventos de Meta
└── src/
    ├── App.jsx
    ├── lib/
    │   ├── supabase.js
    │   ├── hours.js
    │   ├── draft.js
    │   ├── services.js
    │   ├── sendOrder.js                     ← pdf-lib import estático, llama send-whatsapp
    │   └── push.js
    ├── styles/global.css
    ├── components/layout/Navbar.jsx
    └── pages/
        ├── AuthPage.jsx                     ← OTP WhatsApp en registro
        ├── OnboardingPage.jsx
        ├── TutorialPage.jsx
        ├── HomePage.jsx
        ├── UploadPage.jsx
        ├── HistoryPage.jsx
        ├── WalletPage.jsx
        ├── ProfilePage.jsx
        ├── PrintshopPage.jsx
        ├── AdminPage.jsx
        └── SupportPage.jsx
```

---

## BASE DE DATOS — MIGRACIONES CORRIDAS

1. `supabase_schema.sql`
2. `supabase_migration_hours.sql`
3. `supabase_migration_custom_services.sql`
4. `supabase_migration_order_lifecycle.sql`
5. `supabase_migration_printshop_download.sql`
6. `supabase_migration_wallet_payments.sql`
7. `supabase_migration_atomic_wallet.sql`
8. `supabase_migration_kyc.sql`
9. `supabase_migration_admin.sql`
10. `supabase_migration_support.sql`
11. `supabase_migration_push.sql`

**Tabla nueva creada manualmente:**
```sql
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on public.otp_codes(phone);
```

---

## EDGE FUNCTIONS — ESTADO

| Función | Repositorio | Supabase | Estado |
|---|---|---|---|
| `smart-task` | ❌ No está | ✅ Desplegada | Registro usuarios + $6 bienvenida |
| `create-stripe-payment` | ✅ | ✅ | Pagos Stripe |
| `stripe-webhook` | ✅ | ✅ | Webhook Stripe v3 |
| `send-push` | ✅ | ✅ | Obsoleto — reemplazado por send-whatsapp |
| `send-whatsapp` | ✅ | ✅ | Meta Cloud API — notificaciones WhatsApp |
| `send-otp` | ✅ | ✅ | OTP verificación número al registro |
| `whatsapp-webhook` | ✅ | ✅ | Recibe eventos Meta (JWT OFF) |

---

## FLUJO DE NOTIFICACIONES — ESTADO ACTUAL

### Al enviar pedido (sendOrder.js):
1. Crea PDF combinado ✅
2. Sube a Storage ✅
3. Crea orden en DB ✅
4. Cobra $2 del wallet ✅
5. Llama `send-whatsapp` → papelero recibe WhatsApp ⏳ (pendiente verificación Meta)

### Al marcar "Listo" (PrintshopPage.jsx):
1. Actualiza estado orden ✅
2. Llama `send-whatsapp` → usuario recibe WhatsApp ⏳ (pendiente verificación Meta)

### Al registrarse (AuthPage.jsx):
1. Usuario llena nombre, teléfono, contraseña ✅
2. Se envía OTP via `send-otp` ⏳ (pendiente verificación Meta)
3. Usuario ingresa código ✅
4. Se verifica y crea cuenta ✅

---

## GOOGLE BUSINESS PROFILE — ESTADO

- **Ficha creada:** ✅ "Pliego" como área de servicio en Cancún/México
- **Categoría:** Impresora digital
- **Verificación:** En proceso (1-5 días)
- **Servicios agregados:** Impresión de documentos, impresión desde celular, B/N, color
- **Fotos subidas:** ✅
- **Descripción:** ✅
- **URL:** pliego.live

---

## AVISO DE PRIVACIDAD

- **URL pública:** https://pliego.live/privacidad.html ✅
- **Contenido:** LFPDPPP completo, documentos 72h, WhatsApp solo notificaciones, ARCO
- **Subido a Meta:** ✅ como URL de política de privacidad

---

## REGLAS CRÍTICAS DE DESARROLLO

### REGLA 1 — ANTI-ZOOM iOS (OBLIGATORIA)
Todo `<input>`, `<textarea>` y `<select>` debe tener `fontSize: 16` o heredar del CSS global. NUNCA fontSize menor a 16.

### REGLA 2 — NO window.open() EN ASYNC
Safari iOS bloquea window.open() dentro de async. Usar `<a href>` directo.

### REGLA 3 — REALTIME SIN INTERFERENCIAS
Canal de pedidos vive en `PrintshopPage` padre, NO en `OrdersTab`. `loadOrders()` directo en Realtime callbacks.

### REGLA 4 — SERVICE WORKER ACTIVO
SW en `public/sw.js` está ACTIVO. App.jsx lo registra.

### REGLA 5 — PROCESO ANTES DE CÓDIGO (NO NEGOCIABLE)
1. Leer el código real antes de proponer cambios
2. Simular el flujo completo incluyendo iOS, race conditions, efectos secundarios
3. Identificar exactamente qué archivos tocar
4. Solo modificar lo necesario
5. Verificar antes de subir
6. Subir a GitHub

### REGLA 6 — welcome_shown EN DB
Modal de bienvenida usa `welcome_shown` en DB, no sessionStorage.

### REGLA 7 — CREDENCIALES EN VARIABLES DE ENTORNO
Nunca hardcodear credenciales.

### REGLA 8 — SIMULACIONES PROFUNDAS
Simular flujo COMPLETO antes de proponer solución. No dar soluciones superficiales.

### REGLA 9 — onSaved EN ConfigTab
`onSaved` recarga servicios sin llamar `loadShop()` completo.

### REGLA 10 — pdf-lib IMPORT ESTÁTICO
`import { PDFDocument } from 'pdf-lib'` al inicio del archivo. NO dynamic import — Safari iOS falla con dynamic imports.

---

## PENDIENTES — POR PRIORIDAD

### 🔴 Alta prioridad:
1. **Plantillas WhatsApp** — crear en business.facebook.com/wa/manage/message-templates:
   - `pliego_nuevo_pedido` (Utilidad)
   - `pliego_pedido_listo` (Utilidad)
   - `pliego_otp` (Autenticación)
   - Actualizar `send-whatsapp` y `send-otp` para usar plantillas en lugar de texto libre

2. **Verificación Meta pendiente** — esperar 2-10 días. Cuando aprueben: mensajes llegan a cualquier número

3. **Twilio bloqueado** — ticket #27757493 pendiente respuesta. Cuenta bloqueada tras primer pago. Si Meta no resuelve antes, resolver Twilio como fallback SMS.

4. **Rotar token GitHub** — `[ROTAR — ver chat anterior]` se compartió en chat

5. **Rotar credenciales Stripe y Mercado Pago** — se compartieron en chat anteriores

### 🟡 Media prioridad:
6. **Notificaciones push Android/PC** — probar. En Android Chrome debería funcionar sin PWA instalada.
7. **Finanzas admin — ciudades** — agregar campo `city` al registro de papelerías
8. **Garantía anti-no-show** — hold en wallet al enviar pedido, cobro a 24h
9. **Botón "Reportar"** — actualmente solo alert(), tabla `reports` existe

### 🟢 Baja prioridad:
10. **Sistema de reportes UI**
11. **Preview de documentos** — thumbnail primera página
12. **Conteo páginas DOCX** — requiere procesamiento servidor
13. **Tonos de notificación personalizables**
14. **Google Business** — verificar ficha cuando Meta apruebe (1-5 días)

---

## MODELO DE NEGOCIO

- **Ingresos de Pliego**: recargas de wallet menos comisión Stripe (~3.6% + $3 MXN)
- **Cuota de $2 por pedido**: interna, controla actividad
- **Papelerías**: reciben 100% del pago en efectivo del cliente al entregar
- **Paquetes de recarga**: $20 (10 impresiones) y $50 (30 impresiones)
- **Crédito de bienvenida**: $6 MXN para nuevos usuarios (3 pedidos gratis)

---

## VISIÓN ORMUZ (FUTURO)

- Pliego es el primer producto. Ormuz es la empresa.
- Meta Cloud API directa (ya configurada) → base para plataforma de mensajería
- Objetivo: ser el Twilio de LATAM — otros pagan a Ormuz por WhatsApp API
- Tech Provider de Meta: iniciar proceso cuando verificación esté aprobada
- Stack actual es 100% reutilizable para otros clientes

---

## NOTAS TÉCNICAS IMPORTANTES

- `smart-task` en Supabase = función de registro (no está en GitHub)
- `credit_wallet` parámetro `p_user_id` es `text`, `p_method` requiere `::payment_method`
- `select('*')` no garantiza columnas post-ALTER TABLE — listar explícitamente
- Horario `"close":"00:00"` en papelerías se interpreta como inicio del día, usar `23:59` para medianoche
- `send-whatsapp` y `send-otp` tienen JWT verification en OFF (acepta anon key del frontend)
- La app está publicada en Meta pero verificación del negocio tardará 2-10 días
- Número de producción WhatsApp: +52 19981806121 (Phone Number ID: 1093693860503768)
- vercel.json excluye `/assets/` y `privacidad.html` del rewrite para que sirvan correctamente
