# Pliego — Playbook Estratégico
**Documento vivo.** Cada framework se traduce a una decisión ya aplicada (o pendiente de aprobar) a Pliego — no es un resumen de libros, es la lógica de negocio detrás de cada botón, texto y feature.

**Instrucción para cualquier chat que lea esto:** este documento es la fuente de verdad de *por qué* se toman las decisiones de marketing/producto en Pliego. Antes de dar un consejo de marketing/redes/retención, revisar aquí primero si ya hay una decisión tomada con un framework — no reinventar ni contradecir sin avisar.

---

## 0. Fuentes activas — estado

| Fuente | Estado | Aplicado en |
|---|---|---|
| *Posicionamiento Increíble* (Obviously Awesome, April Dunford) | ✅ Aplicado | Sección 2 de este documento |
| *The Cold Start Problem* (Andrew Chen) | ✅ Aplicado | Sección 3 de este documento |
| Amway / Herbalife / Omnilife (análisis, no el modelo) | ✅ Aplicado (lo transferible) | Secciones 3 y 4 de este documento |
| *Superfans* (Pat Flynn) | ✅ Aplicado | Sección 4 de este documento |
| *Palabras que Venden* | ✅ Aplicado (principios generales de copy directo) | Sección 5 de este documento |
| *$100M Offers* (Alex Hormozi) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 3 |
| *La Estrategia del Océano Azul* (Kim & Mauborgne) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 2 |
| *La Vaca Púrpura* (Seth Godin) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 2 |
| *El Principio 80/20* (Richard Koch) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 5 |
| *Solo Una Cosa* (The One Thing, Gary Keller) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 5 |
| ¿Quién no cómo? (Dan Sullivan / Benjamin Hardy) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *Amplitud* (Range, David Epstein) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *El Poder de la Atención* | ✅ Aplicado (genérico — falta título específico para más precisión) | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *Minimalismo Digital* (Cal Newport) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 4 |
| *Pensamiento Crítico, Lógica y Resolución de Problemas* | ✅ Aplicado (genérico) | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *Supercomunicadores* (Charles Duhigg) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 3 |
| Cómo crear buenos contenidos y movilizar a tu tribu (*Tribus*, Seth Godin) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 2 |
| *Omnipresencia* (marketing multicanal) | ✅ Aplicado (genérico — falta autor/título exacto) | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *Networking* (fuente general) | ✅ Aplicado | `pliego_estrategia_redes_y_crecimiento.md`, Partes 1 y 3 |
| *Secretos de una Mente Millonaria* (T. Harv Eker) | ✅ Revisado — más mindset personal que táctica de producto, no genera acción directa | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| *6 Formas de Rentabilizar tu Marca* | ✅ Revisado (genérico — falta autor exacto; solo una vía aplica hoy) | `pliego_estrategia_redes_y_crecimiento.md`, Parte 1 |
| Tony Robbins (fuentes generales) | ⏳ Pendiente — falta título específico para aplicar con sustancia | — |

**Nota de honestidad:** cuando un libro dice "⏳ Pendiente", significa que aún no se ha aplicado con sustancia a una decisión real de Pliego — no fingir que ya se hizo. Cuando se marque "✅ Aplicado", debe existir una sección concreta abajo que lo demuestre, no solo una mención.

---

## 1. Principio rector (de todas las fuentes combinadas)

Ningún framework de los de arriba dice "manipula para vender" como técnica aislada — todos, incluso los de venta directa/persuasión, funcionan mejor y duran más cuando están anclados en **valor real entregado primero**. La línea que Pliego no cruza: persuasión sutil y bien diseñada sí (urgencia real, prueba social real, reconocimiento real) — patrones oscuros (falsa escasez, culpa, ocultar información) no, porque destruyen la confianza que es literalmente el activo que estamos construyendo (ver sección 3, "confianza social" de MLM).

---

## 2. Posicionamiento — Plan Ilimitado ($75/mes)

Framework de Dunford (5 pasos): alternativas competitivas → atributos únicos → valor que habilitan → a quién le importa ese valor → categoría de mercado.

