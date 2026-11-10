const userService = require('../services/user.service');
const { asyncHandler } = require('../utils/asyncHandler');

// Legacy contract: top-level `user` alongside `data.user` (frontend reads both).
const reply = (res, message, user) => {
  const safe = user.toSafeJSON();
  res.json({ success: true, message, data: { user: safe }, user: safe });
};

const getProfile = asyncHandler(async (req, res) => reply(res, 'Profile.', await userService.getProfile(req.user._id)));
const updateProfile = asyncHandler(async (req, res) => reply(res, 'Profile updated.', await userService.updateProfile(req.user._id, req.body)));
const updatePreferences = asyncHandler(async (req, res) => reply(res, 'Preferences updated.', await userService.updatePreferences(req.user._id, req.body.preferences || req.body)));
const changePassword = asyncHandler(async (req, res) => reply(res, 'Password changed. Other sessions were signed out.', await userService.changePassword(req.user._id, req.body)));

const deleteAccount = asyncHandler(async (req, res) => {
  const result = await userService.deleteAccount(req.user._id, req.body);
  res.clearCookie?.('refreshToken');
  res.json({ success: true, message: 'Account deleted.', data: result });
});

module.exports = { getProfile, updateProfile, updatePreferences, changePassword, deleteAccount };
