import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Static-mode bootstrap: leftover auth-token guards in 14 components
// bail out if localStorage.authToken is missing. Pre-seed a placeholder
// so those guards pass; the token is sent to a static file host that
// ignores it. Safe to remove once the guards themselves are deleted.
if (!process.env.REACT_APP_API_URL && !localStorage.getItem('authToken')) {
  localStorage.setItem('authToken', 'static-deploy');
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
