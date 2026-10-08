import type { TransitionEffect } from './SectionTransition'
import './TransitionControls.css'

interface TransitionControlsProps {
  activeEffect: TransitionEffect
  onSelectEffect: (effect: TransitionEffect) => void
  animations?: TransitionEffect[]
}

const DEFAULT_ANIMATIONS: TransitionEffect[] = ['slideUp', 'fade', 'zoom', 'flipX', 'flipY']

export default function TransitionControls({
  activeEffect,
  onSelectEffect,
  animations = DEFAULT_ANIMATIONS,
}: TransitionControlsProps) {
  return (
    <nav className="transition-controls-wrapper" aria-label="Section Transition Effects">
      <ul className="controls transition-controls-list" role="tablist">
        {animations.map((anim) => {
          const isActive = anim === activeEffect
          return (
            <li
              key={anim}
              role="tab"
              aria-selected={isActive}
              className={`transition-controls-item ${isActive ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault()
                onSelectEffect(anim)
              }}
            >
              <span className="transition-controls-text">{anim}</span>
              {isActive && <span className="transition-controls-glow" aria-hidden="true" />}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
