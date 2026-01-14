import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import { verifyToken } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';
import prisma from '../config/database.js';

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendError(res, 'No token provided', 401);
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token);

      // Verify user still exists and is active
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          cooperativeId: true,
          memberId: true,
        },
      });

      if (!user) {
        sendError(res, 'User not found', 401);
        return;
      }

      if (user.status === 'inactive') {
        sendError(res, 'User account is inactive', 401);
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        cooperativeId: user.cooperativeId,
        memberId: user.memberId || undefined,
      };

      next();
    } catch (jwtError) {
      sendError(res, 'Invalid or expired token', 401);
      return;
    }
  } catch (error) {
    sendError(res, 'Authentication failed', 500);
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendError(res, 'Not authenticated', 401);
    return;
  }

  if (req.user.role !== 'admin') {
    sendError(res, 'Admin access required', 403);
    return;
  }

  next();
}

export function requireCooperative(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendError(res, 'Not authenticated', 401);
    return;
  }

  // Check for cooperative in query params or use user's default
  const cooperativeId = (req.query.cooperativeId as string) || req.user.cooperativeId;

  if (!cooperativeId) {
    sendError(res, 'Cooperative not specified', 400);
    return;
  }

  // Attach cooperativeId to request for use in controllers
  (req as AuthRequest & { cooperativeId: string }).cooperativeId = cooperativeId;

  next();
}