- **Alternativa competitiva** de alguien que imprime seguido: comprar paquetes de créditos repetidamente, o ir a cualquier papelería con efectivo sin usar la app.
- **Atributo único:** precio fijo sin importar el uso + cero cálculo mental.
- **Valor real (no "más barato si imprimes mucho"):** alivio de carga mental — una decisión menos en el mes.
- **A quién le importa:** gente que prefiere simplicidad sobre optimización — de ahí "el plan de quienes no se complican" (ya implementado en `WalletPage.jsx` y `TutorialPage.jsx`, commit `a73361e`).
- **Categoría de mercado — pendiente de decidir:** el libro empujaría a NO posicionarlo como "plan de impresión" sino como categoría **"suscripción de conveniencia mensual"**, el mismo cajón mental que Netflix/Spotify — comparado contra la fricción de calcular, no contra otras papelerías. Esto podría cambiar cómo se describe en onboarding/tutorial. **Pendiente de tu aprobación antes de tocar más copy.**

---

## 3. Estrategia de red (recuperada de la sesión del 13/08, íntegra)

### Qué es transferible de cada fuente, y qué no

| Fuente | Transferible (legítimo) | NO copiar |
|---|---|---|
| Amway / Herbalife / Omnilife | Transferencia de confianza por red social existente; sistemas de estatus/reconocimiento; distribución hiperlocal cara a cara | Comisión multinivel por reclutar reclutadores — insostenible y legalmente riesgoso |
| Esquemas Ponzi | El poder viral de "dar para recibir" (referido de dos lados) | Nada de su mecánica de pago |
| Uber / Rappi | Todo — es el modelo más parecido a Pliego (marketplace de dos lados) | — |
| *The Cold Start Problem* | Todo el marco — escrito para este tipo de negocio | — |

### El problema del arranque en frío

Un marketplace de dos lados no vale nada hasta tener ambos lados, pero nadie quiere ser el primero. Solución de Chen: **red atómica** — no cubrir toda la ciudad de un jalón, sino construir una sola red mínima, densa y autosuficiente (una colonia, no Cancún entero).

### El plan de arranque en frío para Pliego, paso a paso

1. Elegir UNA colonia (idealmente donde ya haya una papelería ancla activa).
2. Saturar esa colonia con papelerías primero — el "lado difícil" — meta: 8-12 papelerías activas antes de empujar fuerte del lado cliente ahí.
3. "Rider Zero" local — alguien conocido de la zona, primer pedido documentado.
4. Activar referido de dos lados solo cuando ya haya oferta suficiente para que la primera experiencia del cliente sea buena.
5. Medir **liquidez, no registros** — la métrica real: ¿un cliente que abre la app en esa colonia encuentra papelería disponible en menos de X minutos? Eso es la señal de que la red atómica está viva, no "cuántas se registraron".
6. Solo entonces, repetir en la siguiente colonia — nunca saturar 5 zonas a medias en vez de dominar 1 de verdad.

### Aritmética de crecimiento (corrección importante ya discutida)

Lo que le importa a una papelería no es su % de participación entre todas las papelerías de Pliego — es su volumen absoluto. Si los usuarios crecen más rápido que las papelerías (lo normal), cada papelería puede terminar con más pedidos absolutos aunque haya más competencia — el pastel creció más rápido de lo que se repartió. Solo funciona si de verdad se empuja a ambos lados a la vez.

### Predicción honesta de crecimiento

**5-8 meses para 1,000 usuarios** con buena ejecución (basado en benchmarks reales de marketplaces bootstrapped, no optimismo).

---

## 4. Sistema de estatus — el gancho psicológico sin el riesgo del MLM

De Amway/Herbalife: la gente no se queda por el dinero, se queda por sentirse reconocida. De *Superfans* (Pat Flynn): la progresión por niveles crea identidad y pertenencia — la gente no solo consume, se convierte en parte de algo. Combinado:

| Nivel | Pedidos completados | Reconocimiento |
|---|---|---|
| 🥉 Bronce | 25 | Insignia visible en la app |
| 🥈 Plata | 100 | Insignia + post individual en redes de Pliego, con foto real del local |
| 🥇 Oro | 250 | Todo lo anterior + prioridad de visibilidad en la lista de esa colonia |
| 💎 Fundadora + [nivel] | Combinado con antigüedad | El estatus más alto — primeras 10 que llegan a Oro |

**Decisiones ya tomadas, no reabrir sin avisar:**
- Nunca prometer exclusividad territorial (no se puede controlar quién se registra dónde).
- Nunca prometer comisión — cero comisiones, Pliego no se mete con las ganancias de la papelería.
- El reconocimiento se publica en **redes**, no en WhatsApp — hace doble trabajo: reconoce a la papelería Y promociona a Pliego con contenido real (no inventado).
- "100 pedidos" se comunica como lo que realmente es: varios clientes reales confiaron, algunos más de una vez — dato real de la base de datos, no una cifra inflada.
- Ranking público **por colonia**, no de toda la ciudad — para que una papelería nueva tenga oportunidad real de ser "primera en su zona".

