import { useEffect, useMemo, useRef, useState } from 'react'
import { getReservableKits, reserveKits, toReserveError } from '../api'
import type { Kit, ReserveError } from '../api'
import {
  button,
  buttonPrimary,
  input,
  modalPanel,
  muted,
  noteError,
  noteOk,
  noteWarn,
  overlay,
  textarea as textareaClass,
} from '../ui'

interface ReserveModalProps {
  orderId: string
  lineId: string
  quantity: number
  reservedCount: number
  version: number
  onClose: () => void
  /** Asks the detail page to refetch the order, so version and counts update. */
  onRefresh: () => void
}

type Mode = 'first' | 'last' | 'manual'

type Feedback =
  | { kind: 'success'; count: number }
  | { kind: 'error'; error: ReserveError }

const MODES: ReadonlyArray<readonly [Mode, string]> = [
  ['first', 'First N'],
  ['last', 'Last N'],
  ['manual', 'Manual'],
]

/** Accepts one-per-line or comma-separated input; dedupes, keeping order. */
export function parseSerials(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of text.split(/[\n,]/)) {
    const serial = raw.trim()
    if (serial && !seen.has(serial)) {
      seen.add(serial)
      out.push(serial)
    }
  }

  return out
}

export default function ReserveModal({
  orderId,
  lineId,
  quantity,
  reservedCount,
  version,
  onClose,
  onRefresh,
}: ReserveModalProps) {
  const [kits, setKits] = useState<Kit[]>([])
  const [loadingKits, setLoadingKits] = useState(true)
  const [kitsError, setKitsError] = useState(false)
  const [reloadKitsKey, setReloadKitsKey] = useState(0)

  const [mode, setMode] = useState<Mode>('first')
  const [countText, setCountText] = useState('1')
  const [manualText, setManualText] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const remaining = quantity - reservedCount

  // Reservable kits for the order's warehouse, already sorted by serial.
  useEffect(() => {
    let ignore = false

    setLoadingKits(true)
    setKitsError(false)

    getReservableKits(orderId)
      .then((data) => {
        if (!ignore) setKits(data.kits)
      })
      .catch(() => {
        if (!ignore) setKitsError(true)
      })
      .finally(() => {
        if (!ignore) setLoadingKits(false)
      })

    return () => {
      ignore = true
    }
  }, [orderId, reloadKitsKey])

  // Escape closes, except mid-submit.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const requestedCount = /^\d+$/.test(countText) ? Number(countText) : 0

  const serials = useMemo(() => {
    if (mode === 'manual') return parseSerials(manualText)

    const available = kits.map((kit) => kit.serial)
    // Slicing past the end just yields everything available.
    return mode === 'first'
      ? available.slice(0, requestedCount)
      : available.slice(Math.max(0, available.length - requestedCount))
  }, [mode, manualText, kits, requestedCount])

  const overRemaining = serials.length > remaining
  const canSubmit = !submitting && !loadingKits && serials.length > 0

  async function submit() {
    setSubmitting(true)
    setFeedback(null)

    try {
      const data = await reserveKits(orderId, lineId, { serials, version })
      setFeedback({ kind: 'success', count: data.reservations.length })
      onRefresh()
      closeTimer.current = setTimeout(onClose, 1200)
    } catch (err) {
      const error = toReserveError(err)
      setFeedback({ kind: 'error', error })

      // Someone else moved the order on, so pull in the new version and the
      // new availability rather than leaving the form on stale data.
      if (error.kind === 'ORDER_CHANGED') {
        onRefresh()
        setReloadKitsKey((key) => key + 1)
      }

      // The kit is gone for everyone, so the available list is stale too.
      if (error.kind === 'KIT_TAKEN') {
        setReloadKitsKey((key) => key + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={overlay} role="dialog" aria-modal="true" aria-label="Reserve kits">
      <div className={modalPanel}>
        <h2 className="text-lg font-semibold text-gray-900">Reserve kits</h2>

        <p className={`mt-1 ${muted}`}>
          {reservedCount} of {quantity} reserved &middot; {remaining} still needed
          {!loadingKits && !kitsError ? ` · ${kits.length} kits available` : ''}
        </p>

        {loadingKits && <p className={`mt-4 ${muted}`}>Loading available kits…</p>}
        {kitsError && <p className={`mt-4 ${noteError}`}>Failed to load available kits</p>}

        {!loadingKits && !kitsError && (
          <>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-gray-700">Selection</legend>
              <div className="mt-2 flex flex-col gap-2">
                {MODES.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="reserve-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {mode !== 'manual' && (
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                N
                <input
                  className={`${input} w-24`}
                  type="number"
                  min={0}
                  value={countText}
                  onChange={(event) => setCountText(event.target.value)}
                />
              </label>
            )}

            {mode === 'manual' && (
              <div className="mt-3">
                <label className="text-sm text-gray-700" htmlFor="reserve-serials">
                  Serials (one per line or comma-separated)
                </label>
                <textarea
                  id="reserve-serials"
                  className={`${textareaClass} mt-1`}
                  rows={5}
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                />
              </div>
            )}

            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700">Selected ({serials.length})</p>
              {serials.length === 0 ? (
                <p className={`mt-1 ${muted}`}>Nothing selected yet</p>
              ) : (
                <p className="mt-1 max-h-24 overflow-y-auto rounded-md bg-gray-50 p-2 font-mono text-xs break-words text-gray-700">
                  {serials.join(', ')}
                </p>
              )}
            </div>

            {overRemaining && (
              <p className={`mt-3 ${noteWarn}`}>
                {serials.length} selected, but only {remaining} still needed on this line.
              </p>
            )}
          </>
        )}

        {feedback?.kind === 'success' && (
          <p className={`mt-4 ${noteOk}`}>
            Reserved {feedback.count} kit{feedback.count === 1 ? '' : 's'}. Closing…
          </p>
        )}

        {feedback?.kind === 'error' && <ErrorNote error={feedback.error} />}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={button} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={buttonPrimary} onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Reserving…' : 'Reserve'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorNote({ error }: { error: ReserveError }) {
  switch (error.kind) {
    case 'KITS_UNAVAILABLE':
      return (
        <div className={`mt-4 ${noteError}`}>
          <p className="font-medium">These kits are not reservable, so nothing was reserved:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {error.failures.map((failure) => (
              <li key={failure.serial}>
                <span className="font-mono">{failure.serial}</span> — {failure.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2">Adjust your selection and try again.</p>
        </div>
      )

    case 'ORDER_CHANGED':
      return (
        <p className={`mt-4 ${noteWarn}`}>This order was changed by someone else. Reloading…</p>
      )

    case 'KIT_TAKEN':
      return (
        <p className={`mt-4 ${noteWarn}`}>A kit was just taken by someone else, please try again.</p>
      )

    case 'QUANTITY_EXCEEDED':
    case 'NOT_FOUND':
    case 'BAD_REQUEST':
      return <p className={`mt-4 ${noteError}`}>{error.message}</p>

    default:
      return <p className={`mt-4 ${noteError}`}>{error.message}</p>
  }
}
