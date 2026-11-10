/**
 * Generic repository — thin Mongoose wrapper so services never touch
 * models directly. Keeps query logic reusable + testable.
 */
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(doc) {
    return this.model.create(doc);
  }
  findById(id, populate = '') {
    const q = this.model.findById(id);
    return populate ? q.populate(populate) : q;
  }
  findOne(filter) {
    return this.model.findOne(filter);
  }
  find(filter = {}, { skip = 0, limit = 20, sort = { createdAt: -1 } } = {}) {
    return this.model.find(filter).skip(skip).limit(limit).sort(sort);
  }
  count(filter = {}) {
    return this.model.countDocuments(filter);
  }
  updateById(id, patch, opts = { new: true, runValidators: true }) {
    return this.model.findByIdAndUpdate(id, patch, opts);
  }
  deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }
}

module.exports = BaseRepository;
