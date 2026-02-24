import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Gamepad2, ChevronDown } from 'lucide-react'
import type { NavigateFunction } from 'react-router-dom'

type MenuItem = {
  id: 'chess' | 'my-games' | 'coming-soon'
  label: string
  description?: string
  disabled?: boolean
  onSelect?: () => void
}

function GamesMenuItem({ item, onClose }: { item: MenuItem; onClose: () => void }): React.JSX.Element {
  if (item.disabled) {
    return (
      <div
        role="menuitem"
        aria-disabled="true"
        className="w-full cursor-not-allowed rounded-md px-3 py-2 text-left opacity-65"
      >
        <div className="text-sm font-medium text-slate-500">{item.label}</div>
        {item.description ? <div className="mt-0.5 text-xs text-slate-400">{item.description}</div> : null}
      </div>
    )
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        item.onSelect?.()
        onClose()
      }}
      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <div>{item.label}</div>
      {item.description ? <div className="mt-0.5 text-xs text-slate-500">{item.description}</div> : null}
    </button>
  )
}

export default function GamesMenu({
  navigate,
  closePicker,
  isGamesPage,
}: {
  navigate: NavigateFunction
  closePicker: (reason: string) => void
  isGamesPage: boolean
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const items = useMemo<MenuItem[]>(() => [
    {
      id: 'chess',
      label: 'Chess',
      description: 'Open Chess app shell',
      onSelect: () => {
        closePicker('nav-games-chess')
        navigate('/chess')
      },
    },
    {
      id: 'my-games',
      label: 'My Games',
      description: 'Open your games dashboard',
      onSelect: () => {
        closePicker('nav-games-index')
        navigate('/games')
      },
    },
    {
      id: 'coming-soon',
      label: 'More games coming soon',
      description: 'New game modes are in progress.',
      disabled: true,
    },
  ], [closePicker, navigate])

  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    window.setTimeout(() => {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not([disabled])')
        ?.focus()
    }, 0)
  }, [isOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="nav-games"
        aria-label="Games"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          closePicker('nav-games')
          setIsOpen((prev) => !prev)
        }}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') && !isOpen) {
            event.preventDefault()
            setIsOpen(true)
          }
        }}
        className={`
          flex items-center justify-center gap-1.5
          min-w-[44px] min-h-[44px] px-2 sm:px-3
          rounded-lg text-xs sm:text-sm font-medium border
          transition-all duration-150 touch-manipulation
          ${isGamesPage
            ? 'bg-white text-indigo-700 border-indigo-500'
            : 'bg-white text-slate-600 border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50/40 active:bg-indigo-50'
          }
        `}
      >
        <Gamepad2 size={16} className={`flex-shrink-0 ${isGamesPage ? 'text-indigo-700' : 'text-indigo-600'}`} />
        <span className="inline">Games</span>
        <ChevronDown size={14} className={`inline transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Games menu"
          className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <GamesMenuItem key={item.id} item={item} onClose={() => setIsOpen(false)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}