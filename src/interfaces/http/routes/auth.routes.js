import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginBody, passwordBody, profileBody, registerBody } from '../validation/schemas.js';

export function authRoutes({ config, useCases }, authLimiter) {
  const router = Router();
  const controller = authController(useCases.auth, config);
  const signedIn = authenticate({ config, auth: useCases.auth });
  router.post('/register', authLimiter, validate({ body: registerBody }), controller.register);
  router.post('/login', authLimiter, validate({ body: loginBody }), controller.login);
  router.get('/me', signedIn, controller.me);
  router.patch('/me', signedIn, validate({ body: profileBody }), controller.updateProfile);
  router.patch('/password', authLimiter, signedIn, validate({ body: passwordBody }), controller.changePassword);
  router.post('/logout', signedIn, controller.logout);
  return router;
}
