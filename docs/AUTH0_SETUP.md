# Auth0 Setup Checklist

One-time setup in the Auth0 dashboard. Follow in order. At the end you'll
have five values to paste into Render env vars.

## 1. Create the tenant

1. Sign up at <https://auth0.com>. Pick a tenant name like `arkitechsystems`
   (region: **US**). Your Auth0 domain becomes
   `arkitechsystems.us.auth0.com`.
2. Skip the "Create your first Application" wizard — we'll do it manually.

## 2. Create the SPA Application (frontend)

1. **Applications → Applications → Create Application**.
2. Name: `1Master Dashboard (Frontend)`. Type: **Single Page Web Applications**.
3. After creation, open the app's **Settings** tab.
4. Note the **Domain** and **Client ID** — you'll need both.
5. Set these URLs (one per line in each box, no trailing slashes):

   **Allowed Callback URLs**
   ```
   http://localhost:3000
   https://1masterdashboard-frontend.onrender.com
   https://app.arkitechsystems.com
   ```

   **Allowed Logout URLs**
   ```
   http://localhost:3000
   https://1masterdashboard-frontend.onrender.com
   https://app.arkitechsystems.com
   https://arkitechsystems.com
   ```

   **Allowed Web Origins**
   ```
   http://localhost:3000
   https://1masterdashboard-frontend.onrender.com
   https://app.arkitechsystems.com
   ```

6. Scroll down → **Refresh Token Rotation: ON**, **Refresh Token Expiration: Expiring**.
7. **Save Changes**.

## 3. Create the API (backend audience)

1. **Applications → APIs → Create API**.
2. Name: `1Master Dashboard API`. Identifier (audience):
   `https://api.arkitechsystems.com` (this is just an identifier string —
   it doesn't have to be a real URL, and won't change even when your
   actual API URL does).
3. Signing Algorithm: **RS256**. Leave the rest default.
4. After creation, **Settings → Allow Skipping User Consent: ON** (so
   first-party app users don't get a "this app wants to access your data"
   screen).

## 4. Add the login link from arkitechsystems.com

Replace the broken "Login" link on arkitechsystems.com with:

```
https://app.arkitechsystems.com/?login=true
```

…or, if you don't have `app.arkitechsystems.com` mapped yet:

```
https://1masterdashboard-frontend.onrender.com/?login=true
```

The dashboard's `AuthGate` reads `?login=true` (and the absence of a
session) and bounces straight to the Auth0 Universal Login page, then
back to the dashboard once authenticated.

## 5. Branding (optional but quick)

1. **Branding → Universal Login → Customizations**.
2. Upload your logo, set primary color to your brand color, set page
   background. Takes 2 minutes and makes the hosted login look like it
   belongs to arkitechsystems.com even on free tier.

## 6. Capture the env vars

You should now have five values:

| Var | Where it comes from |
|---|---|
| `AUTH0_DOMAIN` | App Settings → Domain (e.g. `arkitechsystems.us.auth0.com`) |
| `AUTH0_CLIENT_ID` | App Settings → Client ID |
| `AUTH0_AUDIENCE` | API Settings → Identifier (e.g. `https://api.arkitechsystems.com`) |
| `AUTH0_ISSUER` | `https://<your-domain>/` — same as Domain with `https://` prefix and trailing slash |
| `SUPER_ADMIN_EMAILS` | Comma-separated list of emails that get global super-admin (e.g. `wmartin@phgworks.com`) |

Set these on Render:

- Backend service (`1masterdashboard-api`):
  `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_ISSUER`, `SUPER_ADMIN_EMAILS`
- Frontend service (`1masterdashboard-frontend`):
  `REACT_APP_AUTH0_DOMAIN`, `REACT_APP_AUTH0_CLIENT_ID`,
  `REACT_APP_AUTH0_AUDIENCE` (same values, just the `REACT_APP_` prefix
  so CRA exposes them to the bundle)

## 7. First-user invitation

Until you wire a self-service signup flow:

1. **User Management → Users → Create User**.
2. Email: `wmartin@phgworks.com`. Connection: `Username-Password-Authentication`.
3. Set a strong temporary password. Auth0 emails the user a password-reset
   link by default (verify the email-provider in Branding → Emails works
   first, or set the password directly).
4. After this user logs in for the first time, the backend's JIT user
   upsert auto-creates the `users` row and grants super-admin based on
   `SUPER_ADMIN_EMAILS`.

To onboard a new tenant client later:
1. Create the user in Auth0.
2. In your dashboard's (future) admin page, create the tenant + the
   user's membership with role and `dept_scope`.
