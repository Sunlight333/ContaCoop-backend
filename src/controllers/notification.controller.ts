import { Response } from 'express';
import prisma from '../config/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AuthRequest, SendNotificationInput } from '../types/index.js';

// Send notification (admin only)
export async function sendNotification(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const { title, message, recipientType, specificUserIds }: SendNotificationInput = req.body;

    if (!title || !message || !recipientType) {
      sendError(res, 'Title, message, and recipient type are required', 400);
      return;
    }

    // Get recipient users based on type
    let recipientUsers: { id: string }[] = [];

    if (recipientType === 'all') {
      recipientUsers = await prisma.user.findMany({
        where: { cooperativeId, status: 'active', role: 'socio' },
        select: { id: true },
      });
    } else if (recipientType === 'with_debt') {
      // Get users who have debt in current period
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const membersWithDebt = await prisma.membershipFee.findMany({
        where: { cooperativeId, year, month, status: 'with_debt' },
        select: { memberId: true },
      });

      const memberIds = membersWithDebt.map((m) => m.memberId);

      recipientUsers = await prisma.user.findMany({
        where: {
          cooperativeId,
          status: 'active',
          memberId: { in: memberIds },
        },
        select: { id: true },
      });
    } else if (recipientType === 'specific' && specificUserIds) {
      recipientUsers = specificUserIds.map((id) => ({ id }));
    }

    if (recipientUsers.length === 0) {
      sendError(res, 'No recipients found for this notification', 400);
      return;
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        cooperativeId,
        senderId: req.user!.id,
        title,
        message,
        recipientType,
        recipients: {
          create: recipientUsers.map((user) => ({
            userId: user.id,
          })),
        },
      },
      include: {
        recipients: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'Envió una notificación',
        details: `Título: ${title}, Destinatarios: ${recipientUsers.length}`,
        ipAddress: req.ip,
      },
    });

    sendSuccess(
      res,
      {
        id: notification.id,
        recipientCount: recipientUsers.length,
      },
      `Notification sent to ${recipientUsers.length} users`
    );
  } catch (error) {
    console.error('Send notification error:', error);
    sendError(res, 'Failed to send notification', 500);
  }
}

// Get notification history (admin)
export async function getNotificationHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const cooperativeId = req.query.cooperativeId as string || req.user?.cooperativeId;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!cooperativeId) {
      sendError(res, 'Cooperative ID required', 400);
      return;
    }

    const notifications = await prisma.notification.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    });

    const formatted = notifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      recipientType: n.recipientType,
      recipientCount: n._count.recipients,
      senderName: n.sender.name,
      createdAt: n.createdAt.toISOString(),
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    sendError(res, 'Failed to get notification history', 500);
  }
}

// Get my notifications (for socio users)
export async function getMyNotifications(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'Not authenticated', 401);
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const unreadOnly = req.query.unreadOnly === 'true';

    const where: any = { userId: req.user.id };
    if (unreadOnly) {
      where.isRead = false;
    }

    const userNotifications = await prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        notification: {
          select: {
            title: true,
            message: true,
            createdAt: true,
            sender: { select: { name: true } },
          },
        },
      },
    });

    const formatted = userNotifications.map((un) => ({
      id: un.id,
      title: un.notification.title,
      message: un.notification.message,
      senderName: un.notification.sender.name,
      isRead: un.isRead,
      readAt: un.readAt?.toISOString(),
      createdAt: un.notification.createdAt.toISOString(),
    }));

    sendSuccess(res, formatted);
  } catch (error) {
    sendError(res, 'Failed to get notifications', 500);
  }
}

// Mark notification as read
export async function markNotificationAsRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { notificationId } = req.params;

    const userNotification = await prisma.userNotification.findFirst({
      where: { id: notificationId, userId: req.user!.id },
    });

    if (!userNotification) {
      sendError(res, 'Notification not found', 404);
      return;
    }

    await prisma.userNotification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    sendSuccess(res, null, 'Notification marked as read');
  } catch (error) {
    sendError(res, 'Failed to mark notification as read', 500);
  }
}

// Mark all notifications as read
export async function markAllNotificationsAsRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    await prisma.userNotification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    sendSuccess(res, null, 'All notifications marked as read');
  } catch (error) {
    sendError(res, 'Failed to mark notifications as read', 500);
  }
}

// Get unread notification count
export async function getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await prisma.userNotification.count({
      where: { userId: req.user!.id, isRead: false },
    });

    sendSuccess(res, { count });
  } catch (error) {
    sendError(res, 'Failed to get unread count', 500);
  }
}
