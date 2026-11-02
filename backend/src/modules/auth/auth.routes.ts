import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { loginSchema, registerSchema, refreshTokenSchema } from './auth.validator.js';

const router = Router();

router.post(
  '/register',
  validateRequest({ body: registerSchema }),
  AuthController.register
);

router.post(
  '/login',
  validateRequest({ body: loginSchema }),
  AuthController.login
);

router.post(
  '/refresh',
  validateRequest({ body: refreshTokenSchema }),
  AuthController.refresh
);

router.get(
  '/me',
  requireAuth,
  AuthController.me
);

router.post(
  '/logout',
  requireAuth,
  AuthController.logout
);

export const authRouter = router;
