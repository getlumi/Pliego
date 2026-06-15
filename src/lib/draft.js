// Pliego · estado del "borrador" de impresión.
// Vive en App.jsx para que sobreviva la navegación entre pantallas
// (no se pierde al ir a elegir papelería y volver).

export function createEmptyDraft() {
  return {
    files: [],          // [{ file: File, previewUrl: string|null, pageCount: number, pageCountAuto: boolean }]
    shopId: null,        // papelería elegida para este pedido
    serviceId: null,     // printshop_services.id elegido (define precio y tipo de hoja)
    orientation: 'vertical', // 'vertical' | 'horizontal'
    fit: 'fit',          // 'fit' | 'actual'
    copies: 1,
    instructions: '',
    activeIndex: 0,
  }
}

export function revokeDraftUrls(draft) {
  draft.files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
}
