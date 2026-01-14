import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/env.js';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  cooperativeId: string | null;
  memberId?: string;
}

export function generateToken(payload: JwtPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
