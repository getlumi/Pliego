import React from 'react'
export default function UploadPage({ session, onNavigate }) {
  return (
    <div className="page">
      <div style={{ background:'var(--gradient-dark)', padding:'48px 20px 24px' }}>
        <p style={{ fontSize:22, fontWeight:900, color:'#fff' }}>Subir documento</p>
      </div>
      <div className="scroll-content">
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <i className="ti ti-upload" style={{ fontSize:48, color:'var(--green)', display:'block', marginBottom:12 }} />
          <p style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Toca para elegir tu archivo</p>
          <p style={{ fontSize:13, color:'var(--text-secondary)' }}>PDF, DOCX, JPG o PNG</p>
          <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" multiple
            style={{ display:'block', margin:'20px auto 0', fontSize:16 }} />
        </div>
        <p style={{ fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>
          <i className="ti ti-shield-check" style={{ fontSize:13 }} /> Tu documento se elimina automáticamente en 3 días
        </p>
      </div>
    </div>
  )
}
