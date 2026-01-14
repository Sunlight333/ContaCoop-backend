import { Request, Response } from 'express';
import prisma from '../config/database.js';
import { generateToken } from '../utils/jwt.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, LoginRequest, LoginResponse } from '../types/index.js';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password }: LoginRequest = req.body;

    console.log('Login attempt:', { email, passwordLength: password?.length });

    if (!email || !password) {
      console.log('Missing email or password');
      sendError(res, 'Email and password are required', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        cooperative: {
          select: { id: true, name: true },
        },
      },
    });

    console.log('User found:', user ? { id: user.id, email: user.email, status: user.status } : null);

    if (!user) {
      console.log('User not found');
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    if (user.status === 'inactive') {
      console.log('User inactive');
      sendError(res, 'Your account has been deactivated', 401);
      return;
    }

    const isValidPassword = await comparePassword(password, user.password);
    console.log('Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('Invalid password');
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'Inició sesión',
        ipAddress: req.ip,
      },
    });

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      cooperativeId: user.cooperativeId,
    });

    const response: LoginResponse = {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        cooperativeId: user.cooperativeId,
        cooperativeName: user.cooperative?.name,
      },
      expiresIn: '7d',
    };

    sendSuccess(res, response, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    sendError(res, 'Login failed', 500);
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (req.user) {
      await prisma.activityLog.create({
        data: {
          userId: req.user.id,
          action: 'Cerró sesión',
          ipAddress: req.ip,
        },
      });
    }

    sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    sendError(res, 'Logout failed', 500);
  }
}

export async function getCurrentUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        memberId: true,
        lastLogin: true,
        status: true,
        cooperativeId: true,
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

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      sendError(res, 'Current and new password are required', 400);
      return;
    }

    if (newPassword.length < 6) {
      sendError(res, 'Password must be at least 6 characters', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    const isValidPassword = await comparePassword(currentPassword, user.password);

    if (!isValidPassword) {
      sendError(res, 'Current password is incorrect', 401);
      return;
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'Cambió su contraseña',
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, null, 'Password changed successfully');
  } catch (error) {
    sendError(res, 'Failed to change password', 500);
  }
}

export async function getUserActivity(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const activities = await prisma.activityLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        details: true,
        createdAt: true,
      },
    });

    sendSuccess(res, activities);
  } catch (error) {
    sendError(res, 'Failed to get activity', 500);
  }
}

// Register new cooperative and admin user
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { cooperativeName, cooperativeType, name, email, password } = req.body;

    // Validate required fields
    if (!cooperativeName || !cooperativeType || !name || !email || !password) {
      sendError(res, 'All fields are required', 400);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      sendError(res, 'Invalid email format', 400);
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      sendError(res, 'Password must be at least 8 characters', 400);
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

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create cooperative and admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create cooperative
      const cooperative = await tx.cooperative.create({
        data: {
          name: cooperativeName,
          type: cooperativeType,
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

      // Create admin user
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          role: 'admin',
          status: 'active',
          cooperativeId: cooperative.id,
        },
      });

      // Log activity
      await tx.activityLog.create({
        data: {
          userId: user.id,
          action: 'Cuenta creada',
          details: `Cooperativa: ${cooperativeName}`,
          ipAddress: req.ip,
        },
      });

      return { cooperative, user };
    });

    sendSuccess(res, {
      message: 'Registration successful',
      cooperativeId: result.cooperative.id,
      userId: result.user.id,
    }, 'Registration successful', 201);
  } catch (error) {
    console.error('Registration error:', error);
    sendError(res, 'Registration failed', 500);
  }
}
