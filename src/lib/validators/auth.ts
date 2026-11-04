import { z } from 'zod';

const loginPassword = z.string().min(6, 'Kata sandi minimal 6 karakter');

export const loginSchema = z.union([
  z.object({
    identifier: z.string().trim().min(1, 'Masukkan nama pengguna atau email').max(254),
    password: loginPassword,
  }),
  // Keep existing clients that submit an email working.
  z.object({
    email: z.string().trim().email('Format email tidak valid'),
    password: loginPassword,
  }).transform(({ email, password }) => ({ identifier: email, password })),
]);

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email address format'),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters long')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters long'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
