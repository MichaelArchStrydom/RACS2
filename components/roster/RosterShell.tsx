'use client'

/**
 * RosterShell — client wrapper that owns:
 *  1. Date navigation (pushes URL without scroll reset, no full reload)
 *  2. Live polling (refreshes RSC data every 30s in background)
 *  3. Scroll-position preservation across refreshes
 *
 * The heavy RSC data-fetching stays in page.tsx (server component).
 * This shell receives the rendered grid + board as children so it
 * never needs to know about the data shape.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface RosterShellProps {
  children: React.ReactNode
  prevLink: string
  nextLink: string
  daysToShow: number
  dateRangeLabel: string
}

const POLL_INTERVAL_MS = 30_000 // 30 seconds

export default function RosterShell({
  children,
  prevLink,
  nextLink,
  daysToShow,
  dateRangeLabel,
}: RosterShellProps) {
  const router = useRouter()
  const savedScrollY = useRef(0)
  const isNavigating = useRef(false)

  // ── Scroll preservation ──────────────────────────────────────────────────
  // Save scroll before any refresh/navigation, restore after
  const saveScroll = useCallback(() => {
    savedScrollY.current = window.scrollY
  }, [])

  const restoreScroll = useCallback(() => {
    if (savedScrollY.current > 0) {
      // Use requestAnimationFrame to wait for paint before restoring
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY.current, behavior: 'instant' })
      })
    }
  }, [])

  // ── Background polling ───────────────────────────────────────────────────
  useEffect(() => {
    const poll = () => {
      // Don't poll while user is mid-navigation or page is hidden
      if (document.hidden || isNavigating.current) return
      saveScroll()
      router.refresh()
      // Restore after a short delay to let RSC stream in
      setTimeout(restoreScroll, 300)
    }

    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router, saveScroll, restoreScroll])

  // ── Restore scroll after router.refresh() from child components ──────────
  // Children call router.refresh() directly; we watch for the resulting
  // re-render via a MutationObserver on the roster container.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new MutationObserver(() => {
      if (!isNavigating.current) restoreScroll()
    })
    obs.observe(el, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [restoreScroll])

  // ── Date navigation: push without scroll reset ───────────────────────────
  const navigate = useCallback((href: string) => {
    saveScroll()
    isNavigating.current = true
    router.push(href, { scroll: false })
    // Allow restoration after navigation settles
    setTimeout(() => { isNavigating.current = false }, 800)
  }, [router, saveScroll])

  return (
    <div ref={containerRef}>
      {/* Date nav bar — rendered here so we can intercept clicks */}
      <div className="flex items-center justify-between px-1 mb-2">
        <button
          type="button"
          onClick={() => navigate(prevLink)}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
        >
          ← {daysToShow} Days
        </button>
        <span className="text-xs text-slate-400 font-mono font-medium px-2 text-center">
          {dateRangeLabel}
        </span>
        <button
          type="button"
          onClick={() => navigate(nextLink)}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded-lg text-xs font-semibold text-slate-700 transition-colors"
        >
          {daysToShow} Days →
        </button>
      </div>

      {children}
    </div>
  )
}

