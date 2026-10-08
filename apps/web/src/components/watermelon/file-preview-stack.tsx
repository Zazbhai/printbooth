import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { DocumentPagePreview } from '../../lib/documentPreview';

interface FilePreviewStackProps {
  pages: DocumentPagePreview[];
  className?: string;
}

export function FilePreviewStack({ pages, className = '' }: FilePreviewStackProps) {
  const [orderOffset, setOrderOffset] = useState(0);

  const handleNext = () => {
    setOrderOffset((prev) => (prev + 1) % pages.length);
  };
  
  // Calculate dynamic offsets so large documents don't overflow the container
  // Max total spread is 120px (matches the original 5 pages * 30px spread)
  const offsetStep = pages.length > 1 ? Math.min(30, 120 / (pages.length - 1)) : 0;
  
  const maxXOffset = (pages.length - 1) * offsetStep;
  const maxYOffset = (pages.length - 1) * -offsetStep;
  
  return (
    <div 
      className={className} 
      style={{ 
        position: 'relative', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: '100%', 
        height: '100%', 
        perspective: 1200,
        cursor: 'pointer'
      }}
      onClick={handleNext}
      title="Click to flip pages"
    >
      {/* We shift the container slightly to the left/bottom to balance the top/right offset */}
      <div 
        style={{ 
          position: 'relative', 
          width: '190px', 
          height: '260px', 
          transform: `translate(${-maxXOffset / 2}px, ${-maxYOffset / 2}px)` 
        }}
      >
        <AnimatePresence mode="popLayout">
          {pages.map((page, originalIndex) => {
            // Calculate effective index based on current orderOffset
            const effectiveIndex = (originalIndex - orderOffset + pages.length) % pages.length;
            
            // Z-index: first item should be highest
            const zIndex = pages.length - effectiveIndex;
            
            // X and Y offsets: shift right and up as index increases
            const xOffset = effectiveIndex * offsetStep;
            const yOffset = -effectiveIndex * offsetStep;
            
            // Scale: shrink as they go back
            const scale = 1 - (effectiveIndex * 0.05);
            
            // Opacity: slightly fade out as they go back
            const opacity = 1 - (effectiveIndex * 0.08);

            return (
              <motion.div
                key={page.id}
                layout
                initial={{ opacity: 0, x: xOffset - 60, y: yOffset + 60, scale: scale * 0.8 }}
                animate={{ opacity, x: xOffset, y: yOffset, scale }}
                exit={{ opacity: 0, x: -60, y: 60, scale: 0.8 }}
                transition={{ 
                  type: 'spring', 
                  damping: 20, 
                  stiffness: 120, 
                }}
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  zIndex,
                  width: '100%',
                  height: '100%',
                  transformOrigin: 'bottom left',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  backgroundColor: '#ffffff',
                  boxShadow: effectiveIndex === 0 ? '0 20px 40px -10px rgba(0,0,0,0.35)' : '0 10px 20px -5px rgba(0,0,0,0.15)'
                }}
              >
                <img 
                  src={page.url} 
                  alt={page.title} 
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', backgroundColor: '#ffffff' }}
                  draggable={false}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  right: '8px',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  backdropFilter: 'blur(6px)',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.5px',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  {page.pageNumber} / {pages.length}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
