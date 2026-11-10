import { Router } from 'express';
import { aggregationController } from '../controllers/aggregation.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { interestQuery, pageQuery, usernameParams } from '../validation/schemas.js';

export function analyticsRoutes({ config, useCases }) {
  const router = Router();
  router.get('/interests', authenticate({ config, auth: useCases.auth }), authorize('admin'),
    validate({ query: interestQuery }), aggregationController(useCases.analytics).interests);
  return router;
}

export function publicUserRoutes({ useCases }) {
  const router = Router();
  router.get('/:username/posts', validate({ params: usernameParams, query: pageQuery }),
    aggregationController(useCases.analytics).userPosts);
  return router;
}
