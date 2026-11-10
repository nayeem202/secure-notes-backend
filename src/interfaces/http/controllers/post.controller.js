export function postController(posts) {
  return {
    list: async (req, res) => res.json(await posts.list(req.validated.query)),
    get: async (req, res) => res.json({ data: { post: await posts.get(req.validated.params.id) } }),
    create: async (req, res) => res.status(201).json({ data: { post: await posts.create(req.user, req.validated.body) } }),
    update: async (req, res) => res.json({ data: { post: await posts.update(req.user, req.validated.params.id, req.validated.body) } }),
    remove: async (req, res) => {
      await posts.remove(req.user, req.validated.params.id);
      res.status(204).end();
    },
  };
}
