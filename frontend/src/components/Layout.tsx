import { FC } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Mic, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

const Layout: FC = () => {
  const { logout, user } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">🍜 Food Supply AI</h1>
        </div>
        
        <nav className="sidebar-nav">
          <Link 
            to="/" 
            className={`nav-link ${isActive('/') ? 'active' : ''}`}
          >
            <Mic size={20} />
            <span>Voice Assistant</span>
          </Link>
          <Link 
            to="/dashboard" 
            className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user?.username || 'User'}</span>
            <span className="user-role">{user?.role || 'Admin'}</span>
          </div>
          <button onClick={logout} className="logout-btn">
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}

// Simple Outlet component since we're not using react-router's Outlet directly
import { Outlet } from 'react-router-dom'

export default Layout
