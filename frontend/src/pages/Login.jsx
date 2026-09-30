import { useState, useEffect, useRef, useCallback } from 'react'
import { appPath } from '../lib/site'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function LoginPage({ inline = false }) {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  // Modes: 'login' | 'forgot' | 'reset' (admin-only; there is no public registration)
  const [mode, setMode] = useState('login')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    resetToken: '',
    newPassword: '',
    confirmNewPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleLoaded, setGoogleLoaded] = useState(false)
  const googleBtnRef = useRef(null)

  useEffect(() => {
    if (!inline && isAuthenticated) {
      navigate('/admin', { replace: true })
    }
  }, [isAuthenticated, inline, navigate])

  useEffect(() => {
    if (inline) return
    const resetToken = new URLSearchParams(window.location.search).get('reset_token')
    if (!resetToken) return
    setFormData(prev => ({ ...prev, resetToken }))
    setMode('reset')
  }, [inline])

  const handleGoogleResponse = useCallback(async (response) => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Google sign-in failed')
      }
      const data = await res.json()
      login(data.token, data.user)
      if (!inline) navigate('/admin', { replace: true })
    } catch (err) {
      setSubmitError(err.message || 'Google sign-in failed')
    } finally {
      setSubmitting(false)
    }
  }, [login, navigate, inline])

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]')
    if (existingScript && window.google?.accounts?.id) {
      initializeGoogle()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = initializeGoogle
    document.body.appendChild(script)

    function initializeGoogle() {
      if (!window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      })
      setGoogleLoaded(true)
    }
  }, [handleGoogleResponse])

  useEffect(() => {
    if (googleLoaded && googleBtnRef.current && window.google?.accounts?.id) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: googleBtnRef.current.offsetWidth || 320,
        text: 'signin_with',
      })
    }
  }, [googleLoaded, mode])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    setSubmitError('')
    setSubmitSuccess('')
  }

  const validate = () => {
    const newErrors = {}

    if (mode === 'forgot') {
      if (!formData.email.trim()) newErrors.email = 'Email is required'
      else if (!validateEmail(formData.email)) newErrors.email = 'Invalid email format'
    } else if (mode === 'reset') {
      if (!formData.resetToken.trim()) newErrors.resetToken = 'Reset token is required'
      if (!formData.newPassword) newErrors.newPassword = 'Password is required'
      else if (formData.newPassword.length < 6) newErrors.newPassword = 'Password must be at least 6 characters'
      if (!formData.confirmNewPassword) newErrors.confirmNewPassword = 'Please confirm password'
      else if (formData.newPassword !== formData.confirmNewPassword) newErrors.confirmNewPassword = 'Passwords do not match'
    } else {
      if (!formData.email.trim()) newErrors.email = 'Email is required'
      else if (!validateEmail(formData.email)) newErrors.email = 'Invalid email format'
      if (!formData.password) newErrors.password = 'Password is required'
      else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')

    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Failed to process request')

        if (data.reset_token) {
          // Auto-fill the reset token and switch to reset mode
          setFormData(prev => ({ ...prev, resetToken: data.reset_token }))
          setMode('reset')
          setSubmitSuccess('Reset token generated! Set your new password below.')
        } else {
          setSubmitSuccess(data.detail)
        }
      } else if (mode === 'reset') {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: formData.resetToken, password: formData.newPassword }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Password reset failed')
        setSubmitSuccess(data.detail)
        setTimeout(() => {
          setMode('login')
          setFormData(prev => ({ ...prev, password: '', resetToken: '', newPassword: '', confirmNewPassword: '' }))
          setSubmitSuccess('')
        }, 2000)
      } else {
        const body = { email: formData.email, password: formData.password }
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.detail || 'Invalid credentials')
        }
        const data = await res.json()
        login(data.token, data.user)
        if (!inline) navigate('/admin', { replace: true })
      }
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setErrors({})
    setSubmitError('')
    setSubmitSuccess('')
  }

  const getTitle = () => {
    switch (mode) {
      case 'forgot': return 'Forgot Password'
      case 'reset': return 'Reset Password'
      default: return 'Admin Sign In'
    }
  }

  const getSubtitle = () => {
    switch (mode) {
      case 'forgot': return 'Enter your email to reset your password'
      case 'reset': return 'Enter the reset token and your new password'
      default: return 'For site administrators only'
    }
  }

  const formContent = (
    <div className={`w-full max-w-md mx-auto ${inline ? '' : 'min-h-screen flex items-center justify-center px-4'}`}>
      <div className={`w-full animate-pop ${inline ? '' : 'my-8'}`}>
        <div className="p-[1px] rounded-2xl bg-gradient-to-br from-accent-cyan/40 via-accent-magenta/20 to-accent-lime/30">
          <div className="bg-[#111118] rounded-2xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    {mode === 'forgot' || mode === 'reset' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    )}
                  </svg>
                </div>
                <h2 className="text-2xl font-heading font-bold text-text-primary">
                  {getTitle()}
                </h2>
              </div>
              <p className="text-text-secondary text-sm">{getSubtitle()}</p>
            </div>

            {/* Messages */}
            {submitError && (
              <div className="mb-6 p-3 rounded-lg bg-accent-magenta/10 border border-accent-magenta/30 animate-in-fast">
                <p className="text-accent-magenta text-sm text-center">{submitError}</p>
              </div>
            )}
            {submitSuccess && (
              <div className="mb-6 p-3 rounded-lg bg-green-500/10 border border-green-500/30 animate-in-fast">
                <p className="text-green-400 text-sm text-center">{submitSuccess}</p>
              </div>
            )}

            {/* Google Sign-In */}
            {mode === 'login' && GOOGLE_CLIENT_ID && (
              <>
                <div ref={googleBtnRef} className="w-full flex justify-center mb-6" />
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 h-px bg-[#1E1E2A]" />
                  <span className="text-text-muted text-xs uppercase tracking-wider font-medium">or</span>
                  <div className="flex-1 h-px bg-[#1E1E2A]" />
                </div>
              </>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* FORGOT PASSWORD MODE */}
              {mode === 'forgot' && (
                <div>
                  <label htmlFor="auth-email" className="block text-text-secondary text-sm font-medium mb-1.5">Email</label>
                  <input id="auth-email" name="email" type="email" value={formData.email} onChange={handleChange}
                    placeholder="you@example.com" autoComplete="email"
                    className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                      focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                      ${errors.email ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                  {errors.email && <p className="mt-1 text-xs text-accent-magenta">{errors.email}</p>}
                </div>
              )}

              {/* RESET PASSWORD MODE */}
              {mode === 'reset' && (
                <>
                  <div>
                    <label htmlFor="auth-reset-token" className="block text-text-secondary text-sm font-medium mb-1.5">Reset Token</label>
                    <input id="auth-reset-token" name="resetToken" type="text" value={formData.resetToken} onChange={handleChange}
                      placeholder="Paste your reset token" readOnly={!!formData.resetToken}
                      className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                        font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                        ${formData.resetToken ? 'opacity-60' : ''}
                        ${errors.resetToken ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                    {errors.resetToken && <p className="mt-1 text-xs text-accent-magenta">{errors.resetToken}</p>}
                  </div>
                  <div>
                    <label htmlFor="auth-new-password" className="block text-text-secondary text-sm font-medium mb-1.5">New Password</label>
                    <input id="auth-new-password" name="newPassword" type="password" value={formData.newPassword} onChange={handleChange}
                      placeholder="Min. 6 characters" autoComplete="new-password"
                      className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                        focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                        ${errors.newPassword ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                    {errors.newPassword && <p className="mt-1 text-xs text-accent-magenta">{errors.newPassword}</p>}
                  </div>
                  <div>
                    <label htmlFor="auth-confirm-new-password" className="block text-text-secondary text-sm font-medium mb-1.5">Confirm New Password</label>
                    <input id="auth-confirm-new-password" name="confirmNewPassword" type="password" value={formData.confirmNewPassword} onChange={handleChange}
                      placeholder="Repeat your password" autoComplete="new-password"
                      className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                        focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                        ${errors.confirmNewPassword ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                    {errors.confirmNewPassword && <p className="mt-1 text-xs text-accent-magenta">{errors.confirmNewPassword}</p>}
                  </div>
                </>
              )}

              {/* LOGIN MODE */}
              {mode === 'login' && (
                <>

                  <div>
                    <label htmlFor="auth-email" className="block text-text-secondary text-sm font-medium mb-1.5">Email</label>
                    <input id="auth-email" name="email" type="email" value={formData.email} onChange={handleChange}
                      placeholder="you@example.com" autoComplete="email"
                      className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                        focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                        ${errors.email ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                    {errors.email && <p className="mt-1 text-xs text-accent-magenta">{errors.email}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="auth-password" className="block text-text-secondary text-sm font-medium">Password</label>
                      {mode === 'login' && (
                        <button type="button" onClick={() => switchMode('forgot')}
                          className="text-accent-cyan text-xs hover:underline transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input id="auth-password" name="password" type="password" value={formData.password} onChange={handleChange}
                      placeholder="Min. 6 characters" autoComplete="current-password"
                      className={`w-full px-4 py-2.5 rounded-lg bg-[#0A0A0F] border text-text-primary text-sm placeholder-text-muted/50
                        focus:outline-none focus:ring-2 focus:ring-accent-cyan/40 focus:border-accent-cyan/60 transition-all
                        ${errors.password ? 'border-accent-magenta/60' : 'border-[#1E1E2A]'}`} />
                    {errors.password && <p className="mt-1 text-xs text-accent-magenta">{errors.password}</p>}
                  </div>

                </>
              )}

              {/* Submit Button */}
              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-accent-cyan text-black font-bold text-sm
                  hover:brightness-110 active:brightness-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2">
                {submitting && <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                {mode === 'forgot' ? 'Send Reset Link' :
                 mode === 'reset' ? 'Reset Password' : 'Sign In'}
              </button>
            </form>

            {/* Footer links */}
            <div className="mt-6 text-center space-y-2">
              {mode === 'login' && !inline && (
                <p className="text-text-muted text-sm">
                  Not an admin?{' '}
                  <a href={appPath('/dashboard')} className="text-accent-cyan hover:underline font-medium transition-colors">
                    Explore Crickrida — it&apos;s free, no account needed
                  </a>
                </p>
              )}
              {(mode === 'forgot' || mode === 'reset') && (
                <p className="text-text-muted text-sm">
                  Remember your password?{' '}
                  <button onClick={() => switchMode('login')}
                    className="text-accent-cyan hover:underline font-medium transition-colors">
                    Back to Sign In
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  if (inline) {
    return (
      <div className="relative min-h-[60vh] flex items-center justify-center">
        <div className="absolute inset-0 flex items-center justify-center opacity-10 blur-sm pointer-events-none select-none">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-[#1E1E2A] mx-auto mb-4" />
            <div className="h-4 w-48 bg-[#1E1E2A] rounded mx-auto mb-2" />
            <div className="h-3 w-32 bg-[#1E1E2A] rounded mx-auto" />
          </div>
        </div>
        <div className="relative z-10 w-full">{formContent}</div>
      </div>
    )
  }

  return <div className="min-h-screen bg-[#0A0A0F]">{formContent}</div>
}
