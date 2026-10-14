import { useNavigate } from 'react-router-dom'
import PrinterDispenseAnimation from '../components/PrinterDispenseAnimation'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '').replace(/\/+$/, '')
const KIOSK_ID = 'PB-001'

export default function PrintingScreen() {
  const navigate = useNavigate()
  const fileName = sessionStorage.getItem('pb_file_name') || 'document.pdf'
  const rawColour = sessionStorage.getItem('pb_colour_mode') || 'BW'
  const isColor = rawColour.toUpperCase() === 'COLOUR' || rawColour.toUpperCase() === 'COLOR'
  const rawCount = Number(sessionStorage.getItem('pb_page_count') || 1)
  const copies = Number(sessionStorage.getItem('pb_copies') || 1)

  const handlePrintComplete = async () => {
    try {
      const sessionId = sessionStorage.getItem('pb_kiosk_session_id')
      if (sessionId) {
        await fetch(`${API_BASE}/api/kiosk-sessions/${sessionId}/complete`, { method: 'POST' })
      } else {
        await fetch(`${API_BASE}/api/kiosk-sessions/kiosk/${KIOSK_ID}/complete`, { method: 'POST' })
      }
    } catch {}
    navigate('/collect')
  }

  return (
    <PrinterDispenseAnimation
      fileName={fileName}
      sheets={rawCount}
      copies={copies}
      colourMode={isColor ? 'color' : 'mono'}
      onComplete={handlePrintComplete}
    />
  )
}
