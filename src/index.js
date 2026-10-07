import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './fonts.css';
import './touch.css';

// Two sites in one app:
//   /pos, /pos/...  → staff POS (sign-in with PIN)
//   everything else → customer ordering page
const isPos = /^\/pos(\/|$)/.test(window.location.pathname);
const App = lazy(() => (isPos ? import('./App') : import('./shop/Shop')));

// POS: keep a copy of the app on this device so it can still open without internet
if (isPos && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/pos-sw.js', { scope: '/pos' }).catch(() => {}); });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </React.StrictMode>
);
