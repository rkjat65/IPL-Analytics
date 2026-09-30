import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './contexts/AuthContext'
import { TournamentProvider } from './contexts/TournamentContext'
import App from './App'
import { currentPrefix, isAppPath, PREFIXES } from './lib/site'
import './index.css'

// Outside /ipl or /t20-world-cup (only in local development) start at the IPL dashboard.
if (!isAppPath()) window.location.replace(`${PREFIXES.ipl}/dashboard`)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        <BrowserRouter basename={currentPrefix()}>
          <TournamentProvider>
            <App />
          </TournamentProvider>
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>,
)

// The app no longer runs a service worker: one registered at the site root
// would sit in front of the whole of crickrida.com. Remove any left behind.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {})
}
