import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { authenticate } from '../middleware/authenticate';
import type { AuthRequest } from '../middleware/authenticate';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { employee: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });

    // Set cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
        employee: user.employee ? {
          fullName: user.employee.fullName,
          employeeId: user.employee.employeeId,
          canViewTeamCalendar: user.employee.canViewTeamCalendar,
        } : null,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('jwt');
  res.json({ message: 'Logged out successfully' });
});

router.patch('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Not authenticated' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, isFirstLogin: false, tokenVersion: { increment: 1 } },
    });

    return res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('change-password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isFirstLogin: user.isFirstLogin,
        employee: user.employee ? {
          fullName: user.employee.fullName,
          employeeId: user.employee.employeeId,
          canViewTeamCalendar: user.employee.canViewTeamCalendar,
        } : null,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── OTP Email Helper ────────────────────────────────────────────────────────
import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

router.post('/forgot-password', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't leak if user exists, just return success
      return res.json({ message: 'If an account exists, an OTP has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.passwordResetToken.create({
      data: { email, otp, expiresAt },
    });

    const html = `
      <div style="font-family:sans-serif;padding:20px;">
        <h2>Password Reset Request</h2>
        <p>Your one-time password (OTP) to reset your password is:</p>
        <h1 style="font-size:32px;letter-spacing:4px;color:#4F46E5;">${otp}</h1>
        <p>This code will expire in 15 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Innovizia <noreply@innovizia.com>',
      to: email,
      subject: 'Your Password Reset OTP',
      html,
    });

    return res.json({ message: 'If an account exists, an OTP has been sent.' });
  } catch (error) {
    console.error('forgot-password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reset-password', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const token = await prisma.passwordResetToken.findFirst({
      where: { email, otp },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) return res.status(400).json({ message: 'Invalid OTP' });
    if (token.expiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, isFirstLogin: false, tokenVersion: { increment: 1 } },
    });

    // Delete used tokens for this email
    await prisma.passwordResetToken.deleteMany({ where: { email } });

    return res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
