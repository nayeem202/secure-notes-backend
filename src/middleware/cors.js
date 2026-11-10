export function allowFrontendOrigin(allowedOrigin) {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin !== allowedOrigin) return next();
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.vary('Origin');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Protection');
      return res.status(204).end();
    }
    next();
  };
}
