import { FC, useEffect, useState } from 'react'
import { 
  Package, 
  AlertTriangle, 
  DollarSign, 
  ShoppingCart,
  TrendingUp,
  ArrowRight
} from 'lucide-react'
import './Dashboard.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://139.59.102.60:3001'

interface DashboardStats {
  totalProducts: number
  totalInventoryValue: number
  lowStockCount: number
  totalOrders: number
  ordersByStatus: { status: string; count: number }[]
  inventoryByCategory: { category: string; total_quantity: number }[]
}

interface Alert {
  id: number
  name: string
  category: string
  sku: string
  quantity_on_hand: number
  reorder_point: number
  shortage: number
  warehouse_name: string
}

interface Activity {
  type: string
  id: number
  status: string
  total_amount: number
  timestamp: string
}

const Dashboard: FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = {
        'Authorization': `Bearer ${token}`
      }

      const [statsRes, alertsRes, activityRes] = await Promise.all([
        fetch(`${API_URL}/api/dashboard/stats`, { headers }),
        fetch(`${API_URL}/api/dashboard/alerts`, { headers }),
        fetch(`${API_URL}/api/dashboard/activity?limit=5`, { headers })
      ])

      if (!statsRes.ok || !alertsRes.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const statsData = await statsRes.json()
      const alertsData = await alertsRes.json()
      const activityData = await activityRes.json()

      setStats(statsData)
      setAlerts(alertsData)
      setActivities(activityData)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner-large"></div>
        <p>Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Welcome back! Here's what's happening with your inventory.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon products">
            <Package size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats?.totalProducts || 0}</h3>
            <p>Total Products</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <AlertTriangle size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats?.lowStockCount || 0}</h3>
            <p>Low Stock Items</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success">
            <DollarSign size={24} />
          </div>
          <div className="stat-info">
            <h3>{formatCurrency(stats?.totalInventoryValue || 0)}</h3>
            <p>Inventory Value</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orders">
            <ShoppingCart size={24} />
          </div>
          <div className="stat-info">
            <h3>{stats?.totalOrders || 0}</h3>
            <p>Total Orders</p>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Low Stock Alerts */}
        <div className="dashboard-card alerts-card">
          <div className="card-header">
            <h2>
              <AlertTriangle size={20} />
              Low Stock Alerts
            </h2>
            <span className="badge badge-danger">{alerts.length} items</span>
          </div>
          
          <div className="alerts-list">
            {alerts.length === 0 ? (
              <div className="empty-state">
                <TrendingUp size={40} />
                <p>All items are well stocked!</p>
              </div>
            ) : (
              alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="alert-item">
                  <div className="alert-info">
                    <h4>{alert.name}</h4>
                    <p>{alert.category} • {alert.warehouse_name}</p>
                  </div>
                  <div className="alert-stats">
                    <span className="stock-current">{alert.quantity_on_hand}</span>
                    <span className="stock-separator">/</span>
                    <span className="stock-reorder">{alert.reorder_point}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {alerts.length > 5 && (
            <button className="view-all-btn">
              View all alerts <ArrowRight size={16} />
            </button>
          )}
        </div>

        {/* Recent Activity */}
        <div className="dashboard-card activity-card">
          <div className="card-header">
            <h2>
              <TrendingUp size={20} />
              Recent Activity
            </h2>
          </div>
          
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
                  <div className="activity-info">
                    <h4>Order #{activity.id}</h4>
                    <p>{formatDate(activity.timestamp)}</p>
                  </div>
                  <div className="activity-amount">
                    <span className={`badge badge-${activity.status === 'completed' ? 'success' : activity.status === 'pending' ? 'warning' : 'secondary'}`}>
                      {activity.status}
                    </span>
                    <p>{formatCurrency(activity.total_amount)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Categories Section */}
      {stats?.inventoryByCategory && stats.inventoryByCategory.length > 0 && (
        <div className="dashboard-card categories-card">
          <div className="card-header">
            <h2>Inventory by Category</h2>
          </div>
          <div className="categories-grid">
            {stats.inventoryByCategory.map((cat) => (
              <div key={cat.category} className="category-item">
                <span className="category-name">{cat.category}</span>
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
