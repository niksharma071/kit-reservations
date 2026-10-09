import axios, { isAxiosError } from 'axios'

export const api = axios.create({ baseURL: '/api' })

/* ---------- shapes returned by the backend ---------- */

export type OrderStatus = 'draft' | 'confirmed' | 'cancelled'

/** One row of GET /api/orders - order-level fields only, no lines. */
export interface OrderSummary {
  id: string
  reference: string
  status: OrderStatus
  warehouse_id: string
  created_at: string
}

export interface OrderLine {
  id: string
  quantity: number
  reserved_count: number
}

/** GET /api/orders/:orderId - adds version and the order's lines. */
export interface Order extends OrderSummary {
  version: number
  lines: OrderLine[]
}

export interface Kit {
  id: string
  serial: string
  batch_code: string
  /** Date only, already formatted 'YYYY-MM-DD' by the backend. */
  expires_on: string
}

export interface Reservation {
  id: string
  kit_id: string
  serial: string
  status: string
  created_at: string
}

export interface ListOrdersResponse {
  orders: OrderSummary[]
  total: number
  limit: number
  offset: number
}

export interface GetOrderResponse {
  order: Order
}

export interface ReservableKitsResponse {
  kits: Kit[]
}

export interface ReserveKitsResponse {
  reservations: Reservation[]
  version: number
}

export interface ListOrdersParams {
  status?: string
  limit?: number
  offset?: number
}

export interface ReserveKitsBody {
  serials: string[]
  version: number
}

/* ---------- endpoints ---------- */

export async function listOrders(params: ListOrdersParams = {}): Promise<ListOrdersResponse> {
  const { data } = await api.get<ListOrdersResponse>('/orders', { params })
  return data
}

export async function getOrder(orderId: string): Promise<GetOrderResponse> {
  const { data } = await api.get<GetOrderResponse>(`/orders/${orderId}`)
  return data
}

export async function getReservableKits(orderId: string): Promise<ReservableKitsResponse> {
  const { data } = await api.get<ReservableKitsResponse>(`/orders/${orderId}/reservable-kits`)
  return data
}

export async function reserveKits(
  orderId: string,
  lineId: string,
  body: ReserveKitsBody,
): Promise<ReserveKitsResponse> {
  const { data } = await api.post<ReserveKitsResponse>(
    `/orders/${orderId}/lines/${lineId}/reserve`,
    body,
  )
  return data
}

/* ---------- reports ---------- */

/** Confirmed orders whose lines are not fully reserved yet. */
export interface OrderNeedingKits {
  order_id: string
  reference: string
  /** Total line quantity minus active reservations. Always > 0. */
  needed: number
}

export interface ReservationsPerMonth {
  /** 'YYYY-MM', bucketed in Asia/Kolkata by the backend. */
  month: string
  count: number
}

// Both report endpoints answer with a bare JSON array.

export async function getOrdersNeedingKits(): Promise<OrderNeedingKits[]> {
  const { data } = await api.get<OrderNeedingKits[]>('/reports/orders-needing-kits')
  return data
}

export async function getReservationsPerMonth(): Promise<ReservationsPerMonth[]> {
  const { data } = await api.get<ReservationsPerMonth[]>('/reports/reservations-per-month')
  return data
}

/* ---------- reserve error classification ---------- */

export interface KitFailure {
  serial: string
  reason: string
}

/**
 * The reserve endpoint answers with distinct codes in `error`. Axios rejects on
 * 4xx/5xx, so this turns a thrown error back into a typed case. It lives here
 * because this is the only module that knows about axios.
 */
export type ReserveError =
  | { kind: 'ORDER_CHANGED'; message: string }
  | { kind: 'KITS_UNAVAILABLE'; failures: KitFailure[] }
  | { kind: 'QUANTITY_EXCEEDED'; message: string }
  | { kind: 'KIT_TAKEN'; message: string }
  | { kind: 'NOT_FOUND'; message: string }
  | { kind: 'BAD_REQUEST'; message: string }
  | { kind: 'NETWORK'; message: string }
  | { kind: 'UNKNOWN'; message: string }

interface ErrorBody {
  error?: string
  message?: string
  failures?: KitFailure[]
}

export function toReserveError(err: unknown): ReserveError {
  if (!isAxiosError(err) || !err.response) {
    return { kind: 'NETWORK', message: 'Could not reach the server. Please try again.' }
  }

  const { status, data } = err.response
  const body: ErrorBody = typeof data === 'object' && data !== null ? data : {}
  const code = body.error

  switch (code) {
    case 'ORDER_CHANGED':
      return {
        kind: 'ORDER_CHANGED',
        message: body.message ?? 'This order was changed, please reload',
      }
    case 'KITS_UNAVAILABLE':
      return { kind: 'KITS_UNAVAILABLE', failures: body.failures ?? [] }
    case 'QUANTITY_EXCEEDED':
      return {
        kind: 'QUANTITY_EXCEEDED',
        message: body.message ?? 'That exceeds the quantity still needed on this line.',
      }
    case 'KIT_TAKEN':
      return {
        kind: 'KIT_TAKEN',
        message: body.message ?? 'A kit was just taken by someone else.',
      }
  }

  // Not one of the coded cases: `error` is a plain message here.
  if (status === 404) {
    return { kind: 'NOT_FOUND', message: code ?? 'Not found' }
  }
  if (status >= 400 && status < 500) {
    return { kind: 'BAD_REQUEST', message: code ?? 'That request was not valid.' }
  }
  return { kind: 'UNKNOWN', message: 'Something went wrong. Please try again.' }
}
