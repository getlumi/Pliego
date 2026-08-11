// Pliego · etiquetas/íconos para los tipos de impresión.
// `service.label` (texto libre, futuro) tiene prioridad sobre el mapa fijo,
// para soportar tipos de hoja personalizados que agregue cada papelería.

export const SERVICE_LABELS = {
  bn_bond:               { icon: 'ti-file-text', label: 'B/N · Bond carta' },
  color_bond:            { icon: 'ti-palette',   label: 'Color · Solo texto' },
  color_imagen_cuarto:   { icon: 'ti-photo',     label: 'Color · Imagen 1/4 de hoja' },
  color_imagen_medio:    { icon: 'ti-photo',     label: 'Color · Imagen 1/2 hoja carta' },
  color_imagen_completa: { icon: 'ti-photo',     label: 'Color · Imagen hoja completa' },
  opalina_bn:            { icon: 'ti-sparkles',  label: 'Opalina · B/N' },
  opalina_color:         { icon: 'ti-sparkles',  label: 'Opalina · Color' },
  doble_carta:           { icon: 'ti-files',     label: 'Doble carta / oficio' },
  identificacion_2_lados:{ icon: 'ti-id',        label: 'Identificación (frente y reverso)' },
}

export function serviceLabel(service) {
  return service.label || SERVICE_LABELS[service.service_type]?.label || service.service_type
}

export function serviceIcon(service) {
  return SERVICE_LABELS[service.service_type]?.icon || 'ti-file'
}
