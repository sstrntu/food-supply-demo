import { FC, useEffect, useState, useCallback, ReactNode } from 'react';
import { DollarSign, AlertTriangle, Flame, PhoneCall, Mic, ShoppingBag } from 'lucide-react';
import { API_URL, ELEVENLABS_AGENT_ID } from '../config';
import './VoiceInterface.css';

interface KeyInsights {
  revenue30d: number;
  revenueChangePct: number;
  lowStockCount: number;
  hotItemsMatched: number;
  backInStockAlerts: number;
}

const VoiceInterface: FC = () => {
  const [insights, setInsights] = useState<KeyInsights>({
    revenue30d: 0,
    revenueChangePct: 0,
    lowStockCount: 0,
    hotItemsMatched: 0,
    backInStockAlerts: 0,
  });
  const [keyItems, setKeyItems] = useState<ReactNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, salesRes, alertsRes, hotRes, weeeRes, invoiceRes, bisRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/sales-summary`, { headers }),
        fetch(`${API_URL}/api/dashboard/alerts`, { headers }),
        fetch(`${API_URL}/api/hot-items/today`, { headers }),
        fetch(`${API_URL}/api/dashboard/weee-vs-channels`, { headers }),
        fetch(`${API_URL}/api/sales/invoices/overview?due_soon_days=7&limit=3`, { headers }),
        fetch(`${API_URL}/api/sales/back-in-stock-alerts`, { headers }),
      ]);

      const statsData = statsRes.ok ? await statsRes.json() : {};
      const salesData = salesRes.ok ? await salesRes.json() : {};
      const alertsData = alertsRes.ok ? await alertsRes.json() : [];
      const hotData = hotRes.ok ? await hotRes.json() : {};
      const weeeData = weeeRes.ok ? await weeeRes.json() : null;
      const invoiceData = invoiceRes.ok ? await invoiceRes.json() : null;
      const bisData = bisRes.ok ? await bisRes.json() : { alerts: [] };

      setInsights({
        revenue30d: salesData.total_revenue_30d || 0,
        revenueChangePct: salesData.revenue_change_pct || 0,
        lowStockCount: statsData.lowStockCount || 0,
        hotItemsMatched: salesData.hot_items_matched || 0,
        backInStockAlerts: salesData.back_in_stock_alerts || 0,
      });

      // Build key items bullets (most actionable first)
      const items: ReactNode[] = [];
      const fmtUSD = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

      // Today's pitch
      if (hotData.summary_pitch) {
        items.push(<><strong>Today's pitch:</strong> {hotData.summary_pitch}</>);
      }

      // Revenue trend
      const pct = salesData.revenue_change_pct || 0;
      if (pct > 0) items.push(<><strong>Revenue up {pct}%</strong> vs prior 30 days</>);
      else if (pct < 0) items.push(<><strong>Revenue down {Math.abs(pct)}%</strong> vs prior 30 days</>);

      // Low stock names
      if (alertsData.length > 0) {
        const names = alertsData.slice(0, 3).map((a: any) => a.name);
        items.push(<><strong>Low stock:</strong> {names.join(', ')}{alertsData.length > 3 ? ` +${alertsData.length - 3} more` : ''}</>);
      }

      // Back-in-stock with lost revenue
      const bisAlerts = bisData.alerts || [];
      if (bisAlerts.length > 0) {
        const totalLostRevenue = bisAlerts.reduce((sum: number, a: any) =>
          sum + a.affected_customers.reduce((s: number, c: any) => s + (c.estimated_lost_revenue || 0), 0), 0);
        const highPriority = bisAlerts.reduce((count: number, a: any) =>
          count + a.affected_customers.filter((c: any) => c.call_priority === 'high').length, 0);
        items.push(<><strong>Back in stock:</strong> {bisAlerts.length} product{bisAlerts.length > 1 ? 's' : ''} — <strong>{fmtUSD(totalLostRevenue)}</strong> lost revenue to recover{highPriority > 0 ? <>, <strong>{highPriority} high-priority calls</strong></> : ''}</>);
      }

      // Hot items on Weee
      const hotItems = hotData.hot_items || [];
      if (hotItems.length > 0) {
        const matched = hotItems.filter((h: any) => h.match_type && h.match_type !== 'none');
        if (matched.length > 0) {
          const topNames = matched.slice(0, 2).map((h: any) => h.our_product?.name || h.weee_product_name);
          items.push(<><strong>Weee hot items:</strong> we carry {matched.length} — {topNames.join(', ')}</>);
        } else {
          items.push(<><strong>Weee hot items:</strong> {hotItems.length} trending today</>);
        }
      }

      // New Weee signals this week
      if (weeeData?.trend_tracking?.new_signals_this_week?.length > 0) {
        const newItems = weeeData.trend_tracking.new_signals_this_week;
        const matchedNew = newItems.filter((s: any) => s.match_type !== 'none');
        if (matchedNew.length > 0) {
          const names = matchedNew.slice(0, 2).map((s: any) => s.weee_product_name).join(', ');
          items.push(<><strong>New on Weee:</strong> {names} — we carry {matchedNew.length === 1 ? 'it' : 'them'}</>);
        } else {
          const names = newItems.slice(0, 2).map((s: any) => s.weee_product_name).join(', ');
          items.push(<><strong>New on Weee:</strong> {names}</>);
        }
      }

      // Weee rising signals
      if (weeeData?.trend_tracking?.rising_signals?.length > 0) {
        const rising = weeeData.trend_tracking.rising_signals.slice(0, 2);
        const names = rising.map((s: any) => s.weee_product_name).join(', ');
        items.push(<><strong>Rising on Weee:</strong> {names}</>);
      }

      // Proven recurring trends
      if (weeeData?.trend_tracking?.recurring_signals?.length > 0) {
        const recurring = weeeData.trend_tracking.recurring_signals.slice(0, 2);
        const names = recurring.map((s: any) => `${s.weee_product_name} (${s.weeks_seen} wks)`).join(', ');
        items.push(<><strong>Proven sellers:</strong> {names}</>);
      }

      // Channel performance
      if (weeeData?.channels) {
        const { active_accounts_30d, units_30d } = weeeData.channels;
        if (active_accounts_30d > 0) {
          items.push(<><strong>Our channels:</strong> {active_accounts_30d} active accounts, {units_30d.toLocaleString()} units in 30 days</>);
        }
      }

      // Weee best items to push
      if (weeeData?.opportunities?.length > 0) {
        const top = weeeData.opportunities[0];
        items.push(<><strong>Top opportunity:</strong> push <em>{top.our_product_name}</em> — {top.suggested_action}</>);
      }

      // Weee quality watchlist
      if (weeeData?.our_weee_performance?.quality_watchlist?.length > 0) {
        const watchNames = weeeData.our_weee_performance.quality_watchlist
          .slice(0, 2).map((q: any) => q.name).join(', ');
        items.push(<><strong>Quality alert:</strong> {watchNames} — review feedback</>);
      }

      // Invoice overdue
      if (invoiceData?.summary) {
        const { overdue_count, overdue_balance, due_soon_count, due_soon_balance } = invoiceData.summary;
        if (overdue_count > 0) {
          items.push(<><strong>Overdue:</strong> {overdue_count} invoice{overdue_count > 1 ? 's' : ''} totaling <strong>{fmtUSD(overdue_balance)}</strong></>);
        }
        if (due_soon_count > 0) {
          items.push(<><strong>Due soon:</strong> {due_soon_count} invoice{due_soon_count > 1 ? 's' : ''} within 7 days ({fmtUSD(due_soon_balance)})</>);
        }
      }

      setKeyItems(items.slice(0, 10));
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
            <div className="voice-stat-icon green"><DollarSign size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : formatCurrency(insights.revenue30d)}</span>
            <span className="voice-stat-label">
              Revenue 30d
              {!loading && insights.revenueChangePct !== 0 && (
                <span className={`voice-trend ${insights.revenueChangePct > 0 ? 'up' : 'down'}`}>
                  {insights.revenueChangePct > 0 ? '+' : ''}{insights.revenueChangePct}%
                </span>
              )}
            </span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon orange"><AlertTriangle size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.lowStockCount}</span>
            <span className="voice-stat-label">Low Stock</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon purple"><Flame size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.hotItemsMatched}</span>
            <span className="voice-stat-label">Hot Matches</span>
          </div>
          <div className="voice-stat-card">
            <div className="voice-stat-icon blue"><PhoneCall size={20} /></div>
            <span className="voice-stat-value">{loading ? '...' : insights.backInStockAlerts}</span>
            <span className="voice-stat-label">Call Alerts</span>
          </div>
        </section>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={fetchStats} className="retry-btn">Retry</button>
          </div>
        )}

        {!loading && keyItems.length > 0 && (
          <section className="key-items">
            <h3>Key Items</h3>
            <ul>
              {keyItems.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
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
