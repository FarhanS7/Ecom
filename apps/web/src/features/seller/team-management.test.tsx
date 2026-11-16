// apps/web/src/features/seller/team-management.test.tsx - Unit tests for team management component (T068).

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TeamManagement } from './team-management';
import type { StoreMemberDto, StorePendingInvitationDto } from '@shopscale/contracts';

const mockMembers: StoreMemberDto[] = [
  {
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'owner@store.com',
    role: 'owner',
    status: 'active',
  },
  {
    userId: '00000000-0000-0000-0000-000000000002',
    email: 'editor@store.com',
    role: 'catalog-editor',
    status: 'active',
  },
];

const mockInvitations: StorePendingInvitationDto[] = [
  {
    id: '00000000-0000-0000-0000-000000000010',
    email: 'pending@store.com',
    role: 'fulfillment',
    expiresAt: '2026-12-01T00:00:00.000Z',
    createdAt: '2026-11-16T00:00:00.000Z',
  },
];

describe('TeamManagement Component (T068)', () => {
  afterEach(cleanup);
  const storeId = '00000000-0000-0000-0000-000000000001';

  it('renders members and pending invitations', () => {
    render(
      <TeamManagement
        storeId={storeId}
        initialMembers={mockMembers}
        initialInvitations={mockInvitations}
        currentUserId="00000000-0000-0000-0000-000000000001"
      />,
    );

    expect(screen.getByText('owner@store.com')).toBeInTheDocument();
    expect(screen.getByText('editor@store.com')).toBeInTheDocument();
    expect(screen.getByText('pending@store.com')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('blocks revoking the only active owner', async () => {
    render(
      <TeamManagement
        storeId={storeId}
        initialMembers={mockMembers}
        initialInvitations={mockInvitations}
      />,
    );

    const revokeButtons = screen.getAllByRole('button', { name: /revoke/i });
    const ownerRevokeButton = revokeButtons[0]!;
    expect(ownerRevokeButton).toBeDisabled();
  });

  it('allows revoking a non-owner staff member', async () => {
    const onUpdateMember = vi.fn().mockResolvedValue(true);
    render(
      <TeamManagement
        storeId={storeId}
        initialMembers={mockMembers}
        onUpdateMember={onUpdateMember}
      />,
    );

    const revokeButtons = screen.getAllByRole('button', { name: /revoke/i });
    const editorRevokeButton = revokeButtons[1]!;
    expect(editorRevokeButton).not.toBeDisabled();

    fireEvent.click(editorRevokeButton);

    await waitFor(() => {
      expect(onUpdateMember).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000002',
        'catalog-editor',
        'revoked',
      );
    });
  });

  it('submits an invitation via onInvite handler', async () => {
    const onInvite = vi.fn().mockResolvedValue(true);
    render(
      <TeamManagement
        storeId={storeId}
        initialMembers={mockMembers}
        onInvite={onInvite}
      />,
    );

    const emailInput = screen.getByLabelText('Email Address');
    fireEvent.change(emailInput, { target: { value: 'newstaff@store.com' } });

    const sendButton = screen.getByRole('button', { name: /send invitation/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('newstaff@store.com', 'catalog-editor');
      expect(screen.getByText('Invitation sent to newstaff@store.com!')).toBeInTheDocument();
    });
  });
});
