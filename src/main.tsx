import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/styles/index.css'
import { App } from './app/App'
import { initSound } from './ui/sound'
import { startThemeSync } from './ui/theme'

startThemeSync()
initSound()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
