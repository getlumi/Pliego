# Pliego — Bugs Reales Encontrados y Corregidos (19-20 agosto 2026)
**Propósito de este documento:** referencia rápida para futuros problemas parecidos. Cada bug incluye el síntoma tal como se reportó, qué se descartó con evidencia (no con teoría), la causa real, y el fix aplicado — para no repetir el mismo camino de diagnóstico si algo similar vuelve a pasar.

---

## Índice
1. [Realtime silencioso — el filtro de servidor deja de coincidir](#1-realtime-silencioso)
2. [RLS sin restricción de columna — 4 vulnerabilidades de seguridad](#2-rls-sin-restricción-de-columna)
3. [`credit_wallet` sin cast al tipo correcto](#3-credit_wallet-sin-cast)
4. [`.rpc().catch()` no es una función válida](#4-rpccatch-roto)
5. [Nombre de archivo genérico ("documento.pdf")](#5-nombre-de-archivo-genérico)

---

## 1. Realtime silencioso — el filtro de servidor deja de coincidir

### Síntoma reportado
En Historial (lado usuario), cuando la papelería marcaba un pedido como listo/entregado, la pantalla del usuario **nunca se actualizaba sola** — había que salir de la pantalla y volver a entrar para ver el cambio reflejado. Pasaba tanto con el botón manual como con el escaneo de QR.

### Lo que se descartó, con evidencia real (no suposición)
| Hipótesis | Cómo se descartó |
|---|---|
| Caché del navegador sirviendo código viejo | Se confirmó comparando el nombre del archivo JS en la consola (`index-XXXXX.js`) antes/después de un hard reload — una vez confirmado el nombre nuevo, el problema seguía |
| Sesión de Realtime sin token (`setAuth`) | Se agregó `supabase.realtime.setAuth()` — ayudó a que el canal llegara a estado `SUBSCRIBED`, pero el evento seguía sin llegar |
| `REPLICA IDENTITY` no estaba en `FULL` | Verificado con SQL directo — las 3 tablas (`orders`, `users`, `printshops`) ya estaban correctamente en `FULL` |
| `orders` no estaba en la publicación de Realtime | Verificado con `select * from pg_publication_tables where pubname='supabase_realtime'` — sí estaba incluida |
| RLS bloqueando el evento | **Prueba definitiva:** se desactivó RLS por completo en `orders` (`alter table ... disable row level security`) y el evento **seguía sin llegar**. Esto descarta RLS al 100% — no era la causa |
| Bug de código nuevo (QR, seguridad) | Se comparó el diff completo de `HistoryPage.jsx` desde antes de esos cambios (`git diff d83e874 HEAD`) — el patrón del filtro problemático (`filter: user_id=eq....`) ya existía desde el commit original del archivo (`d89a206`, mucho antes de esta sesión) |

### Causa real (confirmada con evidencia, no teoría)
Se agregó un canal de diagnóstico **sin ningún filtro**, escuchando *todos* los cambios de `orders` sin restricción. Ese canal **sí recibía los eventos** (confirmado en consola, con el `user_id` correcto visible en el payload) — mientras que el canal con filtro (`filter: user_id=eq.${session.user.id}`) **nunca disparaba** para esos mismos eventos, aunque el valor coincidía exactamente.

Esto es un bug conocido y documentado de la plataforma Supabase Realtime — el filtro de servidor (`column=eq.value`) puede dejar de coincidir en silencio, sin ningún error visible. Reportado por otros desarrolladores con el mismo síntoma exacto: [github.com/orgs/supabase/discussions/29884](https://github.com/orgs/supabase/discussions/29884). No es un bug de nuestro código — es una falla intermitente del lado del servidor de Supabase.

**Dato clave que lo confirma:** el panel de papelería (`PrintshopPage.jsx`) **nunca tuvo este problema**, porque su canal de pedidos **nunca usó un filtro de servidor** — desde que se escribió (mucho antes de esta sesión), ya filtraba del lado del cliente:
```js
.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
  const shopId = payload.new?.printshop_id ?? payload.old?.printshop_id
  if (shopId !== shop.id) return   // filtro en JS, no en el servidor
  ...
})
```
`HistoryPage.jsx`, en cambio, sí usaba `filter: user_id=eq....` desde su creación — por eso el bug estaba ahí desde siempre, dormido, hasta que alguien hizo una prueba en vivo lo bastante cuidadosa para notarlo.

### Fix aplicado
En `src/pages/HistoryPage.jsx`: se quitó el `filter:` del canal de `orders` y `wallet_transactions`, y se agregó el mismo filtro pero en JavaScript, dentro del callback:
```js
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
  if (payload.new.user_id !== session?.user?.id) return // filtro en JS, no en el servidor
  ...
})
```

### Lección para el futuro
**Nunca usar `filter:` en un canal de `postgres_changes` de Supabase para algo crítico — filtrar siempre del lado del cliente (JS), dentro del callback, comparando contra el valor esperado.** Es más código, pero no depende de una función de la plataforma que puede fallar en silencio sin ningún aviso. Si se agrega un canal nuevo en el futuro, replicar el patrón de `PrintshopPage.jsx`, no el patrón viejo de `HistoryPage.jsx`.

### Segunda causa relacionada, encontrada después del primer fix
Con el filtro de servidor ya quitado, el evento **seguía sin llegar** en una prueba posterior. La consola mostró algo nuevo: el canal cambiaba de estado solo, sin que nadie tocara nada —
```
SUBSCRIBED → CLOSED → CLOSED → SUBSCRIBED
```
justo antes de la prueba. Causa: el `useEffect` que arma el canal dependía del objeto `session` completo (`[session]`). Supabase crea un objeto de sesión **nuevo** cada vez que renueva el token internamente (pasa más seguido de lo esperado) — y React, al comparar objetos por referencia, trataba eso como "la sesión cambió" y destruía + reconstruía todo el canal sin necesidad. Si el pedido se marcaba como entregado justo en ese instante de reconexión, el evento se perdía.

**Fix:** cambiar la dependencia a `[session?.user?.id]` (un texto estable), no al objeto completo — así el canal solo se reconstruye cuando el usuario realmente cambia (login/logout), no cada vez que se renueva el token.

### Archivos afectados
- `src/pages/HistoryPage.jsx` (fix aplicado)
- `src/pages/PrintshopPage.jsx` (ya tenía el patrón correcto, sin cambios)

---

## 2. RLS sin restricción de columna

### Síntoma
Ninguno reportado por el usuario — se encontró en una auditoría de seguridad proactiva, no por un error visible.

### Causa real
Varias políticas de seguridad (RLS) decían "el dueño puede actualizar su propia fila" sin restringir **qué columnas** — Postgres RLS controla filas, no columnas. Esto significaba que, con solo su propia sesión (ya expuesta en el navegador como en cualquier app de Supabase), un usuario podía en teoría:
- Ponerse `is_admin = true` a sí mismo (`users_update_own`)
- Inflar su propio `credits_balance`/`wallet_balance`
- Cambiar el precio de su propio pedido (`orders_update_user`)
- Auto-aprobarse el KYC de su papelería (`printshops_update_owner`)

Además, `wallet_insert_own` permitía insertar transacciones falsas directo a la tabla, sin ningún uso legítimo real en el código.

### Fix aplicado
- Se eliminaron las políticas de `UPDATE` directas y se reemplazaron por funciones `SECURITY DEFINER` angostas (`mark_order_rated`, `update_order_status`, `reset_printshop_kyc`, `admin_review_printshop_kyc`, `admin_toggle_user_active`).
- Se agregaron triggers (`protect_users_sensitive_columns`, `protect_printshop_sensitive_columns`) que revierten cambios a columnas sensibles a menos que la escritura venga de una función de confianza (`current_user = 'postgres'`) o de `service_role`.
- Se eliminó `wallet_insert_own` por completo (sin uso legítimo).

### Archivos afectados
- `supabase_migration_security_hardening.sql`
- `src/pages/PrintshopPage.jsx`, `src/pages/HistoryPage.jsx`, `src/pages/AdminPage.jsx` (llamadas actualizadas a usar las funciones nuevas)

---

## 3. `credit_wallet` sin cast al tipo correcto

### Síntoma
Al intentar agregar créditos de prueba manualmente:
```
ERROR: 42804: column "payment_method" is of type payment_method but expression is of type text
```

### Causa real
`credit_wallet` recibe `p_method` como parámetro de texto, pero la columna `wallet_transactions.payment_method` es un tipo `enum` (`payment_method`). Postgres no convierte automáticamente un parámetro de función ya tipado como texto a un enum — hacía falta el cast explícito `p_method::payment_method` dentro del `INSERT`. Las otras funciones parecidas (`deduct_credit`, `refund_credit`) no tenían este problema porque usan un texto **fijo** directo en el código (`'sistema'`), y ahí Postgres sí convierte automáticamente.

**Importante:** este bug llevaba **3 semanas** en el código (desde el 29 de julio) — no era nuevo de esta sesión. Y como esta es la misma función que usa `stripe-webhook` para confirmar pagos reales (compra de créditos, mensualidades), es posible que también haya estado fallando ahí.

### Fix aplicado
Se agregó el cast faltante: `p_method::payment_method` en el `INSERT` de `credit_wallet`.

### Archivos afectados
- `supabase_migration_credits.sql`
- `fix_credit_wallet_cast.sql` (migración del fix)

---

## 4. `.rpc().catch()` roto

### Síntoma
En consola del navegador:
```
Uncaught (in promise) TypeError: H.rpc(...).catch is not a function
```

### Causa real
`supabase.rpc(...)` devuelve un objeto "thenable" (tiene `.then()`, se puede usar con `await`), pero en esta versión de la librería **no tiene un método `.catch()` propio**. Llamar a `.catch()` directo sobre el resultado truena de forma **síncrona** — y como esto pasaba a la mitad de `updateStatus()`, cortaba la función ahí mismo, sin ejecutar nada de lo que venía después (incluyendo el aviso de "pedido listo" por SMS).

**Este bug también era viejo** — del 4 de agosto, confirmado con `git blame`.

### Fix aplicado
Se quitó el `.catch()` — nunca hacía falta, porque Supabase no lanza errores en estos casos, los devuelve como dato (`{data, error}`), no como una promesa rechazada.

### Consecuencia real descubierta después: créditos de garantía atorados
Como este bug cortaba `updateStatus` justo antes de liberar la garantía, **todo pedido marcado como entregado desde el 4 de agosto hasta el fix de hoy nunca liberó sus créditos reservados** — se quedaban en `credit_holds` con `status='reservado'` para siempre, restándose de `credits_held` sin nunca regresar. Esto causó que una cuenta de prueba con varios pedidos viejos entregados tuviera créditos "fantasma" atorados, haciendo parecer que la garantía no cubría pedidos nuevos aunque el balance se viera suficiente.

**Cómo detectarlo:** comparar `credits_balance` contra `credits_balance - credits_held` — si la diferencia no baja nunca con el tiempo en una cuenta que ya entregó varios pedidos, hay holds atorados.

**Limpieza aplicada:** se liberaron manualmente los holds viejos con la misma lógica de `release_guarantee_hold` (restar de `credits_held`, marcar `status='entregado'`). Los pedidos entregados de aquí en adelante ya se liberan solos, con el fix de arriba.

### Archivos afectados
- `src/pages/PrintshopPage.jsx` (función `updateStatus`)

---

## 5. Nombre de archivo genérico ("documento.pdf")

### Síntoma
Todos los pedidos en Historial mostraban el mismo nombre genérico "documento.pdf", sin importar qué se hubiera subido — dificultaba que el usuario reconociera qué había enviado.

### Causa real
`resolveFileName()` en `sendOrder.js` siempre devolvía `'documento.pdf'` cuando había al menos un archivo "imprimible" (no Word), sin importar si era **uno solo** o varios combinados. Solo tiene sentido usar un nombre genérico cuando se combinan **varios** archivos en un PDF nuevo (ahí no hay un nombre "correcto" único) — con un solo archivo, se puede y se debe usar su nombre real.

### Fix aplicado
```js
function resolveFileName(files) {
  const printable = files.filter(f => !isDocx(f.file))
  if (printable.length === 0) return files[0].file.name // solo Word
  if (files.length === 1) return files[0].file.name // un solo archivo — nombre real
  return 'documento.pdf' // varios archivos combinados en un PDF nuevo
}
```

### Archivos afectados
- `src/lib/sendOrder.js`

---

*Documento creado: 20 de agosto de 2026, tras una sesión extensa de diagnóstico de tiempo real. Actualizar esta lista si aparecen bugs nuevos parecidos, para no repetir el mismo camino de descarte.*
