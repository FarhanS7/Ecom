'use server';

// @shopscale/web features/support/actions - Customer support server actions (T069).
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { apiBaseUrl } from '@/lib/api';

export interface SupportRefundActionResult {
  success: boolean;
  message?: string;
  refundId?: string;
}

export async function issueSupportRefundAction(input: {
  orderId: string;
  amountCents?: number;
  reason: string;
}): Promise<SupportRefundActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/orders/${input.orderId}/refund`, {
      method: 'POST',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amountCents: input.amountCents,
        reason: input.reason,
      }),
    });

    if (!res.ok) {
      if (res.status === 403) {
        return {
          success: false,
          message: 'POLICY_LIMIT_EXCEEDED: Support refunds are capped at $200.00 per order.',
        };
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Refund processing failed.' };
    }

    const data = (await res.json()) as { refundId: string };
    revalidatePath(`/orders/${input.orderId}`);
    revalidatePath(`/admin`);
    return { success: true, refundId: data.refundId, message: 'Refund issued successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}
