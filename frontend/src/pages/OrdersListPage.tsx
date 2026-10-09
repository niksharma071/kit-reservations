import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrders } from '../api'
import type { OrderStatus, OrderSummary } from '../api'
import { badge, button, card, heading, muted, select } from '../ui'

const PAGE_SIZE = 10
const STATUS_OPTIONS: OrderStatus[] = ['draft', 'confirmed', 'cancelled']

/** '' means no status filter (All). */
type StatusFilter = OrderStatus | ''

export default function OrdersListPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<StatusFilter>('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  // Runs on mount and whenever the filter changes: always refetches the first
  // page and replaces the list, so the offset restarts at 0.
  useEffect(() => {
    let ignore = false

    setLoading(true)
    setError(false)

    listOrders({ status: status || undefined, limit: PAGE_SIZE, offset: 0 })
      .then((data) => {
        if (ignore) return
        setOrders(data.orders)
        setTotal(data.total)
      })
      .catch(() => {
        if (!ignore) setError(true)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    // Drops a response that arrives after the filter changed again.
    return () => {
      ignore = true
    }
  }, [status])

  // Appends the next page; the offset is just how many rows are already loaded.
  async function loadMore() {
    setLoadingMore(true)
    setError(false)
    try {
      const data = await listOrders({
        status: status || undefined,
        limit: PAGE_SIZE,
        offset: orders.length,
      })
      setOrders((prev) => [...prev, ...data.orders])
      setTotal(data.total)
    } catch {
      setError(true)
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = orders.length < total

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className={heading}>Orders</h1>

        <div className="flex items-center gap-4">
          <Link to="/reports" className="text-sm text-gray-600 hover:underline">
            Reports
          </Link>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            Status
            <select
              className={select}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading && <p className={muted}>Loading…</p>}
      {error && <p className="text-sm text-red-600">Failed to load orders</p>}

      {!loading && !error && orders.length === 0 && <p className={muted}>No orders</p>}

      {!loading && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className={card}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-gray-900">{order.reference}</span>
                <span className={badge(order.status)}>{order.status}</span>
              </div>
              <div className={`mt-1 ${muted}`}>
                {new Date(order.created_at).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && orders.length > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className={muted}>
            Showing {orders.length} of {total}
          </span>

          {!error && hasMore && (
            <button type="button" className={button} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
