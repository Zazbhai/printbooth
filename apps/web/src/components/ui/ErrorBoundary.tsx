import { Component, type ErrorInfo, type ReactNode } from 'react'
import { WarningCircle, ArrowsClockwise, Upload } from '@phosphor-icons/react'
import { ShinyButton } from './ShinyButton'
import { clearAllFiles } from '../../lib/multiFileStore'
import { clearUploadedDoc } from '../../lib/documentStore'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught unhandled component error:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReturnToUpload = () => {
    clearAllFiles()
    clearUploadedDoc()
    sessionStorage.setItem('pb_print_step', 'upload')
    this.setState({ hasError: false, error: null })
    window.location.href = '/print'
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '420px',
            width: '100%',
            maxWidth: '520px',
            margin: '40px auto',
            padding: '36px 28px',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(226, 232, 240, 0.8)',
            boxShadow: '0 20px 48px -12px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.9) inset',
            textAlign: 'center',
          }}
          className="animate-fadeIn"
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
              marginBottom: '18px',
            }}
          >
            <WarningCircle size={32} weight="duotone" />
          </div>

          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.02em',
              marginBottom: '8px',
            }}
          >
            Something unexpected occurred
          </h2>

          <p
            style={{
              fontSize: '0.875rem',
              color: '#64748b',
              lineHeight: 1.5,
              maxWidth: '380px',
              marginBottom: this.state.error?.message ? '12px' : '24px',
            }}
          >
            The page encountered a temporary issue while rendering. You can retry or return to document upload.
          </p>

          {this.state.error?.message && (
            <div
              style={{
                fontSize: '0.75rem',
                color: '#b91c1c',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '6px 12px',
                borderRadius: '8px',
                marginBottom: '20px',
                maxWidth: '420px',
                wordBreak: 'break-word',
                fontFamily: 'monospace',
              }}
            >
              {this.state.error.message}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <ShinyButton
              type="button"
              variant="ghost"
              onClick={this.handleReset}
              style={{ minWidth: '130px' }}
            >
              <ArrowsClockwise size={16} weight="bold" />
              <span>Try Again</span>
            </ShinyButton>

            <ShinyButton
              type="button"
              variant="primary"
              onClick={this.handleReturnToUpload}
              style={{ minWidth: '150px' }}
            >
              <Upload size={16} weight="bold" />
              <span>Return to Upload</span>
            </ShinyButton>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
