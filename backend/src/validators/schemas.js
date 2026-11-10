const { z } = require('zod');

/**
 * Zod schemas — single source of truth for body shape.
 * Express-validator rules in this folder reuse the same constraints
 * so both validators stay consistent.
 */
const passwordSchema = z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/);
const usernameSchema = z.string().min(3).max(30).regex(/^[a-z0-9_.-]+$/);

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const topicSchemaZ = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
});

const graphSchemaZ = z.object({
  title: z.string().trim().min(1).max(200),
  rootTopic: z.string().optional(),
  rootTopicTitle: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(z.object({ id: z.string(), label: z.string() }).passthrough()).optional(),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string() }).passthrough()).optional(),
  generatedBy: z.enum(['ai', 'manual', 'wikipedia', 'mock']).optional(),
  visibility: z.enum(['private', 'public']).optional(),
});

/** Express-style middleware running a Zod schema against req.body */
const validateZod = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (result.success) {
    req.body = result.data;
    return next();
  }
  const err = new Error('Validation failed.');
  err.statusCode = 400;
  err.details = result.error.flatten();
  next(err);
};

module.exports = { registerSchema, loginSchema, topicSchemaZ, graphSchemaZ, validateZod };
