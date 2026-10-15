import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { StoreProvider } from './state/store';
import { ExposProvider } from './state/expos';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <ExposProvider>
          <App />
        </ExposProvider>
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>
);
