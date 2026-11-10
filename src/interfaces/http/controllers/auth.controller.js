import { clearSession, setSession } from '../session.js';

export function authController(auth, config) {
  const respondWithSession = (res, result, status = 200) => {
    setSession(res, result, config);
    return res.status(status).json({ data: result });
  };
  return {
    register: async (req, res) => respondWithSession(res, await auth.register(req.validated.body), 201),
    login: async (req, res) => respondWithSession(res, await auth.login(req.validated.body)),
    me: (req, res) => res.json({ data: { user: auth.profile(req.user) } }),
    updateProfile: async (req, res) => res.json({ data: { user: await auth.updateProfile(req.user, req.validated.body) } }),
    changePassword: async (req, res) => respondWithSession(res, await auth.changePassword(req.user, req.validated.body)),
    logout: async (req, res) => {
      await auth.logout(req.user);
      clearSession(res, config);
      res.status(204).end();
    },
  };
}
