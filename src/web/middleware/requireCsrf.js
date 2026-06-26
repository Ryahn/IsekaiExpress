function requireCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (!req.session?.csrf || req.session.csrf !== req.body?._csrf) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  next();
}

module.exports = requireCsrf;
