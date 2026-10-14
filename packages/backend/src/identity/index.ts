// @shopscale/backend/identity - Users, sessions, authentication
export * from './auth.service.js';
export * from './session.service.js';
export * from './session.guard.js';
export * from './schema.js';
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  status: 'active' | 'suspended' | 'pending_verification';
  createdAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  refreshTokenHash: string;
  familyId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface IdentityPorts {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(data: { email: string; passwordHash: string; name: string }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  createSession(data: { userId: string; refreshTokenHash: string; familyId: string; expiresAt: Date }): Promise<Session>;
  findSessionByRefreshToken(tokenHash: string): Promise<Session | null>;
  revokeSession(sessionId: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export const identityPorts: IdentityPorts = {
  findUserByEmail() { return Promise.resolve(null); },
  findUserById() { return Promise.resolve(null); },
  createUser() { return Promise.reject(new Error('Not implemented')); },
  updateUser() { return Promise.reject(new Error('Not implemented')); },
  createSession() { return Promise.reject(new Error('Not implemented')); },
  findSessionByRefreshToken() { return Promise.resolve(null); },
  revokeSession() { return Promise.reject(new Error('Not implemented')); },
  revokeFamily() { return Promise.reject(new Error('Not implemented')); },
};