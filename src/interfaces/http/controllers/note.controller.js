export function noteController(notes) {
  return {
    listOwn: async (req, res) => res.json(await notes.listOwn(req.user, req.validated.query)),
    listAll: async (req, res) => res.json(await notes.listAll(req.user, req.validated.query)),
    get: async (req, res) => res.json({ data: { note: await notes.get(req.user, req.validated.params.id) } }),
    create: async (req, res) => res.status(201).json({ data: { note: await notes.create(req.user, req.validated.body) } }),
    update: async (req, res) => res.json({ data: { note: await notes.update(req.user, req.validated.params.id, req.validated.body) } }),
    remove: async (req, res) => {
      await notes.remove(req.user, req.validated.params.id);
      res.status(204).end();
    },
  };
}
