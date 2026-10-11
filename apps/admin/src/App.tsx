import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import MerchantLayout from './components/MerchantLayout'

// Admin Pages
import DashboardPage from './pages/DashboardPage'
import KiosksPage from './pages/KiosksPage'
import KioskDetailPage from './pages/KioskDetailPage'
import OrdersPage from './pages/OrdersPage'
import AlertsPage from './pages/AlertsPage'
import MerchantsPage from './pages/admin/MerchantsPage'
import PaymentSettingsPage from './pages/admin/PaymentSettingsPage'
import HelpDeskPage from './pages/admin/HelpDeskPage'
import InstallationRequestsPage from './pages/admin/InstallationRequestsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdvertisementsPage from './pages/admin/AdvertisementsPage'

// Merchant Pages
import MerchantDashboardPage from './pages/merchant/MerchantDashboardPage'
import MerchantKiosksPage from './pages/merchant/MerchantKiosksPage'
import MerchantOrdersPage from './pages/merchant/MerchantOrdersPage'
import MerchantSettingsPage from './pages/merchant/MerchantSettingsPage'
import MerchantPricingPage from './pages/merchant/MerchantPricingPage'
import MerchantPagesPage from './pages/merchant/MerchantPagesPage'

import LoginPage from './pages/LoginPage'
import { AuthProvider, RequireRole, useAuth } from '@/lib/authContext'
import { MerchantProvider } from '@/lib/merchantContext'

function RootRedirect() {
  const { isAuthenticated, role } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={role === 'admin' ? '/admin/dashboard' : '/merchant/dashboard'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <MerchantProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* ──────── Platform Administrator Portal (Strictly Admin RBAC) ──────── */}
          <Route
            path="/admin"
            element={
              <RequireRole allowedRoles={['admin']}>
                <AdminLayout />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="kiosks" element={<KiosksPage />} />
            <Route path="kiosks/:id" element={<KioskDetailPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="helpdesk" element={<HelpDeskPage />} />
            <Route path="installations" element={<InstallationRequestsPage />} />
            <Route path="merchants" element={<MerchantsPage />} />
            <Route path="payments" element={<PaymentSettingsPage />} />
            <Route path="advertisements" element={<AdvertisementsPage />} />
            <Route path="ads" element={<Navigate to="/admin/advertisements" replace />} />
            <Route path="campaigns" element={<Navigate to="/admin/advertisements" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="admins" element={<Navigate to="/admin/users" replace />} />
          </Route>

          {/* ──────── Merchant Partner Portal (Merchant & Admin Emulation) ──────── */}
          <Route
            path="/merchant"
            element={
              <RequireRole allowedRoles={['merchant', 'admin']}>
                <MerchantLayout />
              </RequireRole>
            }
          >
            <Route index element={<Navigate to="/merchant/dashboard" replace />} />
            <Route path="dashboard" element={<MerchantDashboardPage />} />
            <Route path="kiosks" element={<MerchantKiosksPage />} />
            <Route path="pages" element={<MerchantPagesPage />} />
            <Route path="paper" element={<Navigate to="/merchant/pages" replace />} />
            <Route path="pricing" element={<MerchantPricingPage />} />
            <Route path="orders" element={<MerchantOrdersPage />} />
            <Route path="earnings" element={<Navigate to="/merchant/dashboard" replace />} />
            <Route path="payout" element={<Navigate to="/merchant/dashboard" replace />} />
            <Route path="payouts" element={<Navigate to="/merchant/dashboard" replace />} />
            <Route path="supplies" element={<Navigate to="/merchant/dashboard" replace />} />
            <Route path="settings" element={<MerchantSettingsPage />} />
          </Route>

          {/* ──────── Legacy Fallback Redirects ──────── */}
          <Route path="/dashboard" element={<RootRedirect />} />
          <Route path="/kiosks" element={<Navigate to="/admin/kiosks" replace />} />
          <Route path="/kiosks/:id" element={<Navigate to="/admin/kiosks" replace />} />
          <Route path="/orders" element={<RootRedirect />} />
          <Route path="/alerts" element={<Navigate to="/admin/alerts" replace />} />
          <Route path="/pricing" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/users" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admins" element={<Navigate to="/admin/users" replace />} />

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </MerchantProvider>
    </AuthProvider>
  )
}
