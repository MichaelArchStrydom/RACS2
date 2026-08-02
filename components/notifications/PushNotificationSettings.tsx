'use client'

import { useEffect, useState } from 'react'
import { subscribeToPush, unsubscribeFromPush, updateNotificationPreferences, sendTestPushToSelf } from '@/app/actions/pushActions'
import { Bell, BellOff, Check, Loader2 } from 'lucide-react'

interface PushNotificationSettingsProps {
  vapidPublicKey: string | null
  initialPreferences: {
    notifyNewCoverRequest: boolean
    notifyAnnouncement: boolean
    notifyStaleCoverReminder: boolean
    notifyMyRequestUpdates: boolean
  }
}

type SupportState = 'checking' | 'unsupported' | 'ios-needs-install' | 'ready'
type SubState = 'off' | 'on' | 'busy'

// Web Push's applicationServerKey needs the VAPID public key as a raw
// Uint8Array, not the base64url string the server outputs 
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const PREFERENCE_LABELS: Record<keyof PushNotificationSettingsProps['initialPreferences'], string> = {
  notifyNewCoverRequest: 'A new cover request is posted',
  notifyAnnouncement: 'A new announcement is posted',
  notifyStaleCoverReminder: 'A cover request has been open a few days and its shift is coming up',
  notifyMyRequestUpdates: 'Updates on your own posted requests (picked up, or still uncovered as the shift nears)',
}

export default function PushNotificationSettings({ vapidPublicKey, initialPreferences }: PushNotificationSettingsProps) {
  const [support, setSupport] = useState<SupportState>('checking')
  const [subState, setSubState] = useState<SubState>('off')
  const [preferences, setPreferences] = useState(initialPreferences)
  const [error, setError] = useState<string | null>(null)
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) {
      setSupport('unsupported')
      return
    }
    if (isIOS && !isStandalone) {
      setSupport('ios-needs-install')
      return
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        setSubState(existing ? 'on' : 'off')
        setSupport('ready')
      })
      .catch(() => setSupport('unsupported'))
  }, [vapidPublicKey])

  const handleEnable = async () => {
    setError(null)
    setSubState('busy')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError(permission === 'denied'
          ? 'Notifications are blocked for this site — check your browser/phone settings to allow them.'
          : 'Notification permission was not granted.')
        setSubState('off')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) as BufferSource,
      })

      await subscribeToPush(subscription.toJSON() as any, navigator.userAgent)
      const allOn = {
        notifyNewCoverRequest: true,
        notifyAnnouncement: true,
        notifyStaleCoverReminder: true,
        notifyMyRequestUpdates: true,
      }
      await updateNotificationPreferences(allOn)
      setPreferences(allOn)

      setSubState('on')
    } catch (err) {
      console.error(err)
      setError('Something went wrong enabling notifications — please try again.')
      setSubState('off')
    }
  }

  const handleDisable = async () => {
    setError(null)
    setSubState('busy')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setSubState('off')
    } catch (err) {
      console.error(err)
      setError('Something went wrong disabling notifications — please try again.')
      setSubState('on')
    }
  }

  const togglePreference = async (key: keyof typeof preferences) => {
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    try {
      await updateNotificationPreferences(next)
    } catch {
      setPreferences(preferences) // revert on failure
      setError('Could not save that preference — please try again.')
    }
  }

  const handleTestPush = async () => {
    setTestSent(false)
    setError(null)
    try {
      await sendTestPushToSelf()
      setTestSent(true)
    } catch {
      setError('Could not send a test notification — please try again.')
    }
  }

  if (support === 'checking') return null

  if (support === 'unsupported') {
    return (
      <p className="text-xs text-slate-400 italic">
        Push notifications aren't available on this browser/device.
      </p>
    )
  }

  if (support === 'ios-needs-install') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
        <p className="font-semibold">To get notifications on iPhone/iPad:</p>
        <p>1. Tap the Share icon in Safari.</p>
        <p>2. Choose "Add to Home Screen".</p>
        <p>3. Open RACS2 from that new home screen icon, then come back to this page.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

      {subState === 'off' && (
        <button
          type="button"
          onClick={handleEnable}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Bell className="w-4 h-4" /> Enable Notifications
        </button>
      )}

      {subState === 'busy' && (
        <button type="button" disabled className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-200 text-slate-400 text-sm font-semibold rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" /> Working…
        </button>
      )}

      {subState === 'on' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
              <Check className="w-3.5 h-3.5" /> Notifications are on
            </span>
            <button
              type="button"
              onClick={handleDisable}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              <BellOff className="w-3.5 h-3.5" /> Turn off
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Notify me about</p>
            {(Object.keys(PREFERENCE_LABELS) as Array<keyof typeof preferences>).map((key) => (
              <label key={key} className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={() => togglePreference(key)}
                  className="mt-0.5 rounded text-rose-500 focus:ring-rose-500"
                />
                {PREFERENCE_LABELS[key]}
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestPush}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline"
            >
              Send a test notification to this device
            </button>
            {testSent && <span className="text-[11px] text-green-600 font-semibold">Sent — check your notifications.</span>}
          </div>
        </div>
      )}
    </div>
  )
}
