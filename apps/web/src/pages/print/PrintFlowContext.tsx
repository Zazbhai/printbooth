import { createContext, useContext, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export type PrintStep =
  | 'upload'
  | 'confirm'
  | 'kiosk'
  | 'settings'
  | 'review'
  | 'payment'
  | 'status'
  | 'success'
  | 'history'

export interface PrintFlowContextType {
  currentStep: PrintStep
  goToStep: (step: PrintStep) => void
  printerId: string
  kioskName: string
  setPrinterId: (id: string, name?: string) => void
}

export const PrintFlowContext = createContext<PrintFlowContextType | null>(null)

export function usePrintFlow(): PrintFlowContextType {
  const ctx = useContext(PrintFlowContext)
  if (!ctx) {
    throw new Error('usePrintFlow must be used within a PrintFlowProvider')
  }
  return ctx
}

/**
 * Drop-in replacement for useNavigate() inside the /print?id={printer_id} flow.
 * Intercepts legacy /print/xyz paths and converts them to seamless in-page step transitions.
 */
export function usePrintNavigate() {
  const flow = useContext(PrintFlowContext)
  const routerNavigate = useNavigate()

  return useCallback(
    (to: string | number, options?: any) => {
      if (typeof to === 'string' && flow) {
        const clean = to.toLowerCase()
        if (clean.includes('/print/upload') || clean === '/print') {
          flow.goToStep('upload')
          return
        }
        if (clean.includes('/print/confirm')) {
          flow.goToStep('confirm')
          return
        }
        if (clean.includes('/print/kiosk')) {
          flow.goToStep('kiosk')
          return
        }
        if (clean.includes('/print/settings')) {
          flow.goToStep('settings')
          return
        }
        if (clean.includes('/print/review')) {
          flow.goToStep('review')
          return
        }
        if (clean.includes('/print/payment')) {
          flow.goToStep('payment')
          return
        }
        if (clean.includes('/print/status')) {
          flow.goToStep('status')
          return
        }
        if (clean.includes('/print/success')) {
          flow.goToStep('success')
          return
        }
        if (clean.includes('/print/history')) {
          flow.goToStep('history')
          return
        }
      }
      routerNavigate(to as any, options)
    },
    [flow, routerNavigate]
  )
}
