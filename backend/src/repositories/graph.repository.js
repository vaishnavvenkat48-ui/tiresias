const BaseRepository = require('./base.repository');
const KnowledgeGraph = require('../models/KnowledgeGraph');

class GraphRepository extends BaseRepository {
  constructor() {
    super(KnowledgeGraph);
  }
  findByOwner(owner, { skip, limit }) {
    return KnowledgeGraph.find({ owner }).skip(skip).limit(limit).sort({ updatedAt: -1 });
  }
}

module.exports = new GraphRepository();
