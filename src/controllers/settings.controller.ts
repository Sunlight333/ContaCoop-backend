import { Response } from 'express';
import prisma from '../config/database.js';
import odooService from '../services/odoo.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, OdooConfigInput } from '../types/index.js';

// Get settings
export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const settings = await prisma.settings.findUnique({
      where: { cooperativeId },
    });

    if (!settings) {
      // Create default settings
      const defaultSettings = await prisma.settings.create({
        data: {
          cooperativeId,
          emailNotifications: true,
          uploadNotifications: true,
          paymentReminders: false,
          twoFactorAuth: false,
          sessionTimeout: true,
          autoBackup: true,
        },
      });
      sendSuccess(res, defaultSettings);
      return;
    }

    sendSuccess(res, settings);
  } catch (error) {
    sendError(res, 'Failed to get settings', 500);
  }
}

// Update notification settings
export async function updateNotificationSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { emailNotifications, uploadNotifications, paymentReminders } = req.body;

    const settings = await prisma.settings.upsert({
      where: { cooperativeId },
      update: {
        emailNotifications: emailNotifications ?? undefined,
        uploadNotifications: uploadNotifications ?? undefined,
        paymentReminders: paymentReminders ?? undefined,
      },
      create: {
        cooperativeId,
        emailNotifications: emailNotifications ?? true,
        uploadNotifications: uploadNotifications ?? true,
        paymentReminders: paymentReminders ?? false,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Actualizó configuración de notificaciones',
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, settings, 'Notification settings updated');
  } catch (error) {
    sendError(res, 'Failed to update notification settings', 500);
  }
}

// Update security settings
export async function updateSecuritySettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { twoFactorAuth, sessionTimeout, sessionTimeoutMinutes } = req.body;

    const settings = await prisma.settings.upsert({
      where: { cooperativeId },
      update: {
        twoFactorAuth: twoFactorAuth ?? undefined,
        sessionTimeout: sessionTimeout ?? undefined,
        sessionTimeoutMinutes: sessionTimeoutMinutes ?? undefined,
      },
      create: {
        cooperativeId,
        twoFactorAuth: twoFactorAuth ?? false,
        sessionTimeout: sessionTimeout ?? true,
        sessionTimeoutMinutes: sessionTimeoutMinutes ?? 30,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Actualizó configuración de seguridad',
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, settings, 'Security settings updated');
  } catch (error) {
    sendError(res, 'Failed to update security settings', 500);
  }
}

// Update backup settings
export async function updateBackupSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { autoBackup } = req.body;

    const settings = await prisma.settings.upsert({
      where: { cooperativeId },
      update: { autoBackup: autoBackup ?? undefined },
      create: {
        cooperativeId,
        autoBackup: autoBackup ?? true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Actualizó configuración de respaldos',
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, settings, 'Backup settings updated');
  } catch (error) {
    sendError(res, 'Failed to update backup settings', 500);
  }
}

// Get Odoo connection status
export async function getOdooStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const config = await prisma.odooConfig.findUnique({
      where: { cooperativeId },
    });

    if (!config) {
      sendSuccess(res, {
        url: '',
        database: '',
        username: '',
        apiKey: '',
        isConnected: false,
        lastSync: null,
      });
      return;
    }

    sendSuccess(res, {
      url: config.url,
      database: config.database,
      username: config.username,
      apiKey: config.apiKey,
      companyId: config.companyId,
      isConnected: config.isConnected,
      lastSync: config.lastSync?.toISOString() || null,
    });
  } catch (error) {
    sendError(res, 'Failed to get Odoo status', 500);
  }
}

// Save Odoo configuration
export async function saveOdooConfig(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { url, database, username, apiKey, companyId }: OdooConfigInput = req.body;

    if (!url || !database || !username || !apiKey) {
      sendError(res, 'All Odoo configuration fields are required', 400);
      return;
    }

    await odooService.saveConfig(cooperativeId, { url, database, username, apiKey, companyId });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Configuró conexión con Odoo',
        details: `URL: ${url}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(res, null, 'Odoo configuration saved');
  } catch (error) {
    sendError(res, 'Failed to save Odoo configuration', 500);
  }
}

// Test Odoo connection
export async function testOdooConnection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { url, database, username, apiKey }: OdooConfigInput = req.body;

    if (!url || !database || !username || !apiKey) {
      sendError(res, 'All Odoo configuration fields are required', 400);
      return;
    }

    const result = await odooService.testConnection({ url, database, username, apiKey });

    if (result.success) {
      sendSuccess(res, result, 'Connection successful');
    } else {
      sendError(res, result.message, 400);
    }
  } catch (error) {
    sendError(res, 'Failed to test connection', 500);
  }
}

// Fetch Odoo companies
export async function getOdooCompanies(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { url, database, username, apiKey }: OdooConfigInput = req.body;

    if (!url || !database || !username || !apiKey) {
      sendError(res, 'All Odoo configuration fields are required', 400);
      return;
    }

    const companies = await odooService.fetchCompanies({ url, database, username, apiKey });
    sendSuccess(res, companies, 'Companies fetched successfully');
  } catch (error) {
    sendError(res, 'Failed to fetch Odoo companies', 500);
  }
}

// Export all data
export async function exportAllData(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    // Gather all data
    const cooperative = await prisma.cooperative.findUnique({
      where: { id: cooperativeId },
    });

    const users = await prisma.user.findMany({
      where: { cooperativeId },
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
    });

    const balanceSheetEntries = await prisma.balanceSheetEntry.findMany({
      where: { cooperativeId },
    });

    const cashFlowEntries = await prisma.cashFlowEntry.findMany({
      where: { cooperativeId },
    });

    const membershipFees = await prisma.membershipFee.findMany({
      where: { cooperativeId },
    });

    const financialRatios = await prisma.financialRatio.findMany({
      where: { cooperativeId },
    });

    const exportData = {
      exportDate: new Date().toISOString(),
      cooperative,
      users,
      balanceSheetEntries,
      cashFlowEntries,
      membershipFees,
      financialRatios,
    };

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Exportó todos los datos',
        ipAddress: req.ip,
      },
    });

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cooperative-data-${new Date().toISOString().split('T')[0]}.json"`);

    res.json(exportData);
  } catch (error) {
    sendError(res, 'Failed to export data', 500);
  }
}
