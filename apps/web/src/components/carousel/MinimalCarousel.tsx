import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Copy, Check, DotsThree } from '@phosphor-icons/react'
import './MinimalCarousel.css'

export interface CarouselCard {
  id: string
  title: string
  value: string
  color: string
  icon: React.ComponentType<any>
  badge?: string
  description?: string
}

export interface MinimalCarouselProps {
  cards: CarouselCard[]
  activeIndex?: number
  onCardChange?: (index: number, card: CarouselCard) => void
  onCopyClick?: (card: CarouselCard) => void
  onCustomizeClick?: (card: CarouselCard) => void
  children?: React.ReactNode
}

function resolveBgColor(colorStr: string): string {
  if (!colorStr) return '#171717'
  const hexMatch = colorStr.match(/bg-\[(#[a-fA-F0-9]{3,8})\]/)
  if (hexMatch) return hexMatch[1]
  if (colorStr.startsWith('#') || colorStr.startsWith('rgb')) return colorStr
  return colorStr
}

export function MinimalCarousel({
  cards,
  activeIndex: controlledIndex,
  onCardChange,
  onCopyClick,
  onCustomizeClick,
  children,
}: MinimalCarouselProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>(
    cards[cards.length - 1]?.id || cards[0]?.id
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Active card calculation
  const activeCard =
    controlledIndex !== undefined
      ? cards[controlledIndex] || cards[0]
      : cards.find((c) => c.id === internalActiveId) || cards[0]

  // The remaining cards shown in the bottom row
  const secondaryCards = cards.filter((c) => c.id !== activeCard.id)

  const handleCardSelect = (card: CarouselCard) => {
    setInternalActiveId(card.id)
    const idx = cards.findIndex((c) => c.id === card.id)
    if (idx !== -1) {
      onCardChange?.(idx, card)
    }
  }

  const handleCopy = (card: CarouselCard, e: React.MouseEvent) => {
    e.stopPropagation()
    setCopiedId(card.id)
    navigator.clipboard?.writeText?.(`${card.title}: ${card.value}`)
    onCopyClick?.(card)
    setTimeout(() => {
      setCopiedId(null)
    }, 1800)
  }

  const handleEdit = (card: CarouselCard, e: React.MouseEvent) => {
    e.stopPropagation()
    onCustomizeClick?.(card)
  }

  if (!activeCard) return null

  const ActiveIcon = activeCard.icon
  const activeBg = resolveBgColor(activeCard.color)
  const isCopied = copiedId === activeCard.id

  return (
    <div className="exact-carousel-container">
      {/* Top Main Active Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCard.id}
          className="exact-active-card"
          style={{ backgroundColor: activeBg }}
          initial={{ opacity: 0.8, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0.7, scale: 0.96, y: -8 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        >
          {/* Top Bar: Icon and Copy Pill */}
          <div className="active-card-top">
            <div className="active-card-icon">
              {ActiveIcon && <ActiveIcon size={34} />}
            </div>
            <button
              type="button"
              className={`pill-btn copy-pill ${isCopied ? 'copied' : ''}`}
              onClick={(e) => handleCopy(activeCard, e)}
              title="Copy"
            >
              <span>{isCopied ? 'Copied' : 'Copy'}</span>
              {isCopied ? (
                <Check size={16} weight="bold" />
              ) : (
                <Copy size={16} weight="bold" />
              )}
            </button>
          </div>

          {/* Bottom Bar: Title, Value and Edit Pill */}
          <div className="active-card-bottom">
            <div className="active-card-texts">
              <h2 className="active-card-title">{activeCard.title}</h2>
              <div className="active-card-value">{activeCard.value}</div>
            </div>
            <button
              type="button"
              className="pill-btn edit-pill"
              onClick={(e) => handleEdit(activeCard, e)}
              title="Edit / Adjust"
            >
              <span>Edit</span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Bottom Secondary Cards Row */}
      <div className="exact-secondary-row">
        {secondaryCards.map((card) => {
          const CardIcon = card.icon
          const bg = resolveBgColor(card.color)

          return (
            <motion.div
              key={card.id}
              className="exact-secondary-card"
              style={{ backgroundColor: bg }}
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => handleCardSelect(card)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCardSelect(card)
                }
              }}
            >
              {/* Secondary Card Top: Icon & More Options Button */}
              <div className="secondary-card-top">
                <div className="secondary-card-icon">
                  {CardIcon && <CardIcon size={22} />}
                </div>
                <button
                  type="button"
                  className="dots-circle-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCardSelect(card)
                    onCustomizeClick?.(card)
                  }}
                  title="Options"
                >
                  <DotsThree size={20} weight="bold" />
                </button>
              </div>

              {/* Secondary Card Bottom: Title & Value */}
              <div className="secondary-card-bottom">
                <span className="secondary-card-title">{card.title}</span>
                <span className="secondary-card-value">{card.value}</span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {children}
    </div>
  )
}

export default MinimalCarousel
