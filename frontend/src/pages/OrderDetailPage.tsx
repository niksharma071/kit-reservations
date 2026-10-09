import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrder } from '../api'
import type { Order } from '../api'
import ReserveModal from '../components/ReserveModal'
import { badge, buttonPrimary, cardStatic, heading, muted, noteError, sectionTitle } from '../ui'

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()

  // The whole order is kept in state because the reserve modal needs the
  // order's warehouse_id and version, not just the line it was opened from.
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

  // Bumping this refetches the order. The modal uses it after a successful
  // reserve, and after ORDER_CHANGED, to pick up the new version and counts.
  const [refreshKey, setRefreshKey] = useState(0)

  // Only a different order should close the modal, not a refresh.
  useEffect(() => {
    setSelectedLineId(null)
  }, [orderId])

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      setError(true)
      return
    }

    let ignore = false

    setLoading(true)
    setError(false)

    getOrder(orderId)
      .then((data) => {
        if (!ignore) setOrder(data.order)
      })
      .catch(() => {
        if (!ignore) setError(true)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [orderId, refreshKey])

  const selectedLine = order?.lines.find((line) => line.id === selectedLineId) ?? null

  return (
    <div>
      <Link to="/" className="text-sm text-gray-600 hover:underline">
        &larr; Back to orders
      </Link>

      {/* While refreshing, the order stays rendered so the modal is not torn down. */}
      {!order && loading && <p className={`mt-4 ${muted}`}>Loading…</p>}
      {!order && error && <p className="mt-4 text-sm text-red-600">Failed to load order</p>}

      {order && (
        <>
          {error && <p className={`mt-4 ${noteError}`}>Could not refresh this order</p>}

          <div className="mt-4 mb-6">
            <div className="flex items-center gap-3">
              <h1 className={heading}>{order.reference}</h1>
              <span className={badge(order.status)}>{order.status}</span>
            </div>
            <p className={`mt-1 ${muted}`}>{new Date(order.created_at).toLocaleString()}</p>
          </div>

          <h2 className={sectionTitle}>Lines</h2>

          {order.lines.length === 0 ? (
            <p className={muted}>No lines on this order</p>
          ) : (
            <div className="flex flex-col gap-3">
              {order.lines.map((line) => {
                const isFull = line.reserved_count >= line.quantity
                const notConfirmed = order.status !== 'confirmed'
                const disabledReason = notConfirmed
                  ? 'Only confirmed orders can reserve'
                  : isFull
                    ? 'All kits for this line are reserved'
                    : null

                return (
                  <div key={line.id} className={cardStatic}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">
                          {line.reserved_count} of {line.quantity} reserved
                        </p>
                        {disabledReason && <p className={`mt-1 ${muted}`}>{disabledReason}</p>}
                      </div>

                      <button
                        type="button"
                        className={buttonPrimary}
                        disabled={disabledReason !== null}
                        onClick={() => setSelectedLineId(line.id)}
                      >
                        Reserve
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {selectedLine && (
            <ReserveModal
              orderId={order.id}
              lineId={selectedLine.id}
              quantity={selectedLine.quantity}
              reservedCount={selectedLine.reserved_count}
              version={order.version}
              onClose={() => setSelectedLineId(null)}
              onRefresh={() => setRefreshKey((key) => key + 1)}
            />
          )}
        </>
      )}
    </div>
  )
}
