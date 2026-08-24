# Pliego — Estado Completo del Proyecto
**Última actualización:** 20 de agosto de 2026, tras una sesión extensa (suscripciones, garantía, escáner, Tienda, dashboards, seguridad, entrega por QR, y una investigación larga de un bug de tiempo real).
**Cómo usar este documento:** está organizado por zonas — busca la sección que te interesa en vez de leer todo. La sección 10 (Bugs y lecciones) es la más importante para evitar repetir errores ya resueltos.

---

## 1. Accesos y stack técnico

| Servicio | Dato |
|---|---|
| GitHub | Repo `getlumi/Pliego` — **el token de acceso NO se guarda aquí a propósito** (riesgo de seguridad si queda en un documento permanente). Al iniciar un chat nuevo, pide el token directo al usuario cuando haga falta hacer `git push` — se ha rotado varias veces hoy por exposición repetida en el chat, así que no asumas que uno viejo sigue vivo. |
| Supabase | `hjrexcdtrzesdcfkhnpd.supabase.co` |
| Vercel | Deploy automático desde `main`, producción: **pliego.live** (⚠️ nunca probar en URLs de preview tipo `pliego-xxxxx-gelumi.vercel.app` — tienen candado SSO de Vercel que rompe el manifest) |
| Frontend | Vite + React, sin Next.js |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions + Realtime) |
| Pagos | Stripe (tarjeta + OXXO), suscripciones para clientes y papelerías |
| Mensajería | SMS Masivos (canal real hoy — la función se sigue llamando `send-whatsapp` por compatibilidad con el código viejo, pero ya no usa WhatsApp) |
| Librerías nuevas hoy | `qrcode`, `html5-qrcode` (entrega por QR), `xlsx` (exportar Ganancias), `recharts` (gráficas) — todas con carga diferida, no inflan el bundle inicial |

**Cuenta de prueba principal:** "Gio", UID `1356b3b0-82d7-4335-97f8-dc2fed068366`, correo `9999999999@pliego.com`, `phone` real guardado como `9990000003` (quedaron distintos por como se creó la cuenta manualmente).

---

## 2. Modelo de negocio (completo, actualizado)

- **Créditos:** $26.5 (2 créditos, $13.25 c/u) · $55 (5 créditos, $11 c/u).
- **Plan Ilimitado cliente:** $75/mes.
- **Suscripción papelería:** $75/mes, periodo de gracia (3 meses las 10 fundadoras, 1 mes las demás).
- **Garantía anti-no-show:**
  - Créditos: cubre si `créditos disponibles ≥ techo(costo ÷ $5.50)` — **el $5.50 por crédito es un valor interno fijo, distinto a lo que realmente cuesta un crédito ($11-$13.25) — pendiente de decisión: ¿es margen de seguridad a propósito, o debería actualizarse?** (ver sección 9, pendientes)
  - Suscriptores: cubre hasta $50 de costo de impresión; si no se recoge, se suspende la cuenta hasta pagar $50 de reactivación.
- **Pliego Store:** productos adicionales de la papelería (café, snacks, etc.), se unen al mismo pedido de impresión, se pagan juntos en efectivo. **Nunca** cuentan para la garantía (se asume que no generan merma).

---

## 3. Funciones construidas hoy (resumen — detalle técnico en las secciones siguientes)

1. Suscripción de clientes ($75/mes) + suscripción de papelerías con periodo de gracia
2. Garantía anti-no-show con suspensión de cuenta para suscriptores
3. Escáner de documentos con IA (Scanic, detector `ml`) + mejora de imagen (contraste/brillo)
4. Captura de identificación (frente/reverso) corregida — recorte de cámara real, tamaño credencial real
5. Tienda / Pliego Store — productos por papelería, selector de cantidad, se unen al pedido
6. Dashboards de métricas (papelería y admin) — KPIs, gráficas, ranking de productos
7. Logo de papelería en su perfil
8. Analítica de suscripciones en Admin (activas/nuevas/canceladas)
9. **Entrega de pedidos por código QR** — cliente muestra QR, papelería escanea con botón global
10. **Auditoría de seguridad completa** — 4 vulnerabilidades reales de RLS cerradas

---

## 4. Base de datos — todo lo nuevo de hoy

### Tablas nuevas
- `printshop_products` — productos de Tienda (nombre, precio, imagen, activo)
- `otp_codes` (de sesión anterior, sin tocar hoy)

### Columnas nuevas
- `orders`: `store_items` (jsonb), `store_total`, `pickup_code` (uuid, para QR)
- `printshops`: `logo_url`, `city` (nuevo, vacío hasta que se capture), `subscription_started_at`, `subscription_canceled_at`
- `users`: `subscription_started_at`, `subscription_canceled_at`

