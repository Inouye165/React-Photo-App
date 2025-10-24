import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './env'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import AuthWrapper from './components/AuthWrapper.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthWrapper>
        <App />
      </AuthWrapper>
    </AuthProvider>
  </StrictMode>,
)
