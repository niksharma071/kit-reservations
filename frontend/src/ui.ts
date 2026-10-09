import type { OrderStatus } from './api'

// Shared Tailwind class strings so the detail page and the reserve popup can
// reuse the same card / button / badge look without re-deriving it.

export const page = 'max-w-3xl mx-auto p-6'
export const heading = 'text-2xl font-semibold text-gray-900'

/** A plain card. Use this when the card is not clickable. */
export const cardStatic = 'block bg-white border border-gray-200 rounded-lg p-4 shadow-sm'

/** The same card with a hover lift, for cards that are links or buttons. */
export const card = `${cardStatic} transition hover:shadow-md hover:border-gray-300`

export const button =
  'inline-flex items-center rounded-md border border-gray-300 bg-white ' +
  'px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition ' +
  'hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

export const buttonPrimary =
  'inline-flex items-center rounded-md border border-transparent bg-gray-900 ' +
  'px-3 py-1.5 text-sm font-medium text-white shadow-sm transition ' +
  'hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50'

export const select =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm ' +
  'text-gray-700 shadow-sm'

export const muted = 'text-sm text-gray-500'

const BADGE_BASE = 'inline-block rounded-full px-2 py-0.5 text-xs font-medium'

const BADGE_TONE: Record<OrderStatus, string> = {
  confirmed: 'bg-green-100 text-green-800',
  draft: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
}

export function badge(status: OrderStatus): string {
  return `${BADGE_BASE} ${BADGE_TONE[status] ?? BADGE_TONE.draft}`
}

/* ---------- modal + form controls ---------- */

export const overlay =
  'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center'

export const modalPanel =
  'w-full max-w-lg rounded-lg bg-white p-5 shadow-xl'

export const input =
  'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 ' +
  'shadow-sm focus:border-gray-400 focus:outline-none'

export const textarea =
  'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs ' +
  'text-gray-900 shadow-sm focus:border-gray-400 focus:outline-none'

/** Tinted blocks for inline feedback. */
export const noteError = 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'
export const noteWarn = 'rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900'
export const noteOk = 'rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800'

/* ---------- section titles + tables ---------- */

export const sectionTitle = 'mb-2 text-sm font-semibold text-gray-700'

export const table = 'w-full text-sm'
export const thead = 'border-b border-gray-200'
export const th = 'pb-2 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase'
/** Borders sit between rows only, so the last row has no trailing rule. */
export const tbody = 'divide-y divide-gray-100'
export const td = 'py-2 text-gray-900'
/** Right-aligned variants for numeric columns. */
export const thNum = `${th} text-right`
export const tdNum = `${td} text-right tabular-nums`
