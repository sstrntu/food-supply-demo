import { FC, useEffect, useState, useCallback, useRef } from 'react'
import { Package, AlertTriangle, TrendingUp, Mic, X } from 'lucide-react'
import './VoiceInterface.css'

interface DashboardStats {
  totalProducts: number
  totalInventoryValue: number
  lowStockCount: number
}

const API_URL = 'https://139.59.102.60:3001'
const ELEVENLABS_AGENT_ID = 'agent_7901khz299zdfvcbhtk3c08vcps8'

declare global {
  interface Window {
    elevenlabs: any;
  }
}

const VoiceInterface: FC = () => {
  const [stats, setStats] = useState<DashboardStats>({ 
    totalProducts: 0, 
    totalInventoryValue: 0, 
    lowStockCount: 0 
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCallActive, setIsCallActive] = useState(false)
  const widgetRef = useRef<HTMLElement | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_URL}/api/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Load ElevenLabs ConvAI Widget
  useEffect(() => {
    const handleCall = (event: any) => {
      const actions = {
        get_inventory_summary: async () => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${API_URL}/api/dashboard/stats`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            return `You have ${data.totalProducts} products with a total inventory value of $${Math.round(data.totalInventoryValue).toLocaleString()}. There are ${data.lowStockCount} items low on stock.`
          } catch (e) {
            return 'Sorry, I could not fetch the inventory summary.'
          }
        },
        get_low_stock: async () => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch(`${API_URL}/api/inventory/low-stock`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            const items = await res.json()
            if (!items?.length) return 'All items are well stocked!'
            const itemList = items.slice(0, 3).map((i: any) => `${i.product_name} (${i.quantity_on_hand} units)`).join(', ')
            return `Low stock: ${itemList}${items.length > 3 ? ` and ${items.length - 3} more` : ''}.`
          } catch (e) {
            return 'Sorry, I could not fetch low stock items.'
          }
        },
        check_product_stock: async (params: { product_name: string }) => {
          try {
            if (!params?.product_name) return 'Please specify a product name.'
            const token = localStorage.getItem('token')
            const res = await fetch(`${API_URL}/api/products?search=${encodeURIComponent(params.product_name)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            const products = await res.json()
            if (!products?.length) return `No product found matching "${params.product_name}".`
            const p = products[0]
            return `${p.name} has ${p.quantity_on_hand} units in stock.`
          } catch (e) {
            return 'Sorry, could not check that product.'
          }
        }
      }
      
      event.detail.config.clientTools = actions
    }

    // Listen for call start/end events
    const handleCallStart = () => setIsCallActive(true)
    const handleCallEnd = () => setIsCallActive(false)

    document.addEventListener('elevenlabs-convai:call', handleCall)
    document.addEventListener('elevenlabs-convai:call-start', handleCallStart)
    document.addEventListener('elevenlabs-convai:call-end', handleCallEnd)

    // Load script if not already loaded
    if (!document.getElementById('elevenlabs-convai-script')) {
      const script = document.createElement('script')
      script.id = 'elevenlabs-convai-script'
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
      script.async = true
      script.onload = () => {
        console.log('ElevenLabs widget loaded')
      }
      document.body.appendChild(script)
    }

    // Find widget reference after a delay
    setTimeout(() => {
      widgetRef.current = document.querySelector('elevenlabs-convai')
    }, 1000)

    return () => {
      document.removeEventListener('elevenlabs-convai:call', handleCall)
      document.removeEventListener('elevenlabs-convai:call-start', handleCallStart)
      document.removeEventListener('elevenlabs-convai:call-end', handleCallEnd)
    }
  }, [])

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0)
  }

  // Start ElevenLabs voice call
  const startElevenLabsCall = () => {
    // Try to find and click the ElevenLabs widget button
    const widget = document.querySelector('elevenlabs-convai') as any
    if (widget) {
      // Method 1: Try to trigger via widget API
      if (widget.startConversation) {
        widget.startConversation()
      } else if (widget.click) {
        widget.click()
      } else {
        // Method 2: Find the button inside shadow DOM
        const shadowRoot = widget.shadowRoot
        if (shadowRoot) {
          const button = shadowRoot.querySelector('button') || shadowRoot.querySelector('[role="button"]')
          if (button) {
            (button as HTMLElement).click()
          }
        }
      }
    }
    
    // Method 3: Dispatch custom event that ElevenLabs listens for
    const startEvent = new CustomEvent('elevenlabs-convai:start-call')
    document.dispatchEvent(startEvent)
    
    setIsCallActive(true)
  }

  // End ElevenLabs voice call
  const endElevenLabsCall = () => {
    const widget = document.querySelector('elevenlabs-convai') as any
    if (widget) {
      if (widget.endConversation) {
        widget.endConversation()
      } else {
        const shadowRoot = widget.shadowRoot
        if (shadowRoot) {
          const endButton = shadowRoot.querySelector('.end-call-button') || 
                           shadowRoot.querySelector('[data-action="end"]') ||
                           shadowRoot.querySelector('button:last-child')
          if (endButton) {
            (endButton as HTMLElement).click()
          }
        }
      }
    }
    
    const endEvent = new CustomEvent('elevenlabs-convai:end-call')
    document.dispatchEvent(endEvent)
    
    setIsCallActive(false)
  }

  return (
    <div className="voice-app">
      {/* Mobile Header with Big Voice Button */}
      <header className="mobile-header">
        <div className="header-title">
          <span className="logo">🍜</span>
          <h1>Food Supply AI</h1>
        </div>
        
        {/* BIG VOICE BUTTON - Triggers ElevenLabs */}
        <button 
          className={`big-voice-btn ${isCallActive ? 'active' : ''}`} 
          onClick={isCallActive ? endElevenLabsCall : startElevenLabsCall}
        >
          <Mic size={32} />
          <span>{isCallActive ? 'Tap to End' : 'Tap to Ask'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Quick Stats - Mobile Cards */}
        <section className="stats-section">
          <div className="stat-card">
            <div className="stat-icon blue">
              <Package size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{loading ? '...' : stats.totalProducts}</span>
              <span className="stat-label">Products</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon green">
              <TrendingUp size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{loading ? '...' : formatCurrency(stats.totalInventoryValue)}</span>
              <span className="stat-label">Value</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon orange">
              <AlertTriangle size={20} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{loading ? '...' : stats.lowStockCount}</span>
              <span className="stat-label">Low Stock</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={fetchStats} className="retry-btn">Retry</button>
          </div>
        )}

        {/* Active Call Status */}
        {isCallActive && (
          <div className="call-status-banner">
            <div className="call-pulse" />
            <span>🎙️ Voice AI Active - Speak now</span>
            <button className="end-call-btn" onClick={endElevenLabsCall}>
              <X size={16} />
              End
            </button>
          </div>
        )}

        {/* Quick Questions */}
        <section className="quick-questions">
          <h3>Try Asking</h3>
          <div className="question-list">
            <button className="question-btn" onClick={startElevenLabsCall}>
              🍚 "How much rice do we have?"
            </button>
            <button className="question-btn" onClick={startElevenLabsCall}>
              ⚠️ "What's low on stock?"
            </button>
            <button className="question-btn" onClick={startElevenLabsCall}>
              🍜 "Show me all sauces"
            </button>
            <button className="question-btn" onClick={startElevenLabsCall}>
              💰 "What's our inventory value?"
            </button>
          </div>
        </section>

        {/* Instructions */}
        <section className="instructions">
          <div className="instruction-item">
            <span className="icon">🎙️</span>
            <p>Tap the big button above to talk with the AI</p>
          </div>
          <div className="instruction-item">
            <span className="icon">📱</span>
            <p>Works on mobile - use it on the go!</p>
          </div>
        </section>
      </main>

      {/* Hidden ElevenLabs Widget */}
      <div className="widget-container" style={{ position: 'fixed', bottom: '-100px', right: '-100px', opacity: 0, pointerEvents: 'none' }}>
        <elevenlabs-convai 
          agent-id={ELEVENLABS_AGENT_ID}
          className="elevenlabs-widget"
        />
      </div>
    </div>
  )
}

export default VoiceInterface