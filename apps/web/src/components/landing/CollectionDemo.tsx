import AnimatedHeading from './AnimatedHeading'
import RevealText from './RevealText'

export default function CollectionDemo() {
  return (
    <section className="landing-collection" aria-label="Collection">
      <div className="landing-container">
        <div className="collection-content">
          <AnimatedHeading
            text="Ready when you are."
            tag="h2"
            className="collection-heading-wrap"
            duration={900}
          />

          <RevealText delay={300}>
            <p className="collection-subtext">
              Collect your prints from the tray.
            </p>
          </RevealText>

          <RevealText delay={500}>
            <div className="collection-visual">
              <div className="paper-stack">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="paper-sheet"
                    style={{
                      transform: `translateY(${-i * 3}px) rotate(${(i - 2) * 0.5}deg)`,
                    }}
                  />
                ))}
              </div>
            </div>
          </RevealText>
        </div>
      </div>
    </section>
  )
}
