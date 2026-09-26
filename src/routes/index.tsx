import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { RequireAnonymous, RequireAuth } from '@/components/layout/RouteGuards'
import { PlaceholderPage } from '@/components/data-display/PlaceholderPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { SignUpPage } from '@/features/auth/pages/SignUpPage'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'

/** The authenticated shell: sidebar + topbar + routed content. */
const AppShell = lazy(() =>
  import('@/components/layout/AppShell').then((m) => ({ default: m.AppShell })),
)

const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const ProductsPage = lazy(() =>
  import('@/features/products/pages/ProductsPage').then((m) => ({ default: m.ProductsPage })),
)
const ProductDetailPage = lazy(() =>
  import('@/features/products/pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })),
)
const ProductFormPage = lazy(() =>
  import('@/features/products/pages/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
)
const CategoriesPage = lazy(() =>
  import('@/features/categories/pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
)
const WarehousesPage = lazy(() =>
  import('@/features/warehouses/pages/WarehousesPage').then((m) => ({ default: m.WarehousesPage })),
)
const WarehouseDetailPage = lazy(() =>
  import('@/features/warehouses/pages/WarehouseDetailPage').then((m) => ({ default: m.WarehouseDetailPage })),
)
const ReceiptsPage = lazy(() =>
  import('@/features/receipts/pages/ReceiptsPage').then((m) => ({ default: m.ReceiptsPage })),
)
const ReceiptFormPage = lazy(() =>
  import('@/features/receipts/pages/ReceiptFormPage').then((m) => ({ default: m.ReceiptFormPage })),
)
const ReceiptDetailPage = lazy(() =>
  import('@/features/receipts/pages/ReceiptDetailPage').then((m) => ({ default: m.ReceiptDetailPage })),
)
const DeliveriesPage = lazy(() =>
  import('@/features/deliveries/pages/DeliveriesPage').then((m) => ({ default: m.DeliveriesPage })),
)
const DeliveryFormPage = lazy(() =>
  import('@/features/deliveries/pages/DeliveryFormPage').then((m) => ({ default: m.DeliveryFormPage })),
)
const DeliveryDetailPage = lazy(() =>
  import('@/features/deliveries/pages/DeliveryDetailPage').then((m) => ({ default: m.DeliveryDetailPage })),
)
const TransfersPage = lazy(() =>
  import('@/features/transfers/pages/TransfersPage').then((m) => ({ default: m.TransfersPage })),
)
const TransferFormPage = lazy(() =>
  import('@/features/transfers/pages/TransferFormPage').then((m) => ({ default: m.TransferFormPage })),
)
const TransferDetailPage = lazy(() =>
  import('@/features/transfers/pages/TransferDetailPage').then((m) => ({ default: m.TransferDetailPage })),
)
const AdjustmentsPage = lazy(() =>
  import('@/features/adjustments/pages/AdjustmentsPage').then((m) => ({ default: m.AdjustmentsPage })),
)
const AdjustmentFormPage = lazy(() =>
  import('@/features/adjustments/pages/AdjustmentFormPage').then((m) => ({ default: m.AdjustmentFormPage })),
)
const LedgerPage = lazy(() =>
  import('@/features/ledger/pages/LedgerPage').then((m) => ({ default: m.LedgerPage })),
)
const NotificationsPage = lazy(() =>
  import('@/features/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/settings/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const NotFoundPage = lazy(() =>
  import('@/components/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/**
 * All routes are declared up front so navigation never dead-ends, even while
 * individual modules are still being built. Feature routes are code-split so
 * the login screen does not download the dashboard's charting library.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={
          <RequireAnonymous>
            <LoginPage />
          </RequireAnonymous>
        }
      />
      <Route
        path="/signup"
        element={
          <RequireAnonymous>
            <SignUpPage />
          </RequireAnonymous>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Authenticated */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<RouteFallback />}>
              <DashboardPage />
            </Suspense>
          }
        />

        <Route path="products">
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <ProductsPage />
              </Suspense>
            }
          />
          <Route
            path="new"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ProductFormPage />
              </Suspense>
            }
          />
          <Route
            path=":productId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ProductDetailPage />
              </Suspense>
            }
          />
          <Route
            path=":productId/edit"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ProductFormPage />
              </Suspense>
            }
          />
        </Route>

        <Route
          path="categories"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CategoriesPage />
            </Suspense>
          }
        />

        <Route path="warehouses">
          <Route
            index
            element={
              <Suspense fallback={<RouteFallback />}>
                <WarehousesPage />
              </Suspense>
            }
          />
          <Route
            path=":warehouseId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <WarehouseDetailPage />
              </Suspense>
            }
          />
        </Route>

        <Route path="operations">
          <Route path="receipts">
            <Route
              index
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ReceiptsPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ReceiptFormPage />
                </Suspense>
              }
            />
            <Route
              path=":documentId"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ReceiptDetailPage />
                </Suspense>
              }
            />
          </Route>

          <Route path="deliveries">
            <Route
              index
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DeliveriesPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DeliveryFormPage />
                </Suspense>
              }
            />
            <Route
              path=":documentId"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <DeliveryDetailPage />
                </Suspense>
              }
            />
          </Route>

          <Route path="transfers">
            <Route
              index
              element={
                <Suspense fallback={<RouteFallback />}>
                  <TransfersPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <TransferFormPage />
                </Suspense>
              }
            />
            <Route
              path=":documentId"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <TransferDetailPage />
                </Suspense>
              }
            />
          </Route>

          <Route path="adjustments">
            <Route
              index
              element={
                <Suspense fallback={<RouteFallback />}>
                  <AdjustmentsPage />
                </Suspense>
              }
            />
            <Route
              path="new"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <AdjustmentFormPage />
                </Suspense>
              }
            />
          </Route>
        </Route>

        <Route
          path="ledger"
          element={
            <Suspense fallback={<RouteFallback />}>
              <LedgerPage />
            </Suspense>
          }
        />

        <Route
          path="notifications"
          element={
            <Suspense fallback={<RouteFallback />}>
              <NotificationsPage />
            </Suspense>
          }
        />

        <Route
          path="settings/profile"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ProfilePage />
            </Suspense>
          }
        />
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  )
}

export { PlaceholderPage }
