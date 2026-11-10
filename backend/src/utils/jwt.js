const jwt = require('jsonwebtoken');

const ACCESS_SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET || `${ACCESS_SECRET()}-refresh`;

const signAccessToken = (userId) =>
  jwt.sign({ sub: userId, type: 'access' }, ACCESS_SECRET(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const signRefreshToken = (userId) =>
  jwt.sign({ sub: userId, type: 'refresh' }, REFRESH_SECRET(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });

const verifyAccessToken = (token) => jwt.verify(token, ACCESS_SECRET());
const verifyRefreshToken = (token) => {
  const payload = jwt.verify(token, REFRESH_SECRET());
  if (payload.type !== 'refresh') throw new Error('Not a refresh token');
  return payload;
};

// Legacy alias used by older controllers
const signToken = signAccessToken;

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, signToken };
