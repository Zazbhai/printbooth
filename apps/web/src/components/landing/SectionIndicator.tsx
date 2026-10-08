interface SectionIndicatorProps {
  activeIndex: number
  total: number
  onSelect: (index: number) => void
  labels: string[]
}

export default function SectionIndicator({
  activeIndex,
  total,
  onSelect,
  labels,
}: SectionIndicatorProps) {
  return (
    <nav
      className="section-indicator"
      aria-label="Section Navigation"
      role="navigation"
    >
      <div className="section-indicator__track">
        {Array.from({ length: total }, (_, i) => {
          const isActive = i === activeIndex
          const isPassed = i < activeIndex
          const num = String(i + 1).padStart(2, '0')
          const label = labels[i] || `Section ${i + 1}`

          return (
            <button
              key={i}
              className={`section-indicator__item ${isActive ? 'is-active' : ''} ${isPassed ? 'is-passed' : ''}`}
              onClick={() => onSelect(i)}
              aria-label={`Jump to ${label}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="section-indicator__num">{num}</span>
              <span className="section-indicator__bar">
                <span className="section-indicator__bar-fill" />
              </span>
              <span className="section-indicator__label">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
