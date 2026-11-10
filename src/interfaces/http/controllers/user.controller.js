import { setSession } from '../session.js';

export function userController(users, config) {
  return {
    list: async (req, res) => res.json(await users.list(req.user, req.validated.query)),
    get: async (req, res) =>
      res.json({ data: { user: await users.get(req.user, req.validated.params.id) } }),
    create: async (req, res) =>
      res.status(201).json({ data: { user: await users.create(req.user, req.validated.body) } }),
    update: async (req, res) => {
      const result = await users.update(req.user, req.validated.params.id, req.validated.body);
      if (result.accessToken) setSession(res, result, config);
      res.json({ data: result });
    },
    remove: async (req, res) => {
      await users.remove(req.user, req.validated.params.id);
      res.status(204).end();
    },
  };
}
