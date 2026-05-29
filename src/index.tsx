import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
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

// Auth0 wiring. When the three REACT_APP_AUTH0_* env vars are absent the
// provider still mounts but isAuthenticated stays false; AuthGate falls
// back to the legacy un-gated UI so local development without an Auth0
// tenant configured keeps working.
const auth0Domain = process.env.REACT_APP_AUTH0_DOMAIN;
const auth0ClientId = process.env.REACT_APP_AUTH0_CLIENT_ID;
const auth0Audience = process.env.REACT_APP_AUTH0_AUDIENCE;

const Root: React.FC = () => {
  if (auth0Domain && auth0ClientId) {
    return (
      <Auth0Provider
        domain={auth0Domain}
        clientId={auth0ClientId}
        cacheLocation="localstorage"
        useRefreshTokens
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: auth0Audience,
        }}
      >
        <App />
      </Auth0Provider>
    );
  }
  return <App />;
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
