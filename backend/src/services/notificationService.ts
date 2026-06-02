import { prisma } from '../lib/prisma';

export const createNotification = async (
  userId: string,
  type: string,
  message: string,
  link?: string
) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        message,
        link,
      },
    });
    // In the future, this is where we would trigger WebSockets to send real-time updates to connected clients
    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    // Don't throw, we don't want a notification failure to break the main transaction (like leave application)
    return null;
  }
};
