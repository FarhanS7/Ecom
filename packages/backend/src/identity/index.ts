// @shopscale/backend/identity - Users, sessions, authentication
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
  async findUserByEmail() { return null; },
  async findUserById() { return null; },
  async createUser() { throw new Error('Not implemented'); },
  async updateUser() { throw new Error('Not implemented'); },
  async createSession() { throw new Error('Not implemented'); },
  async findSessionByRefreshToken() { return null; },
  async revokeSession() { throw new Error('Not implemented'); },
  async revokeFamily() { throw new Error('Not implemented'); },
};