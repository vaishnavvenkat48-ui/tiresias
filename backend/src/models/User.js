const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_VALUES, ROLES } = require('../constants/roles');

/**
 * User — central identity document, designed for future expansion.
 * Backward compatible with Phase-1 frontend payloads:
 *   avatar <-> profilePicture, createdAt <-> joinedAt,
 *   lower-case roles normalized to UPPER-CASE.
 */
const preferencesSchema = new mongoose.Schema(
  {
    // Spec fields
    visualMode: { type: String, default: 'oracle' },
    theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
    notifications: { type: Boolean, default: true },
    // Legacy Phase-1 aliases (kept so old clients keep working)
    emailNotifications: { type: Boolean, default: true },
    productUpdates: { type: Boolean, default: true },
  },
  { _id: false }
);

const statsSchema = new mongoose.Schema(
  {
    topicsExplored: { type: Number, default: 0 },
    graphsCreated: { type: Number, default: 0 },
    aiInteractions: { type: Number, default: 0 },
    // Legacy dashboard aliases
    savedGraphs: { type: Number, default: 0 },
    learningPaths: { type: Number, default: 0 },
    aiSessions: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 80 },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9_.-]+$/, 'Username may contain letters, numbers, _, . and -'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
    profilePicture: { type: String, default: '' },
    // Legacy alias for profilePicture
    avatar: { type: String, default: '' },
    joinedAt: { type: Date, default: Date.now },
    role: {
      type: String,
      enum: ROLE_VALUES,
      default: ROLES.USER,
      set: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
    },
    preferences: { type: preferencesSchema, default: () => ({}) },
    stats: { type: statsSchema, default: () => ({}) },
    // Future-ready relations
    savedGraphs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeGraph' }],
    learningPaths: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningPath' }],
    refreshTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Keep avatar <-> profilePicture in sync (prefer explicit profilePicture)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    if (this.isModified('avatar') && !this.isModified('profilePicture') && this.avatar) {
      this.profilePicture = this.avatar;
    } else if (this.isModified('profilePicture')) {
      this.avatar = this.profilePicture;
    }
    return next();
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  if (this.isModified('avatar') && !this.isModified('profilePicture') && this.avatar) {
    this.profilePicture = this.avatar;
  } else if (this.profilePicture && !this.avatar) {
    this.avatar = this.profilePicture;
  }
  next();
});

// Normalize legacy lowercase roles on read path handled in toSafeJSON
userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeJSON = function () {
  const role = typeof this.role === 'string' ? this.role.toUpperCase() : this.role;
  const pic = this.profilePicture || this.avatar || '';
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    email: this.email,
    profilePicture: pic,
    avatar: pic, // legacy alias
    joinedAt: this.joinedAt || this.createdAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    role,
    preferences: {
      visualMode: this.preferences?.visualMode ?? 'oracle',
      theme: this.preferences?.theme ?? 'dark',
      notifications: this.preferences?.notifications ?? true,
      emailNotifications: this.preferences?.emailNotifications ?? true,
      productUpdates: this.preferences?.productUpdates ?? true,
    },
    stats: {
      topicsExplored: this.stats?.topicsExplored ?? 0,
      graphsCreated: this.stats?.graphsCreated ?? 0,
      aiInteractions: this.stats?.aiInteractions ?? 0,
    },
  };
};

module.exports = mongoose.model('User', userSchema);
