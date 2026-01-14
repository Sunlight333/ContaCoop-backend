import { Response } from 'express';
import prisma from '../config/database.js';
import { hashPassword, generateRandomPassword } from '../utils/password.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, CreateUserInput } from '../types/index.js';

// Get all users
export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const search = req.query.search as string;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const where: any = { cooperativeId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        memberId: true,
        lastLogin: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    sendSuccess(res, users);
  } catch (error) {
    sendError(res, 'Failed to get users', 500);
  }
}

// Create new user
export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { email, name, role, password }: CreateUserInput = req.body;

    if (!email || !name) {
      sendError(res, 'Email and name are required', 400);
      return;
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      sendError(res, 'Email already registered', 400);
      return;
    }

    // Generate password if not provided
    const userPassword = password || generateRandomPassword();
    const hashedPassword = await hashPassword(userPassword);

    // Generate unique member ID by finding the highest existing memberId globally
    // (memberId is globally unique, not per-cooperative)
    const allUsers = await prisma.user.findMany({
      where: {
        memberId: { not: null }
      },
      select: { memberId: true },
    });

    let nextMemberId = 'M001';
    if (allUsers.length > 0) {
      // Find the highest member number across all cooperatives
      const memberNumbers = allUsers
        .map(u => parseInt(u.memberId?.replace('M', '') || '0'))
        .filter(n => !isNaN(n));

      if (memberNumbers.length > 0) {
        const maxNum = Math.max(...memberNumbers);
        nextMemberId = `M${(maxNum + 1).toString().padStart(3, '0')}`;
      }
    }

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        role: role || 'socio',
        memberId: nextMemberId,
        cooperativeId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        memberId: true,
        createdAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Creó un nuevo usuario',
        details: `Usuario: ${name} (${email})`,
        ipAddress: req.ip,
      },
    });

    // In production, send email with credentials
    // For now, return the generated password (only for initial setup)
    sendSuccess(
      res,
      {
        user,
        temporaryPassword: password ? undefined : userPassword,
      },
      'User created successfully',
      201
    );
  } catch (error) {
    console.error('Create user error:', error);
    sendError(res, 'Failed to create user', 500);
  }
}

// Change user role
export async function changeUserRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'socio'].includes(role)) {
      sendError(res, 'Valid role is required (admin or socio)', 400);
      return;
    }

    // Prevent changing own role
    if (userId === req.user?.id) {
      sendError(res, 'Cannot change your own role', 400);
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Cambió el rol de un usuario',
        details: `Usuario: ${user.name}, Nuevo rol: ${role}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, user, 'User role updated');
  } catch (error) {
    sendError(res, 'Failed to change user role', 500);
  }
}

// Change user status (activate/deactivate)
export async function changeUserStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status)) {
      sendError(res, 'Valid status is required (active or inactive)', 400);
      return;
    }

    // Prevent deactivating self
    if (userId === req.user?.id && status === 'inactive') {
      sendError(res, 'Cannot deactivate your own account', 400);
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: status === 'active' ? 'Activó un usuario' : 'Desactivó un usuario',
        details: `Usuario: ${user.name}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, user, `User ${status === 'active' ? 'activated' : 'deactivated'}`);
  } catch (error) {
    sendError(res, 'Failed to change user status', 500);
  }
}

// Reset user password
export async function resetUserPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    const newPassword = generateRandomPassword();
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Restableció la contraseña de un usuario',
        details: `Usuario: ${user.name}`,
        ipAddress: req.ip,
      },
    });

    // In production, send email with new password
    // For now, return the new password
    sendSuccess(
      res,
      { temporaryPassword: newPassword },
      'Password reset successfully. Send this temporary password to the user.'
    );
  } catch (error) {
    sendError(res, 'Failed to reset password', 500);
  }
}

// Get user by ID
export async function getUserById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        memberId: true,
        lastLogin: true,
        createdAt: true,
        cooperative: {
          select: { id: true, name: true },
        },
      },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    sendError(res, 'Failed to get user', 500);
  }
}
