'use client';

// apps/web/src/features/seller/settings-workspace.tsx - Multi-tab settings workspace (T068).

import React, { useState } from 'react';
import type {
  StoreContentDto,
  StoreMemberDto,
  StorePendingInvitationDto,
  ThemeTokens,
} from '@shopscale/contracts';
import { GeneralSettings } from './general-settings';
import { TeamManagement } from './team-management';
import { ThemeCustomizer } from './theme-customizer';

export type SettingsTab = 'general' | 'team' | 'theme';

export interface SettingsWorkspaceProps {
  storeId: string;
  initialTheme: ThemeTokens;
  initialContent?: StoreContentDto | undefined;
  initialMembers: StoreMemberDto[];
  initialInvitations?: StorePendingInvitationDto[] | undefined;
  currentUserId?: string | undefined;
  defaultTab?: SettingsTab | undefined;
}

export function SettingsWorkspace({
  storeId,
  initialTheme,
  initialContent,
  initialMembers,
  initialInvitations = [],
  currentUserId,
  defaultTab = 'general',
}: SettingsWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  return (
    <div className="ss-settings-workspace" data-testid="settings-workspace">
      {/* Tab Navigation */}
      <div className="ss-tabs-nav" role="tablist" aria-label="Store Settings Navigation">
        <button
          type="button"
          role="tab"
          id="tab-general"
          aria-selected={activeTab === 'general'}
          aria-controls="panel-general"
          onClick={() => setActiveTab('general')}
          className={`ss-tab-button ${activeTab === 'general' ? 'ss-tab-button--active' : ''}`}
        >
          General
        </button>
        <button
          type="button"
          role="tab"
          id="tab-team"
          aria-selected={activeTab === 'team'}
          aria-controls="panel-team"
          onClick={() => setActiveTab('team')}
          className={`ss-tab-button ${activeTab === 'team' ? 'ss-tab-button--active' : ''}`}
        >
          Team & Permissions
        </button>
        <button
          type="button"
          role="tab"
          id="tab-theme"
          aria-selected={activeTab === 'theme'}
          aria-controls="panel-theme"
          onClick={() => setActiveTab('theme')}
          className={`ss-tab-button ${activeTab === 'theme' ? 'ss-tab-button--active' : ''}`}
        >
          Theme Customizer
        </button>
      </div>

      {/* Tab Panels */}
      <div className="ss-tab-panels mt-6">
        {activeTab === 'general' && (
          <div role="tabpanel" id="panel-general" aria-labelledby="tab-general">
            <GeneralSettings storeId={storeId} initialContent={initialContent} />
          </div>
        )}

        {activeTab === 'team' && (
          <div role="tabpanel" id="panel-team" aria-labelledby="tab-team">
            <TeamManagement
              storeId={storeId}
              initialMembers={initialMembers}
              initialInvitations={initialInvitations}
              currentUserId={currentUserId}
            />
          </div>
        )}

        {activeTab === 'theme' && (
          <div role="tabpanel" id="panel-theme" aria-labelledby="tab-theme">
            <ThemeCustomizer storeId={storeId} initialTheme={initialTheme} />
          </div>
        )}
      </div>
    </div>
  );
}
