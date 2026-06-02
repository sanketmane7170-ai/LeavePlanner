import jwt from 'jsonwebtoken';

// JWT_SECRET is validated at startup by validateEnv() — safe to assert non-null here
const JWT_SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  userId:       string;
  role:         string;
  tokenVersion: number;
}

export const signToken = (payload: JwtPayload): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, JWT_SECRET) as JwtPayload;
