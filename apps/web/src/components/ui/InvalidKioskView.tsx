import React from 'react'
import { Warning, ArrowRight, ArrowLeft, MagnifyingGlass, CheckCircle } from '@phosphor-icons/react'
import { ShinyButton } from './ShinyButton'
import { VERIFIED_KIOSKS } from '@/lib/kioskValidation'

interface InvalidKioskViewProps {
  attemptedId: string
  reason: 'INVALID_FORMAT' | 'NOT_FOUND'
  suggestion: string | null
  onResolveSuggestion?: (canonicalId: string) => void
  onOpenKioskSelector: () => void
  onGoHome: () => void
}

export const InvalidKioskView: React.FC<InvalidKioskViewProps> = ({
  attemptedId,
  reason,
  suggestion,
  onResolveSuggestion,
  onOpenKioskSelector,
  onGoHome,
}) => {
  const suggestedMeta = suggestion ? VERIFIED_KIOSKS[suggestion] : null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '75vh',
        padding: '24px 16px',
        width: '100%',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--card-bg, #ffffff)',
          borderRadius: '24px',
          padding: '36px 28px',
          boxShadow: '0 20px 48px -12px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle decorative glow */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '240px',
            height: '140px',
            background: 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.15), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Warning Icon Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(254, 242, 242, 1), rgba(254, 226, 226, 1))',
            color: '#dc2626',
            boxShadow: '0 8px 16px -4px rgba(220, 38, 38, 0.2)',
            marginBottom: '20px',
          }}
        >
          <Warning size={32} weight="duotone" />
        </div>

        {/* Badge */}
        <div>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              background: '#fee2e2',
              color: '#991b1b',
              marginBottom: '12px',
            }}
          >
            Access Denied · Invalid Machine Parameter
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-main, #0f172a)',
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}
        >
          Station Parameter Not Recognized
        </h1>

        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'var(--text-muted, #64748b)',
            margin: '0 0 24px',
          }}
        >
          {reason === 'INVALID_FORMAT'
            ? 'PrintBooth stations require strict canonical identifiers formatted as PB-XXX. Direct access with lowercase, malformed, or fake machine parameters is blocked to protect printer hardware queues and billing integrity.'
            : `The station "${attemptedId}" is not a registered PrintBooth kiosk in the active network. Document routing and print release are restricted to verified hardware.`}
        </p>

        {/* Attempted Parameter Inspector */}
        <div
          style={{
            background: 'var(--bg-secondary, #f8fafc)',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: '#94a3b8' }}>
              Attempted Parameter
            </div>
            <code
              style={{
                fontFamily: 'monospace',
                fontSize: '15px',
                fontWeight: 700,
                color: '#dc2626',
              }}
            >
              ?id={attemptedId}
            </code>
          </div>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#fef2f2',
              color: '#b91c1c',
            }}
          >
            Unverified
          </span>
        </div>

        {/* Quick Correction Card if Typo was Detected (e.g. p-002 -> PB-002) */}
        {suggestion && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(238, 242, 255, 0.8), rgba(240, 253, 250, 0.8))',
              border: '1px solid #c7d2fe',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle size={22} weight="fill" color="#4f46e5" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e1b4b', marginBottom: '2px' }}>
                  Did you mean station {suggestion}?
                </div>
                <div style={{ fontSize: '12px', color: '#4338ca', marginBottom: '10px' }}>
                  {suggestedMeta ? suggestedMeta.name : 'Verified PrintBooth Station'}
                  {suggestedMeta?.location && ` · ${suggestedMeta.location}`}
                </div>
                <button
                  type="button"
                  onClick={() => onResolveSuggestion?.(suggestion)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                  }}
                >
                  Connect to {suggestion}
                  <ArrowRight size={14} weight="bold" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <ShinyButton
            onClick={onOpenKioskSelector}
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <MagnifyingGlass size={16} weight="bold" />
            Select a Verified Station
          </ShinyButton>

          <button
            type="button"
            onClick={onGoHome}
            style={{
              width: '100%',
              padding: '12px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--text-muted, #64748b)',
              border: '1px solid #cbd5e1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <ArrowLeft size={14} weight="bold" />
            Return to Homepage
          </button>
        </div>
      </div>
    </div>
  )
}
