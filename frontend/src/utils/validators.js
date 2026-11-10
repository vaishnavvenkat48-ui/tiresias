import { z } from 'zod';

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[0-9]/, 'Include a number.')
  .regex(/[^A-Za-z0-9]/, 'Include a symbol.');

export const registerSchema = z
  .object({
    name: z.string().min(1, 'Full name is required.').max(80),
    username: z
      .string()
      .min(3, 'Username must be 3–30 characters.')
      .max(30)
      .regex(/^[a-z0-9_.-]+$/i, 'Letters, numbers, _, . and - only.'),
    email: z.string().email('Enter a valid email.'),
    password: passwordRule,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
  remember: z.boolean().optional(),
});

export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(80),
  username: z.string().min(3).max(30).regex(/^[a-z0-9_.-]+$/i, 'Letters, numbers, _, . and - only.'),
  email: z.string().email('Enter a valid email.'),
});

export const passwordStrength = (pw = '') => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  return Math.min(score, 5);
};
