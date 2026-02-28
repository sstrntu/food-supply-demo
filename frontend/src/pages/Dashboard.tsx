import { FC, useEffect, useState } from 'react';
import {
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Flame,
  Phone,
  Star,
  ShoppingBag,
  FileText
} from 'lucide-react';
import { API_URL } from '../config';
import './Dashboard.css';

interface DashboardStats {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockCount: number;
  inventoryByCategory: { category: string; total_quantity: number }[];
}

interface SalesSummary {
  total_revenue_30d: number;
  revenue_change_pct: number;
  back_in_stock_alerts: number;
  weee_weekly_sold: number;
  weee_listings: number;
  hot_items_matched: number;
}

interface WeeeChannelInsight {
  period_days: number;
  benchmark_context: {
    method: string;
    note: string;
  };
  weee_observed: {
    trending_items_today: number;
    latest_week_start?: string | null;
    prior_week_start?: string | null;
    top_trending_categories: { category: string; item_count: number }[];
  };
  trend_tracking: {
    weeks_tracked: number;
    latest_week_start: string | null;
    prior_week_start: string | null;
    recurring_signals: {
      weee_product_name: string;
      weee_category: string;
      weeks_seen: number;
      current_rank: number | null;
    }[];
    rising_signals: {
      weee_product_name: string;
      weee_category: string;
      current_rank: number | null;
      rank_change_4w: number;
    }[];
    cooling_signals: {
      weee_product_name: string;
      weee_category: string;
      current_rank: number | null;
      rank_change_4w: number;
    }[];
    new_signals_this_week: {
      weee_product_name: string;
      weee_category: string;
      current_rank: number | null;
      match_type: 'exact' | 'alternative' | 'none';
    }[];
  };
  our_weee_listings: {
    listed_products: number;
    avg_rating: number;
  };
  our_weee_performance: {
    week_start: string | null;
    units_sold_week: number;
    units_wow_pct: number;
    revenue_week: number;
    revenue_wow_pct: number;
    avg_rating_week: number;
    rating_wow_delta: number;
    sentiment: {
      positive_reviews: number;
      neutral_reviews: number;
      negative_reviews: number;
      positive_pct: number;
      neutral_pct: number;
      negative_pct: number;
    };
    top_products: {
      name: string;
      sku: string;
      units_sold_week: number;
      wow_units_pct: number;
      avg_rating_week: number;
      review_count_week: number;
      negative_review_share_pct: number;
    }[];
    quality_watchlist: {
      name: string;
      sku: string;
      units_sold_week: number;
      wow_units_pct: number;
      avg_rating_week: number;
      review_count_week: number;
      negative_review_share_pct: number;
    }[];
  };
  channels: {
    units_30d: number;
    revenue_30d: number;
    active_accounts_30d: number;
  };
  hot_item_coverage: {
    total_hot_items: number;
    matched_hot_items: number;
    exact_match_items: number;
    alternative_match_items: number;
    unmatched_hot_items: number;
    coverage_pct: number;
    stock_ready_matched_items: number;
    stock_risk_matched_items: number;
    stock_ready_pct: number;
    matched_items_sold_30d: number;
  };
  opportunities: {
    trend_rank: number;
    weee_trend_item: string;
    our_product_name: string;
    sku?: string;
    match_type: 'exact' | 'alternative' | 'none';
    our_30d_units: number;
    our_30d_revenue: number;
    account_reach_30d: number;
    quantity_on_hand: number;
    reorder_point: number;
    stock_status: 'ready' | 'risk';
    trend_presence_weeks: number;
    rank_change_4w: number;
    weee_units_week: number;
    weee_units_wow_pct: number;
    negative_review_share_pct: number;
    opportunity_reason: string;
    opportunity_score: number;
    suggested_action: string;
  }[];
  uncovered_hot_items: {
    weee_rank: number;
    weee_product_name: string;
    weee_category: string;
  }[];
  insights: string[];
}

