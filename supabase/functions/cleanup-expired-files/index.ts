// Pliego · Edge Function: cleanup-expired-files
// La llama pg_cron cada 2 horas (ver supabase_migration_cleanup.sql).
// Borra de Storage los archivos de pedidos cuyo expires_at ya pasó —
// esto es lo que hace REAL la promesa de "tu documento se borra
// automáticamente" que ya está en tutoriales y aviso de privacidad.
// IMPORTANTE: desplegar con "Verify JWT" DESACTIVADO — pg_net la llama
// sin token de usuario, solo desde la base de datos.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: due, error } = await supabase.from('orders_due_cleanup').select('*')
    if (error) return json({ error: error.message }, 500)

    let deleted = 0
    const errors: string[] = []

    for (const order of due ?? []) {
      const { error: removeError } = await supabase.storage.from('documents').remove([order.file_url])
      if (removeError) {
        errors.push(`${order.id}: ${removeError.message}`)
        continue
      }
      await supabase.rpc('mark_order_file_deleted', { p_order_id: order.id })
      deleted++
    }

    console.log(`✅ cleanup-expired-files: ${deleted} borrados de ${due?.length ?? 0}`)
    return json({ ok: true, deleted, total: due?.length ?? 0, errors })

  } catch (e) {
    console.error('Error interno cleanup-expired-files:', e)
    return json({ error: 'Error interno' }, 500)
  }
})
