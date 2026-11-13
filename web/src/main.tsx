/**
 * @module web/main
 * @description Ingresso della nuova web app: font locale, stile e montaggio React.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { App } from './App';

// Feedback al tocco caricato a parte: non pesa sull'avvio, arriva prima del primo tocco.
void import('./press').then(({ installPressFeedback }) => installPressFeedback()).catch(() => {});
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