**Sin construir todavía** — depende de que exista tracción real primero:
- Insignias visibles en `PrintshopPage` (tarjeta de perfil) y en `HomePage` (lista de papelerías, junto al chip de servicios).
- Conteo de pedidos completados por papelería ya existe en la base (`orders` con `status='entregado'`) — el trabajo es de UI, no de datos nuevos.
- Retos tipo Uber (meta con plazo + premio).

---

## 5. Copy/microcopy — principios aplicados hoy

De copywriting directo (*Palabras que Venden* y principios generales de venta directa bien documentados):
- **Beneficio, no característica.** "El plan de quienes no se complican" vende el alivio (beneficio), no "$75/mes ilimitado" (característica). Ya aplicado en el rediseño de Wallet.
- **Identidad, no segmento de uso.** Un gancho que divide a la gente en "usa mucho / usa poco" empuja a la mitad de la audiencia a excluirse. Un gancho de identidad ("los que no se complican") invita a todos por igual — nadie se excluye a sí mismo de querer ser "quien no se complica".
- **Especificidad sobre vaguedad.** "100 pedidos reales" convence más que "¡Muy popular!" — la especificidad es lo que la hace creíble (principio de prueba social bien aplicado, no inflado).

---

## 6. Retención y "dopamina" — primera pasada, pendiente de aprobación

Esto es lo que pediste hoy explícitamente y merece su propia sesión de diseño en vez de que yo invente features sueltas. Con lo que ya sabemos de arriba (estatus real, especificidad, identidad), los candidatos más alineados con las fuentes ya aplicadas — **ninguno construido todavía, todos para tu aprobación**:

- **Progreso visible hacia el siguiente nivel** en `HistoryPage`/Wallet — barra "38/100 hacia Plata" para la papelería. Variable-reward real (Superfans), no inventado.
- **Racha de uso** para clientes (ej. "3 meses seguidos usando Pliego") — reconocimiento de lealtad, no descuento — evita entrenar al usuario a esperar rebajas.
- **Micro-confirmación con identidad** al completar un pedido: en vez de solo "Pedido enviado", algo como "Uno menos que calcular" — refuerza el mismo gancho de identidad del plan Ilimitado en cada interacción, no solo en el paywall.
- **Notificación de hito real** (no inventado): cuando una papelería llega a Bronce/Plata/Oro, notificación push/SMS inmediata — el reconocimiento pierde fuerza si llega tarde.

Antes de construir cualquiera de estos, necesito que confirmes cuál(es) priorizamos — son features nuevas de verdad (algunas necesitan columnas/triggers nuevos), no ajustes de copy.

---

## 7. Cinco frameworks nuevos, aplicados a decisiones reales de Pliego

### Océano Azul — dónde no competir

El marco (Kim & Mauborgne): en vez de competir a muerte en el mercado existente ("océano rojo" — comparar precio/features contra otras papelerías o apps de impresión), crear un espacio sin competencia real. Aplicado con la parrilla ERRC:

- **Eliminar:** la comisión sobre ventas (ya decidido — "cero comisiones"). Nadie en el mercado de impresión hace esto; es lo que nos saca del océano rojo de entrada.
- **Reducir:** la fricción de decidir cuánto pagar por impresión (de ahí el plan Ilimitado — reduce la variable "cuánto me va a costar" a cero pensamiento).
- **Elevar:** la confianza papelería-cliente vía calificaciones reales y garantía anti-no-show — nadie en impresión local ofrece esto hoy.
- **Crear:** la categoría "suscripción de conveniencia para imprimir" no existe todavía en la mente de nadie en Cancún — es territorio nuevo, no estamos peleando por cuota de mercado de algo que ya existe.

**Implicación práctica:** en cualquier mensaje de marketing, evitar compararse contra "otras papelerías" o "otras apps" — compararse contra la fricción misma (ir, esperar, no saber si va a estar abierto, cargar efectivo exacto).

### Vaca Púrpura — ser lo suficientemente notable para que hablen de ti

Seth Godin: lo ordinario es invisible. El marketing tradicional (anuncios) ya no basta — el producto mismo debe ser la razón de que la gente hable de él. Aplicado:

