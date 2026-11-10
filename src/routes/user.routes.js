import { Router } from 'express';
import { createUser, deleteUser, getUser, listUsers, updateUser } from '../controllers/user.controller.js';
import { listAllNotes } from '../controllers/note.controller.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { adminCreateBody, adminUpdateBody, allNotesQuery, idParams, pageQuery } from '../validation/schemas.js';

export function adminRoutes(config) {
  const router = Router();
  router.use(authenticate(config), authorize('admin'));
  router.get('/notes', validate({ query: allNotesQuery }), listAllNotes);
  router.get('/users', validate({ query: pageQuery }), listUsers);
  router.post('/users', validate({ body: adminCreateBody }), createUser(config));
  router.get('/users/:id', validate({ params: idParams }), getUser);
  router.patch('/users/:id', validate({ params: idParams, body: adminUpdateBody }), updateUser(config));
  router.delete('/users/:id', validate({ params: idParams }), deleteUser);
  return router;
}
