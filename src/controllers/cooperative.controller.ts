import { Response } from 'express';
import prisma from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest } from '../types/index.js';

// Get all cooperatives user has access to
export async function getCooperatives(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    // Admin can see all cooperatives, socio only sees their own
    const cooperatives = req.user.role === 'admin'
      ? await prisma.cooperative.findMany({
          select: {
            id: true,
            name: true,
            ruc: true,
          },
          orderBy: { name: 'asc' },
        })
      : req.user.cooperativeId
        ? await prisma.cooperative.findMany({
            where: { id: req.user.cooperativeId },
            select: {
              id: true,
              name: true,
              ruc: true,
            },
          })
        : [];

    sendSuccess(res, cooperatives);
  } catch (error) {
    console.error('Get cooperatives error:', error);
    sendError(res, 'Failed to get cooperatives', 500);
  }
}

// Get cooperative details
export async function getCooperativeInfo(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
      include: {
        settings: true,
        odooConfig: {
          select: {
            isConnected: true,
            lastSync: true,
            url: true,
            database: true,
          },
        },
      },
    });

    if (!cooperative) {
      sendError(res, 'Cooperative not found', 404);
      return;
    }

    sendSuccess(res, cooperative);
  } catch (error) {
    sendError(res, 'Failed to get cooperative info', 500);
  }
}

// Update cooperative info
export async function updateCooperativeInfo(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { name, ruc, address, phone, email } = req.body;

    const updated = await prisma.cooperative.update({
      where: { id: cooperativeId },
      data: {
        name,
        ruc,
        address,
        phone,
        email,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Actualizó información de la cooperativa',
        details: `Nombre: ${name}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, updated, 'Cooperative info updated');
  } catch (error) {
    sendError(res, 'Failed to update cooperative info', 500);
  }
}

// Create new cooperative (super admin only)
export async function createCooperative(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, ruc, address, phone, email } = req.body;

    if (!name) {
      sendError(res, 'Cooperative name is required', 400);
      return;
    }

    const cooperative = await prisma.cooperative.create({
      data: {
        name,
        ruc,
        address,
        phone,
        email,
        settings: {
          create: {
            emailNotifications: true,
            uploadNotifications: true,
            paymentReminders: false,
            twoFactorAuth: false,
            sessionTimeout: true,
            autoBackup: true,
          },
        },
      },
    });

    sendSuccess(res, cooperative, 'Cooperative created', 201);
  } catch (error) {
    sendError(res, 'Failed to create cooperative', 500);
  }
}
