// Pliego · Qué servicio (precio) le corresponde a una IMAGEN.
//
// UN SOLO LUGAR para la regla, usado por UploadPage.jsx (botones y
// valores por defecto) — así el precio, el preview y el PDF nunca se
// contradicen (13/10/2026, reporte real: una imagen agregada quedaba con
// el primer servicio de la lista, un B/N de $1, hasta que se tocaba).
//
// Dos ejes + tamaño:
//   - material: 'bond' | 'opalina'
//   - colorMode: 'color' | 'bn'
//   - frame: 'cuarto' | 'medio' | 'completa'  (solo importa en color)
//
//   color → servicio "imagen" del material y tamaño (color_imagen_* /
//           opalina_imagen_*)
//   bn    → servicio B/N normal del material (bn_bond / opalina_bn),
//           SIN importar el tamaño de la imagen.

export const FRAME_TO_SERVICE_TYPE = {
  bond:    { cuarto: 'color_imagen_cuarto',   medio: 'color_imagen_medio',   completa: 'color_imagen_completa' },
  opalina: { cuarto: 'opalina_imagen_cuarto', medio: 'opalina_imagen_medio', completa: 'opalina_imagen_completa' },
}
export const BN_SERVICE_TYPE = { bond: 'bn_bond', opalina: 'opalina_bn' }

const COLOR_IMAGE_TYPES = [...Object.values(FRAME_TO_SERVICE_TYPE.bond), ...Object.values(FRAME_TO_SERVICE_TYPE.opalina)]
const BN_TYPES = Object.values(BN_SERVICE_TYPE)

export const ALL_IMAGE_SERVICE_TYPES = COLOR_IMAGE_TYPES

export const isImageFile = (f) => !!f?.file?.type?.startsWith('image/')

// ¿Es un servicio válido para una imagen? (color por tamaño o B/N normal)
export const isImageOrBnService = (service) =>
  !!service && (COLOR_IMAGE_TYPES.includes(service.service_type) || BN_TYPES.includes(service.service_type))

export const colorModeOfService = (service) =>
  service && BN_TYPES.includes(service.service_type) ? 'bn' : 'color'

export const materialOfService = (service) =>
  service && (Object.values(FRAME_TO_SERVICE_TYPE.opalina).includes(service.service_type) || service.service_type === 'opalina_bn' || service.service_type === 'opalina_color')
    ? 'opalina' : 'bond'

// Servicio que corresponde a {material, colorMode, frame}. null si la
// papelería no lo ofrece. strict=true: nunca cae a otro material (sirve
// para saber si un botón debe estar habilitado); strict=false: si no
// existe esa combinación en Opalina, cae a la versión Bond.
export function resolveImageService(services, { material = 'bond', colorMode = 'color', frame = 'completa', strict = false }) {
  const list = services ?? []
  const find = (type) => list.find(s => s.service_type === type) ?? null
  if (colorMode === 'bn') {
    return find(BN_SERVICE_TYPE[material]) ?? (strict ? null : find(BN_SERVICE_TYPE.bond))
  }
  return find(FRAME_TO_SERVICE_TYPE[material][frame]) ?? (strict ? null : find(FRAME_TO_SERVICE_TYPE.bond[frame]))
}

// Servicio inicial de un archivo que aún no tiene uno válido.
// Imagen y la papelería ofrece tamaños de imagen → COLOR en el tamaño
// indicado (por defecto "completa", el más caro: el cliente lo baja si
// quiere; así la papelería nunca pierde). Todo lo demás → primer
// servicio habilitado, como siempre.
export function pickDefaultService(file, services, anyImageFrameOffered, frame) {
  const list = services ?? []
  if (isImageFile(file) && anyImageFrameOffered) {
    const f = frame ?? file.imageFrame ?? (file.groupId ? 'cuarto' : 'completa')
    const s = resolveImageService(list, { material: 'bond', colorMode: 'color', frame: f })
    if (s) return s
  }
  return list[0] ?? null
}
