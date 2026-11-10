const BaseRepository = require('./base.repository');
const UserActivity = require('../models/UserActivity');

class ActivityRepository extends BaseRepository {
  constructor() {
    super(UserActivity);
  }
  recentByUser(userId, limit = 20) {
    return UserActivity.find({ userId }).limit(limit).sort({ timestamp: -1 });
  }
}

module.exports = new ActivityRepository();
