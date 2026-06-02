import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: { userId: string; role: string };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  const token = req.cookies.jwt;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    const decoded = verifyToken(token);

    // Verify tokenVersion — catches tokens issued before logout / password change
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { tokenVersion: true },
    });

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      res.clearCookie('jwt');
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch {
    res.clearCookie('jwt');
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireRole = (role: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction): any => {
    if (req.user?.role !== role) {
      return res.status(403).json({ message: 'Access forbidden: Insufficient privileges' });
    }
    next();
  };
};
