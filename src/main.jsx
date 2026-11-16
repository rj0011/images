import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload() } })
}
window.APP_VERSION = '1.0'
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__installEvt = e
  window.dispatchEvent(new Event('lu-install-ready'))
})

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
