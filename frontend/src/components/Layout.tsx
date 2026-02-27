import { FC, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Mic, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Layout.css'

const Layout: FC = () => {
  const { logout, user } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="layout">
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <button
          className="mobile-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <span className="mobile-brand">🍜 Food Supply AI</span>
      </header>

      {/* Overlay */}
      <div
        className={`overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={closeSidebar}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="logo">🍜 Food Supply AI</h1>
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/"
            className={`nav-link ${isActive('/') ? 'active' : ''}`}
            onClick={closeSidebar}
          >
            <Mic size={20} />
            <span>Voice Assistant</span>
          </Link>
          <Link
            to="/dashboard"
            className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={closeSidebar}
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

export default Layout
