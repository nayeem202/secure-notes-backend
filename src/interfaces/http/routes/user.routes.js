import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { noteController } from '../controllers/note.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { adminCreateBody, adminUpdateBody, allNotesQuery, idParams, pageQuery } from '../validation/schemas.js';

export function adminRoutes({ config, useCases }) {
  const router = Router();
  const controller = userController(useCases.users, config);
  router.use(authenticate({ config, auth: useCases.auth }), authorize('admin'));
  router.get('/notes', validate({ query: allNotesQuery }), noteController(useCases.notes).listAll);
  router.get('/users', validate({ query: pageQuery }), controller.list);
  router.post('/users', validate({ body: adminCreateBody }), controller.create);
  router.get('/users/:id', validate({ params: idParams }), controller.get);
  router.patch('/users/:id', validate({ params: idParams, body: adminUpdateBody }), controller.update);
  router.delete('/users/:id', validate({ params: idParams }), controller.remove);
  return router;
}
