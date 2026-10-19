import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Confirm } from './Confirm'
import { Overlay } from './Overlay'
import './styles.css'
import './session.css'

// One renderer build, three windows: the hash picks which one this is
const view = window.location.hash.replace('#', '').split('&')[0]
if (view === 'overlay') document.documentElement.classList.add('overlay-root')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'confirm' ? <Confirm /> : view === 'overlay' ? <Overlay /> : <App />}</StrictMode>
)
