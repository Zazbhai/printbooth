import { Component, type ErrorInfo, type ReactNode } from 'react'


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
    console.error('[ErrorBoundary] Uncaught rendering exception:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--background, #06110D)',
            color: 'var(--foreground, #fafafa)',
            padding: '24px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: 'var(--card, #121215)',
              border: '1px solid var(--border, rgba(255,255,255,0.1))',
              borderRadius: 12,
              padding: '28px',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 16,
              }}
            >
              ⚠️
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>
              Interface Loaded with Transient Notice
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground, #a1a1aa)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              A temporary render hiccup was intercepted. Click below to refresh the console telemetry smoothly.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '10px 12px',
                  borderRadius: 6,
                  color: '#f87171',
                  textAlign: 'left',
                  overflowX: 'auto',
                  marginBottom: 20,
                  maxHeight: 120,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                width: '100%',
                background: 'var(--primary, #3b82f6)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Reload Dashboard Console
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
