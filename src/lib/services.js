// Pliego · etiquetas/íconos para los tipos de impresión.
// `service.label` (texto libre, futuro) tiene prioridad sobre el mapa fijo,
// para soportar tipos de hoja personalizados que agregue cada papelería.

export const SERVICE_LABELS = {
  bn_bond:       { icon: 'ti-file-text', label: 'B/N · Bond carta' },
  color_bond:    { icon: 'ti-palette',   label: 'Color · Bond carta' },
  opalina_bn:    { icon: 'ti-sparkles',  label: 'Opalina · B/N' },
  opalina_color: { icon: 'ti-sparkles',  label: 'Opalina · Color' },
  doble_carta:   { icon: 'ti-files',     label: 'Doble carta / oficio' },
}

export function serviceLabel(service) {
  return service.label || SERVICE_LABELS[service.service_type]?.label || service.service_type
}

export function serviceIcon(service) {
  return SERVICE_LABELS[service.service_type]?.icon || 'ti-file'
}
