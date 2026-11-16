'use server';

// @shopscale/web features/admin/actions - Platform admin server actions (T069).
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { apiBaseUrl } from '@/lib/api';

export interface AdminActionResult {
  success: boolean;
  message?: string;
}

export async function approveStoreAction(storeId: string): Promise<AdminActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/stores/${storeId}/approve`, {
      method: 'POST',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Failed to approve store.' };
    }

    revalidatePath('/admin/sellers');
    return { success: true, message: 'Store approved successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}

export async function suspendStoreAction(storeId: string): Promise<AdminActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/stores/${storeId}/suspend`, {
      method: 'POST',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Failed to suspend store.' };
    }

    revalidatePath('/admin/sellers');
    return { success: true, message: 'Store suspended successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}

export async function createCategoryAction(input: {
  name: string;
  slug: string;
  parentId?: string | null;
}): Promise<AdminActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/categories`, {
      method: 'POST',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        parentId: input.parentId || null,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Failed to create category.' };
    }

    revalidatePath('/admin/categories');
    return { success: true, message: 'Category created successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}

export async function reparentCategoryAction(input: {
  categoryId: string;
  parentId: string | null;
}): Promise<AdminActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/categories/${input.categoryId}/parent`, {
      method: 'PUT',
      headers: {
        cookie: cookies().toString(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        parentId: input.parentId,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Failed to reparent category.' };
    }

    revalidatePath('/admin/categories');
    return { success: true, message: 'Category reparented successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<AdminActionResult> {
  const base = apiBaseUrl();
  try {
    const res = await fetch(`${base}/v1/admin/categories/${categoryId}`, {
      method: 'DELETE',
      headers: {
        cookie: cookies().toString(),
      },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { success: false, message: body.message || 'Failed to delete category.' };
    }

    revalidatePath('/admin/categories');
    return { success: true, message: 'Category deleted successfully.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}
