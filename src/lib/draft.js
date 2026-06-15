// Pliego · estado del "borrador" de impresión.
// Vive en App.jsx para que sobreviva la navegación entre pantallas
// (no se pierde al ir a elegir papelería y volver).

export function createEmptyDraft() {
  return {
    files: [],          // [{ file: File, previewUrl: string|null }]
    shopId: null,        // papelería elegida para este pedido
    orientation: 'vertical', // 'vertical' | 'horizontal'
    fit: 'fit',          // 'fit' | 'actual'
    copies: 1,
    colorMode: 'bn',     // 'bn' | 'color'
    paperType: 'bond',   // 'bond' | 'opalina' | 'doble_carta'
    instructions: '',
    activeIndex: 0,
  }
}

export function revokeDraftUrls(draft) {
  draft.files.forEach(f => f.previewUrl && URL.revokeObjectURL(f.previewUrl))
}
