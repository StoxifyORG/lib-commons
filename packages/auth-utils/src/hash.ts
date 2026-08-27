import crypto from 'crypto';
import bcrypt from 'bcrypt';

export const sha256 = (input: string): string =>
  crypto.createHash('sha256').update(input).digest('hex');

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, 12);

export const comparePassword = (password: string, hash: string): Promise<boolean> =>
  bcrypt.compare(password, hash);
