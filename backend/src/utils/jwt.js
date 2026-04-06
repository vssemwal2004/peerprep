import jwt from 'jsonwebtoken';

// SECURITY: Enforce strong JWT secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'dev-secret' || JWT_SECRET === 'change-me' || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SECURITY: JWT_SECRET must be set to a strong value (min 32 characters) in production');
  }
  console.warn('⚠️  WARNING: Using weak JWT_SECRET. Set a strong secret (min 32 chars) in production!');
}

// SECURITY: Token expiration - default to 7 days but enforce expiration
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload, opts = {}) {
  // SECURITY: Always set expiration, never allow infinite tokens
  const options = {
    expiresIn: JWT_EXPIRES_IN,
    ...opts
  };
  
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
