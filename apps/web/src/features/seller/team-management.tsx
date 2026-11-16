'use client';

// apps/web/src/features/seller/team-management.tsx - Staff management & invitations console (T068).

import React, { useState } from 'react';
import type { StoreMemberDto, StorePendingInvitationDto, StoreStaffRole } from '@shopscale/contracts';
import { ActionButton, Card } from '@/components/ui';

export interface TeamManagementProps {
  storeId: string;
  initialMembers: StoreMemberDto[];
  initialInvitations?: StorePendingInvitationDto[] | undefined;
  currentUserId?: string | undefined;
  onInvite?: ((email: string, role: StoreStaffRole) => Promise<boolean | void>) | undefined;
  onUpdateMember?: ((userId: string, role: StoreStaffRole, status: 'active' | 'revoked') => Promise<boolean | void>) | undefined;
}

export function TeamManagement({
  storeId,
  initialMembers,
  initialInvitations = [],
  currentUserId,
  onInvite,
  onUpdateMember,
}: TeamManagementProps) {
  const [members, setMembers] = useState<StoreMemberDto[]>(initialMembers);
  const [invitations, setInvitations] = useState<StorePendingInvitationDto[]>(initialInvitations);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<StoreStaffRole>('catalog-editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  // Count active owners to prevent revoking or demoting the last active owner
  const activeOwnersCount = members.filter((m) => m.role === 'owner' && m.status === 'active').length;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      if (onInvite) {
        await onInvite(inviteEmail.trim().toLowerCase(), inviteRole);
      } else {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'Failed to send invitation.');
        }

        const data = (await res.json()) as { invitationId: string; email: string; role: string; expiresAt: string };
        setInvitations((prev) => [
          {
            id: data.invitationId,
            email: data.email,
            role: data.role as StoreStaffRole,
            expiresAt: data.expiresAt,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      setInviteSuccess(`Invitation sent to ${inviteEmail}!`);
      setInviteEmail('');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (member: StoreMemberDto, newRole: StoreStaffRole) => {
    if (member.role === 'owner' && newRole !== 'owner' && activeOwnersCount <= 1) {
      setMemberError('Cannot demote the last active owner of this store.');
      return;
    }

    setMemberError(null);
    setMemberSuccess(null);

    try {
      if (onUpdateMember) {
        await onUpdateMember(member.userId, newRole, member.status);
      } else {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/members/${member.userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'Failed to update member role.');
        }
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, role: newRole } : m)),
      );
      setMemberSuccess(`Updated ${member.email} role to ${newRole}.`);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const handleRevoke = async (member: StoreMemberDto) => {
    if (member.role === 'owner' && activeOwnersCount <= 1) {
      setMemberError('Cannot revoke the last active owner of this store.');
      return;
    }

    setMemberError(null);
    setMemberSuccess(null);

    const nextStatus = member.status === 'active' ? 'revoked' : 'active';

    try {
      if (onUpdateMember) {
        await onUpdateMember(member.userId, member.role, nextStatus);
      } else {
        const res = await fetch(`/api/v1/seller/stores/${storeId}/members/${member.userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(body.detail ?? 'Failed to update member status.');
        }
      }

      setMembers((prev) =>
        prev.map((m) => (m.userId === member.userId ? { ...m, status: nextStatus } : m)),
      );
      setMemberSuccess(`${nextStatus === 'revoked' ? 'Revoked' : 'Reactivated'} ${member.email}.`);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  return (
    <div className="ss-team-management" data-testid="team-management">
      {/* Invite Member Section */}
      <Card className="ss-form-card mb-6">
        <h2 className="type-title-md">Invite Staff Member</h2>
        <p className="type-caption text-muted">
          Grant team members scoped access to your store according to their business role.
        </p>

        {inviteSuccess && (
          <div className="ss-banner ss-banner--success" role="status">
            {inviteSuccess}
          </div>
        )}
        {inviteError && (
          <div className="ss-banner ss-banner--error" role="alert">
            {inviteError}
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleInvite(e);
          }}
          className="ss-invite-form"
          aria-label="Invite staff form"
        >
          <div className="ss-invite-form__row">
            <div className="ss-form-group flex-1">
              <label htmlFor="invite-email" className="ss-label">Email Address</label>
              <input
                type="email"
                id="invite-email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="ss-input"
              />
            </div>
            <div className="ss-form-group">
              <label htmlFor="invite-role" className="ss-label">Role</label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as StoreStaffRole)}
                className="ss-select"
              >
                <option value="owner">Owner (Full Store Control)</option>
                <option value="manager">Manager (Catalog, Team & Fulfillment)</option>
                <option value="catalog-editor">Catalog Editor (Products Only)</option>
                <option value="fulfillment">Fulfillment (Orders & Returns)</option>
              </select>
            </div>
            <div className="ss-invite-form__submit">
              <ActionButton type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? 'Inviting...' : 'Send Invitation'}
              </ActionButton>
            </div>
          </div>
        </form>
      </Card>

      {/* Staff Members List */}
      <Card className="ss-team-table-card mb-6">
        <div className="ss-card-header">
          <h2 className="type-title-md">Active Staff Members ({members.length})</h2>
        </div>

        {memberSuccess && (
          <div className="ss-banner ss-banner--success" role="status">
            {memberSuccess}
          </div>
        )}
        {memberError && (
          <div className="ss-banner ss-banner--error" role="alert">
            {memberError}
          </div>
        )}

        <div className="ss-table-container">
          <table className="ss-table" aria-label="Store staff members">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isCurrent = member.userId === currentUserId;
                const isOnlyOwner = member.role === 'owner' && activeOwnersCount <= 1;

                return (
                  <tr key={member.userId}>
                    <td>
                      <strong>{member.email}</strong>
                      {isCurrent && <span className="ss-badge ml-2">You</span>}
                    </td>
                    <td>
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        disabled={isOnlyOwner}
                        onChange={(e) => {
                          void handleRoleChange(member, e.target.value as StoreStaffRole);
                        }}
                        className="ss-select ss-select--compact"
                      >
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="catalog-editor">Catalog Editor</option>
                        <option value="fulfillment">Fulfillment</option>
                      </select>
                    </td>
                    <td>
                      <span className={`ss-badge ss-badge--${member.status === 'active' ? 'success' : 'muted'}`}>
                        {member.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={isOnlyOwner && member.status === 'active'}
                        onClick={() => {
                          void handleRevoke(member);
                        }}
                        className={`ss-button ss-button--compact ${
                          member.status === 'active' ? 'ss-button--danger' : 'ss-button--secondary'
                        }`}
                        title={isOnlyOwner ? 'Cannot remove the last active owner' : undefined}
                      >
                        {member.status === 'active' ? 'Revoke' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pending Invitations List */}
      {invitations.length > 0 && (
        <Card className="ss-invitations-card">
          <div className="ss-card-header">
            <h2 className="type-title-md">Pending Invitations ({invitations.length})</h2>
          </div>
          <div className="ss-table-container">
            <table className="ss-table" aria-label="Pending invitations">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Assigned Role</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>
                      <span className="ss-badge">{inv.role}</span>
                    </td>
                    <td>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
