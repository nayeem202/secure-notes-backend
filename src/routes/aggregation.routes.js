import { Router } from 'express';
import { getUserPosts, groupByInterests } from '../controllers/aggregation.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { interestQuery, pageQuery, usernameParams } from '../validation/schemas.js';

export function analyticsRoutes(config) {
  const router = Router();
  router.get('/interests', authenticate(config), authorize('admin'),
    validate({ query: interestQuery }), groupByInterests(config));
  return router;
}

export function publicUserRoutes(config) {
  const router = Router();
  router.get('/:username/posts', validate({ params: usernameParams, query: pageQuery }), getUserPosts(config));
  return router;
}
