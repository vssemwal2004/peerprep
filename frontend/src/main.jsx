// First: fallbacks for older Safari / iOS before any app code runs.
import './polyfills.js'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'));
root.render(<App />);

