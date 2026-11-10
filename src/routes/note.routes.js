import { Router } from 'express';
import { createNote, deleteNote, getNote, listNotes, updateNote } from '../controllers/note.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParams, noteCreateBody, noteUpdateBody, pageQuery } from '../validation/schemas.js';

export function noteRoutes(config) {
  const router = Router();
  router.use(authenticate(config));
  router.get('/', validate({ query: pageQuery }), listNotes);
  router.post('/', validate({ body: noteCreateBody }), createNote);
  router.get('/:id', validate({ params: idParams }), getNote);
  router.patch('/:id', validate({ params: idParams, body: noteUpdateBody }), updateNote);
  router.delete('/:id', validate({ params: idParams }), deleteNote);
  return router;
}
