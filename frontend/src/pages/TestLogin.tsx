import { useState } from 'react'

const API_URL = 'https://139.59.102.60:3001'

function TestLogin() {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const testLogin = async () => {
    setLoading(true)
    setResult('Testing...')
    
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          username: 'testuser', 
          password: '123454321' 
        })
      })
      
      const data = await response.json()
      setResult(JSON.stringify(data, null, 2))
    } catch (err: any) {
      setResult(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Test Login API</h1>
      <button 
        onClick={testLogin} 
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Testing...' : 'Test Login'}
      </button>
      <pre style={{ 
        marginTop: '20px', 
        padding: '15px', 
        background: '#f5f5f5',
        borderRadius: '8px',
        overflow: 'auto'
      }}>
        {result || 'Click button to test'}
      </pre>
    </div>
  )
}

export default TestLogin