### Funciones nuevas (`SECURITY DEFINER`)
| Función | Para qué |
|---|---|
| `mark_order_rated(order_id)` | Cliente marca su propio pedido como calificado |
| `update_order_status(order_id, status)` | Papelería cambia estado de un pedido propio |
| `deliver_order_by_qr(order_id, pickup_code)` | Entrega verificada por QR |
| `reset_printshop_kyc(printshop_id)` | Papelería reinicia su propio KYC para volver a subir docs |
| `admin_review_printshop_kyc(...)` | Admin aprueba/rechaza KYC |
| `admin_toggle_user_active(user_id)` | Admin activa/desactiva una cuenta |

### Triggers nuevos
- `protect_users_sensitive_columns` (+ versión insert) — bloquea `is_admin`, `credits_balance`, `wallet_balance`, `account_suspended`, campos de suscripción, etc. a menos que la escritura venga de una función de confianza o `service_role`
- `protect_printshop_sensitive_columns` — mismo patrón para `verified`, `subscription_*`, `rating_avg`, etc.

### Buckets de Storage
- `store-products` (nuevo, público) — fotos de productos de Tienda
- `avatars` (ya existía) — reusado también para logo de papelería

---

## 5. Seguridad — auditoría completa de hoy

**4 vulnerabilidades reales cerradas** (detalle completo en `BUGS_ENCONTRADOS_20_08_2026.md`, sección 2):
1. `users_update_own` sin restricción de columna — **cualquier usuario podía ponerse `is_admin=true` a sí mismo**
2. Mismo problema en `orders` (cambiar precio de su propio pedido)
3. Mismo problema en `printshops` (auto-aprobarse KYC, activar su propia suscripción)
4. `wallet_insert_own` sin ningún uso legítimo — permitía insertar transacciones falsas

**Patrón de la solución:** triggers que verifican `current_user = 'postgres'` (viene de una función SECURITY DEFINER de confianza) o `auth.role() = 'service_role'` (viene de una Edge Function) — bloquean todo lo demás automáticamente, sin tener que tocar ninguna función existente.

**Verificación recomendada cada vez que se agregue una tabla o campo sensible nuevo:** ¿tiene RLS? ¿la política de `update`/`insert` restringe columnas, o cualquiera puede tocar cualquier campo de su propia fila?

---

## 6. Realtime — la investigación grande de hoy

**Resuelto y confirmado funcionando en producción.** Historia completa, con las 3 causas reales encontradas en capas, en `BUGS_ENCONTRADOS_20_08_2026.md`, sección 1. Resumen de las reglas nuevas para cualquier canal futuro:

1. Nunca usar `filter:` en `postgres_changes` — filtrar en JS dentro del callback
2. Nunca encadenar dos tablas distintas en un solo canal — un canal por tabla
3. Usar `event: '*'`, no un tipo específico — filtrar `payload.eventType` en el callback
4. El `useEffect` debe depender de valores primitivos estables (`session?.user?.id`), no de objetos completos

**Nota de limpieza pendiente (baja prioridad):** quedaron canales de diagnóstico (`DEBUG2`) y varios `console.log` en `HistoryPage.jsx` de la investigación — no rompen nada, pero vale la pena limpiarlos en algún momento sin prisa.

---

## 7. Escáner, identificación y garantía — detalle técnico

- **Escáner de documentos:** Scanic con `detector: 'ml'` (no el clásico, falla con fondos con patrón) + paso de mejora de imagen (contraste 135%, brillo 108%) que Scanic no hace por sí solo.
- **Identificación:** recorte de cámara corregido matemáticamente (compensa `object-fit: cover` real, no un número mágico) — resuelve la sensación de "se ajusta solo". PDF final a tamaño credencial real (243pt = 85.6mm), apilado (frente arriba, reverso abajo).
- **Vista previa:** tanto el escáner como identificación ahora muestran una miniatura fiel de lo que se va a enviar (antes no había ninguna).

---

## 8. Entrega por QR — cómo quedó

- Cada pedido tiene un `pickup_code` (uuid) único desde que se crea.
- Cliente: botón "Mostrar código para recoger" cuando el pedido está "Listo" — QR de pantalla completa con `order_id` + `pickup_code`.
- Papelería: botón único y global "Escanear código de cliente" (no por tarjeta — el QR ya identifica el pedido). Botón "Sin QR" por tarjeta como respaldo manual (para negocios sin cámara disponible, ej. panel abierto en PC).
- Verificación real vía `deliver_order_by_qr` — valida `order_id` + `pickup_code` juntos, y que el pedido sea de una papelería que le pertenece a quien escanea.

---

