const BaseRepository = require('./base.repository');
const User = require('../models/User');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }
  findByEmail(email) {
    return User.findOne({ email: email.toLowerCase() }).select('+password +refreshTokens');
  }
  findByUsername(username) {
    return User.findOne({ username: username.toLowerCase() });
  }
  findByEmailOrUsername(email, username) {
    return User.findOne({ $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }] });
  }
  bumpStat(userId, field, by = 1) {
    return User.findByIdAndUpdate(userId, { $inc: { [`stats.${field}`]: by } }, { new: true });
  }
}

module.exports = new UserRepository();
