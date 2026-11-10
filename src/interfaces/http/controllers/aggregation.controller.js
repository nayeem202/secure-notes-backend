export function aggregationController(analytics) {
  return {
    interests: async (req, res) => res.json(await analytics.groupByInterests(req.user, req.validated.query)),
    userPosts: async (req, res) => res.json(await analytics.postsByUser(req.validated.params.username, req.validated.query)),
  };
}
