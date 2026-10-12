// Pliego · Edge Function: cleanup-expired-files
// La llama pg_cron cada 2 horas (ver supabase_migration_cleanup.sql).
// Borra de Storage los archivos de pedidos cuyo expires_at ya pasó —
// esto es lo que hace REAL la promesa de "tu documento se borra
// automáticamente" que ya está en tutoriales y aviso de privacidad.
// IMPORTANTE: desplegar con "Verify JWT" DESACTIVADO — pg_net la llama
// sin token de usuario, solo desde la base de datos.
//
// 🔒 SEGURIDAD (agregado 07/09/2026): con "Verify JWT" apagado,
// cualquiera que supiera esta URL podía dispararla manualmente sin
// ninguna otra verificación. Ahora exige un secreto compartido en el
// header x-cron-secret, que solo pg_cron (y quien administre el
// proyecto) conoce — ver supabase_migration_cleanup.sql actualizado.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'No autorizado' }, 401)
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: due, error } = await supabase.from('orders_due_cleanup').select('*')
    if (error) return json({ error: error.message }, 500)

    let deleted = 0
    const errors: string[] = []

    // Cada pedido vive en su propia carpeta "<user_id>/<order_id>/". Los pedidos
    // con varios archivos guardan ahí además del PDF combinado (file_url) un
    // archivo por cada documento (12/10/2026) — hay que borrarlos TODOS, no
    // solo file_url, o quedarían archivos de clientes más allá de la promesa
    // de privacidad. Solo se lista la carpeta si tiene EXACTAMENTE esa forma
    // (dos UUID): si file_url trajera cualquier otra ruta, se borra solo ese
    // archivo — nunca se lista una carpeta que pudiera ser la raíz del bucket.
    const ORDER_FOLDER = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i

    for (const order of due ?? []) {
      let paths: string[] = [order.file_url]
      const folder = order.file_url.split('/').slice(0, -1).join('/')
      if (ORDER_FOLDER.test(folder)) {
        const { data: listed, error: listError } = await supabase.storage
          .from('documents').list(folder, { limit: 1000 })
        if (listError) {
          // Sin poder listar no se marca como borrado: se reintenta en el
          // siguiente ciclo (2 h) en vez de dejar archivos huérfanos.
          errors.push(`${order.id}: list: ${listError.message}`)
          continue
        }
        for (const f of listed ?? []) {
          if (f.id) paths.push(`${folder}/${f.name}`) // f.id nulo = subcarpeta, se omite
        }
        paths = [...new Set(paths)]
      }

      const { error: removeError } = await supabase.storage.from('documents').remove(paths)
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
