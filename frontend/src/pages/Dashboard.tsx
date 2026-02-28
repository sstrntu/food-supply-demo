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
  ShoppingBag
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

const Dashboard: FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
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

      const [statsRes, alertsRes, activityRes, salesRes, hotItemsRes, bisRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/alerts`, { headers }),
        fetch(`${API_URL}/api/dashboard/activity?limit=5`, { headers }),
        fetch(`${API_URL}/api/dashboard/sales-summary`, { headers }),
        fetch(`${API_URL}/api/hot-items/today`, { headers }),
        fetch(`${API_URL}/api/sales/back-in-stock-alerts`, { headers }),
      ]);

      const [statsData, alertsData, activityData, salesData, hotItemsData, bisData] = await Promise.all([
        statsRes.ok ? statsRes.json() : null,
        alertsRes.ok ? alertsRes.json() : [],
        activityRes.ok ? activityRes.json() : [],
        salesRes.ok ? salesRes.json() : null,
        hotItemsRes.ok ? hotItemsRes.json() : null,
        bisRes.ok ? bisRes.json() : { alerts: [] },
      ]);

      setStats(statsData);
      setAlerts(alertsData);
      setActivities(activityData);
      setSalesSummary(salesData);
      setHotItems(hotItemsData);
      setBackInStock(bisData.alerts || []);
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
            <div className="stat-value">{salesSummary?.weee_weekly_sold || 0}</div>
            <div className="stat-label">Weee Sales (Week)</div>
          </div>
        </div>
      </div>

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
