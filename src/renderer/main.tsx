/**
 * @module renderer/main
 * @description Punto d'ingresso React. Niente StrictMode: i listener nativi devono essere montati una sola volta.
 */
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { App } from './App';
import { ApplicationBoundary } from './components/ApplicationBoundary';
import './styles/app.css';
import './styles/settings-minimal.css';
import './styles/surfaces-minimal.css';
import './styles/response-surface.css';
import './styles/unified-surfaces.css';
import './styles/adaptive-performance.css';
import './styles/final-polish.css';
import { markStartup } from './systems/StartupMetrics';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root not found');
}

markStartup('shell');
createRoot(root).render(
  <ApplicationBoundary>
    <App />
  </ApplicationBoundary>
);