interface Alert {
  id: number;
  name: string;
  category: string;
  sku: string;
  quantity_on_hand: number;
  reorder_point: number;
  shortage: number;
  warehouse_name: string;
}

interface HotItem {
  rank: number;
  weee_product_name: string;
  weee_category: string;
  match_type: 'exact' | 'alternative' | 'none';
  match_notes: string;
  talking_point: string;
  universal_pitch: string;
  our_product: {
    name: string;
    sku: string;
    price: number;
    quantity_on_hand: number;
    weee_rating: number;
    weee_review_count: number;
    weee_weekly_sold: number;
  } | null;
  cross_sell: {
    product_name: string;
    sku: string;
    reason: string;
  } | null;
}

interface HotItemsResponse {
  date: string;
  hot_items: HotItem[];
  summary_pitch: string;
}

interface BackInStockAlert {
  product: { id: number; name: string; sku: string; quantity_on_hand: number };
  affected_customers: {
    customer_id: number;
    customer_name: string;
    territory: string;
    account_manager: string;
    phone: string;
    oos_days: number;
    estimated_lost_revenue: number;
    call_priority: 'high' | 'medium';
  }[];
}

interface Activity {
  type: string;
  customer_name: string;
  territory: string;
  product_name: string;
  quantity_sold: number;
  revenue: number;
  timestamp: string;
}

interface InvoiceItem {
  id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  amount: number;
  balance_due: number;
  status: string;
  assigned_to?: string;
  follow_up_note?: string;
  customer_id: number;
  customer_name: string;
  territory: string;
  account_manager: string;
  phone: string;
  days_overdue?: number;
  days_until_due?: number;
  follow_up_priority?: 'high' | 'medium' | 'normal';
  recommended_action?: string;
}

interface InvoiceOverview {
  due_soon_window_days: number;
  summary: {
    total_invoices: number;
    total_amount: number;
    open_balance: number;
    overdue_balance: number;
    due_soon_balance: number;
    overdue_count: number;
    due_soon_count: number;
    paid_count: number;
  };
  late_payments: InvoiceItem[];
  due_soon: InvoiceItem[];
  follow_up_queue: InvoiceItem[];
}

