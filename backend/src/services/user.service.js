const mongoose = require('mongoose');
const userRepo = require('../repositories/user.repository');
const { NotFoundError, UnauthorizedError, BadRequestError } = require('../utils/ApiError');

/** UserService — profile, preferences, password, account lifecycle, stats. */
const getProfile = async (userId) => {
  const user = await userRepo.findById(userId);
  if (!user) throw new NotFoundError('User not found.');
  return user;
};

const updateProfile = async (userId, patch) => {
  const allowed = ['name', 'username', 'email', 'avatar', 'profilePicture', 'preferences'];
  const update = {};
  for (const key of allowed) if (patch[key] !== undefined) update[key] = patch[key];
  if (update.preferences) {
    // merge, don't replace, the preferences sub-document
    const current = await userRepo.findById(userId);
    update.preferences = { ...(current?.preferences?.toObject?.() || {}), ...sanitizePrefs(update.preferences) };
  }
  // Keep avatar/profilePicture mirrored
  if (update.profilePicture && !update.avatar) update.avatar = update.profilePicture;
  if (update.avatar && !update.profilePicture) update.profilePicture = update.avatar;
  const user = await userRepo.updateById(userId, update);
  if (!user) throw new NotFoundError('User not found.');
  return user;
};

const sanitizePrefs = (p = {}) => {
  const out = {};
  if (typeof p.visualMode === 'string' && p.visualMode.length <= 30) out.visualMode = p.visualMode;
  if (['dark', 'light', 'system'].includes(p.theme)) out.theme = p.theme;
  for (const k of ['notifications', 'emailNotifications', 'productUpdates']) if (typeof p[k] === 'boolean') out[k] = p[k];
  return out;
};

const updatePreferences = async (userId, prefs) => updateProfile(userId, { preferences: prefs });

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await userRepo.model.findById(userId).select('+password +refreshTokens');
  if (!user) throw new NotFoundError('User not found.');
  if (!(await user.comparePassword(String(currentPassword || '')))) throw new UnauthorizedError('Current password is incorrect.');
  if (currentPassword === newPassword) throw new BadRequestError('New password must be different from the current one.');
  user.password = newPassword; // hashed by the pre-save hook
  user.refreshTokens = []; // sign out other sessions
  await user.save();
  return userRepo.findById(userId);
};

/** Permanently delete the account and everything it owns. */
const deleteAccount = async (userId, { password }) => {
  const user = await userRepo.model.findById(userId).select('+password');
  if (!user) throw new NotFoundError('User not found.');
  if (!(await user.comparePassword(String(password || '')))) throw new UnauthorizedError('Password is incorrect.');
  const m = (name) => mongoose.models[name];
  const graphIds = (await m('KnowledgeGraph').find({ owner: userId }).select('_id').lean()).map((g) => g._id);
  await Promise.all([
    m('KnowledgeGraph').deleteMany({ owner: userId }),
    m('UsageCounter')?.deleteMany({ key: new RegExp(`^[a-z]+:u:${userId}:`) }),
    m('LearningPath').deleteMany({ $or: [{ userId }, { owner: userId }] }),
    m('UserActivity').deleteMany({ userId }),
    m('AIConversation')?.deleteMany({ userId }),
  ]);
  await user.deleteOne();
  return { deletedGraphs: graphIds.length };
};

module.exports = { getProfile, updateProfile, updatePreferences, changePassword, deleteAccount };
