const { body, param } = require('express-validator');

/** Shared express-validator rule sets (sanitize + constrain). */
const strongPassword = body('password')
  .trim()
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters.')
  .matches(/[A-Z]/)
  .withMessage('Password must include an uppercase letter.')
  .matches(/[a-z]/)
  .withMessage('Password must include a lowercase letter.')
  .matches(/[0-9]/)
  .withMessage('Password must include a number.')
  .matches(/[^A-Za-z0-9]/)
  .withMessage('Password must include a symbol.');

const registerRules = [
  body('name').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 80 }),
  body('username').trim().toLowerCase().isLength({ min: 3, max: 30 }).matches(/^[a-z0-9_.-]+$/).withMessage('Username may contain letters, numbers, _, . and -.'),
  body('email').trim().normalizeEmail().isEmail().withMessage('Please provide a valid email.'),
  strongPassword,
];

const loginRules = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Please provide a valid email.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

const profileRules = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.').isLength({ max: 80 }),
  body('username').optional().trim().toLowerCase().isLength({ min: 3, max: 30 }).matches(/^[a-z0-9_.-]+$/),
  body('email').optional().trim().normalizeEmail().isEmail().withMessage('Please provide a valid email.'),
];

const topicRules = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 200 }),
  body('category').optional().trim().isLength({ max: 50 }),
  body('description').optional().isLength({ max: 5000 }),
];

const graphRules = [
  body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 200 }),
  body('visibility').optional().isIn(['private', 'public']),
];

const mongoIdParam = (name = 'id') => param(name).isMongoId().withMessage(`Invalid ${name}.`);

module.exports = { registerRules, loginRules, profileRules, topicRules, graphRules, mongoIdParam };
