import { Route, Routes } from 'react-router-dom'
import OrderDetailPage from './pages/OrderDetailPage'
import OrdersListPage from './pages/OrdersListPage'
import ReportsPage from './pages/ReportsPage'
import { page } from './ui'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className={page}>
        <Routes>
          <Route path="/" element={<OrdersListPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </div>
    </div>
  )
}
