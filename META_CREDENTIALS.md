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
- **Token de acceso temporal:** EAGEC4qc5k1oBR0TVuTRNSCXDPajZCv8UI24...
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
