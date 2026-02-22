import { FC, useEffect, useState, useCallback } from 'react'
import { Package, AlertTriangle, TrendingUp } from 'lucide-react'
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

  return (
    <div className="voice-app">
      {/* Mobile Header with ElevenLabs Widget at Top */}
      <header className="mobile-header">
        <div className="header-title">
          <span className="logo">🍜</span>
          <h1>Food Supply AI</h1>
        </div>
        
        {/* ELEVENLABS WIDGET AT TOP */}
        <div className="elevenlabs-top">
          <elevenlabs-convai 
            agent-id={ELEVENLABS_AGENT_ID}
          />
        </div>
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
            <div className="question-hint">
              🍚 "How much rice do we have?"
            </div>
            <div className="question-hint">
              ⚠️ "What's low on stock?"
            </div>
            <div className="question-hint">
              🍜 "Show me all sauces"
            </div>
            <div className="question-hint">
              💰 "What's our inventory value?"
            </div>
          </div>
        </section>

        {/* Instructions */}
        <section className="instructions">
          <div className="instruction-item">
            <span className="icon">🎙️</span>
            <p>Tap the voice button above to talk with the AI</p>
          </div>
          <div className="instruction-item">
            <span className="icon">📱</span>
            <p>Works on mobile - use it on the go!</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default VoiceInterface