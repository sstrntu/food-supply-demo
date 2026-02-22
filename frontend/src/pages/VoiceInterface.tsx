import { FC, useEffect, useState, useCallback } from 'react'
import { Package, AlertTriangle, TrendingUp, Mic, X } from 'lucide-react'
import './VoiceInterface.css'

interface DashboardStats {
  totalProducts: number
  totalInventoryValue: number
  lowStockCount: number
}

const API_URL = 'https://139.59.102.60:3001'
const ELEVENLABS_AGENT_ID = 'agent_7901khz299zdfvcbhtk3c08vcps8'

const VoiceInterface: FC = () => {
  const [stats, setStats] = useState<DashboardStats>({ 
    totalProducts: 0, 
    totalInventoryValue: 0, 
    lowStockCount: 0 
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showVoiceModal, setShowVoiceModal] = useState(false)

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

  // Setup ElevenLabs client tools
  useEffect(() => {
    const handleCall = (event: any) => {
      console.log('ElevenLabs call started, setting up tools...')
      
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
      
      if (event.detail?.config) {
        event.detail.config.clientTools = actions
      }
    }

    document.addEventListener('elevenlabs-convai:call', handleCall)

    // Load script if not already loaded
    if (!document.getElementById('elevenlabs-convai-script')) {
      const script = document.createElement('script')
      script.id = 'elevenlabs-convai-script'
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
      script.async = true
      document.body.appendChild(script)
    }

    return () => {
      document.removeEventListener('elevenlabs-convai:call', handleCall)
    }
  }, [])

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0)
  }

  const openVoiceModal = () => setShowVoiceModal(true)
  const closeVoiceModal = () => setShowVoiceModal(false)

  return (
    <div className="voice-app">
      {/* Mobile Header with Big Voice Button */}
      <header className="mobile-header">
        <div className="header-title">
          <span className="logo">🍜</span>
          <h1>Food Supply AI</h1>
        </div>
        
        {/* BIG VOICE BUTTON - Opens Voice Modal */}
        <button className="big-voice-btn" onClick={openVoiceModal}>
          <Mic size={32} />
          <span>Tap to Ask</span>
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

        {/* Quick Questions */}
        <section className="quick-questions">
          <h3>Try Asking</h3>
          <div className="question-list">
            <button className="question-btn" onClick={openVoiceModal}>
              🍚 "How much rice do we have?"
            </button>
            <button className="question-btn" onClick={openVoiceModal}>
              ⚠️ "What's low on stock?"
            </button>
            <button className="question-btn" onClick={openVoiceModal}>
              🍜 "Show me all sauces"
            </button>
            <button className="question-btn" onClick={openVoiceModal}>
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

      {/* Voice Modal with ElevenLabs Widget */}
      {showVoiceModal && (
        <div className="voice-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) closeVoiceModal()
        }}>
          <div className="voice-modal-content">
            <button className="voice-modal-close" onClick={closeVoiceModal}>
              <X size={24} />
            </button>
            
            <div className="voice-modal-header">
              <h2>🎙️ Voice Assistant</h2>
              <p>Tap the microphone and speak your question</p>
            </div>

            <div className="voice-modal-widget">
              <elevenlabs-convai 
                agent-id={ELEVENLABS_AGENT_ID}
              />
            </div>

            <div className="voice-modal-tips">
              <h4>Try saying:</h4>
              <ul>
                <li>"How many rice products do we have?"</li>
                <li>"What's low on stock?"</li>
                <li>"Show me all sauces"</li>
                <li>"What's our total inventory value?"</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VoiceInterface