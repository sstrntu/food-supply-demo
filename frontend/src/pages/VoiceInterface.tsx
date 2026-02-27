import { FC, useEffect, useState, useCallback, useRef } from 'react';
import { Package, AlertTriangle, TrendingUp, Mic, Send } from 'lucide-react';
import { API_URL, ELEVENLABS_AGENT_ID } from '../config';
import './VoiceInterface.css';

interface DashboardStats {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockCount: number;
}

interface Message {
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

const VoiceInterface: FC = () => {
  const [stats, setStats] = useState<DashboardStats>({ 
    totalProducts: 0, 
    totalInventoryValue: 0, 
    lowStockCount: 0 
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fallback chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // WebSocket connection for fallback voice/text chat
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/voice`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setMessages(prev => [...prev, { 
        type: 'ai', 
        text: "Connected! I'm your inventory assistant. How can I help you?",
        timestamp: new Date()
      }]);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'response' || data.type === 'connected') {
          setMessages(prev => [...prev, {
            type: 'ai',
            text: data.text || data.message,
            timestamp: new Date()
          }]);
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    };
    
    ws.onerror = () => {
      setIsConnected(false);
    };
    
    ws.onclose = () => {
      setIsConnected(false);
    };
    
    wsRef.current = ws;
    
    return () => {
      ws.close();
    };
  }, []);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current) return;
    
    setMessages(prev => [...prev, {
      type: 'user',
      text: inputText,
      timestamp: new Date()
    }]);
    
    wsRef.current.send(JSON.stringify({
      type: 'text',
      text: inputText
    }));
    
    setInputText('');
  };
  
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendMessage();
  };

  // Setup ElevenLabs client tools and connection monitoring
  const [elevenlabsStatus, setElevenlabsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  
  useEffect(() => {
    // Monitor ElevenLabs widget connection
    const checkWidgetConnection = () => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget) {
        // Check if widget has shadow DOM and is loaded
        const shadow = widget.shadowRoot;
        if (shadow) {
          setElevenlabsStatus('connected');
        }
      }
    };

    // Check after a delay
    const timer = setTimeout(checkWidgetConnection, 5000);
    
    // Also check on widget events
    const handleWidgetReady = () => {
      setElevenlabsStatus('connected');
    };
    
    const handleWidgetError = () => {
      setElevenlabsStatus('error');
    };

    document.addEventListener('elevenlabs-convai:ready', handleWidgetReady);
    document.addEventListener('elevenlabs-convai:error', handleWidgetError);

    const handleCall = (event: Event) => {
      const customEvent = event as CustomEvent;
      const actions: Record<string, () => Promise<string>> = {
        get_inventory_summary: async () => {
          try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/dashboard/stats`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return `You have ${data.totalProducts} products with a total inventory value of $${Math.round(data.totalInventoryValue).toLocaleString()}. There are ${data.lowStockCount} items low on stock.`;
          } catch {
            return 'Sorry, I could not fetch the inventory summary.';
          }
        },
        get_low_stock: async () => {
          try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/inventory/low-stock`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const items = await res.json();
            if (!items?.length) return 'All items are well stocked!';
            const itemList = items.slice(0, 3).map((i: { product_name: string; quantity_on_hand: number }) => 
              `${i.product_name} (${i.quantity_on_hand} units)`
            ).join(', ');
            return `Low stock: ${itemList}${items.length > 3 ? ` and ${items.length - 3} more` : ''}.`;
          } catch {
            return 'Sorry, I could not fetch low stock items.';
          }
        },
        check_product_stock: async (params: { product_name?: string } = {}) => {
          try {
            if (!params?.product_name) return 'Please specify a product name.';
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/products?search=${encodeURIComponent(params.product_name)}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const products = await res.json();
            if (!products?.length) return `No product found matching "${params.product_name}".`;
            const p = products[0];
            return `${p.name} has ${p.quantity_on_hand} units in stock.`;
          } catch {
            return 'Sorry, could not check that product.';
          }
        }
      };
      
      if (customEvent.detail) {
        customEvent.detail.config = customEvent.detail.config || {};
        customEvent.detail.config.clientTools = actions;
      }
    };

    document.addEventListener('elevenlabs-convai:call', handleCall);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('elevenlabs-convai:call', handleCall);
      document.removeEventListener('elevenlabs-convai:ready', handleWidgetReady);
      document.removeEventListener('elevenlabs-convai:error', handleWidgetError);
    };
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  return (
    <div className="voice-app">
      <section className="voice-section">
        <elevenlabs-convai agent-id={ELEVENLABS_AGENT_ID}></elevenlabs-convai>
        
        {/* ElevenLabs Connection Status */}
        {elevenlabsStatus === 'connecting' && (
          <div className="widget-status connecting">
            <div className="spinner"></div>
            <span>Connecting to voice AI...</span>
          </div>
        )}
        {elevenlabsStatus === 'error' && (
          <div className="widget-status error">
            <p>⚠️ Voice AI connection failed</p>
            <small>
              The ElevenLabs widget requires the agent to be published in the dashboard.
              <br />
              <a href="https://elevenlabs.io/app/conversational-ai" target="_blank" rel="noopener">
                Check Agent Status →
              </a>
            </small>
          </div>
        )}
      </section>
      

      <main className="voice-content">
        <section className="stats-section">
          <div className="voice-stat-card">
            <div className="voice-stat-icon blue">
              <Package size={20} />
            </div>
            <span className="voice-stat-value">{loading ? '...' : stats.totalProducts}</span>
            <span className="voice-stat-label">Products</span>
          </div>

          <div className="voice-stat-card">
            <div className="voice-stat-icon green">
              <TrendingUp size={20} />
            </div>
            <span className="voice-stat-value">{loading ? '...' : formatCurrency(stats.totalInventoryValue)}</span>
            <span className="voice-stat-label">Value</span>
          </div>

          <div className="voice-stat-card">
            <div className="voice-stat-icon orange">
              <AlertTriangle size={20} />
            </div>
            <span className="voice-stat-value">{loading ? '...' : stats.lowStockCount}</span>
            <span className="voice-stat-label">Low Stock</span>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={fetchStats} className="retry-btn">Retry</button>
          </div>
        )}

        <section className="quick-questions">
          <h3>Try Asking</h3>
          <div className="question-list">
            <div className="question-hint">
              🍚 &quot;How much rice do we have?&quot;
            </div>
            <div className="question-hint">
              ⚠️ &quot;What&apos;s low on stock?&quot;
            </div>
            <div className="question-hint">
              🍜 &quot;Show me all sauces&quot;
            </div>
            <div className="question-hint">
              💰 &quot;What&apos;s our inventory value?&quot;
            </div>
          </div>
        </section>

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
  );
};

export default VoiceInterface;
