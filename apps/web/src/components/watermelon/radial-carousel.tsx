'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  motion,
  AnimatePresence,
  type Variants,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { X, Orbit } from 'lucide-react';
import './radial-carousel.css';

export interface GalleryItem {
  id: string | number;
  url: string;
  title?: string;
  pageNumber?: number;
  subtitle?: string;
}

export interface RadialCarouselProps {
  items: GalleryItem[];
  radius?: number;
  thumbnailSize?: number;
  centerSize?: number;
  onSelect?: (item: GalleryItem, index: number) => void;
  className?: string;
}

export const RadialCarousel: React.FC<RadialCarouselProps> = ({
  items,
  radius = 240,
  thumbnailSize = 100,
  centerSize = 340,
  onSelect,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const [isPanning, setIsPanning] = useState(false);
  const [responsiveSizes, setResponsiveSizes] = useState({
    radius,
    thumbnailSize,
    centerSize,
  });

  useEffect(() => {
    const updateSizes = () => {
      const width = window.innerWidth;

      if (width < 420) {
        setResponsiveSizes({
          radius: Math.min(radius, 130),
          thumbnailSize: Math.min(thumbnailSize, 65),
          centerSize: Math.min(centerSize, 250),
        });
      } else if (width < 640) {
        setResponsiveSizes({
          radius: Math.min(radius, 160),
          thumbnailSize: Math.min(thumbnailSize, 75),
          centerSize: Math.min(centerSize, 280),
        });
      } else if (width < 1024) {
        setResponsiveSizes({
          radius: Math.min(radius, 200),
          thumbnailSize: Math.min(thumbnailSize, 90),
          centerSize: Math.min(centerSize, 320),
        });
      } else {
        setResponsiveSizes({ radius, thumbnailSize, centerSize });
      }
    };

    updateSizes();
    window.addEventListener('resize', updateSizes);
    return () => window.removeEventListener('resize', updateSizes);
  }, [radius, thumbnailSize, centerSize]);

  const rotation = useMotionValue(0);

  const smoothRotation = useSpring(rotation, {
    bounce: 0.15,
    duration: 0.1,
  });

  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleItemClick = (index: number) => {
    setActiveIndex(index);
    setIsExpanded(false);
    onSelect?.(items[index], index);
  };

  const containerVariants: Variants = {
    collapsed: { transition: { staggerChildren: 0.01, staggerDirection: -1 } },
    expanded: { transition: { staggerChildren: 0.03, delayChildren: 0.1 } },
  };

  const activeItem = items[activeIndex] || items[0];

  return (
    <div className={`radial-carousel-root ${className}`}>
      <AnimatePresence mode="popLayout">
        {!isExpanded ? (
          <motion.div
            key="center-view"
            layout
            transition={{ type: 'spring', bounce: 0.15, duration: 0.2 }}
            className="radial-center-container"
          >
            <motion.div
              layoutId={`card-${activeItem.id}`}
              style={{
                width: responsiveSizes.centerSize,
                height: responsiveSizes.centerSize * 1.25,
              }}
              className="radial-center-card"
            >
              <div className="radial-card-content">
                <motion.img
                  layoutId={`img-${activeItem.id}`}
                  src={activeItem.url}
                  alt={activeItem.title || 'Page Preview'}
                  className="radial-center-img"
                  draggable={false}
                />

                {/* Page Badge */}
                <div className="radial-page-badge">
                  <span>{activeItem.title || `Page ${activeIndex + 1}`}</span>
                </div>

                {/* Orbit / Expand Toggle */}
                <button
                  type="button"
                  onClick={toggleExpand}
                  aria-label="View all pages in radial circle"
                  className="radial-expand-btn"
                  title="Expand radial carousel"
                >
                  <Orbit size={18} className="radial-expand-icon" />
                  <span className="radial-expand-label">All Pages</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="radial-view"
            variants={containerVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            className={`radial-orbit-area ${isPanning ? 'is-panning' : ''}`}
            onPanStart={() => setIsPanning(true)}
            onPanEnd={() => setIsPanning(false)}
            onPan={(_, info) => {
              rotation.set(rotation.get() + info.delta.x * 0.5);
            }}
          >
            {/* Center Close/Collapse Button */}
            <motion.button
              type="button"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={toggleExpand}
              className="radial-close-center-btn"
              title="Close orbit view"
            >
              <X size={20} />
            </motion.button>

            {items.map((item, index) => {
              const baseAngle =
                (index / items.length) * (2 * Math.PI) - Math.PI / 2;
              return (
                <RadialItem
                  key={item.id}
                  item={item}
                  index={index}
                  isActive={index === activeIndex}
                  baseAngle={baseAngle}
                  radius={responsiveSizes.radius}
                  thumbnailSize={responsiveSizes.thumbnailSize}
                  rotation={smoothRotation}
                  onClick={() => handleItemClick(index)}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface RadialItemProps {
  item: GalleryItem;
  index: number;
  isActive: boolean;
  baseAngle: number;
  radius: number;
  thumbnailSize: number;
  rotation: any;
  onClick: () => void;
}

const RadialItem: React.FC<RadialItemProps> = ({
  item,
  index,
  isActive,
  baseAngle,
  radius,
  thumbnailSize,
  rotation,
  onClick,
}) => {
  const x = useTransform(rotation, (r: number) => {
    const currentAngle = baseAngle + (r * Math.PI) / 180;
    return Math.cos(currentAngle) * radius;
  });

  const y = useTransform(rotation, (r: number) => {
    const currentAngle = baseAngle + (r * Math.PI) / 180;
    return Math.sin(currentAngle) * radius;
  });

  const rotate = useTransform(rotation, (r: number) => {
    const currentAngle = baseAngle + (r * Math.PI) / 180;
    return (currentAngle * 180) / Math.PI + 90;
  });

  const itemVariants: Variants = {
    collapsed: {
      opacity: 0,
      scale: 0.8,
      transition: { type: 'spring', bounce: 0.4, duration: 0.5 },
    },
    expanded: {
      scale: 1,
      opacity: 1,
      transition: { type: 'spring', bounce: 0.4, duration: 0.5 },
    },
  };

  return (
    <motion.div
      variants={itemVariants}
      style={{ 
        x, 
        y, 
        rotate,
        left: `calc(50% - ${thumbnailSize / 2}px)`,
        top: `calc(50% - ${(thumbnailSize * 1.3) / 2}px)`,
      }}
      onClick={onClick}
      className="radial-item-wrap"
    >
      <motion.div
        layoutId={`card-${item.id}`}
        style={{
          width: thumbnailSize,
          height: thumbnailSize * 1.3,
        }}
        className={`radial-thumb-card ${isActive ? 'is-active-thumb' : ''}`}
      >
        <motion.img
          layoutId={`img-${item.id}`}
          src={item.url}
          alt={item.title || `Page ${index + 1}`}
          className="radial-thumb-img"
          draggable={false}
        />
        <div className="radial-thumb-badge">
          <span>{index + 1}</span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RadialCarousel;
