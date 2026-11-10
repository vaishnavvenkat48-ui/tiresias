const userRepo = require('../repositories/user.repository');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { ConflictError, UnauthorizedError, NotFoundError } = require('../utils/ApiError');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');
const { track } = require('./activity.service');

/** All business logic for auth lives here — controllers only map HTTP. */
const register = async ({ name, username, email, password }) => {
  const exists = await userRepo.findByEmailOrUsername(email, username);
  if (exists) {
    throw new ConflictError(
      exists.email === email.toLowerCase()
        ? 'An account with that email already exists.'
        : 'That username is already taken.'
    );
  }
  const user = await userRepo.create({ name, username, email, password });
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  user.refreshTokens = [refreshToken];
  await user.save();
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.USER_REGISTERED });
  return { user, accessToken, refreshToken };
};

const login = async ({ email, password }) => {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError('Invalid email or password.');
  }
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
  await user.save();
  await track({ userId: user._id, activityType: ACTIVITY_TYPES.USER_LOGIN });
  const safe = await userRepo.findById(user._id);
  return { user: safe, accessToken, refreshToken };
};

const refresh = async (refreshToken) => {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required.');
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token.');
  }
  const user = await userRepo.model.findById(payload.sub).select('+refreshTokens');
  if (!user || !(user.refreshTokens || []).includes(refreshToken)) {
    throw new UnauthorizedError('Refresh token revoked. Please log in again.');
  }
  const accessToken = signAccessToken(user._id);
  return { user: await userRepo.findById(user._id), accessToken };
};

const logout = async (userId, refreshToken = null) => {
  if (refreshToken) {
    await userRepo.model.findByIdAndUpdate(userId, { $pull: { refreshTokens: refreshToken } });
  } else {
    await userRepo.model.findByIdAndUpdate(userId, { $set: { refreshTokens: [] } });
  }
  await track({ userId, activityType: ACTIVITY_TYPES.USER_LOGOUT });
};

const getMe = async (userId) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new NotFoundError('User not found.');
  return user;
};

module.exports = { register, login, refresh, logout, getMe };
