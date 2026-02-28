import { FC, useEffect, useState, useCallback } from 'react';
import { Package, AlertTriangle, TrendingUp, Mic, ShoppingBag } from 'lucide-react';
import { API_URL, ELEVENLABS_AGENT_ID } from '../config';
import './VoiceInterface.css';

interface DashboardStats {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockCount: number;
}

const VoiceInterface: FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalInventoryValue: 0,
    lowStockCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // ElevenLabs client tools
  const [elevenlabsStatus, setElevenlabsStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  useEffect(() => {
    const widgetEl = document.querySelector('elevenlabs-convai');
    const eventTarget: EventTarget = widgetEl || document;

    const checkWidgetConnection = () => {
      const widget = document.querySelector('elevenlabs-convai');
      if (widget?.shadowRoot) {
        setElevenlabsStatus('connected');
      }
    };
    const timer = setTimeout(checkWidgetConnection, 5000);

    const handleWidgetReady = () => { setElevenlabsStatus('connected'); };
    const handleWidgetError = () => { setElevenlabsStatus('error'); };
    eventTarget.addEventListener('elevenlabs-convai:ready', handleWidgetReady);
    eventTarget.addEventListener('elevenlabs-convai:error', handleWidgetError);

    const handleCall = (event: Event) => {
      const customEvent = event as CustomEvent;
      const token = localStorage.getItem('token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      const fetchTopSkus = async (
        params: { territory?: string; region?: string; area?: string; days?: number; limit?: number } = {}
      ) => {
        try {
          const territory = params.territory || params.region || params.area || 'Chicago/Midwest';
          const days = params.days || 30;
          const limit = params.limit || 10;
          const res = await fetch(
            `${API_URL}/api/sales/top-skus?territory=${encodeURIComponent(territory)}&days=${days}&limit=${limit}`,
            { headers }
          );
          const data = await res.json();
          const topThree = data.priority_picks.map((p: any, i: number) =>
            `Number ${i + 1}: ${p.name}, ${p.total_qty} units sold, ${p.priority_score === 'restock_needed' ? 'RESTOCK NEEDED' : 'well stocked'}`
          ).join('. ');
          return `Top SKUs in ${territory} over the last ${days} days: ${topThree}.`;
        } catch { return 'Sorry, could not fetch top SKUs.'; }
      };

      const fetchWeeeVsChannels = async () => {
        try {
          const res = await fetch(`${API_URL}/api/dashboard/weee-vs-channels`, { headers });
          if (!res.ok) return null;
          return await res.json();
        } catch {
          return null;
        }
      };

      const actions: Record<string, (params?: any) => Promise<string>> = {
        // Existing tools
        get_inventory_summary: async () => {
          try {
            const res = await fetch(`${API_URL}/api/dashboard/stats`, { headers });
            const data = await res.json();
            const categories = (data.inventoryByCategory || []).slice(0, 2).map((c: any) =>
              `${c.category} (${c.total_quantity})`
            ).join(', ');
            const categoryText = categories ? ` Top categories: ${categories}.` : '';
            return `You have ${data.totalProducts} products with a total inventory value of $${Math.round(data.totalInventoryValue).toLocaleString()}. There are ${data.lowStockCount} items low on stock.${categoryText}`;
          } catch { return 'Sorry, I could not fetch the inventory summary.'; }
        },

        get_low_stock: async () => {
          try {
            const res = await fetch(`${API_URL}/api/dashboard/alerts`, { headers });
            const items = await res.json();
            if (!items?.length) return 'All items are well stocked!';
            const itemList = items.slice(0, 3).map((i: any) => `${i.name} (${i.quantity_on_hand} units)`).join(', ');
            return `Low stock: ${itemList}${items.length > 3 ? ` and ${items.length - 3} more` : ''}.`;
          } catch { return 'Sorry, I could not fetch low stock items.'; }
        },

        check_product_stock: async (params: { product_name?: string } = {}) => {
          try {
            if (!params?.product_name) return 'Please specify a product name.';
            const res = await fetch(`${API_URL}/api/products?search=${encodeURIComponent(params.product_name)}`, { headers });
            const products = await res.json();
            if (!products?.length) return `No product found matching "${params.product_name}".`;
            const p = products[0];
            return `${p.name} has ${p.quantity_on_hand} units in stock.`;
          } catch { return 'Sorry, could not check that product.'; }
        },

        // UC1: Hot items brief
        get_hot_items_brief: async () => {
          try {
            const res = await fetch(`${API_URL}/api/hot-items/today`, { headers });
            const data = await res.json();
            if (!data.hot_items?.length) return 'No hot items data for today.';
            const items = data.hot_items.slice(0, 5).map((h: any) =>
              `Number ${h.rank}: ${h.weee_product_name} (${h.match_type || 'unknown match'})`
            ).join(', ');
            return `Today's top ${data.hot_items.length} hot items on Weee (Sayweee) are: ${items}.`;
          } catch { return 'Sorry, could not fetch hot items.'; }
        },

        // UC2: Match to catalog
        match_hot_items_to_catalog: async () => {
          try {
            const res = await fetch(`${API_URL}/api/hot-items/today`, { headers });
            const data = await res.json();
            const matches = data.hot_items.map((h: any) => {
              const matchType = h.match_type || 'none';
              if (matchType === 'none') return `${h.weee_product_name}: no match`;
              if (matchType === 'exact') return `${h.weee_product_name}: exact match`;
              return `${h.weee_product_name}: ${matchType} match${h.match_notes ? ` (${h.match_notes})` : ''}`;
            }
            ).join('. ');
            return matches;
          } catch { return 'Sorry, could not match hot items.'; }
        },

        // UC3: Talking points
        get_talking_points: async () => {
          try {
            const res = await fetch(`${API_URL}/api/hot-items/today`, { headers });
            const data = await res.json();
            return data.hot_items.map((h: any) =>
              `For ${h.weee_product_name}: ${h.talking_point}`
            ).join(' | ');
          } catch { return 'Sorry, could not fetch talking points.'; }
        },

        // UC4: Cross-sell
        get_cross_sell_recommendations: async () => {
          try {
            const res = await fetch(`${API_URL}/api/hot-items/today`, { headers });
            const data = await res.json();
            const recs = data.hot_items.filter((h: any) => h.cross_sell).map((h: any) =>
              `Pair ${h.our_product?.name} with ${h.cross_sell.product_name}: ${h.cross_sell.reason}`
            ).join('. ');
            return recs || 'No cross-sell recommendations found for today.';
          } catch { return 'Sorry, could not fetch cross-sell recommendations.'; }
        },

        // UC5: Universal pitch
        get_universal_pitch: async () => {
          try {
            const res = await fetch(`${API_URL}/api/hot-items/today`, { headers });
            const data = await res.json();
            const pitches = [...new Set(data.hot_items.map((h: any) => h.universal_pitch).filter(Boolean))] as string[];
            return data.summary_pitch || pitches[0] || 'Focus on trending Asian staples — coconut-based and snack items are surging on Weee and Sayweee right now.';
          } catch { return 'Sorry, could not fetch the pitch.'; }
        },

        // UC6: Top SKUs
        get_top_skus: fetchTopSkus,

        // UC7: Category trends
        get_category_trends: async (params: { customer_id?: number; days?: number } = {}) => {
          try {
            const customerId = params.customer_id || 1;
            const days = params.days || 30;
            const res = await fetch(
              `${API_URL}/api/sales/category-trends?customer_id=${customerId}&days=${days}`,
              { headers }
            );
            const data = await res.json();
            const up = data.trending_up.slice(0, 2).map((c: any) => `${c.category} up ${Math.round(c.trend_pct)}%`).join(', ');
            const down = data.trending_down.slice(0, 1).map((c: any) => `${c.category} down ${Math.round(Math.abs(c.trend_pct))}%`).join(', ');
            const recs = data.recommendations.map((r: any) => r.name).join(', ');
            return `For ${data.customer.name} (last ${days} days): trending up - ${up || 'none'}. Trending down - ${down || 'none'}. Recommended items: ${recs || 'none'}.`;
          } catch { return 'Sorry, could not fetch category trends.'; }
        },

        // UC8: Back-in-stock
        get_back_in_stock_alerts: async (params: { days_lookback?: number } = {}) => {
          try {
            const daysLookback = params.days_lookback || 14;
            const res = await fetch(`${API_URL}/api/sales/back-in-stock-alerts?days_lookback=${daysLookback}`, { headers });
            const data = await res.json();
            if (!data.alerts?.length) return 'No back-in-stock situations detected.';
            return data.alerts.map((alert: any) => {
              const topCustomers = alert.affected_customers.slice(0, 2).map((c: any) =>
                `${c.customer_name} (${c.phone})`
              ).join(' and ');
              return `${alert.product.name} is back in stock with ${alert.product.quantity_on_hand} units. Call ${topCustomers} first.`;
            }).join(' | ');
          } catch { return 'Sorry, could not fetch back-in-stock alerts.'; }
        },

        // Weee reviews
        get_weee_reviews: async (params: { product_id?: number } = {}) => {
          try {
            if (params?.product_id) {
              const res = await fetch(`${API_URL}/api/weee/reviews/${params.product_id}`, { headers });
              const data = await res.json();
              const recent = (data.reviews || []).slice(0, 3).map((r: any) =>
                `${r.reviewer_name} (${r.rating}/5): ${r.comment}`
              ).join('. ');
              return recent
                ? `${data.product.name}: ${recent}`
                : `${data.product.name} has ${data.product.weee_review_count} reviews and a ${data.product.weee_rating} rating.`;
            }
            const res = await fetch(`${API_URL}/api/weee/trends`, { headers });
            const data = await res.json();
            const topRated = (data.top_rated || []).slice(0, 2).map((p: any) => p.name).join(', ');
            const topSelling = (data.top_selling || []).slice(0, 2).map((p: any) => p.name).join(', ');
            return `Weee (Sayweee) trends — top rated: ${topRated || 'none'}. Top selling: ${topSelling || 'none'}.`;
          } catch { return 'Sorry, could not fetch Weee reviews.'; }
        },

        // Weee performance
        get_weee_performance: async () => {
          try {
            const insight = await fetchWeeeVsChannels();
            if (insight) {
              const rising = (insight.trend_tracking?.rising_signals || []).slice(0, 2).map((s: any) =>
                `${s.weee_product_name} (${s.rank_change_4w > 0 ? '+' : ''}${s.rank_change_4w} rank in 4 weeks)`
              ).join(', ');
              const watchlist = (insight.our_weee_performance?.quality_watchlist || []).slice(0, 2).map((q: any) =>
                `${q.name} (${q.negative_review_share_pct}% negative)`
              ).join(', ');
              const opps = (insight.opportunities || []).slice(0, 2).map((o: any) =>
                `${o.our_product_name}: ${o.suggested_action}`
              ).join(', ');
              return `Weee (Sayweee) benchmark uses observed top-seller trends for ${insight.trend_tracking?.weeks_tracked || 0} weeks, not competitor sales volume. This week we mapped ${insight.hot_item_coverage.coverage_pct}% of observed trends to our catalog. Our own Weee listings sold ${insight.our_weee_performance?.units_sold_week || 0} units (${insight.our_weee_performance?.units_wow_pct || 0}% WoW) with ${insight.our_weee_performance?.sentiment?.negative_pct || 0}% negative review share. Rising signals: ${rising || 'none'}. Priority actions: ${opps || 'none yet'}.${watchlist ? ` Quality watchlist: ${watchlist}.` : ''}`;
            }

            const res = await fetch(`${API_URL}/api/weee/our-listings`, { headers });
            const data = await res.json();
            const top = data.listings.slice(0, 5).map((p: any) =>
              `${p.name}: ${p.weee_weekly_sold} sold, ${p.weee_rating} stars`
            ).join(', ');
            return `We have ${data.stats.total_listings} products on Weee (Sayweee). Average rating: ${data.stats.avg_rating}. Total weekly sales: ${data.stats.total_weekly_sold}. Top sellers: ${top}.`;
          } catch { return 'Sorry, could not fetch Weee performance.'; }
        },

        // Weee/Sayweee + channel opportunity insight
        get_weee_channel_opportunities: async () => {
          try {
            const insight = await fetchWeeeVsChannels();
            if (!insight) return 'Sorry, could not fetch Weee channel opportunities.';
            const uncovered = (insight.uncovered_hot_items || []).slice(0, 2).map((i: any) => i.weee_product_name).join(', ');
            const opps = (insight.opportunities || []).slice(0, 3).map((o: any) =>
              `${o.our_product_name}: ${o.suggested_action} (${o.trend_presence_weeks}/${insight.trend_tracking?.weeks_tracked || 0} weeks observed)`
            ).join(' | ');
            return `Weee vs channels opportunity view: ${insight.hot_item_coverage.coverage_pct}% trend coverage, ${insight.hot_item_coverage.stock_ready_pct}% stock-ready mapped trends, and ${insight.hot_item_coverage.unmatched_hot_items} uncovered observed trends this week. Uncovered trends: ${uncovered || 'none'}. Priority actions: ${opps || 'none'}.`;
          } catch { return 'Sorry, could not fetch Weee channel opportunities.'; }
        },
      };

      if (customEvent.detail) {
        customEvent.detail.config = customEvent.detail.config || {};
        customEvent.detail.config.clientTools = actions;
      }
    };

    eventTarget.addEventListener('elevenlabs-convai:call', handleCall);

    return () => {
      clearTimeout(timer);
      eventTarget.removeEventListener('elevenlabs-convai:call', handleCall);
      eventTarget.removeEventListener('elevenlabs-convai:ready', handleWidgetReady);
      eventTarget.removeEventListener('elevenlabs-convai:error', handleWidgetError);
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

        {elevenlabsStatus === 'connecting' && (
          <div className="widget-status connecting">
            <div className="spinner"></div>
            <span>Connecting to voice AI...</span>
          </div>
        )}
        {elevenlabsStatus === 'error' && (
          <div className="widget-status error">
            <p>Voice AI connection failed</p>
            <small>
              The ElevenLabs widget requires the agent to be published.
              <br />
              <a href="https://elevenlabs.io/app/conversational-ai" target="_blank" rel="noopener">
                Check Agent Status
              </a>
            </small>
          </div>
        )}
      </section>

      <main className="voice-content">
        <section className="stats-section">
          <div className="voice-stat-card">
            <div className="voice-stat-icon blue"><Package size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : stats.totalProducts}</span>
            <span className="voice-stat-label">Products</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon green"><TrendingUp size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : formatCurrency(stats.totalInventoryValue)}</span>
            <span className="voice-stat-label">Value</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon orange"><AlertTriangle size={20} /></div>
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
              &quot;What are today&apos;s hot items on Weee?&quot;
            </div>
            <div className="question-hint">
              &quot;Which hot items do we carry?&quot;
            </div>
            <div className="question-hint">
              &quot;Give me talking points for today&quot;
            </div>
            <div className="question-hint">
              &quot;What should I cross-sell with Pocky?&quot;
            </div>
            <div className="question-hint">
              &quot;What&apos;s my universal pitch today?&quot;
            </div>
            <div className="question-hint">
              &quot;Top sellers in Chicago/Midwest last 30 days&quot;
            </div>
            <div className="question-hint">
              &quot;Any back-in-stock items to call about?&quot;
            </div>
            <div className="question-hint">
              &quot;How are we doing on Weee?&quot;
            </div>
            <div className="question-hint">
              &quot;How are we doing on Sayweee vs our channels?&quot;
            </div>
          </div>
        </section>

        <section className="instructions">
          <div className="instruction-item">
            <span className="icon"><Mic size={18} /></span>
            <p>Tap the voice button above to talk with the AI</p>
          </div>
          <div className="instruction-item">
            <span className="icon"><ShoppingBag size={18} /></span>
            <p>Ask about Weee hot items, sales data, or inventory</p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default VoiceInterface;
