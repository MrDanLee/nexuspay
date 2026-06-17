import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { RequestContext } from '../context/RequestContext';
import { AuthenticationError, AuthorizationError } from '../errors/AppError';

export interface AuthUser {
  userId: string;
  roles: string[];
}

export interface AuthOptions {
  secret: string;
  /** When true, requests without a token continue unauthenticated. */
  optional?: boolean;
}

/** Express request augmented with the authenticated user. */
export type AuthenticatedRequest = Request & {
  userId?: string;
  user?: AuthUser;
};

/**
 * JWT authentication middleware.
 *
 * Verifies a Bearer token, attaches the user to the request, and records
 * the userId in the request context so logs are attributed. With
 * `optional: true` a missing token is allowed (public endpoints); a
 * malformed or expired token is always rejected with 401.
 */
export function authMiddleware(options: AuthOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (options.optional) {
        next();
        return;
      }
      next(new AuthenticationError('Authentication required'));
      return;
    }

    try {
      const payload = jwt.verify(token, options.secret) as jwt.JwtPayload;
      const userId = String(payload.sub ?? payload.userId ?? '');
      const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];

      const authReq = req as AuthenticatedRequest;
      authReq.userId = userId;
      authReq.user = { userId, roles };

      const ctx = RequestContext.get();
      if (ctx) ctx.userId = userId;

      next();
    } catch {
      next(new AuthenticationError('Invalid or expired token'));
    }
  };
}

/**
 * Authorization guard requiring one of the given roles. Must run after
 * authMiddleware.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }
    if (!user.roles.some((role) => roles.includes(role))) {
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }
    next();
  };
}