const Dashboard: FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [weeeChannelInsight, setWeeeChannelInsight] = useState<WeeeChannelInsight | null>(null);
  const [invoiceOverview, setInvoiceOverview] = useState<InvoiceOverview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [hotItems, setHotItems] = useState<HotItemsResponse | null>(null);
  const [backInStock, setBackInStock] = useState<BackInStockAlert[]>([]);
  const [expandedTalkingPoint, setExpandedTalkingPoint] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, alertsRes, activityRes, salesRes, hotItemsRes, bisRes, weeeInsightRes, invoiceRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/alerts`, { headers }),
        fetch(`${API_URL}/api/dashboard/activity?limit=5`, { headers }),
        fetch(`${API_URL}/api/dashboard/sales-summary`, { headers }),
        fetch(`${API_URL}/api/hot-items/today`, { headers }),
        fetch(`${API_URL}/api/sales/back-in-stock-alerts`, { headers }),
        fetch(`${API_URL}/api/dashboard/weee-vs-channels`, { headers }),
        fetch(`${API_URL}/api/sales/invoices/overview?due_soon_days=7&limit=6`, { headers }),
      ]);

      const [statsData, alertsData, activityData, salesData, hotItemsData, bisData, weeeInsightData, invoiceData] = await Promise.all([
        statsRes.ok ? statsRes.json() : null,
        alertsRes.ok ? alertsRes.json() : [],
        activityRes.ok ? activityRes.json() : [],
        salesRes.ok ? salesRes.json() : null,
        hotItemsRes.ok ? hotItemsRes.json() : null,
        bisRes.ok ? bisRes.json() : { alerts: [] },
        weeeInsightRes.ok ? weeeInsightRes.json() : null,
        invoiceRes.ok ? invoiceRes.json() : null,
      ]);

      setStats(statsData);
      setAlerts(alertsData);
      setActivities(activityData);
      setSalesSummary(salesData);
      setHotItems(hotItemsData);
      setBackInStock(bisData.alerts || []);
      setWeeeChannelInsight(weeeInsightData);
      setInvoiceOverview(invoiceData);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value || 0);
  };

  const formatSignedPct = (value: number) => {
    const rounded = Math.round((value || 0) * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  };

  const formatShortDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner-large"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Sales Dashboard</h1>
        <p>U.S. Trading — Asian Food Distribution</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Summary Pitch Banner */}
      {hotItems?.summary_pitch && (
        <div className="pitch-banner">
          <Flame size={18} />
          <span><strong>Today&apos;s Pitch:</strong> {hotItems.summary_pitch}</span>
        </div>
      )}

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Package size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.totalProducts || 0}</div>
            <div className="stat-label">Total Products</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(salesSummary?.total_revenue_30d || 0)}</div>
            <div className="stat-label">Revenue (30d)
              {salesSummary && salesSummary.revenue_change_pct !== 0 && (
                <span className={`trend-badge ${salesSummary.revenue_change_pct > 0 ? 'up' : 'down'}`}>
                  {salesSummary.revenue_change_pct > 0 ? '+' : ''}{salesSummary.revenue_change_pct}%
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.lowStockCount || 0}</div>
            <div className="stat-label">Low Stock Items</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{weeeChannelInsight?.our_weee_listings.listed_products || salesSummary?.weee_listings || 0}</div>
            <div className="stat-label">Our Weee Listings</div>
          </div>
        </div>
      </div>

      {/* Weee vs Channel Insight */}
      {weeeChannelInsight && (
        <div className="dashboard-card weee-vs-card">
          <div className="card-header">
            <h2>
              <ShoppingBag size={20} />
              Weee (Sayweee) vs Our Sales Channels
            </h2>
            <span className="badge badge-fire">{weeeChannelInsight.hot_item_coverage.coverage_pct}% hot-item coverage</span>
          </div>
          <div className="card-body">
            <div className="weee-vs-metrics">
              <div className="weee-vs-metric">
                <span className="weee-vs-label">Our Weee Units (Week)</span>
                <strong>{weeeChannelInsight.our_weee_performance.units_sold_week}</strong>
                <div className="weee-vs-subtext">{formatSignedPct(weeeChannelInsight.our_weee_performance.units_wow_pct)} vs prior week</div>
              </div>
              <div className="weee-vs-metric">
                <span className="weee-vs-label">Our Weee Revenue (Week)</span>
                <strong>{formatCurrency(weeeChannelInsight.our_weee_performance.revenue_week)}</strong>
                <div className="weee-vs-subtext">{formatSignedPct(weeeChannelInsight.our_weee_performance.revenue_wow_pct)} vs prior week</div>
              </div>
              <div className="weee-vs-metric">
                <span className="weee-vs-label">Avg Rating (Week)</span>
                <strong>{weeeChannelInsight.our_weee_performance.avg_rating_week.toFixed(2)}</strong>
                <div className="weee-vs-subtext">
                  {weeeChannelInsight.our_weee_performance.rating_wow_delta > 0 ? '+' : ''}
                  {weeeChannelInsight.our_weee_performance.rating_wow_delta.toFixed(2)} points vs prior week
                </div>
              </div>
              <div className="weee-vs-metric">
                <span className="weee-vs-label">Negative Review Share</span>
                <strong>{weeeChannelInsight.our_weee_performance.sentiment.negative_pct}%</strong>
                <div className="weee-vs-subtext">{weeeChannelInsight.our_weee_performance.sentiment.negative_reviews} negative reviews this week</div>
              </div>
            </div>

            <div className="weee-benchmark-note">{weeeChannelInsight.benchmark_context.note}</div>

            <div className="weee-top-categories">
              <strong>Latest tracked week:</strong>{' '}
              {weeeChannelInsight.trend_tracking.latest_week_start || 'N/A'}
              {' '}| <strong>Observed top sellers:</strong>{' '}
              {weeeChannelInsight.weee_observed.trending_items_today}
              {' '}| <strong>Stock-ready mapped trends:</strong>{' '}
              {weeeChannelInsight.hot_item_coverage.stock_ready_matched_items}
            </div>

            {weeeChannelInsight.weee_observed.top_trending_categories.length > 0 && (
              <div className="weee-top-categories">
                <strong>Top observed Weee categories:</strong>{' '}
                {weeeChannelInsight.weee_observed.top_trending_categories
                  .map((c) => `${c.category} (${c.item_count})`)
                  .join(', ')}
              </div>
            )}

            {weeeChannelInsight.trend_tracking.rising_signals.length > 0 && (
              <div className="weee-opportunities">
                <h3>Rising Weee Signals (4-week rank movement)</h3>
                {weeeChannelInsight.trend_tracking.rising_signals.slice(0, 3).map((signal) => (
                  <div key={`${signal.weee_product_name}-${signal.current_rank}`} className="weee-opportunity-item">
                    <div className="weee-opportunity-title">
                      #{signal.current_rank || '-'} {signal.weee_product_name}
                    </div>
                    <div className="weee-opportunity-meta">
                      {signal.weee_category} | Rank change (4w): {signal.rank_change_4w > 0 ? `+${signal.rank_change_4w}` : signal.rank_change_4w}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {weeeChannelInsight.our_weee_performance.quality_watchlist.length > 0 && (
              <div className="weee-opportunities">
                <h3>Our Weee Quality Watchlist</h3>
                {weeeChannelInsight.our_weee_performance.quality_watchlist.map((item) => (
                  <div key={`${item.sku}-watchlist`} className="weee-opportunity-item">
                    <div className="weee-opportunity-title">
                      {item.name} ({item.sku})
                    </div>
                    <div className="weee-opportunity-meta">
                      Avg rating: {item.avg_rating_week.toFixed(2)} | Negative share: {item.negative_review_share_pct}% | Units: {item.units_sold_week}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {weeeChannelInsight.opportunities.length > 0 && (
              <div className="weee-opportunities">
                <h3>Best Items To Push This Week</h3>
                {weeeChannelInsight.opportunities.slice(0, 3).map((item) => (
                  <div key={`${item.sku || item.our_product_name}-${item.trend_rank}`} className="weee-opportunity-item">
                    <div className="weee-opportunity-title">
                      Weee trend #{item.trend_rank}: {item.weee_trend_item}
                    </div>
                    <div className="weee-opportunity-subtitle">
                      Our matching product: <strong>{item.our_product_name}</strong>
                    </div>

                    <div className="weee-opportunity-summary">
                      Why it matters: Seen in {item.trend_presence_weeks} of the last {weeeChannelInsight.trend_tracking.weeks_tracked} weeks
                      {item.rank_change_4w > 0 ? ` and moving up (+${item.rank_change_4w} in 4 weeks)` : ''}
                      {item.rank_change_4w < 0 ? ` and cooling down (${item.rank_change_4w} in 4 weeks)` : ''}.
                    </div>

                    <div className="weee-opportunity-summary">
                      Sales gap: {item.our_30d_units === 0
                        ? 'No sales in our other channels in the last 30 days.'
                        : `${item.our_30d_units} units sold in our other channels in the last 30 days.`}
                      {' '}
                      {item.account_reach_30d <= 2
                        ? `Only ${item.account_reach_30d} account${item.account_reach_30d === 1 ? '' : 's'} reached so far.`
                        : `${item.account_reach_30d} accounts reached.`}
                    </div>

                    <div className="weee-opportunity-summary">
                      On Weee this week: {item.weee_units_week} units ({formatSignedPct(item.weee_units_wow_pct)} vs last week).
                      {' '}
                      Review risk: {item.negative_review_share_pct}% negative.
                      {' '}
                      Stock: {item.stock_status === 'ready' ? 'Ready to sell' : 'Restock needed'}.
                    </div>

                    <div className="weee-opportunity-action">
                      <strong>Rep action:</strong> {item.suggested_action}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {weeeChannelInsight.insights.length > 0 && (
              <div className="weee-insight-list">
                {weeeChannelInsight.insights.slice(0, 3).map((insight, idx) => (
                  <div key={idx} className="weee-insight-item">{insight}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hot Items Card */}
      {hotItems && hotItems.hot_items.length > 0 && (
        <div className="dashboard-card hot-items-card">
          <div className="card-header">
            <h2>
              <Flame size={20} />
              Today&apos;s Weee Hot Items
            </h2>
            <span className="badge badge-fire">{hotItems.hot_items.length} trending</span>
          </div>
          <div className="card-body">
            <div className="hot-items-list">
              {hotItems.hot_items.map((item) => (
                <div key={item.rank} className="hot-item-row">
                  <div className="hot-item-rank">#{item.rank}</div>
                  <div className="hot-item-info">
                    <div className="hot-item-name">{item.weee_product_name}</div>
                    <div className="hot-item-category">{item.weee_category}</div>
                    {item.our_product && (
                      <div className="hot-item-match-detail">
                        Our: {item.our_product.name} ({item.our_product.sku}) — {item.our_product.quantity_on_hand} in stock
                        {item.our_product.weee_rating && (
                          <span className="weee-rating">
                            <Star size={12} /> {item.our_product.weee_rating} ({item.our_product.weee_review_count} reviews)
                          </span>
                        )}
                      </div>
                    )}
                    {item.cross_sell && (
                      <div className="hot-item-cross-sell">
                        Cross-sell: {item.cross_sell.product_name} — {item.cross_sell.reason}
                      </div>
                    )}
                    {expandedTalkingPoint === item.rank && item.talking_point && (
                      <div className="hot-item-talking-point">
                        {item.talking_point}
                      </div>
                    )}
                  </div>
                  <div className="hot-item-actions">
                    <span className={`match-chip ${item.match_type}`}>
                      {item.match_type === 'exact' ? 'Exact Match' :
                       item.match_type === 'alternative' ? 'Alternative' : 'No Match'}
                    </span>
                    {item.talking_point && (
                      <button
                        className="talking-point-btn"
                        onClick={() => setExpandedTalkingPoint(
                          expandedTalkingPoint === item.rank ? null : item.rank
                        )}
                      >
                        {expandedTalkingPoint === item.rank ? 'Hide' : 'Talking Point'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Back-in-Stock Call List */}
        {backInStock.length > 0 && (
          <div className="dashboard-card bis-card">
            <div className="card-header">
              <h2>
                <Phone size={20} />
                Back-in-Stock Call List
              </h2>
              <span className="badge badge-danger">{backInStock.length} products</span>
            </div>
            <div className="card-body">
              <div className="bis-list">
                {backInStock.map((alert) => (
                  <div key={alert.product.id} className="bis-item">
                    <div className="bis-product">
                      <strong>{alert.product.name}</strong> ({alert.product.sku})
                      <span className="bis-stock"> — {alert.product.quantity_on_hand} units back in stock</span>
                    </div>
                    <div className="bis-customers">
                      {alert.affected_customers.slice(0, 3).map((c, idx) => (
                        <div key={idx} className={`bis-customer ${c.call_priority}`}>
                          <span className="bis-customer-name">{c.customer_name}</span>
                          <span className="bis-customer-phone">{c.phone}</span>
                          <span className="bis-customer-territory">{c.territory}</span>
                          <span className={`bis-priority ${c.call_priority}`}>
                            {c.call_priority === 'high' ? 'CALL NOW' : 'Follow up'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Low Stock Alerts */}
        <div className="dashboard-card alerts-card">
          <div className="card-header">
            <h2>
              <AlertTriangle size={20} />
              Low Stock Alerts
            </h2>
            <span className="badge badge-danger">{alerts.length} items</span>
          </div>
          <div className="card-body">
            <div className="alerts-list">
              {alerts.length === 0 ? (
                <div className="empty-state">
                  <TrendingUp size={40} />
                  <p>All items are well stocked!</p>
                </div>
              ) : (
                alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="alert-item">
                    <div className="alert-details">
                      <div className="alert-name">{alert.name}</div>
                      <div className="alert-meta">{alert.category} &bull; {alert.warehouse_name}</div>
                    </div>
                    <div className="alert-stock">
                      <div className="alert-stock-value">{alert.quantity_on_hand}</div>
                      <div className="alert-stock-label">of {alert.reorder_point} min</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {alerts.length > 5 && (
              <button className="view-all-link">
                View all alerts <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dashboard-card activity-card">
          <div className="card-header">
            <h2>
              <TrendingUp size={20} />
              Recent Sales
            </h2>
          </div>
          <div className="card-body">
            <div className="activity-list">
              {activities.length === 0 ? (
                <div className="empty-state">
                  <ShoppingBag size={40} />
                  <p>No recent activity</p>
                </div>
              ) : (
                activities.map((activity, idx) => (
                  <div key={idx} className="activity-item">
                    <div className="activity-details">
                      <div className="activity-title">{activity.product_name}</div>
                      <div className="activity-time">{activity.customer_name} &bull; {activity.territory}</div>
                    </div>
                    <div className="activity-amount">
                      <div className="activity-qty">{activity.quantity_sold} units</div>
                      <div className="activity-price">{formatCurrency(activity.revenue)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {invoiceOverview && (
        <>
          <div className="dashboard-grid invoice-summary-grid">
            <div className="dashboard-card invoice-summary-card">
              <div className="card-header">
                <h2>
                  <FileText size={20} />
                  Invoice Snapshot
                </h2>
              </div>
              <div className="card-body">
                <div className="invoice-metrics-grid">
                  <div className="invoice-metric">
                    <span className="invoice-metric-label">Open Balance</span>
                    <strong>{formatCurrency(invoiceOverview.summary.open_balance)}</strong>
                  </div>
                  <div className="invoice-metric">
                    <span className="invoice-metric-label">Overdue Balance</span>
                    <strong>{formatCurrency(invoiceOverview.summary.overdue_balance)}</strong>
                  </div>
                  <div className="invoice-metric">
                    <span className="invoice-metric-label">Due in {invoiceOverview.due_soon_window_days} Days</span>
                    <strong>{formatCurrency(invoiceOverview.summary.due_soon_balance)}</strong>
                  </div>
                  <div className="invoice-metric">
                    <span className="invoice-metric-label">Paid Invoices</span>
                    <strong>{invoiceOverview.summary.paid_count}</strong>
                  </div>
                </div>

                <div className="invoice-chip-row">
                  <span className="invoice-chip danger">{invoiceOverview.summary.overdue_count} late</span>
                  <span className="invoice-chip warning">{invoiceOverview.summary.due_soon_count} due soon</span>
                  <span className="invoice-chip neutral">{invoiceOverview.summary.total_invoices} total invoices</span>
                </div>
              </div>
            </div>

            <div className="dashboard-card invoice-followup-card">
              <div className="card-header">
                <h2>
                  <Phone size={20} />
                  Invoice Follow-Up Queue
                </h2>
              </div>
              <div className="card-body">
                <div className="invoice-list">
                  {invoiceOverview.follow_up_queue.length === 0 ? (
                    <div className="empty-state">
                      <TrendingUp size={40} />
                      <p>No follow-ups right now</p>
                    </div>
                  ) : (
                    invoiceOverview.follow_up_queue.slice(0, 6).map((item) => (
                      <div key={`followup-${item.id}`} className="invoice-item-row">
                        <div className="invoice-item-main">
                          <div className="invoice-item-title">
                            {item.customer_name} &bull; {item.invoice_number}
                          </div>
                          <div className="invoice-item-meta">
                            {item.days_overdue !== undefined
                              ? `${item.days_overdue} day${item.days_overdue === 1 ? '' : 's'} overdue`
                              : `Due in ${item.days_until_due || 0} day${(item.days_until_due || 0) === 1 ? '' : 's'}`}
                            {' '} &bull; Balance {formatCurrency(item.balance_due)}
                            {' '} &bull; {item.territory}
                          </div>
                          <div className="invoice-item-note">
                            {item.recommended_action || item.follow_up_note || 'Follow up with customer accounts payable contact.'}
                          </div>
                        </div>
                        <span className={`invoice-priority ${item.follow_up_priority || 'normal'}`}>
                          {(item.follow_up_priority || 'normal').toUpperCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid invoice-buckets-grid">
            <div className="dashboard-card invoice-late-card">
              <div className="card-header">
                <h2>
                  <AlertTriangle size={20} />
                  Late Payments
                </h2>
                <span className="badge badge-danger">{invoiceOverview.late_payments.length}</span>
              </div>
              <div className="card-body">
                <div className="invoice-list">
                  {invoiceOverview.late_payments.length === 0 ? (
                    <div className="empty-state">
                      <TrendingUp size={40} />
                      <p>No late payments</p>
                    </div>
                  ) : (
                    invoiceOverview.late_payments.map((item) => (
                      <div key={`late-${item.id}`} className="invoice-item-row compact">
                        <div className="invoice-item-main">
                          <div className="invoice-item-title">{item.customer_name}</div>
                          <div className="invoice-item-meta">
                            {item.invoice_number} &bull; Due {formatShortDate(item.due_date)} &bull; {item.days_overdue || 0}d late
                          </div>
                        </div>
                        <div className="invoice-amount">{formatCurrency(item.balance_due)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="dashboard-card invoice-due-card">
              <div className="card-header">
                <h2>
                  <DollarSign size={20} />
                  Due Soon
                </h2>
                <span className="badge badge-warning">{invoiceOverview.due_soon.length}</span>
              </div>
              <div className="card-body">
                <div className="invoice-list">
                  {invoiceOverview.due_soon.length === 0 ? (
                    <div className="empty-state">
                      <TrendingUp size={40} />
                      <p>No upcoming due invoices</p>
                    </div>
                  ) : (
                    invoiceOverview.due_soon.map((item) => (
                      <div key={`due-${item.id}`} className="invoice-item-row compact">
                        <div className="invoice-item-main">
                          <div className="invoice-item-title">{item.customer_name}</div>
                          <div className="invoice-item-meta">
                            {item.invoice_number} &bull; Due {formatShortDate(item.due_date)} &bull; in {item.days_until_due || 0}d
                          </div>
                        </div>
                        <div className="invoice-amount">{formatCurrency(item.balance_due)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Inventory by Category */}
      {stats?.inventoryByCategory && stats.inventoryByCategory.length > 0 && (
        <div className="dashboard-card categories-card">
          <div className="card-header">
            <h2>Inventory by Category</h2>
          </div>
          <div className="card-body">
            <div className="categories-grid">
              {stats.inventoryByCategory.map((cat) => (
                <div key={cat.category} className="category-item">
                  <div className="category-info">
                    <div className="category-name">{cat.category}</div>
                  </div>
                  <div className="category-bar-wrapper">
                    <div className="category-bar">
                      <div
                        className="category-fill"
                        style={{
                          width: `${Math.min(100, (cat.total_quantity / Math.max(...stats.inventoryByCategory.map(c => c.total_quantity))) * 100)}%`
                        }}
                      ></div>
                    </div>
                    <span className="category-value">{cat.total_quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
