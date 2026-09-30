import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAdminUsers, getAdminStats } from '../lib/api'
import SEO from '../components/SEO'

export default function Admin() {
  const { token } = useAuth()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [resetModal, setResetModal] = useState(null) // { userId, email, name }
  const [resetPassword, setResetPassword] = useState('')
  const [resetMsg, setResetMsg] = useState('')

  const loadData = () => {
    if (!token) { setError('Not authenticated'); setLoading(false); return }
    Promise.all([getAdminUsers(token), getAdminStats(token)])
      .then(([u, s]) => { setUsers(u); setStats(s) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [token])

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      setResetMsg('Password must be at least 6 characters')
      return
    }
    try {
      const res = await fetch('/api/auth/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: resetModal.userId, new_password: resetPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      setResetMsg(data.detail)
      setTimeout(() => { setResetModal(null); setResetPassword(''); setResetMsg('') }, 2000)
    } catch (err) {
      setResetMsg(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-heading font-bold text-text-primary mb-2">Access Denied</h2>
          <p className="text-red-400 text-sm">{error}</p>
          <p className="text-text-muted text-xs mt-2">Only the platform admin can access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <SEO title="Admin Panel" />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-magenta to-accent-amber flex items-center justify-center text-white font-bold text-lg">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="font-heading font-bold text-text-primary text-xl">Admin Panel</h1>
          <p className="text-xs text-text-muted font-mono">Platform users & analytics</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total Users', value: stats.total_users, color: 'text-accent-cyan' },
            { label: 'Google Users', value: stats.google_users, color: 'text-accent-magenta' },
            { label: 'Email Users', value: stats.email_users, color: 'text-accent-lime' },
            { label: 'Active Sessions', value: stats.active_sessions, color: 'text-accent-amber' },
            { label: 'Today Signups', value: stats.today_signups, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-bg-card border border-border-subtle rounded-xl p-4">
              <div className="text-[10px] text-text-muted font-mono uppercase tracking-wider mb-1">{s.label}</div>
              <div className={`text-3xl font-mono font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="font-heading font-bold text-text-primary text-sm">
            Registered Users ({users.length})
          </h2>
          <span className="text-[10px] font-mono text-text-muted">Sorted by newest first</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-bg-elevated/50">
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">#</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">User</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Email</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Provider</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Verified</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Logins</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Last Login</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Sessions</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Joined</th>
                <th className="text-left py-3 px-4 text-text-muted text-[11px] font-mono uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="border-b border-border-subtle/50 hover:bg-bg-card-hover transition-colors">
                  <td className="py-3 px-4 text-text-muted font-mono text-xs">{i + 1}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border-subtle" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-cyan to-accent-magenta flex items-center justify-center text-white text-xs font-bold">
                          {u.name?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="text-text-primary font-medium">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-text-secondary font-mono text-xs">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                      u.auth_provider === 'google'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20'
                    }`}>
                      {u.auth_provider === 'google' && (
                        <svg className="w-3 h-3" viewBox="0 0 24 24">
                          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      )}
                      {u.auth_provider}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u.is_verified ? (
                      <span className="text-green-400 text-xs font-mono">Yes</span>
                    ) : (
                      <span className="text-text-muted text-xs font-mono">No</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs text-accent-cyan">{u.login_count || 0}</span>
                  </td>
                  <td className="py-3 px-4 text-text-muted font-mono text-xs whitespace-nowrap">
                    {u.last_login ? new Date(u.last_login + 'Z').toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    }) : 'Never'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`font-mono text-xs ${u.active_sessions > 0 ? 'text-accent-lime' : 'text-text-muted'}`}>
                      {u.active_sessions > 0 ? `${u.active_sessions} active` : 'none'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-muted font-mono text-xs whitespace-nowrap">
                    {u.created_at ? new Date(u.created_at + 'Z').toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    }) : '-'}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => { setResetModal({ userId: u.id, email: u.email, name: u.name }); setResetPassword(''); setResetMsg('') }}
                      className="text-xs text-accent-amber hover:text-accent-amber/80 font-mono transition-colors"
                      title="Reset password"
                    >
                      Reset PW
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="p-12 text-center text-text-muted font-mono text-sm">
            No users registered yet.
          </div>
        )}
      </div>

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setResetModal(null)}>
          <div className="bg-[#111118] border border-border-subtle rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-heading font-bold text-text-primary text-lg mb-1">Reset Password</h3>
            <p className="text-text-secondary text-sm mb-4">
              Set a new password for <span className="text-accent-cyan font-mono">{resetModal.email}</span>
            </p>

            {resetMsg && (
              <div className={`mb-4 p-2.5 rounded-lg text-sm text-center ${
                resetMsg.includes('reset for') || resetMsg.includes('success')
                  ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                  : 'bg-accent-magenta/10 border border-accent-magenta/30 text-accent-magenta'
              }`}>
                {resetMsg}
              </div>
            )}

            <input
              type="password"
              value={resetPassword}
              onChange={e => { setResetPassword(e.target.value); setResetMsg('') }}
              placeholder="New password (min 6 characters)"
              className="w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border border-[#1E1E2A] text-text-primary text-sm
                placeholder-text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 mb-4"
            />

            <div className="flex gap-3">
              <button onClick={() => setResetModal(null)}
                className="flex-1 py-2 rounded-lg border border-border-subtle text-text-secondary text-sm hover:bg-bg-card-hover transition-colors">
                Cancel
              </button>
              <button onClick={handleResetPassword}
                className="flex-1 py-2 rounded-lg bg-accent-amber text-black font-bold text-sm hover:brightness-110 transition-all">
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
