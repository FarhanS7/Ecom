// @shopscale/web features/seller/notices - Console feedback (T027c).
//
// Two shapes only, so every panel in the console announces the same way: a
// polite status message for "this worked / nothing to do", and an assertive
// alert for anything the seller must act on. The conflict notice is separate
// because a version conflict is neither: it is a decision the seller makes.

import type { ReactNode } from 'react';
import { SecondaryButton } from '@/components/ui';

export interface ActionNoticeProps {
  /** Rendered only when there is something to say. */
  tone: 'ok' | 'error';
  children: ReactNode;
}

export function ActionNotice({ tone, children }: ActionNoticeProps) {
  if (tone === 'ok') {
    return (
      <p className="ss-notice" role="status">
        {children}
      </p>
    );
  }
  return (
    <p className="ss-error" role="alert">
      {children}
    </p>
  );
}

export interface ConflictNoticeProps {
  message: string;
  /** Adopt the server's current version (replaces the entered values). */
  onReload?: (() => void) | undefined;
  /** Re-send the entered values on top of the server's current version. */
  onApply?: (() => void) | undefined;
}

/**
 * Optimistic concurrency as a decision, not an error wall: the seller either
 * takes the newer values or keeps their own on top of them. When the current
 * version could not be read (`onReload`/`onApply` absent) the notice says so
 * instead of offering a button that would only fail again.
 */
export function ConflictNotice({ message, onReload, onApply }: ConflictNoticeProps) {
  return (
    <div className="ss-conflict" role="alert">
      <p className="ss-conflict__message">{message}</p>
      {onReload !== undefined || onApply !== undefined ? (
        <div className="ss-conflict__actions">
          {onReload !== undefined ? (
            <SecondaryButton onClick={onReload}>Reload latest</SecondaryButton>
          ) : null}
          {onApply !== undefined ? (
            <SecondaryButton onClick={onApply}>Apply my changes</SecondaryButton>
          ) : null}
        </div>
      ) : (
        <p className="type-caption">
          Reload this page to see the latest version, then try again.
        </p>
      )}
    </div>
  );
}
