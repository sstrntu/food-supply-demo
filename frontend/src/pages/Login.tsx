import { FC, useState, useRef, FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Lock, User, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

interface FormErrors {
  username?: string
  password?: string
  general?: string
}

interface FormTouched {
  username: boolean
  password: boolean
}

const Login: FC = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<FormTouched>({ username: false, password: false })
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const validateField = (field: keyof FormTouched, value: string): string | undefined => {
    switch (field) {
      case 'username':
        if (!value.trim()) return 'Username is required'
        if (value.length < 3) return 'Username must be at least 3 characters'
        return undefined
      case 'password':
        if (!value) return 'Password is required'
        if (value.length < 6) return 'Password must be at least 6 characters'
        return undefined
      default:
        return undefined
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}
    
    const usernameError = validateField('username', username)
    if (usernameError) newErrors.username = usernameError
    
    const passwordError = validateField('password', password)
    if (passwordError) newErrors.password = passwordError
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBlur = (field: keyof FormTouched) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const error = validateField(field, field === 'username' ? username : password)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const handleChange = (field: keyof FormTouched, value: string) => {
    if (field === 'username') {
      setUsername(value)
    } else {
      setPassword(value)
    }
    
    // Clear error when user starts typing
    if (touched[field] && errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    // Mark all fields as touched
    setTouched({ username: true, password: true })
    
    if (!validateForm()) {
      // Focus first field with error
      if (errors.username) {
        usernameRef.current?.focus()
      } else if (errors.password) {
        passwordRef.current?.focus()
      }
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const success = await login(username, password)
      if (success) {
        navigate('/')
      } else {
        setErrors({ general: 'Invalid username or password' })
        usernameRef.current?.focus()
      }
    } catch (error) {
      setErrors({ general: 'An error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    setErrors({})
    setUsername('')
    setPassword('')
    setTouched({ username: false, password: false })
    usernameRef.current?.focus()
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

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            {errors.general && (
              <div 
                className="login-error" 
                role="alert"
                aria-live="polite"
              >
                <AlertCircle size={18} aria-hidden="true" />
                <span>{errors.general}</span>
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
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('username', e.target.value)}
                  onBlur={() => handleBlur('username')}
                  placeholder="Enter username"
                  autoComplete="username"
                  aria-label="Username"
                  aria-required="true"
                  aria-invalid={touched.username && !!errors.username}
                  aria-describedby={errors.username ? "username-error" : undefined}
                  disabled={loading}
                />
              </div>
              {touched.username && errors.username && (
                <span id="username-error" className="field-error" role="alert">
                  {errors.username}
                </span>
              )}
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">
                  <Lock size={20} />
                </span>
                <input
                  ref={passwordRef}
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  aria-label="Password"
                  aria-required="true"
                  aria-invalid={touched.password && !!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  disabled={loading}
                />
              </div>
              {touched.password && errors.password && (
                <span id="password-error" className="field-error" role="alert">
                  {errors.password}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={loading}
              aria-busy={loading}
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

            {errors.general && (
              <button 
                type="button" 
                className="retry-button"
                onClick={handleRetry}
                disabled={loading}
              >
                Try Again
              </button>
            )}
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