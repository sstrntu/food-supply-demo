import { FC, useEffect, useState } from 'react';
import { 
  Package, 
  AlertTriangle, 
  DollarSign, 
  ShoppingCart,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { API_URL } from '../config';
import './Dashboard.css';

interface DashboardStats {
  totalProducts: number;
  totalInventoryValue: number;
  lowStockCount: number;
  totalOrders: number;
  ordersByStatus: { status: string; count: number }[];
  inventoryByCategory: { category: string; total_quantity: number }[];
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

interface Activity {
  type: string;
  id: number;
  status: string;
  total_amount: number;
  timestamp: string;
}

const Dashboard: FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, alertsRes, activityRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/alerts`, { headers }),
        fetch(`${API_URL}/api/dashboard/activity?limit=5`, { headers })
      ]);

      if (!statsRes.ok || !alertsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [statsData, alertsData, activityData] = await Promise.all([
        statsRes.json(),
        alertsRes.json(),
        activityRes.json()
      ]);

      setStats(statsData);
      setAlerts(alertsData);
      setActivities(activityData);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <h1>Dashboard</h1>
        <p>Welcome back! Here&apos;s what&apos;s happening with your inventory.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
          <div className="stat-icon orange">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.lowStockCount || 0}</div>
            <div className="stat-label">Low Stock Items</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats?.totalInventoryValue || 0)}</div>
            <div className="stat-label">Inventory Value</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <ShoppingCart size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats?.totalOrders || 0}</div>
            <div className="stat-label">Total Orders</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
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
                      <div className="alert-meta">{alert.category} • {alert.warehouse_name}</div>
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

        <div className="dashboard-card activity-card">
          <div className="card-header">
            <h2>
              <TrendingUp size={20} />
              Recent Activity
            </h2>
          </div>

          <div className="card-body">
            <div className="activity-list">
              {activities.length === 0 ? (
                <div className="empty-state">
                  <ShoppingCart size={40} />
                  <p>No recent activity</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className="activity-icon">
                      <ShoppingCart size={18} />
                    </div>
                    <div className="activity-details">
                      <div className="activity-title">Order #{activity.id}</div>
                      <div className="activity-time">{formatDate(activity.timestamp)}</div>
                    </div>
                    <div className="activity-amount">
                      <span className={`activity-status ${activity.status}`}>
                        {activity.status}
                      </span>
                      <div className="activity-price">{formatCurrency(activity.total_amount)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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
