'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const POLL_INTERVAL_MS = 15_000

/**
 * Keeps this page's server-rendered data in sync with other users' actions.
 * Polls on an interval, plus refreshes immediately whenever the tab becomes
 * visible again — covers the common "switched away, came back" case without
 * waiting for the next poll tick. Renders nothing.
 */
export default function LiveRefresher() {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  return null
}
