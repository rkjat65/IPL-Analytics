import { useAuth } from '../../contexts/AuthContext'
import { lazy, Suspense } from 'react'

const LoginPage = lazy(() => import('../../pages/Login'))

export default function ProtectedRoute({ children }) {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 animate-in">
          <div className="w-10 h-10 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm font-body">Verifying access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Suspense fallback={null}><LoginPage inline /></Suspense>
  }

  if (!user?.is_admin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-sm animate-in">
          <h2 className="text-xl font-heading font-bold text-text-primary mb-2">Admins only</h2>
          <p className="text-text-secondary text-sm">This area is for site administrators. Everything else on Crickrida is free and open to everyone.</p>
        </div>
      </div>
    )
  }

  return children
}
