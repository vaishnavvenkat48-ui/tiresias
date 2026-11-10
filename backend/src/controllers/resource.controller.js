const resources = require('../services/resources.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { track } = require('../services/activity.service');
const { ACTIVITY_TYPES } = require('../constants/activityTypes');

const q = (req) => ({ topic: String(req.query.topic || '').trim(), context: String(req.query.context || '').trim().slice(0, 120) || undefined });
const graphId = (req) => (/^[a-f0-9]{24}$/i.test(req.query.graphId || '') ? req.query.graphId : null);

const videos = asyncHandler(async (req, res) => {
  const { topic, context } = q(req);
  const data = await resources.videos(topic, context);
  await track({ userId: req.user._id, activityType: ACTIVITY_TYPES.VIDEO_RECOMMENDED, topic, graphId: graphId(req), metadata: { topic, count: data.videos.length } });
  sendSuccess(res, { message: 'Videos.', data });
});

const images = asyncHandler(async (req, res) => {
  const { topic, context } = q(req);
  const data = await resources.images(topic, context);
  sendSuccess(res, { message: 'Images.', data });
});

const research = asyncHandler(async (req, res) => {
  const { topic, context } = q(req);
  const data = await resources.research(topic, context);
  await track({ userId: req.user._id, activityType: ACTIVITY_TYPES.RESEARCH_VIEWED, topic, graphId: graphId(req), metadata: { topic, count: data.works.length } });
  sendSuccess(res, { message: 'Research.', data });
});

const topic = asyncHandler(async (req, res) => {
  const { topic: t, context } = q(req);
  const data = await resources.topicCard(t, { context, wikidataId: req.query.wikidataId });
  sendSuccess(res, { message: 'Topic card.', data });
});

module.exports = { videos, images, research, topic };
