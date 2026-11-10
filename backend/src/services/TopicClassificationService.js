const { CATEGORIES } = require('../constants/categories');

/**
 * TopicClassificationService — keyword heuristic today, LLM-backed tomorrow.
 * classify(title, description) -> one of the canonical categories.
 * Keep the keyword map in one place; GeminiService can override via hint.
 */
const KEYWORDS = [
  [/ai\b|machine learning|neural|software|program|code|coding|cyber|robot|quantum comput|blockchain|startup tech|cloud|data science/i, CATEGORIES.TECHNOLOGY],
  [/roman|rome|empire|war\b|medieval|ancient|revolution|pharaoh|ottoman|colonial|world war/i, CATEGORIES.HISTORY],
  [/physics|biology|chemistry|astronom|quantum|evolution|genome|climate|math\b|theorem/i, CATEGORIES.SCIENCE],
  [/stoic|ethic|philosoph|logic|metaphysic|kant|nietzsche|plato|aristotle|existential/i, CATEGORIES.PHILOSOPHY],
  [/market|finance|business|startup|invest|econom|entrepreneur|brand|sales/i, CATEGORIES.BUSINESS],
  [/zeus|odin|thor|myth|greek god|norse|hindu|egyptian god|olympus|valhalla/i, CATEGORIES.MYTHOLOGY],
];

const classify = (title = '', description = '') => {
  const text = `${title} ${description}`;
  for (const [re, cat] of KEYWORDS) if (re.test(text)) return cat;
  return CATEGORIES.GENERAL;
};

module.exports = { classify, KEYWORDS };
