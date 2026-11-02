import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/user.model.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('User authentication context missing');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Access denied: required role in [${allowedRoles.join(', ')}], current role is '${req.user.role}'`
      );
    }

    next();
  };
}