- La garantía anti-no-show y el sistema de créditos apartados **es** la vaca púrpura de Pliego — ninguna papelería local ofrece esa certeza hoy. Vale la pena que el marketing lo diga explícito, no lo esconda como detalle técnico.
- El sistema de insignias (sección 4) publicado en redes con fotos reales de locales es intrínsecamente más "hablable" que un anuncio — es contenido genuino, no publicidad disfrazada.
- **Pendiente de decidir:** ¿cuál es el "momento vaca púrpura" del onboarding — el primer contacto con la app que hace que alguien quiera contárselo a otro? Candidato: la primera vez que ve el precio EN VIVO mientras sube su documento (ya construido) — vale la pena resaltarlo más en el tutorial si no se ha hecho.

### 80/20 — dónde va el esfuerzo real

Aplicado directamente a la estrategia de red ya escrita en la sección 3: no todas las colonias, papelerías o features valen lo mismo. El 20% de esfuerzo que más importa ahora mismo, según todo lo ya decidido:
- Saturar UNA colonia (no repartir esfuerzo en varias) — ya es 80/20 puro, confirma que la estrategia de red ya está alineada con este principio sin que lo llamáramos así.
- De las ideas de retención (sección 6), no construir las 4 a la vez — elegir la que más mueva la aguja antes de tocar el resto (ver pregunta al final de este documento).

### Solo Una Cosa — la pregunta que evita dispersión

Gary Keller: "¿Cuál es la ÚNICA cosa que puedo hacer tal que, al hacerla, todo lo demás se vuelva más fácil o innecesario?" Aplicado como disciplina de trabajo entre tú y yo, no como feature de producto: antes de aprobar una nueva construcción (sección 6, o cualquier feature nueva), la pregunta correcta no es "¿serviría esto?" (casi todo sirve algo) sino "¿es ESTA la única cosa que hace innecesarias a las demás por ahora?" — por ejemplo, si la red atómica de la colonia elegida (sección 3) no está saturada todavía, ningún feature de retención mueve la aguja tanto como conseguir más papelerías ahí — la retención no importa si no hay suficiente oferta que retener.

### $100M Leads (Hormozi) — la ecuación de valor de la oferta

Framework central: Valor = (Resultado soñado × Probabilidad percibida de lograrlo) / (Tiempo × Esfuerzo/Sacrificio). Aplicado al plan Ilimitado:
- Resultado soñado: no pensar en imprimir, nunca.
- Probabilidad percibida: la garantía + calificaciones reales ya suben esto.
- Lo que falta bajar (el denominador): **tiempo hasta el primer valor percibido**. Hormozi insistiría en que el momento crítico es cuánto tarda alguien en sentir el beneficio la primera vez que paga — vale la pena revisar si hay fricción entre "me suscribo" y "siento que ya no tengo que pensar en esto" (ej. ¿el primer pedido después de suscribirse se siente distinto, se le dice algo especial?). **Candidato fuerte para la sección 6** (retención), no construido todavía.

Sobre "Core Four" de generación de prospectos (contenido, cold outreach, redes pagadas, boca a boca) — encaja directo con la estrategia de red ya escrita (sección 3): ahora mismo Pliego usa principalmente boca a boca + contenido de reconocimiento (insignias en redes). Cold outreach directo a papelerías (visitas en persona, ya contemplado en `papeleria_tracker.jsx`) es el canal más fuerte para el "lado difícil" según Hormozi también, no solo según Cold Start Problem — dos fuentes distintas confirmando la misma táctica.

---

## 8. Documentos relacionados (recuperar/re-subir a Project Knowledge si no están)

- `pliego_brief_de_marca.md` — identidad, tono, públicos, mensajes clave (existía en sesión anterior, confirmar si ya está en Project Knowledge).
- `papeleria_tracker.jsx` — artifact de seguimiento de reclutamiento, 6 papelerías reales cerca de Paseo del Caribe.
- `pliego_corrida_financiera_con_impuestos.xlsx` — margen real con IVA/ISR, punto de equilibrio ~30-35 pedidos/mes para la mensualidad.

---

*Última actualización: 14 de agosto 2026 — se agregaron 5 frameworks nuevos aplicados (Océano Azul, Vaca Púrpura, 80/20, Solo Una Cosa, $100M Leads) y 5 pendientes de profundizar. Siguiente paso: elegir UNA pieza de la sección 6 para construir primero (aplicando el propio principio de "Solo Una Cosa" a esta decisión), y seguir profundizando los libros marcados ⏳.*
