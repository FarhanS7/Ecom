def get_tasks():
    return [
        {
            "id": "009",
            "name": "Model Global Accounts and Session Records",
            "status": "IMPLEMENTED",
            "goal": "Author Drizzle schema and migrations for users, platform_roles, permissions, session_families, and refresh_tokens.",
            "why": "Provides normalized global customer identity and stateful session tracking for token rotation.",
            "requirements": ["ID-1", "ID-3", "G4", "PRD Section 8"],
            "blocked_by": ["TASK-003", "TASK-008"],
            "blocks": ["TASK-010", "TASK-011", "TASK-012", "TASK-014", "TASK-091"],
            "architecture": ["ARCHITECTURE.md -> Authentication", "DECISIONS.md -> DEC-004"],
            "skills": [
                {
                    "name": "domain-modeling",
                    "location": "skills/skills-main/skills/engineering/domain-modeling/SKILL.md",
                    "why": "Governs designing normalized identity tables and relationship constraints.",
                    "instructions": ["Normalize emails on write", "Hash all stored tokens"]
                }
            ],
            "inspect_files": ["packages/backend/src/identity/schema.ts", "db/migrations/0001-identity.sql"],
            "current_behavior": "Completed. 0001-identity.sql applied with unique email constraints, session families, and token hash indexes.",
            "required_behavior": "PostgreSQL schema enforces unique normalized emails and parent session family cascade rules.",
            "contracts": "Users, SessionFamilies, RefreshTokens Drizzle schema definitions.",
            "commands": [
                "Define Drizzle schema for identity tables in packages/backend/src/identity/schema.ts.",
                "Generate migration 0001-identity.sql with indexes on user_id and token_hash.",
                "Apply migration and verify schema constraints in integration tests."
            ],
            "data_changes": "Creates users, platform_roles, permissions, role_permissions, user_platform_roles, session_families, refresh_tokens, identity_tokens.",
            "security": "Raw tokens and plaintext passwords are never stored in the database.",
            "error_handling": "Unique constraint violations on email throw typed DuplicateEmailError.",
            "edge_cases": ["Case insensitivity in email addresses", "Null replacement token on fresh session"],
            "observability": "Migration log confirmation.",
            "unit_tests": ["packages/backend/src/identity/schema.test.ts"],
            "integration_tests": ["Identity schema constraint tests against PostgreSQL"],
            "e2e_tests": ["None."],
            "security_tests": ["Assert token_hash column stores SHA-256 digests"],
            "manual_verification": "Inspect PostgreSQL tables via psql: \\d users; verify unique email constraint exists.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on security and session lifetime rules. Recorded in docs/reviews/t009-context.md.",
            "commit": "feat(identity): model global accounts and session families in postgres"
        },
        {
            "id": "010",
            "name": "Implement Registration and Login",
            "status": "IMPLEMENTED",
            "goal": "Build AuthService with Argon2id password hashing, credential verification, and initial session issuance.",
            "why": "Provides secure entry point for customer and seller authentication.",
            "requirements": ["ID-1", "G4", "PRD Section 6.1"],
            "blocked_by": ["TASK-006", "TASK-009"],
            "blocks": ["TASK-011", "TASK-013", "TASK-017", "TASK-018"],
            "architecture": ["ARCHITECTURE.md -> Authentication", "DECISIONS.md -> DEC-004"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs Argon2id implementation and secure credential handling.",
                    "instructions": ["Use memoryCost 64MB and timeCost 3", "Enforce timing-safe comparisons"]
                }
            ],
            "inspect_files": ["packages/backend/src/identity/auth.service.ts", "packages/backend/src/identity/auth.controller.ts"],
            "current_behavior": "Completed. POST /v1/auth/register and /v1/auth/login validate credentials and issue HttpOnly session cookies.",
            "required_behavior": "Valid credentials issue JWT and refresh token; invalid credentials return 401 with generic message.",
            "contracts": "RegisterDto, LoginDto, SessionResponse DTOs in @shopscale/contracts.",
            "commands": [
                "Implement Argon2id hashing in packages/backend/src/identity/password.ts.",
                "Build AuthService.register() and AuthService.login() methods.",
                "Expose Fastify controller endpoints setting shopscale_session cookie."
            ],
            "data_changes": "Inserts users, session_families, refresh_tokens.",
            "security": "Password hashing uses Argon2id; timing attack prevention on invalid user emails.",
            "error_handling": "Returns 401 Invalid Credentials on wrong password; 409 Conflict on existing email.",
            "edge_cases": ["Whitespace trimming in emails", "Unicode password characters"],
            "observability": "Structured audit log of successful and failed login attempts.",
            "unit_tests": ["packages/backend/src/identity/auth.service.test.ts"],
            "integration_tests": ["Authentication flow integration test with live PostgreSQL"],
            "e2e_tests": ["tests/e2e/account.spec.ts"],
            "security_tests": ["Timing attack resistance verification"],
            "manual_verification": "Register test account via curl; login and verify Set-Cookie header contains HttpOnly session token.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on password security and cookie flags. Documented in docs/reviews/t010-context.md.",
            "commit": "feat(identity): implement registration and login with argon2id hashing"
        },
        {
            "id": "011",
            "name": "Implement Refresh Rotation and Logout",
            "status": "IMPLEMENTED",
            "goal": "Build refresh token rotation with reuse detection, session family revocation, and logout invalidation.",
            "why": "Prevents stolen refresh tokens from gaining persistent access while maintaining long-lived user sessions.",
            "requirements": ["ID-1", "ID-3", "G4", "PRD Section 6.1"],
            "blocked_by": ["TASK-010"],
            "blocks": ["TASK-013", "TASK-017", "TASK-018"],
            "architecture": ["ARCHITECTURE.md -> Authentication", "DECISIONS.md -> DEC-004"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Enforces token family reuse detection protocols.",
                    "instructions": ["Revoke entire family on reuse", "Hash tokens prior to DB lookup"]
                }
            ],
            "inspect_files": ["packages/backend/src/identity/session.service.ts", "packages/backend/src/identity/session.guard.ts"],
            "current_behavior": "Completed. POST /v1/auth/refresh rotates token; replayed token revokes session family; POST /v1/auth/logout invalidates session.",
            "required_behavior": "Refreshing token updates used_at and issues new token; presenting consumed token revokes all sibling tokens.",
            "contracts": "POST /v1/auth/refresh -> 200 OK + new cookies; POST /v1/auth/logout -> 200 OK + cleared cookies.",
            "commands": [
                "Implement SessionService.rotateToken() with atomic Drizzle transaction.",
                "Add reuse detection check revoking family if used_at is not null.",
                "Implement SessionService.revoke() for logout."
            ],
            "data_changes": "Updates refresh_tokens (used_at, replacement_id) and session_families (revoked_at).",
            "security": "Reused refresh token immediately neutralizes compromised session family.",
            "error_handling": "Returns 401 Unauthorized with code REFRESH_TOKEN_REUSED upon reuse.",
            "edge_cases": ["Concurrent refresh requests from multiple browser tabs"],
            "observability": "Security alert logged on token reuse detection.",
            "unit_tests": ["packages/backend/src/identity/session.service.test.ts"],
            "integration_tests": ["Token rotation and reuse revocation integration test"],
            "e2e_tests": ["tests/e2e/account.spec.ts"],
            "security_tests": ["Simulated token theft and replay test asserting total family revocation"],
            "manual_verification": "Exchange refresh token twice; assert second call returns 401 and invalidates active session.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on concurrent rotation races. Documented in docs/reviews/t011-context.md.",
            "commit": "feat(identity): implement refresh token rotation and reuse revocation"
        },
        {
            "id": "012",
            "name": "Implement Account Recovery and Verification",
            "status": "IMPLEMENTED",
            "goal": "Build email verification and password reset flows using single-use hash tokens and expiration TTLs.",
            "why": "Enables customers to securely recover accounts and verify email ownership.",
            "requirements": ["ID-1", "ID-2", "PRD Section 6.1"],
            "blocked_by": ["TASK-009", "TASK-010"],
            "blocks": ["TASK-017"],
            "architecture": ["ARCHITECTURE.md -> Authentication", "DECISIONS.md -> DEC-004"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs cryptographic token generation and timing-safe consumption.",
                    "instructions": ["Use crypto.randomBytes(32)", "Store only SHA-256 hash in DB"]
                }
            ],
            "inspect_files": ["packages/backend/src/identity/recovery.service.ts", "packages/backend/src/identity/identity-token.ts"],
            "current_behavior": "Completed. Endpoints for /password-reset/request, /password-reset/confirm, and /verify-email fully operational.",
            "required_behavior": "Generates 1-hour reset token; confirms new password; marks email verified upon token match.",
            "contracts": "PasswordResetRequestDto, PasswordResetConfirmDto, VerifyEmailDto.",
            "commands": [
                "Implement IdentityTokenService generating secure random 32-byte tokens.",
                "Build RecoveryService handling request and confirmation with Argon2id update.",
                "Add email verification endpoint marking users.status = 'ACTIVE'."
            ],
            "data_changes": "Inserts identity_tokens; updates users (password_hash, status).",
            "security": "Reset tokens expire after 60 minutes and can be used exactly once.",
            "error_handling": "Returns 400 Bad Request on expired or already-consumed recovery tokens.",
            "edge_cases": ["Password reset requested for non-existent email (must return 200 to prevent user enumeration)"],
            "observability": "Audit log for every password change and verification.",
            "unit_tests": ["packages/backend/src/identity/recovery.service.test.ts"],
            "integration_tests": ["Account recovery lifecycle test"],
            "e2e_tests": ["tests/e2e/account.spec.ts"],
            "security_tests": ["User enumeration prevention test on reset request endpoint"],
            "manual_verification": "Request password reset; copy token hash; confirm new password and login with new credentials.",
            "risk_level": "MEDIUM",
            "review_requirements": "Thorough independent review of user enumeration defenses. Documented in docs/reviews/t012-context.md.",
            "commit": "feat(identity): implement password reset and email verification flows"
        },
        {
            "id": "013",
            "name": "Add Authentication Throttling and Protections",
            "status": "IMPLEMENTED",
            "goal": "Build Redis sliding-window rate limiters on login, registration, and password recovery endpoints.",
            "why": "Protects authentication routes against brute-force password guessing and credential stuffing attacks.",
            "requirements": ["ID-4", "G4", "PRD Section 5.3"],
            "blocked_by": ["TASK-010", "TASK-011"],
            "blocks": ["TASK-018"],
            "architecture": ["ARCHITECTURE.md -> Rate Limiting", "DECISIONS.md -> DEC-004"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs brute-force defenses and rate limiting algorithms.",
                    "instructions": ["Use Redis sliding window", "Return Retry-After headers on breach"]
                }
            ],
            "inspect_files": ["packages/backend/src/identity/rate-limit.ts", "packages/backend/src/identity/auth-throttle.guard.ts"],
            "current_behavior": "Completed. Redis token bucket limits failed logins to 5 per 15 minutes per IP and email.",
            "required_behavior": "Breaching limit returns HTTP 429 Too Many Requests with Retry-After header.",
            "contracts": "HTTP 429 response with Retry-After header and RATE_LIMITED code.",
            "commands": [
                "Implement Redis sliding window counter in packages/backend/src/identity/rate-limit.ts.",
                "Build AuthThrottleGuard intercepting login and password reset routes.",
                "Add test fixtures verifying threshold trigger and automatic expiry."
            ],
            "data_changes": "Stores ephemeral keys in Redis DB 1 (rl:login:{ip}, rl:login:{email}).",
            "security": "Mitigates credential stuffing across distributed IP proxies.",
            "error_handling": "Returns 429 with precise retry seconds remaining.",
            "edge_cases": ["X-Forwarded-For header spoofing (must use trusted proxy config)"],
            "observability": "Warn log emitted on every rate limit breach.",
            "unit_tests": ["packages/backend/src/identity/rate-limit.test.ts"],
            "integration_tests": ["Brute force throttle integration test with live Redis"],
            "e2e_tests": ["None."],
            "security_tests": ["Verify rate limit cannot be bypassed with spoofed client headers"],
            "manual_verification": "Submit 5 invalid logins rapidly; assert 6th request fails with HTTP 429 and Retry-After.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass. Documented in docs/reviews/t013-context.md.",
            "commit": "feat(identity): add redis sliding-window brute-force rate limiting"
        },
        {
            "id": "014",
            "name": "Implement Scoped Store Memberships",
            "status": "IMPLEMENTED",
            "goal": "Model businesses, stores, store_roles, and store_memberships with fine-grained staff permissions.",
            "why": "Enforces multi-tenancy, vendor boundaries, and staff role separation.",
            "requirements": ["G4", "ID-5", "PRD Section 5.1", "REQ-STORE-002"],
            "blocked_by": ["TASK-003", "TASK-009"],
            "blocks": ["TASK-015", "TASK-016", "TASK-018", "TASK-020"],
            "architecture": ["ARCHITECTURE.md -> Boundaries", "DECISIONS.md -> DEC-003"],
            "skills": [
                {
                    "name": "domain-modeling",
                    "location": "skills/skills-main/skills/engineering/domain-modeling/SKILL.md",
                    "why": "Governs multi-tenant relational modeling and composite keys.",
                    "instructions": ["Use composite PK (store_id, user_id)", "Enforce store_id on all child tables"]
                }
            ],
            "inspect_files": ["packages/backend/src/stores/schema.ts", "db/migrations/0002-stores.sql", "packages/backend/src/stores/permissions.ts"],
            "current_behavior": "Completed. 0002-stores.sql applied; store_memberships links users to stores with owner, manager, catalog-editor, fulfillment roles.",
            "required_behavior": "Staff access is scoped by (user_id, store_id); users can hold distinct roles across different stores.",
            "contracts": "Businesses, Stores, StoreMemberships, StoreRoles Drizzle schemas.",
            "commands": [
                "Define stores domain schema in packages/backend/src/stores/schema.ts.",
                "Author migration 0002-stores.sql with composite foreign keys.",
                "Implement PermissionEvaluator resolving store-specific capabilities."
            ],
            "data_changes": "Creates businesses, stores, store_roles, store_role_permissions, store_memberships.",
            "security": "Enforces tenant isolation; users cannot access stores without valid membership.",
            "error_handling": "Cross-store requests fail with uniform 404 Not Found.",
            "edge_cases": ["User holds membership in multiple stores simultaneously"],
            "observability": "Audit trail for store membership updates.",
            "unit_tests": ["packages/backend/src/stores/permissions.test.ts"],
            "integration_tests": ["Multi-tenant membership constraint tests"],
            "e2e_tests": ["None."],
            "security_tests": ["Verify store membership cannot be forged via request body"],
            "manual_verification": "Query store_memberships table; verify owner role assigned to test vendor.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on multi-tenant isolation. Recorded in docs/reviews/t014-context.md.",
            "commit": "feat(stores): model businesses stores and scoped staff memberships"
        },
        {
            "id": "015",
            "name": "Implement Seller Applications and Invitations",
            "status": "IMPLEMENTED",
            "goal": "Build seller onboarding application endpoints, admin approval transitions, and staff email invitation workflows.",
            "why": "Enables new merchants to register and store owners to invite teammates.",
            "requirements": ["ID-5", "PRD Section 6.1"],
            "blocked_by": ["TASK-014"],
            "blocks": ["TASK-018", "TASK-068", "TASK-069"],
            "architecture": ["ARCHITECTURE.md -> Identity and Stores", "docs/modules/stores.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs lifecycle states and onboarding API contracts.",
                    "instructions": ["Enforce admin-only approval", "Hash invitation tokens"]
                }
            ],
            "inspect_files": ["packages/backend/src/stores/store.service.ts", "packages/backend/src/stores/invitation.service.ts"],
            "current_behavior": "Completed. Endpoints for seller application, admin approval, and staff invitations fully tested.",
            "required_behavior": "Sellers submit application in pending status; admin approves, transitioning store to ACTIVE; staff receive token invite.",
            "contracts": "SellerApplicationDto, StoreInvitationDto, StoreApprovalDto.",
            "commands": [
                "Build StoreService.applyForStore() inserting pending business and store.",
                "Build StoreService.approveStore() restricted to admin role.",
                "Build InvitationService.createInvitation() generating hashed invite token."
            ],
            "data_changes": "Inserts store_invitations, updates stores.status.",
            "security": "Store approval restricted strictly to platform administrators.",
            "error_handling": "Returns 409 Conflict if shop name or slug already exists.",
            "edge_cases": ["Inviting an email that already has membership in the store"],
            "observability": "Audit log for seller application approval.",
            "unit_tests": ["packages/backend/src/stores/store.service.test.ts"],
            "integration_tests": ["Seller onboarding and invitation lifecycle test"],
            "e2e_tests": ["None."],
            "security_tests": ["Verify non-admin cannot approve seller applications"],
            "manual_verification": "Submit seller application; approve as admin; verify store status transitions to ACTIVE.",
            "risk_level": "MEDIUM",
            "review_requirements": "Single thorough review pass. Documented in docs/reviews/t015-context.md.",
            "commit": "feat(stores): implement seller application approval and staff invitations"
        },
        {
            "id": "016",
            "name": "Resolve Storefront Channels and Themes",
            "status": "IMPLEMENTED",
            "goal": "Build channel resolution service and theme token manager mapping slug to store and serving CSS variables.",
            "why": "Enables multi-store routing (/stores/{slug}) and dynamic brand styling without code redeployment.",
            "requirements": ["REQ-STORE-001", "REQ-STORE-003", "PRD Section 4"],
            "blocked_by": ["TASK-007", "TASK-014"],
            "blocks": ["TASK-017", "TASK-023", "TASK-024"],
            "architecture": ["ARCHITECTURE.md -> System shape", "DECISIONS.md -> DEC-003"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs token-based theming and dynamic CSS custom properties.",
                    "instructions": ["Sanitize theme tokens strictly", "Disallow arbitrary raw CSS/HTML"]
                }
            ],
            "inspect_files": ["packages/backend/src/stores/theme.service.ts", "db/migrations/0004-themes.sql", "apps/web/src/components/theme.ts"],
            "current_behavior": "Completed. 0004-themes.sql applied; store_themes table stores approved JSONB color tokens; resolved per route.",
            "required_behavior": "Navigating to /stores/{slug} resolves store context and injects approved theme tokens into root container.",
            "contracts": "StoreTheme schema with primary, secondary, background, and accent hex colors.",
            "commands": [
                "Create 0004-themes.sql with store_themes table.",
                "Implement ThemeService validating JSONB color tokens against strict schema.",
                "Build Next.js theme provider component injecting CSS variables."
            ],
            "data_changes": "Creates store_themes and store_content tables.",
            "security": "Strict schema validation prevents arbitrary CSS or script injection via theme settings.",
            "error_handling": "Returns default marketplace theme if store theme is missing.",
            "edge_cases": ["Malformed hex color values in JSONB"],
            "observability": "Theme resolution debug logs.",
            "unit_tests": ["packages/backend/src/stores/theme.test.ts", "apps/web/src/components/theme.test.ts"],
            "integration_tests": ["Theme persistence and retrieval integration test"],
            "e2e_tests": ["tests/e2e/store-theme.spec.ts"],
            "security_tests": ["Assert XSS payload in theme JSON is stripped or rejected"],
            "manual_verification": "Visit /stores/apex-athletics; verify background and primary button colors match store tokens.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t016-context.md.",
            "commit": "feat(stores): resolve storefront channels and apply token-based themes"
        },
        {
            "id": "017",
            "name": "Build Account and Recovery Screens",
            "status": "IMPLEMENTED",
            "goal": "Build Next.js pages for /login, /register, /forgot-password, /reset-password, and /account dashboard.",
            "why": "Provides complete presentation interface for authentication and customer self-service.",
            "requirements": ["ID-1", "ID-2", "PRD Section 6.1"],
            "blocked_by": ["TASK-007", "TASK-010", "TASK-011", "TASK-012", "TASK-016"],
            "blocks": ["TASK-024"],
            "architecture": ["ARCHITECTURE.md -> Frontend", "docs/architecture/frontend.md"],
            "skills": [
                {
                    "name": "frontend-ui-engineering",
                    "location": "skills/agent-skills-main/skills/frontend-ui-engineering/SKILL.md",
                    "why": "Governs accessible form controls and client-side validation.",
                    "instructions": ["Include accessible form labels", "Show clear field error states"]
                }
            ],
            "inspect_files": ["apps/web/src/app/(auth)/login/page.tsx", "apps/web/src/app/(auth)/register/page.tsx", "apps/web/src/app/account/page.tsx"],
            "current_behavior": "Completed. Fully accessible auth screens wired to same-origin API proxy with form validation.",
            "required_behavior": "Users can log in, register, reset password, and view account details through clean Next.js UI.",
            "contracts": "Auth form actions and session user context.",
            "commands": [
                "Build login and registration form components with inline validation.",
                "Build forgot-password and reset-password token confirmation pages.",
                "Build account profile dashboard displaying user info and active sessions."
            ],
            "data_changes": "None.",
            "security": "Forms use CSRF tokens and submit via POST; passwords masked in input fields.",
            "error_handling": "Displays inline field errors for invalid input; banners for rate limiting.",
            "edge_cases": ["Submitting form multiple times before response arrives (disable button on submit)"],
            "observability": "Client-side telemetry on authentication failure.",
            "unit_tests": ["apps/web/src/features/auth/login-form.test.tsx"],
            "integration_tests": ["apps/web/src/lib/session.test.ts"],
            "e2e_tests": ["tests/e2e/account.spec.ts"],
            "security_tests": ["Assert password is not logged or visible in DOM"],
            "manual_verification": "Complete full registration and login in browser; verify account page renders user email.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t017-context.md.",
            "commit": "feat(web): build authentication and account management pages"
        },
        {
            "id": "018",
            "name": "Build the Authorization Matrix Harness",
            "status": "IMPLEMENTED",
            "goal": "Build automated test suite exercising every API endpoint across all roles and stores to verify allow/deny rules.",
            "why": "Provides mechanical proof that RBAC and ABAC tenant isolation rules are completely enforced across the API.",
            "requirements": ["G4", "PRD Section 5.1", "PRD Section 5.2"],
            "blocked_by": ["TASK-006", "TASK-010", "TASK-011", "TASK-013", "TASK-014", "TASK-015"],
            "blocks": ["TASK-020", "TASK-074"],
            "architecture": ["ARCHITECTURE.md -> Authorization", "docs/architecture/conventions.md"],
            "skills": [
                {
                    "name": "security-and-hardening",
                    "location": "skills/agent-skills-main/skills/security-and-hardening/SKILL.md",
                    "why": "Governs automated authorization testing and route permission audits.",
                    "instructions": ["Iterate every declared route", "Assert exact allow/deny expectations"]
                }
            ],
            "inspect_files": ["packages/backend/src/stores/permissions.test.ts", "packages/backend/src/platform/security.test.ts"],
            "current_behavior": "Completed. Test harness verifies route x role combinations; catches OpenAPI drift and missing guards.",
            "required_behavior": "Fails CI if any endpoint lacks an explicit permission declaration or permits cross-tenant access.",
            "contracts": "PermissionMatrix definition in test harness.",
            "commands": [
                "Build test harness scanning Fastify route table.",
                "Execute each route against fixtures for Guest, Customer, Seller1, Seller2, Support, Admin.",
                "Assert 401 on unauthenticated, 403 on role mismatch, and uniform 404 on cross-store access."
            ],
            "data_changes": "None.",
            "security": "Enforces deny-by-default on all endpoints.",
            "error_handling": "Harness prints exact route and failing role combination on test failure.",
            "edge_cases": ["Routes with optional authentication parameters"],
            "observability": "Matrix coverage report in CI logs.",
            "unit_tests": ["packages/backend/src/stores/permissions.test.ts"],
            "integration_tests": ["Full route permission matrix evaluation"],
            "e2e_tests": ["None."],
            "security_tests": ["Assert cross-store access unconditionally returns 404"],
            "manual_verification": "Run pnpm test permissions; assert 100% matrix scenarios pass.",
            "risk_level": "HIGH",
            "review_requirements": "Multiple review passes on authorization coverage. Documented in docs/reviews/t018-context.md.",
            "commit": "test(security): build automated route and role authorization matrix harness"
        },
        {
            "id": "091",
            "name": "Implement the Customer Address Book",
            "status": "IMPLEMENTED",
            "goal": "Build addresses table, address validation, CRUD endpoints, and Next.js customer address management UI.",
            "why": "Allows shoppers to save delivery addresses; provides address snapshots for checkout.",
            "requirements": ["REQ-STORE-004", "PRD Section 8"],
            "blocked_by": ["TASK-003", "TASK-009"],
            "blocks": ["TASK-047", "TASK-055"],
            "architecture": ["ARCHITECTURE.md -> Identity and stores", "docs/architecture/data-model.md"],
            "skills": [
                {
                    "name": "api-and-interface-design",
                    "location": "skills/agent-skills-main/skills/api-and-interface-design/SKILL.md",
                    "why": "Governs address DTOs and customer resource scoping.",
                    "instructions": ["Scope addresses strictly to user_id", "Validate structured fields"]
                }
            ],
            "inspect_files": ["db/migrations/0005-addresses.sql", "packages/backend/src/identity/address.service.ts", "apps/web/src/features/account/address-book.tsx"],
            "current_behavior": "Completed. 0005-addresses.sql applied; customer address CRUD functional; checkout snapshots deferred to T047.",
            "required_behavior": "Customers can create, edit, list, and delete saved shipping addresses; cannot see other users' addresses.",
            "contracts": "AddressDto, CreateAddressDto in @shopscale/contracts.",
            "commands": [
                "Author migration 0005-addresses.sql creating addresses table.",
                "Build AddressService with scoped CRUD operations.",
                "Build Next.js address book component on /account/addresses."
            ],
            "data_changes": "Creates addresses(id, user_id, fields JSONB, created_at).",
            "security": "Enforces ownership checks: user can access only their own address records.",
            "error_handling": "Returns 404 Not Found if address ID does not belong to authenticated user.",
            "edge_cases": ["Deleting an address currently referenced by an active order (immutable order snapshots prevent issues)"],
            "observability": "Audit log for address creation and deletion.",
            "unit_tests": ["packages/backend/src/identity/address.service.test.ts"],
            "integration_tests": ["Customer address ownership test"],
            "e2e_tests": ["tests/e2e/addresses.spec.ts"],
            "security_tests": ["Assert user cannot read or update another user's address ID"],
            "manual_verification": "Add new address in /account; verify address displays in list and persists across reloads.",
            "risk_level": "LOW",
            "review_requirements": "Single review pass. Documented in docs/reviews/t091-context.md.",
            "commit": "feat(identity): implement customer address book and account management ui"
        }
    ]
