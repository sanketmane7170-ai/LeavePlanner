import jwt from 'jsonwebtoken';

// JWT_SECRET is validated at startup by validateEnv() — safe to assert non-null here
const JWT_SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  userId:       string;
  role:         string;
  tokenVersion: number;
  isFirstLogin: boolean;
}

// expiresIn defaults to 1 day; pass '30d' for a "remember me" session.
export const signToken = (payload: JwtPayload, expiresIn: string = '1d'): string =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: expiresIn as any });

export const verifyToken = (token: string): JwtPayload =>
  jwt.verify(token, JWT_SECRET) as JwtPayload;
