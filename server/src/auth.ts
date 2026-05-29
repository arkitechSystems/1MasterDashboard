/**
 * Auth0 JWT verification + per-request user/tenant context.
 *
 * Wire this once into the Express app:
 *   app.use(attachUser);                  // best-effort: decodes the token if present, attaches req.user
 *   app.get('/api/auth/me', requireAuth, handler);   // strict: 401 if no valid token
 *
 * Active-tenant resolution per request:
 *   1. x-tenant-id header (set by the frontend on every request)
 *   2. ?tenant query param (useful for shareable deep links)
 *   3. First membership in alphabetical order (deterministic fallback)
 *
 * Super-admins may switch to any tenant. Non-super users are denied access
 * to any tenant they don't have a membership in.
 */

import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import {
  upsertUserFromClaims,
  getMembershipsForUser,
  UserRow,
  MembershipRow,
} from './dbSetup';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
      memberships?: MembershipRow[];
      activeTenantId?: string;
      activeMembership?: MembershipRow;
    }
  }
}

const AUTH0_ISSUER = process.env.AUTH0_ISSUER;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const authEnabled = Boolean(AUTH0_ISSUER && AUTH0_AUDIENCE);

if (!authEnabled) {
  console.warn(
    '[auth] AUTH0_ISSUER / AUTH0_AUDIENCE not set — all auth-gated endpoints will 401.',
  );
}

// Lazy-init the JWKS so the server boots fine without Auth0 env vars set yet.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const getJwks = () => {
  if (!AUTH0_ISSUER) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${AUTH0_ISSUER}.well-known/jwks.json`));
  }
  return jwks;
};

const extractBearer = (req: Request): string | null => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice('Bearer '.length).trim() || null;
};

/**
 * Verify the JWT and return the payload. Throws on any verification failure
 * (bad signature, wrong audience, expired, etc).
 */
const verifyToken = async (token: string): Promise<JWTPayload> => {
  const ks = getJwks();
  if (!ks || !AUTH0_ISSUER || !AUTH0_AUDIENCE) {
    throw new Error('Auth0 env vars not configured');
  }
  const { payload } = await jwtVerify(token, ks, {
    issuer: AUTH0_ISSUER,
    audience: AUTH0_AUDIENCE,
  });
  return payload;
};

const resolveActiveTenant = (
  req: Request,
  memberships: MembershipRow[],
  superAdmin: boolean,
): MembershipRow | undefined => {
  const requested =
    (req.header('x-tenant-id') as string | undefined) ||
    (typeof req.query.tenant === 'string' ? req.query.tenant : undefined);

  if (requested) {
    const found = memberships.find((m) => m.tenantId === requested);
    if (found) return found;
    // Super-admins can switch into any tenant even without an explicit
    // membership — they get an effective tenant_admin role on the fly.
    if (superAdmin) {
      return {
        userId: req.user!.id,
        tenantId: requested,
        tenantName: requested,
        role: 'tenant_admin',
        deptScope: [],
      };
    }
    return undefined;
  }
  return memberships[0];
};

/**
 * Best-effort middleware: if a valid Bearer token is present, populate
 * req.user/memberships/activeTenantId. If no token or token invalid, just
 * continue — strict gating happens in requireAuth.
 */
export const attachUser = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractBearer(req);
  if (!token || !authEnabled) {
    next();
    return;
  }
  try {
    const payload = await verifyToken(token);
    const sub = String(payload.sub || '');
    const email = String(
      (payload['email'] as string) ||
        (payload['https://arkitechsystems.com/email'] as string) ||
        '',
    );
    const name = String(
      (payload['name'] as string) ||
        (payload['https://arkitechsystems.com/name'] as string) ||
        '',
    );
    if (!sub || !email) {
      // Token is valid but missing the claims we need — treat as anonymous.
      next();
      return;
    }
    const user = await upsertUserFromClaims({ sub, email, name });
    const memberships = await getMembershipsForUser(sub);
    req.user = user;
    req.memberships = memberships;
    const active = resolveActiveTenant(req, memberships, user.superAdmin);
    if (active) {
      req.activeTenantId = active.tenantId;
      req.activeMembership = active;
    }
  } catch (e) {
    // Bad token — fall through; routes that require auth will 401.
  }
  next();
};

/** Strict auth gate. Returns 401 if no valid user attached. */
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!authEnabled) {
    res.status(503).json({ error: 'Auth not configured on this server.' });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
};

/** Requires the user be a super-admin. */
export const requireSuperAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.superAdmin) {
    res.status(403).json({ error: 'Super-admin only' });
    return;
  }
  next();
};

/**
 * Requires an active tenant context (a resolved membership for the
 * current request). Use on every endpoint that reads or writes tenant data.
 */
export const requireTenant = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.activeTenantId) {
    res.status(403).json({ error: 'No active tenant for this user' });
    return;
  }
  next();
};

export const isAuthEnabled = () => authEnabled;
