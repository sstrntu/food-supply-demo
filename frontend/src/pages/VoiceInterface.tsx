import { FC, useEffect, useState, useCallback } from 'react'
import { Package, AlertTriangle, TrendingUp, Mic, Loader2 } from 'lucide-react'
import './VoiceInterface.css'

interface DashboardStats {
  totalProducts: number
  totalInventoryValue: number
  lowStockCount: number
}

interface ApiError {
  message: string
  code?: string
}

const API_URL = 'https://139.59.102.60:3001'
const ELEVENLABS_AGENT_ID = 'agent_7901khz299zdfvcbhtk3c08vcps8'

// Voice Actions for ElevenLabs
const createVoiceActions = () => {
  const fetchWithAuth = async (endpoint: string) => {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Not authenticated')
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`)
    }
    return res.json()
  }

  return {
    get_inventory_summary: async () => {
      try {
        const data = await fetchWithAuth('/api/dashboard/stats')
        return `You have ${data.totalProducts} products with a total inventory value of $${Math.round(data.totalInventoryValue).toLocaleString()}. There are ${data.lowStockCount} items low on stock.`
      } catch (e) {
        return 'Sorry, I could not fetch the inventory summary. Please try again.'
      }
    },
    get_low_stock: async () => {
      try {
        const items = await fetchWithAuth('/api/inventory/low-stock')
        if (!items?.length) return 'All items are well stocked!'
        const itemList = items.slice(0, 5).map((i: any) => `${i.product_name} (${i.quantity_on_hand} units)`).join(', ')
        const moreText = items.length > 5 ? ` and ${items.length - 5} more` : ''
        return `Low stock alert: ${itemList}${moreText}. Consider reordering soon.`
      } catch (e) {
        return 'Sorry, I could not fetch low stock items. Please try again.'
      }
    },
    check_product_stock: async (params: { product_name: string }) => {
      try {
        if (!params?.product_name) return 'Please specify a product name.'
        const products = await fetchWithAuth(`/api/products?search=${encodeURIComponent(params.product_name)}`)
        if (!products?.length) return `I could not find any product matching "${params.product_name}".`
        const p = products[0]
        const lowStockWarning = p.quantity_on_hand <= p.reorder_point ? ' This item is low on stock!' : ''
        return `${p.name} has ${p.quantity_on_hand} units in stock at ${p.warehouse_name}.${lowStockWarning}`
      } catch (e) {
        return 'Sorry, I could not check that product. Please try again.'
      }
    },
    get_products_by_category: async (params: { category: string }) => {
      try {
        if (!params?.category) return 'Please specify a category like rice, sauces, noodles, etc.'
        const products = await fetchWithAuth(`/api/products/category/${encodeURIComponent(params.category)}`)
        if (!products?.length) return `No products found in category "${params.category}".`
        const productList = products.slice(0, 5).map((p: any) => `${p.name} (${p.quantity_on_hand} in stock)`).join(', ')
        const moreText = products.length > 5 ? ` and ${products.length - 5} more` : ''
        return `Found ${products.length} products in ${params.category}: ${productList}${moreText}.`
      } catch (e) {
        return 'Sorry, I could not fetch products by category. Please try again.'
      }
    },
    search_products: async (params: { query: string }) => {
      try {
        if (!params?.query) return 'Please specify what you want to search for.'
        const products = await fetchWithAuth(`/api/products?search=${encodeURIComponent(params.query)}`)
        if (!products?.length) return `No products found matching "${params.query}".`
        const productList = products.slice(0, 5).map((p: any) => p.name).join(', ')
        const moreText = products.length > 5 ? ` and ${products.length - 5} more` : ''
        return `Found ${products.length} products: ${productList}${moreText}.`
      } catch (e) {
        return 'Sorry, I could not search products. Please try again.'
      }
    }
  }
}

const VoiceInterface: FC = () => {
  const [stats, setStats] = useState<DashboardStats>({ 
    totalProducts: 0, 
    totalInventoryValue: 0, 
    lowStockCount: 0 
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const [widgetLoaded, setWidgetLoaded] = useState(false)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const token = localStorage.getItem('token')
      if (!token) {
        setError({ message: 'Please log in to view dashboard' })
        return
      }
      
      const res = await fetch(`${API_URL}/api/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!res.ok) {
        throw new Error(`Failed to load: ${res.status}`)
      }
      
      const data = await res.json()
      setStats(data)
    } catch (e) {
      console.error('Error fetching stats:', e)
      setError({ 
        message: e instanceof Error ? e.message : 'Failed to load dashboard data'
      })
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
      const actions = createVoiceActions()
      
      event.detail.config.clientTools = {
        get_inventory_summary: actions.get_inventory_summary,
        get_low_stock: actions.get_low_stock,
        check_product_stock: actions.check_product_stock,
        get_products_by_category: actions.get_products_by_category,
        search_products: actions.search_products,
      }
    }

    document.addEventListener('elevenlabs-convai:call', handleCall)

    // Load ElevenLabs script
    if (!document.getElementById('elevenlabs-convai-script')) {
      const script = document.createElement('script')
      script.id = 'elevenlabs-convai-script'
      script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
      script.async = true
      script.onload = () => setWidgetLoaded(true)
      script.onerror = () => console.error('Failed to load ElevenLabs widget')
      document.body.appendChild(script)
    } else {
      setWidgetLoaded(true)
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

  const sampleQuestions = [
    'How much jasmine rice do we have?',
    "What's low on stock?",
    'Show me all sauces',
    'Search for noodles'
  ]

  return (
    <div className="voice-app">
      <header className="app-header">
        <div className="header-title">
          <span className="logo" aria-label="Food">🍜</span>
          <h1>Food Supply AI</h1>
        </div>
        <div className="connection-status online">
          <span className="status-dot" aria-hidden="true" />
          <span>Online</span>
        </div>
      </header>

      <main className="main-content">
        {/* Stats Grid */}
        <section className="stats-grid" aria-label="Dashboard statistics">
          <div className="stat-card">
            <div className="stat-icon-wrapper blue">
              <Package size={24} aria-hidden="true" />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {loading ? <Loader2 className="spinner" size={20} /> : stats.totalProducts}
              </span>
              <span className="stat-label">Products</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon-wrapper green">
              <TrendingUp size={24} aria-hidden="true" />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {loading ? <Loader2 className="spinner" size={20} /> : formatCurrency(stats.totalInventoryValue)}
              </span>
              <span className="stat-label">Inventory Value</span>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon-wrapper orange">
              <AlertTriangle size={24} aria-hidden="true" />
            </div>
            <div className="stat-info">
              <span className="stat-value">
                {loading ? <Loader2 className="spinner" size={20} /> : stats.lowStockCount}
              </span>
              <span className="stat-label">Low Stock</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error.message}</span>
            <button onClick={fetchStats} className="retry-btn">Retry</button>
          </div>
        )}

        {/* Voice Assistant CTA */}
        <section className="voice-cta" aria-label="Voice assistant">
          <div className="voice-cta-content">
            <div className="voice-cta-icon">
              <Mic size={32} aria-hidden="true" />
            </div>
            <h2>Ask About Your Inventory</h2>
            <p>Tap the microphone button to ask questions about stock levels, products, or orders.</p>
          </div>
        </section>

        {/* Sample Questions */}
        <section className="sample-questions" aria-label="Sample questions">
          <h3>Try asking:</h3>
          <div className="question-chips">
            {sampleQuestions.map((q, i) => (
              <button 
                key={i} 
                className="question-chip"
                onClick={() => {/* Could trigger voice with this question */}}
              >
                "{q}"
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* ElevenLabs Widget */}
      <div className="widget-container" aria-label="Voice assistant widget">
        {!widgetLoaded && (
          <div className="widget-loading">
            <Loader2 className="spinner" size={20} />
          </div>
        )}
        <elevenlabs-convai 
          agent-id={ELEVENLABS_AGENT_ID}
          className="elevenlabs-widget"
        />
      </div>
    </div>
  )
}

export default VoiceInterface