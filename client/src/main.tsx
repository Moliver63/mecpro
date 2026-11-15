import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { trackGoogleSignUpFromUrl } from './lib/analytics';

// Programa de parceiros: guarda o codigo de ?ref= para o cadastro, mesmo que a
// pessoa navegue por outras paginas antes de criar a conta.
try {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref && /^[A-Za-z0-9_-]{3,40}$/.test(ref)) window.localStorage.setItem('mp_ref', ref);
} catch { /* storage indisponivel: o ?ref= da URL de cadastro ainda funciona */ }

// Cadastro novo pelo Google (servidor marca ?cadastro=google): evento sign_up no GA4.
trackGoogleSignUpFromUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
