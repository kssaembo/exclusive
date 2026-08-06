import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// PeerJS connections are intentionally created once. React StrictMode's development-only
// double mount would briefly attempt to claim the same host peer ID twice.
createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>)
