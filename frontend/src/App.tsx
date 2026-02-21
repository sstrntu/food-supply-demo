import { FC } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import VoiceInterface from './pages/VoiceInterface'
import Layout from './components/Layout'
import './App.css'

const ProtectedRoute: FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<VoiceInterface />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="voice" element={<VoiceInterface />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

export default App
