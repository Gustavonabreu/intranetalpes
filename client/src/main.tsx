import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import App from './app.tsx'
import './index.css' // <-- O import do Tailwind DEVE estar aqui!
import './styles/legacy/main.css'
import './styles/legacy/nav.css'
import './styles/legacy/spa-bridge.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