## 9. Pendientes reales (para revisar, no urgentes)

1. **Valor de $5.50 por crédito en la garantía** — decidir si es margen de seguridad a propósito o debe actualizarse para acercarse a lo que realmente cuesta un crédito ($11-$13.25)
2. **Limpiar canales de diagnóstico y logs** de la investigación de Realtime en `HistoryPage.jsx`
3. **Campo `city`** en papelerías — vacío hasta que se capture al aprobar KYC o al expandir a más ciudades
4. **Pedido anticipado de Tienda** (que el café esté listo cuando llegas, como la impresión) — diseñado en la estrategia, no construido
5. Revisar si hay otros `credit_holds` viejos atorados en otras cuentas de prueba (se limpiaron los de Gio manualmente hoy)

---

## 10. Bugs y lecciones — ver documento aparte

**`BUGS_ENCONTRADOS_20_08_2026.md`** tiene el detalle completo de los 6 bugs reales de hoy (el sexto, encontrado más tarde: choque de columnas en RLS de Storage que impedía subir imágenes de Tienda desde el día uno), cada uno con: síntoma, qué se descartó con evidencia, causa real, fix aplicado, y lección para el futuro. Empezar ahí ante cualquier síntoma parecido, antes de investigar desde cero.

## 11. Actualización — segunda mitad de la sesión (después de la Parte 6 original)

### Encuadre de imágenes sueltas (nuevo)
- Módulo compartido `src/lib/imageFraming.js` — mismo cálculo para vista previa y PDF final, imposible que se desincronicen.
- **Modelo correcto (tras un rediseño fallido intermedio, corregido):** la hoja SIEMPRE es Carta estándar, respetando el botón Vertical/Horizontal real — lo que cambia con cuarto/media/completa es el TAMAÑO DE LA IMAGEN dentro de esa misma hoja, nunca la hoja en sí.
- Cuarto/media/completa se definen como **fracción de ÁREA** (no de un solo lado) — así siempre se ven distintos entre sí, sin importar si la foto es vertical u horizontal.
- Alineación elegible por foto (Centrada / Superior izquierda).
- Solo aplica a archivos de imagen real (`image/*`) — nunca a PDF, Word, escaneados o identificación.
- Solo se muestra si la papelería elegida ofrece esos servicios (`color_imagen_cuarto/medio/completa`).
- **Auto-selección de precio:** al elegir un tamaño de imagen, o al agregar una identificación (sin importar el orden en que pase respecto a elegir papelería), se auto-selecciona el servicio de precio correspondiente — para que nunca se mande una imagen a color con el precio de "B/N Bond" seleccionado por accidente.

### Bug de seguridad real encontrado en Tienda (RLS de Storage)
Las imágenes de productos de Tienda **nunca se subieron correctamente desde el primer día** — causa real: la política de seguridad del bucket `store-products` tenía `storage.foldername(name)` sin calificar la tabla. Como `printshops` también tiene su propia columna `name` (el nombre del negocio), Postgres resolvió la ambigüedad contra la tabla equivocada — comparando el nombre del negocio contra un UUID, algo que nunca podía ser verdadero para nadie. Corregido a `storage.foldername(objects.name)`, explícito. Detalle completo en `BUGS_ENCONTRADOS_20_08_2026.md`.

También se corrigió: faltaba `contentType` explícito al subir (causaba que el archivo se guardara con tipo genérico, aunque la subida "funcionara"). Y se agregó la posibilidad de cambiar la foto de un producto ya creado (antes solo se podía subir al crearlo).

### Ver documento enviado desde Historial
Antes no había ninguna forma de ver el archivo ya enviado desde Historial — solo se mostraba el nombre. Ahora hay un botón "Ver documento enviado" con enlace real (mismo patrón seguro que ya se usaba en descarga de papelería — sin `window.open()` tras un `await`, que Safari bloquea).

### Identificación — posición en la hoja
El bloque frente/reverso se movió 4cm hacia arriba desde el centro (antes perfectamente centrado) — se ve más como una copia de identificación real.

### Estrategia de redes — actualizaciones
`pliego_estrategia_redes_y_crecimiento.md` sí cambió hoy — se agregaron las Partes 11-13 (corrección de duración de video TikTok para 2026, playbook de seguidores con los recursos reales del fundador, y el framing de venta de Pliego Store como oportunidad de negocio estilo Uber).

---

*Este documento reemplaza como referencia principal a las versiones anteriores de "estado del proyecto" — para historial completo de decisiones de producto/marketing, ver `pliego_playbook_estrategico.md` (sin cambios hoy) y `pliego_estrategia_redes_y_crecimiento.md` (sí actualizado, ver Partes 11-13).*
