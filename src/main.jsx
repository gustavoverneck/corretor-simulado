import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ViewerApp from './ViewerApp'
import { isLanViewer } from './lib/lanShare'
import './styles.css'

// Aberto pelo endereço compartilhado na rede local: só consulta.
const Root = isLanViewer() ? ViewerApp : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
