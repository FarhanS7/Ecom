// @shopscale/backend/reporting - Read-replica analytics, audit log, seller/platform dashboards
export interface SalesMetrics {
  gmvCents: number;
  ordersCount: number;
  avgOrderValueCents: number;
  topSellers: Array<{ sellerId: string; gmvCents: number; ordersCount: number }>;
  periodStart: Date;
  periodEnd: Date;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  requestId: string;
  createdAt: Date;
}

export interface ReportingPorts {
  getSalesMetrics(periodStart: Date, periodEnd: Date): Promise<SalesMetrics>;
  getSellerMetrics(sellerId: string, periodStart: Date, periodEnd: Date): Promise<SalesMetrics>;
  getAuditLogs(filters: { actorId?: string; entityType?: string; from?: Date; to?: Date }, options: { cursor?: string; limit: number }): Promise<{ items: AuditLog[]; nextCursor: string | null }>;
}

export const reportingPorts: ReportingPorts = {
  async getSalesMetrics() { throw new Error('Not implemented'); },
  async getSellerMetrics() { throw new Error('Not implemented'); },
  async getAuditLogs() { return { items: [], nextCursor: null }; },
};