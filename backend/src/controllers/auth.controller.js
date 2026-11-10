const authService = require('../services/auth.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/**
 * AuthController — thin HTTP mapping. Business logic lives in auth.service.
 * Response envelope: { success, message, data }. Legacy `token` field is
 * mirrored as `accessToken` for forward-compat; both are returned.
 */
const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  const safe = user.toSafeJSON();
  // Envelope + legacy flat fields (Phase-1 frontend reads res.token / res.user)
  res.status(201).json({
    success: true,
    message: 'Account created.',
    data: { token: accessToken, accessToken, refreshToken, user: safe },
    token: accessToken,
    accessToken,
    refreshToken,
    user: safe,
  });
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  const safe = user.toSafeJSON();
  res.json({
    success: true,
    message: 'Welcome back.',
    data: { token: accessToken, accessToken, refreshToken, user: safe },
    token: accessToken,
    accessToken,
    refreshToken,
    user: safe,
  });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user._id);
  // Support both envelopes: legacy { user } and standard { success, data }
  res.json({ success: true, message: 'Current user.', data: { user: user.toSafeJSON() }, user: user.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken || null;
  await authService.logout(req.user._id, refreshToken);
  res.clearCookie('refreshToken');
  sendSuccess(res, { message: 'Logged out.' });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  const { user, accessToken } = await authService.refresh(token);
  const safe = user.toSafeJSON();
  res.json({
    success: true,
    message: 'Token refreshed.',
    data: { token: accessToken, accessToken, user: safe },
    token: accessToken,
    accessToken,
    user: safe,
  });
});

module.exports = { register, login, me, logout, refresh };
