import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginBody, passwordBody, profileBody, registerBody } from '../validation/schemas.js';

export function authRoutes(config, authLimiter) {
  const router = Router();
  const controller = authController(config);
  router.post('/register', authLimiter, validate({ body: registerBody }), controller.register);
  router.post('/login', authLimiter, validate({ body: loginBody }), controller.login);
  router.get('/me', authenticate(config), controller.me);
  router.patch('/me', authenticate(config), validate({ body: profileBody }), controller.updateProfile);
  router.patch('/password', authLimiter, authenticate(config), validate({ body: passwordBody }), controller.changePassword);
  router.post('/logout', authenticate(config), controller.logout);
  return router;
}
