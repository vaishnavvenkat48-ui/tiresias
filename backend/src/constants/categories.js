/**
 * Knowledge categories. Drives TopicClassificationService + adaptive visual modes.
 * Keep in sync with frontend/src/theme/modes.js.
 */
const CATEGORIES = Object.freeze({
  TECHNOLOGY: 'Technology',
  HISTORY: 'History',
  SCIENCE: 'Science',
  PHILOSOPHY: 'Philosophy',
  BUSINESS: 'Business',
  MYTHOLOGY: 'Mythology',
  GENERAL: 'General',
});

const CATEGORY_VALUES = Object.freeze(Object.values(CATEGORIES));

/** Category → frontend visual mode id. */
const modeIdForCategory = (c) => (c && c !== CATEGORIES.GENERAL ? String(c).toLowerCase() : 'oracle');

module.exports = { CATEGORIES, CATEGORY_VALUES, modeIdForCategory };
