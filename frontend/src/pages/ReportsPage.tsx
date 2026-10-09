import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOrdersNeedingKits, getReservationsPerMonth } from '../api'
import type { OrderNeedingKits, ReservationsPerMonth } from '../api'
import {
  cardStatic,
  heading,
  muted,
  sectionTitle,
  table,
  tbody,
  td,
  tdNum,
  th,
  thNum,
  thead,
} from '../ui'

export default function ReportsPage() {
  const [needingKits, setNeedingKits] = useState<OrderNeedingKits[]>([])
  const [perMonth, setPerMonth] = useState<ReservationsPerMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ignore = false

    setLoading(true)
    setError(false)

    // Both reports are independent, so fetch them together.
    Promise.all([getOrdersNeedingKits(), getReservationsPerMonth()])
      .then(([orders, months]) => {
        if (ignore) return
        setNeedingKits(orders)
        setPerMonth(months)
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
  }, [])

  return (
    <div>
      <Link to="/" className="text-sm text-gray-600 hover:underline">
        &larr; Back to orders
      </Link>

      <h1 className={`mt-4 mb-6 ${heading}`}>Reports</h1>

      {loading && <p className={muted}>Loading…</p>}
      {error && <p className="text-sm text-red-600">Failed to load reports</p>}

      {!loading && !error && (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className={sectionTitle}>Orders needing kits</h2>

            <div className={cardStatic}>
              {needingKits.length === 0 ? (
                <p className={muted}>No orders are waiting on kits</p>
              ) : (
                <table className={table}>
                  <thead className={thead}>
                    <tr>
                      <th className={th}>Reference</th>
                      <th className={thNum}>Needed</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {needingKits.map((order) => (
                      <tr key={order.order_id}>
                        <td className={td}>
                          <Link
                            to={`/orders/${order.order_id}`}
                            className="font-medium hover:underline"
                          >
                            {order.reference}
                          </Link>
                        </td>
                        <td className={tdNum}>{order.needed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className={sectionTitle}>Reservations per month (last 6 months, IST)</h2>

            <div className={cardStatic}>
              {perMonth.length === 0 ? (
                <p className={muted}>No data</p>
              ) : (
                <table className={table}>
                  <thead className={thead}>
                    <tr>
                      <th className={th}>Month</th>
                      <th className={thNum}>Count</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {perMonth.map((row) => (
                      <tr key={row.month}>
                        <td className={`${td} tabular-nums`}>{row.month}</td>
                        <td className={tdNum}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
