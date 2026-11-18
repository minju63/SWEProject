import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './index.css'
import PolicyDataGate from './app/PolicyDataGate'
import { AuthProvider } from './lib/auth'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider><PolicyDataGate><App /></PolicyDataGate></AuthProvider>
  </React.StrictMode>,
)
