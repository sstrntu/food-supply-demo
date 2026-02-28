import { FC, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Lock, User, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

const Login: FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  
  const usernameRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const normalizedUsername = username.trim()
    const normalizedPassword = password.trim()
    
    console.log('[Login] Form submitted')
    console.log('[Login] Username:', normalizedUsername)
    console.log('[Login] Password length:', normalizedPassword?.length)
    
    // Simple validation
    if (!normalizedUsername || !normalizedPassword) {
      console.log('[Login] Validation failed - empty fields')
      setError('Please enter both username and password')
      return
    }

    setLoading(true)
    console.log('[Login] Calling login function...')

    try {
      const success = await login(normalizedUsername, normalizedPassword)
      console.log('[Login] Login returned:', success)
      
      if (success) {
        console.log('[Login] Navigating to home...')
        navigate('/')
      } else {
        console.log('[Login] Login returned false, showing error')
        setError('Invalid username or password')
        usernameRef.current?.focus()
      }
    } catch (err) {
      console.error('[Login] CATCH block error:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
      console.log('[Login] Loading set to false')
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-brand" aria-hidden="true">
              <Package size={36} />
            </div>
            <h1 className="login-title">Food Supply AI</h1>
            <p className="login-subtitle">Inventory Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="username">Username</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">
                  <User size={20} />
                </span>
                <input
                  ref={usernameRef}
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">
                  <Lock size={20} />
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="spinner" size={18} aria-hidden="true" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <div className="login-divider">
            <span>Demo Account</span>
          </div>

          <div className="login-demo">
            <div className="login-demo-label">Test Credentials</div>
            <div className="login-demo-credentials">
              <code>testuser</code>
              <span className="login-demo-divider">/</span>
              <code>123454321</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
