# Meta WhatsApp Cloud API — Credenciales Pliego
**Fecha:** Junio 2026
**NO subir a GitHub público — agregar a .gitignore**

## App de Meta
- **App Name:** Pliego
- **App ID:** 273062452323664426
- **Modo:** En desarrollo
- **Negocio:** Pliego (portfolio comercial)

## Número de Prueba (Sandbox)
- **Número:** +1 (555) 676-7736
- **Phone Number ID:** 1238205789369369
- **WhatsApp Business Account ID:** 1551671766302944
- **Token permanente (producción):** EAGEC4qc5k1oBRxjmSZBClITtWLmoZBIZAKDYNoZCnyFTqoZBZBIcvOMFPjqDuDVuJSa5ZACZByDBXO3hxgT8Q4Tp3NUyJAUi2K6DGiZCvMFfV2SaGuTT2mFfX3SUgFrpXRASOcvt2K637Ft2eSJhMey11V0eZABJ84DHC7Gawj3T25boCrHS4TTc7HIJZCVa2f2Tos97AZDZD
  ⚠️ Este token expira — generar token permanente con System User

## Próximos pasos
1. Configurar webhook → URL: https://hjrexcdtrzesdcfkhnpd.supabase.co/functions/v1/whatsapp-webhook
2. Registrar número real de producción
3. Agregar método de pago en Meta
4. Crear System User y token permanente
5. Verificación del negocio (Paso 3)

## Variables de entorno a agregar en Supabase Secrets
- META_WHATSAPP_TOKEN → token permanente del System User
- META_PHONE_NUMBER_ID → 1238205789369369
- META_WABA_ID → 1551671766302944
- META_WEBHOOK_VERIFY_TOKEN → string aleatorio que tú defines

## Número de Producción (Real)
- **Número:** +52 19981806121
- **Phone Number ID:** 1093693860503768
- **WhatsApp Business Account ID:** 4506343626317089
- **Estado:** Pendiente de registrar

## ⚠️ Actualizar en Supabase Secrets cuando esté registrado:
- META_PHONE_NUMBER_ID → cambiar a: 1093693860503768
- META_WABA_ID → cambiar a: 4506343626317089
