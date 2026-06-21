# Clinova Backend Refactor Status

Generated: 2026-05-26
Status: Safe Step 22 completed. Disabled signup guard route was extracted; legacy fallback remains for validation.

## Current Module Map

`server/app.js` now acts as the API bootstrap and route dispatcher. Extracted route modules are registered before broad legacy fallbacks where order matters.

- Auth: `POST /api/login`, `POST /api/logout`, `GET /api/me`
- Status: `GET /api/health`, `GET /api/version`
- Account: `POST /api/account/password`
- Signup Guard: `POST /api/signup`
- Platform Read: `GET /api/platform/tenants`
- Platform Tenant Update: `PUT /api/platform/tenants/:id`
- Platform Invoices: `POST /api/platform/tenants/:id/invoices`, `PUT /api/platform/invoices/:id`
- Platform Auto Billing: `POST /api/platform/billing/auto-run`
- Platform Tenant Admin Reset: `POST /api/platform/tenants/:id/reset-password`
- Platform Tenant Provisioning: `POST /api/platform/tenants`
- Users: `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`
- Invitations: `GET /api/invitations`, `POST /api/invitations`, `DELETE /api/invitations/:id`, `GET /api/invitations/:token`, `POST /api/invitations/:token/accept`
- Clients: `GET /api/clients`, `POST /api/clients`, `PUT /api/clients/:id`, `DELETE /api/clients/:id`, `GET /api/clients/:id/history`
- Appointments: `GET /api/appointments`, `POST /api/appointments`, `PUT /api/appointments/:id`, `DELETE /api/appointments/:id`
- Settings: `GET /api/settings`, `PUT /api/settings`, `GET /api/tenant`, `PUT /api/tenant`
- Tenant Domains: `GET /api/tenant/domains`, `POST /api/tenant/domains`, `PUT /api/tenant/domains/:id`, `DELETE /api/tenant/domains/:id`
- Files/Uploads: `GET /api/clients/:id/files`, `POST /api/clients/:id/files`, `GET /api/client-files/:id/download`, `DELETE /api/client-files/:id`
- Consents: `GET /api/consents`, `POST /api/consents`, `DELETE /api/consents/:id`, `GET /api/consents/:id/download`, `POST /api/consents/:id/sign`
- Search: `GET /api/search`
- Reports: `GET /api/reports`
- Audit: `GET /api/audit`
- Feedback: `GET /api/feedback`, `POST /api/feedback`, `GET /api/public/feedback/:token`, `POST /api/public/feedback/:token`
- CRM: `GET /api/crm`, `GET /api/crm-tasks`, `POST /api/crm-tasks`, `PUT /api/crm-tasks/:id`
- Billing: `GET /api/billing`, `PUT /api/billing`, `POST /api/billing/invoices`, `PUT /api/billing/invoices/:id`
- WhatsApp: `GET /api/message-logs`, `POST /api/appointments/:id/whatsapp`, `POST /api/gifts/:id/whatsapp`
- Catalog: `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/:id`, `DELETE /api/categories/:id`, `GET /api/services`, `POST /api/services`, `PUT /api/services/:id`, `DELETE /api/services/:id`
- Gifts: `GET /api/gifts`, `POST /api/gifts`, `PUT /api/gifts/:id`

## Route Order Verification

Extracted modules that need precedence are registered before broad resources:

- `filesRoutes` before `clientsRoutes`, so `/api/clients/:id/files` is handled by Files, not Clients.
- `whatsappRoutes` before `appointmentsRoutes`, so `/api/appointments/:id/whatsapp` is handled by WhatsApp, not Appointments.
- `whatsappRoutes` uses exact regexes for gift sending and is registered before `giftsRoutes`, so `/api/gifts/:id/whatsapp` remains in WhatsApp.
- `giftsRoutes` uses exact `/api/gifts` and `/api/gifts/:id` matchers only, so it does not intercept nested WhatsApp send routes.
- `statusRoutes`, `accountRoutes`, and `signupRoutes` use exact matchers only, so they do not affect `/api/login`, `/api/logout`, `/api/me`, `/api/bootstrap`, or platform routes.
- `platformRoutes` uses exact/numeric matchers for all extracted platform owner routes.
- `feedbackRoutes` before legacy fallback, so public feedback tokens are no longer handled by legacy.
- `billingRoutes` before fallback, while `/api/platform/*` remains legacy.
- `catalogRoutes` before `clientsRoutes`/fallback, so categories and services CRUD is handled by Catalog.
- `reportsRoutes` still contains bootstrap without a module key; it intentionally goes to legacy.

No extracted endpoint should actively fall through to `legacy-runtime.js` unless a controller returns `false` for an unsupported nested path. The known intentional examples are broad resources that reject nested paths before falling back, such as non-file nested clients paths and non-WhatsApp nested appointment paths.

## Remaining Active Legacy Endpoints

### A. Truly Legacy And Active

These endpoints are still actively handled by `server/legacy-runtime.js`:

No simple clinic-local CRUD/status/account endpoints remain here.

Reasons:

- Remaining active legacy areas are bootstrap, platform-owner operations, and system backup/restore/export.

### B. Fallback Duplicate Code For Extracted Modules

These endpoint implementations still exist physically in `legacy-runtime.js`, but extracted route/controller paths now intercept them:

- Auth: login/logout/me
- Status: health/version
- Account: current-user password change
- Signup Guard: disabled signup response
- Platform Read: tenants list with counts, balances, recent invoices, and domains
- Platform Tenant Update: tenant/subscription plan, status, billing day, and auto billing flag
- Platform Invoices: platform manual invoice creation and invoice status update
- Platform Auto Billing: automatic invoice generation for due enabled subscriptions
- Platform Tenant Admin Reset: platform-owner reset of the first active non-platform clinic admin password
- Platform Tenant Provisioning: platform-owner tenant, subscription, settings, and clinic admin creation
- Users CRUD
- Invitations
- Clients CRUD and client history
- Appointments CRUD
- Settings and tenant profile
- Tenant domains
- Client files
- Consent templates/signing/download
- Search
- Reports
- Audit read
- Feedback/public feedback
- CRM dashboard/tasks
- Tenant-local billing
- Message logs, appointment WhatsApp, gift WhatsApp
- Catalog categories/services
- Gifts CRUD

Removal candidate only after regression testing proves extracted paths cover every active URL and all routes with no module key are accounted for.

### C. Bootstrap-Only Aggregation Logic

Still active:

- `GET /api/bootstrap`

Do not remove yet. It aggregates user/session, tenant, platform tenant summaries, billing, users, invitations, categories, services, clients, CRM, appointments, consents, feedback, gifts, message logs, settings, tenant domains, and audit-adjacent dashboard data.

### D. Platform-Owner Logic

Still active:

No active `/api/platform/*` endpoints remain here.

Do not remove yet. This area mixes platform owner authorization, tenant provisioning, tenant subscription updates, automatic billing, invoice operations across tenants, owner password reset, and dashboard response shapes.

### E. System Backup/Restore Logic

Still active:

- `GET /api/system/export`
- `POST /api/system/restore`

Do not remove yet. This area uses backup creation, SQLite integrity checks, pending restore files, filesystem writes, and database-engine-specific behavior.

## Safe Removal Candidates Later

Do not remove in this step. Later, after a full regression pass, the following duplicate legacy blocks can be removed from `legacy-runtime.js`:

- Duplicated route handlers for extracted modules listed in section B.
- Duplicated repository-style helpers that now live in extracted repositories.
- Duplicated response/business helpers that now live in extracted services.
- Duplicated nested route handling for files, consents, feedback, CRM, billing, WhatsApp, reports, audit, search, settings, tenant domains, invitations, users, clients, and appointments.

Recommended removal approach:

- Remove one duplicate module block at a time.
- Run `node --check`.
- Run a targeted API smoke test for that module.
- Keep `serveStatic`, `json`, and active legacy endpoints untouched until replacements exist.

## Shared Helpers To Move Later

These helpers remain in `legacy-runtime.js` and/or are duplicated in extracted modules. They should be centralized later, not during Step 18:

- HTTP helpers: `json`, `readBody`, `readRawBody`, `readMultipart`
- File helpers: `safeFileName`, `contentDispositionName`
- Date helpers: `todayIso`, `addDaysIso`, `addMonthsIso`, billing date helpers
- Billing helpers: `planCatalog`, `planLimits`, `limitReached`, tenant billing snapshots
- Template helpers: `renderTemplate`
- Tenant/platform helpers: `tenantDomains`, `platformTenants`
- WhatsApp/message helpers: tenant-aware sending, `logMessage`
- Consent PDF helpers: `pdfSafeText`, `consentPdfLabels`, signed PDF generation pieces
- Search helpers: `digitsOnly`, `searchScore`
- Static serving helper: `serveStatic`

## Do Not Remove Yet

- `serveStatic` and static MIME handling: app still uses it for the client bundle.
- `json`: many extracted controllers still import it from `legacy-runtime.js`.
- Active legacy endpoints in sections A, C, D, and E.
- `runAutomaticBilling` and billing date helpers: still needed by active platform auto billing.
- Platform tenant provisioning and reset-password helpers.
- Backup/restore helpers and SQLite validation.
- Bootstrap aggregation helpers until `/api/bootstrap` is intentionally decomposed.
- Shared audit writing in `server/db.js`.
- Feedback-specific WhatsApp send flow in `feedback.service.js`; it is intentionally separate from the general WhatsApp module for now.

## Remaining Risk Areas

- `/api/bootstrap`: largest response surface and most likely to hide coupling.
- Platform tenants: high-impact owner-only operations across tenants.
- System export/restore: filesystem and database restore behavior.
- Signup Guard: extracted, but duplicate legacy fallback remains until production validation is complete.
- Account password: extracted, but duplicate legacy fallback remains until production validation is complete.
- Catalog categories/services: extracted, but duplicate legacy fallback remains until production validation is complete.
- Gifts CRUD: extracted, but duplicate legacy fallback remains until production validation is complete.
- Shared helper duplication: behavior can drift if future changes touch only one copy.
- Route fallback behavior: broad `resource()` routes must stay ordered behind more specific nested routes.
- Unicode/mojibake strings: existing response messages are preserved but still inconsistent in several areas.

## Recommended Next 3 Safe Steps

1. Bootstrap boundary report.
   Inspect and document `/api/bootstrap` before any aggregation extraction.

2. Legacy duplicate cleanup planning.
   Identify extracted platform fallback blocks that can be removed after full regression.

3. System Backup/Restore boundary report.
   Inspect export/restore behavior before extracting filesystem/database restore code.

After those, consider Platform module, System Backup/Restore module, then Bootstrap decomposition.

## Manual Regression Checklist Before Production

- Auth: login, logout, `/api/me`, bad credentials, expired/no cookie.
- Account: password change invalid current password, short new password, session clearing.
- Users: list/create/update/deactivate, plan user limit behavior.
- Invitations: create/list/preview/accept/revoke, plan user limit behavior.
- Clients: list/create/update/delete/history, therapist visibility, client limit behavior.
- Appointments: list/create/update/delete, therapist visibility, conflict rejection, status `done` with missing consent.
- Settings: read/write settings, tenant read/write, tenant domains create/update/delete.
- Files: upload/download/delete client files, unsupported type rejection, missing file behavior.
- Consents: upload/download/delete/sign, duplicate signature rejection, generated client file.
- Search: short query, client name/phone, appointment/service term, therapist visibility.
- Reports: metric keys and numeric values, forbidden therapist access.
- Audit: latest 100 rows, parsed `details`, forbidden therapist access.
- Feedback: create request, public token read, submit rating, invalid token 404.
- CRM: dashboard, tasks list/create/update, `done` updates client last-contacted, client stage event side effect.
- Billing: read/update billing, create invoice, update invoice status, client/invitation limits unchanged.
- WhatsApp: message logs, appointment send fallback/provider behavior, gift send fallback/provider behavior.
- Catalog: categories/services CRUD, service/category deactivation behavior.
- Gifts: CRUD and redemption state behavior.
- Platform owner: tenants list/create/update, reset password, platform invoices, auto billing.
- System: export backup, restore upload scheduling, PostgreSQL restore rejection behavior.
- Bootstrap: verify frontend first load for platform owner, admin, reception, and therapist.

## Verification

- Step 18 is documentation-only.
- `node --check` should pass for server JavaScript files.
- `npm start` should run successfully on a test port.
- Step 19 moved only catalog route/controller/service/repository logic and retained the legacy fallback block.
- Step 19 verification passed on test port `3053`: health, login, me, bootstrap, categories GET/POST/PUT/DELETE cleanup, and services GET/POST/PUT/DELETE cleanup.
- Step 20 moved only gifts CRUD route/controller/service/repository logic and retained the legacy fallback block.
- Step 20 verification passed on test port `3054`: health, login, me, bootstrap, gifts GET/POST/PUT, and `POST /api/gifts/:id/whatsapp` through WhatsApp module. Temporary test gift was removed after validation.
- Step 21 moved only status and current-account password route/controller/service/repository logic and retained the legacy fallback block.
- Step 21 verification passed on test port `3055`: health, version, login, me, current-user password change, login with temporary password, password restored to original test password, bootstrap, signup 403 unchanged, and unauthenticated platform tenants 401 unchanged.
- Step 22 moved only disabled signup guard route/controller/service logic and retained the legacy fallback block.
- Step 22 verification passed on test port `3056`: health, version, signup returned `403` with `{"error":"Clinic creation is managed by the platform owner."}`, login, me, bootstrap, and unauthenticated platform tenants remained `401`.
- Step 23 is documentation-only. Verification passed on test port `3057`: health, version, login, me, bootstrap, signup remained `403`, and unauthenticated platform tenants remained `401`.
- Step 24 moved only read-only platform tenants route/controller/service/repository logic and retained the legacy fallback block.
- Step 24 verification passed on test port `3058`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants remained `401`, platform-owner `GET /api/platform/tenants` returned 3 tenants, response matched `bootstrap.platformTenants`, and platform `POST`/`PUT` write routes still fell through to legacy with validation `400` for empty bodies.
- Step 25 moved only platform tenant update route/controller/service/repository logic and retained the legacy fallback block.
- Step 25 verification passed on test port `3059`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants remained `401`, platform-owner read returned 3 tenants, invalid tenant update returned `400`, a reversible `autoBillingEnabled` update succeeded and was restored, and create/reset/invoice/auto-run routes remained legacy. A validation invoice accidentally created during legacy-route probing was removed immediately with its audit traces.
- Step 26 moved only platform invoice create/update route/controller/service/repository logic and retained the legacy fallback block.
- Step 26 verification passed on test port `3060`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants remained `401`, platform-owner read returned 3 tenants, missing-tenant invoice create returned `404`, invalid invoice update returned `400`, a marked test invoice was created and updated to `void`, then deleted directly from the DB with its audit traces and confirmed absent from platform tenants. Tenant create/reset/auto-run remained legacy and returned `401` without auth.
- Step 27 moved only platform auto-billing route/controller/service/repository logic and retained the legacy fallback block. Verification passed on test port `3061`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants and auto-run remained `401`, platform-owner read returned 3 tenants, auto-run returned `{ tenants, result }` with `created=0` and `skipped=1`, invoice count stayed `8`, and tenant create/reset remained legacy with `401` without auth.
- Step 28 moved only platform tenant admin reset-password route/controller/service/repository logic and retained the legacy fallback block. Verification passed on test port `3062`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants/reset remained `401`, invalid reset returned `400`, missing tenant returned `404`, functional reset on tenant `3` admin succeeded, temporary login worked, original password hash was restored directly, reset audit trace was removed, temporary password then failed with `401`, and tenant creation remained legacy with `401` without auth.
- Step 29 moved only platform tenant creation route/controller/service/repository logic and retained the legacy fallback block. Verification passed on test port `3063`: health, version, clinic login/me/bootstrap, signup remained `403`, unauthenticated platform tenants/create remained `401`, platform-owner invalid create returned `400`, a marked `SAFE_STEP_29_TEST` tenant was created with subscription, 12 settings, admin user, and audit traces, admin login worked, then all created tenant data was deleted directly and confirmed absent from platform tenants.
- Step 30 is documentation-only. Verification passed on test port `3064`: `node --check` passed for 111 server JavaScript files, health/version worked, clinic admin/reception/therapist and platform-owner bootstrap returned all 20 expected keys, signup remained `403`, platform tenants returned 3 tenants for platform-owner, and invalid platform tenant creation returned `400`.
- Step 31 moved only the `/api/bootstrap` route/controller/service shell and retained the same legacy aggregation helper. Verification passed on test port `3065`: `node --check` passed for 114 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 expected keys with no missing or extra keys, signup remained `403`, platform tenants returned 3 tenants and matched bootstrap, and invalid platform tenant creation returned `400`.
- Step 32 cleaned only the internal bootstrap service boundary. No routes changed. Verification passed on test port `3066`: `node --check` passed for 114 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order with no missing or extra keys, important counts were preserved for users/clients/appointments/platformTenants/giftCards/messageLogs/audits, signup remained `403`, and platform tenants still returned 3 tenants.
- Step 33 moved only simple direct bootstrap SQL reads into `bootstrap.repository.js`. Verification passed on test port `3067`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, direct-read counts and samples were preserved for tenant/users/invitations/categories/services, complex legacy sections stayed unchanged, signup remained `403`, platform tenants returned 3 tenants, and invalid platform tenant creation returned `400`.
- Step 34 is documentation-only. No code/routes changed. Verification passed on test port `3068`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin and platform-owner bootstrap returned the exact 20 keys in the same order, signup remained `403`, and platform tenants returned 3 tenants.
- Step 35 delegated only bootstrap `platformTenants` to `server/modules/platform/platform.repository.js`. Verification passed on test port `3069`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin and platform-owner bootstrap returned the exact 20 keys in the same order, `bootstrap.platformTenants` matched `GET /api/platform/tenants` exactly by count, IDs, fields, values, order, and compact JSON, signup remained `403`, and invalid platform tenant creation returned `400`.
- Step 36 delegated only bootstrap low-risk reads: `tenantDomains`, `clinicSettings`, and `listAudit`. Verification passed on test port `3070`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, settings/audits/tenantDomains samples and counts were preserved, clients and appointments counts were unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 37 delegated only bootstrap `listClients` to `server/repositories/clients.repository.js` through an exact bootstrap adapter. Verification passed on test port `3071`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, admin/reception clients remained 7 with IDs `3,4,7,2,5,6,1`, therapist clients remained 1 with ID `1`, appointments/settings/audits counts stayed unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 38 delegated only bootstrap `listAppointments` to `server/repositories/appointments.repository.js` through an exact bootstrap adapter. Verification passed on test port `3072`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, admin/reception/therapist appointments remained 2 with IDs `1,2`, sample appointment fields and payment fields matched, clients/settings/audits counts stayed unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 39 delegated only bootstrap CRM helpers to `server/repositories/crm.repository.js`. Verification passed on test port `3073`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, admin/reception CRM tasks remained 4 with IDs `4,2,1,3`, therapist CRM tasks remained 0, CRM events remained 19 with IDs `19..1`, clients/appointments/settings/audits counts stayed unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 40 delegated only bootstrap operational read lists to existing repositories/modules. Verification passed on test port `3074`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, operational list counts and IDs matched by role, clients/appointments/CRM/settings/audits counts stayed unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 41 delegated only bootstrap `tenantBilling` to `server/repositories/billing.repository.js`. Verification passed on test port `3075`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin/reception/therapist/platform-owner bootstrap returned the exact 20 keys in the same order, billing remained `null` for all current bootstrap roles, clients/appointments/CRM/operational/settings/audits counts stayed unchanged, signup remained `403`, and platform tenants returned 3 tenants.
- Step 42 is documentation-only. No code/routes changed. Verification passed on test port `3076`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin login/me/bootstrap worked with 20 ordered bootstrap keys, platform-owner bootstrap worked with 20 ordered keys and 3 platform tenants, signup remained `403`, and platform tenants returned 3 tenants.
- Step 43 is documentation-only. No code/routes changed. Verification passed on test port `3077`: `node --check` passed for 115 server JavaScript files, health/version worked, clinic admin login/me/bootstrap worked with 20 ordered bootstrap keys, platform-owner bootstrap worked with 20 ordered keys and 3 platform tenants, signup remained `403`, and platform tenants returned 3 tenants.
- Step 44 extracted only the shared JSON response helper to `server/shared/http/json-response.js` while keeping the legacy export. Verification passed on test port `3078`: `node --check` passed for 116 server JavaScript files, health/version worked, unauthenticated bootstrap remained `401` with the same JSON body and headers, clinic admin login/me/bootstrap worked with 20 ordered bootstrap keys, platform-owner bootstrap worked with 20 ordered keys and 3 platform tenants, signup remained `403` with the same JSON body, and platform tenants returned 3 tenants.
- Step 45 extracted only the shared invitation URL helper to `server/shared/http/url-helpers.js` while keeping the legacy export. Verification passed on test port `3079`: `node --check` passed for 117 server JavaScript files, health/version worked, clinic admin bootstrap returned 20 ordered keys with invitation URLs, normal host and forwarded host/proto URL behavior matched the legacy formula, unauthenticated bootstrap remained `401`, signup remained `403`, and platform tenants returned 3 tenants.

## SAFE STEP 23 - PLATFORM BOUNDARY REPORT

Step 23 is report-only. No routes, handlers, schemas, or behavior were changed.

### Active Platform Endpoints Still In Legacy

All endpoints below are still actively handled by `server/legacy-runtime.js` and must require `requirePlatformOwner(req, res)` before doing work:

- `GET /api/platform/tenants`
  Purpose: returns `{ tenants }` using `platformTenants()`.
  Permission: authenticated user with `user.platformOwner === true`.
  Tables/fields: `tenants.id/name/slug/status/plan/billing_email/trial_ends_at/created_at/updated_at`, latest `subscriptions.status/plan/current_period_end/billing_day/auto_billing_enabled`, `users.active/is_platform_owner`, `clients.active`, `billing_invoices.status/amount/billing_cycle`, `tenant_domains.status/is_primary/verified_at`.

- `POST /api/platform/tenants`
  Purpose: provisions a new tenant/clinic, creates initial subscription/settings/admin user, then applies requested plan/status.
  Permission: platform owner only.
  Tables/fields: `tenants.name/slug/status/plan/billing_email/trial_ends_at`, `subscriptions.tenant_id/provider/status/plan/current_period_end`, `clinic_settings.tenant_id/key/value`, `users.tenant_id/username/email/password_hash/name/title/role/workdays/service_ids/active`, `audit_log`.
  Helper dependency: `provisionTenant()` from `server/db.js`, `planCatalog`, `platformTenants()`, `audit()`.

- `PUT /api/platform/tenants/:id`
  Purpose: updates tenant plan/status and latest subscription billing settings.
  Permission: platform owner only.
  Tables/fields: `tenants.plan/status/updated_at`, `subscriptions.plan/status/billing_day/auto_billing_enabled/updated_at`, optional insert into `subscriptions` when missing, `audit_log`.
  Business rules: plan must exist in `planCatalog`; status must be one of `trial`, `active`, `past_due`, `suspended`, `cancelled`; `billingDay` is clamped to `1..31`; `autoBillingEnabled` accepts boolean/string/on.

- `POST /api/platform/tenants/:id/reset-password`
  Purpose: resets the first active non-platform clinic admin password for a tenant.
  Permission: platform owner only.
  Tables/fields: `tenants.id/name`, `users.tenant_id/role/active/is_platform_owner/password_hash/updated_at`, `audit_log`.
  Business rules: password length must be at least 8; target owner is the first active `role = 'admin'` with `COALESCE(is_platform_owner, 0) = 0`.

- `POST /api/platform/tenants/:id/invoices`
  Purpose: creates a manual invoice for a tenant.
  Permission: platform owner only.
  Tables/fields: `tenants.id`, latest subscription from `tenantBilling()`, `billing_invoices.tenant_id/subscription_id/number/status/currency/amount/period_start/period_end/due_at/notes`, `audit_log`.
  Business rules: invoice status is `draft` only when body status is `draft`, otherwise `open`; amount is non-negative; currency is uppercased and truncated to three characters; period/due dates default from `todayIso()` and `addDaysIso()`.

- `PUT /api/platform/invoices/:id`
  Purpose: updates invoice status.
  Permission: platform owner only.
  Tables/fields: `billing_invoices.id/tenant_id/status/paid_at/updated_at`, `audit_log`.
  Business rules: status must be one of `draft`, `open`, `paid`, `void`, `uncollectible`; `paid_at` is set only when status becomes `paid`.

- `POST /api/platform/billing/auto-run`
  Purpose: manually triggers automatic billing for active subscriptions due on a run date.
  Permission: platform owner only.
  Tables/fields: latest `subscriptions.tenant_id/plan/status/billing_day/auto_billing_enabled/current_period_end`, `tenants.status`, `billing_invoices.billing_cycle`, `audit_log`.
  Helper dependency: `runAutomaticBilling(runDate)`, `billingDateForMonth()`, `billingCycleKey()`, `addMonthsIso()`, `addDaysIso()`, `planCatalog`.

### Platform Auth And Permission Guard

- `requirePlatformOwner(req, res)` depends on `requireUser(req, res)`, which depends on cookie parsing, signed session token validation, `sessions.tenant_id/user_id/expires_at`, and `rowToUser()`.
- Non-platform users receive `403 { error: "Platform owner access is required." }`.
- Unauthenticated callers receive the existing login-required `401` response from `requireUser`.
- Clinic modules explicitly block platform owners through `requirePermission()` with `403 { error: "Platform owners must use the platform administration API." }`.

### Shared Helpers Used By Platform Logic

- Response/body/session helpers: `json`, `readBody`, `parseCookies`, `currentUser`, `requireUser`, `requirePlatformOwner`.
- Tenant/billing helpers: `platformTenants`, `tenantBilling`, `tenantDomains`, `planCatalog`, `planLimits`, `todayIso`, `addDaysIso`, `addMonthsIso`, `clampBillingDay`, `billingDateForMonth`, `billingCycleKey`, `runAutomaticBilling`.
- Provisioning/security helpers: `provisionTenant`, `hashPassword`, `normalizeEmail` indirectly through `provisionTenant`.
- Audit helper: shared `audit()` from `server/db.js`.
- Data conversion helper: `rowToUser()` is used through auth/current-user and `provisionTenant()`.

### Safe To Extract Later

- Read-only platform tenant listing: `GET /api/platform/tenants` with `platformTenants()` and `tenantDomains()` moved together.
- Tenant plan/status update: `PUT /api/platform/tenants/:id` after extracting shared plan/date helpers.
- Manual invoice create/update: `POST /api/platform/tenants/:id/invoices` and `PUT /api/platform/invoices/:id` as a separate platform billing slice.
- Auto billing trigger: `POST /api/platform/billing/auto-run`, but only after moving `runAutomaticBilling()` and date helpers intact.
- Tenant admin password reset: `POST /api/platform/tenants/:id/reset-password`, but keep separate from normal account password and users CRUD.

### Do Not Extract Yet

- `/api/bootstrap` platform-owner aggregation. It returns `platformTenants`, platform-owner `tenantDomains`, and a special reduced response branch when `user.platformOwner` is true.
- `provisionTenant()` internals from `server/db.js` unless the next step explicitly owns tenant creation, seed settings, subscription creation, and admin creation together.
- `runAutomaticBilling()` separately from its date/cycle helpers and invoice uniqueness behavior.
- System backup/restore/export endpoints.
- Signup guard fallback; it is already extracted and should remain unrelated to platform tenant provisioning.
- General clinic users CRUD. Platform reset-password must not be merged into clinic user-management behavior.

### Risky Dependencies

- Auth/session: platform access depends on `currentUser()` and `is_platform_owner`; password reset for clinics must not affect platform owner sessions.
- Bootstrap: platform owner first load depends on `platformTenants()` response shape, invoice summaries, domains, and counts.
- Billing: tenant status and subscription status both feed normal clinic write blocking and plan limits.
- Users: tenant admins are normal `users` rows but must exclude `is_platform_owner`.
- Audit: platform actions write tenant-scoped audit rows using the platform owner's `tenantId` plus `targetTenantId`.
- Cross-tenant safety: all platform endpoints intentionally cross tenant boundaries; extraction must avoid accidentally applying clinic tenant isolation to platform reads/writes.
- PostgreSQL/SQLite compatibility: keep `?` placeholders and existing adapter behavior; do not introduce engine-specific SQL.

### Recommended Extraction Order

1. Extract Platform read module only:
   `GET /api/platform/tenants`, plus repository helpers `platformTenants()` and `tenantDomains()` read-only.

2. Extract Platform tenant update module:
   `PUT /api/platform/tenants/:id`, including plan/status/billing-day validation and subscription upsert.

3. Extract Platform invoice module:
   `POST /api/platform/tenants/:id/invoices` and `PUT /api/platform/invoices/:id`.

4. Extract Platform auto-billing module:
   `POST /api/platform/billing/auto-run` with `runAutomaticBilling()` and date/cycle helpers.

5. Extract Platform tenant provisioning:
   `POST /api/platform/tenants`, keeping `provisionTenant()` behavior intact.

6. Extract Platform tenant admin reset:
   `POST /api/platform/tenants/:id/reset-password`, separate from account/users modules.

### Manual Validation Checklist

Before extraction:

- Login as platform owner and confirm `/api/bootstrap` renders platform dashboard data.
- `GET /api/platform/tenants` returns tenants with counts, balances, domains, and recent invoices.
- `POST /api/platform/tenants` creates tenant, subscription, clinic settings, and clinic admin.
- `PUT /api/platform/tenants/:id` updates tenant and subscription plan/status/billing day/auto billing.
- `POST /api/platform/tenants/:id/reset-password` changes only the selected clinic admin password.
- `POST /api/platform/tenants/:id/invoices` creates manual invoice with expected status/default dates.
- `PUT /api/platform/invoices/:id` updates status and sets `paid_at` for paid.
- `POST /api/platform/billing/auto-run` creates/skips invoices according to billing cycle.
- Non-authenticated platform requests return `401`; non-platform authenticated users return `403`.

After each extraction:

- Repeat the exact endpoint smoke tests above.
- Compare response keys for `platformTenants()` before/after.
- Confirm `/api/bootstrap` platform-owner response is unchanged.
- Confirm normal clinic admin cannot access `/api/platform/*`.
- Confirm platform owner still cannot use clinic module APIs.
- Confirm no tenant data leaks into normal clinic users.
- Run `node --check` and start the app on a test port.

## SAFE STEP 30 - BOOTSTRAP BOUNDARY REPORT

Step 30 is report-only. No `/api/bootstrap` code, routes, schemas, or response shapes were changed.

### Bootstrap Endpoint Location

- Active handler: `server/legacy-runtime.js`, `GET /api/bootstrap`.
- Authentication: `requireUser(req, res)` is required before any response.
- Current status: still fully legacy and intentionally not extracted.

### Exact Response Keys

Both platform-owner and clinic-user branches return the same top-level keys:

`user`, `tenant`, `tenantDomains`, `platformTenants`, `billing`, `users`, `invitations`, `categories`, `services`, `clients`, `crmTasks`, `crmEvents`, `appointments`, `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `messageLogs`, `settings`, `audits`.

### Platform-Owner Response Shape

When `user.platformOwner` is true, bootstrap returns:

- `user`: current platform owner user object.
- `tenant`: `null`.
- `tenantDomains`: `[]`.
- `platformTenants`: `await platformTenants()`.
- `billing`: `null`.
- All clinic-local arrays are `[]`: `users`, `invitations`, `categories`, `services`, `clients`, `crmTasks`, `crmEvents`, `appointments`, `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `messageLogs`, `audits`.
- `settings`: `{}`.

### Clinic Response Key Map

| Key | Source in bootstrap | Existing module owner | Notes |
| --- | --- | --- | --- |
| `user` | `requireUser()` / current session | Auth | Includes role, tenantId, platformOwner. |
| `tenant` | `SELECT id, name, slug, status, plan, billing_email AS billingEmail FROM tenants WHERE id = ?` | Settings/Tenant profile partly | Tenant isolated by `user.tenantId`. |
| `tenantDomains` | `user.platformOwner ? tenantDomains(user.tenantId) : []` | Tenant Domains / Platform | For normal clinic users this is always `[]` despite extracted tenant-domain APIs. |
| `platformTenants` | `user.platformOwner ? platformTenants() : []` | Platform | For normal clinic users this is always `[]`. |
| `billing` | `user.platformOwner ? tenantBilling(user.tenantId) : null` | Billing | For normal clinic users this is always `null`; tenant-local billing page uses separate endpoint. |
| `users` | `SELECT * FROM users WHERE tenant_id = ? AND COALESCE(is_platform_owner, 0) = 0 ORDER BY id`, mapped by `rowToUser` | Users | Returns all tenant non-platform users to every clinic role currently. |
| `invitations` | `user_invitations` query with `inviteUrl(req, token)` | Invitations | Only for `admin`; otherwise `[]`. |
| `categories` | `SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name` | Catalog | Tenant isolated and active-only. |
| `services` | `SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name` | Catalog | Includes inactive services; matches legacy service list behavior. |
| `clients` | `listClients(user)` | Clients | Applies therapist visibility. |
| `crmTasks` | `listCrmTasks(user)` | CRM | Applies CRM task visibility rules from legacy helper. |
| `crmEvents` | `listCrmEvents(user.tenantId)` | CRM | Tenant isolated. |
| `appointments` | `listAppointments(user)` | Appointments | Applies therapist visibility and appointment mapping. |
| `consentTemplates` | `consentTemplates(user.tenantId)` | Consents | Tenant isolated. |
| `consentSignatures` | `consentSignatures(user.tenantId)` for `admin`/`reception`; otherwise `[]` | Consents | Hidden from therapists in bootstrap. |
| `feedbackRequests` | `feedbackRequests(user.tenantId)` for `admin`/`reception`; otherwise `[]` | Feedback | Hidden from therapists in bootstrap. |
| `giftCards` | `giftCards(user.tenantId)` for `admin`/`reception`; otherwise `[]` | Gifts | Hidden from therapists in bootstrap. |
| `messageLogs` | `listMessageLogs(user.tenantId)` for `admin`/`reception`; otherwise `[]` | WhatsApp | Hidden from therapists in bootstrap. |
| `settings` | `clinicSettings(user.tenantId)` | Settings | Tenant isolated key/value object. |
| `audits` | `listAudit(user.tenantId)` for `admin`; otherwise `[]` | Audit | Hidden from reception and therapists. |

### Legacy-Only Helpers Still Required By Bootstrap

- `requireUser`, `currentUser`, `parseCookies` as used by the legacy bootstrap handler.
- `inviteUrl(req, token)` for invitation URLs.
- `tenantBilling()` for the currently unreachable platform-owner billing branch and other legacy use.
- `listClients(user)`, `listAppointments(user)`, `listCrmTasks(user)`, `listCrmEvents(tenantId)`.
- `consentTemplates(tenantId)`, `consentSignatures(tenantId)`.
- `feedbackRequests(tenantId)`, `giftCards(tenantId)`, `listMessageLogs(tenantId)`.
- `clinicSettings(tenantId)`, `listAudit(tenantId)`.
- `rowToUser()` from `server/db.js`.
- `platformTenants()` and `tenantDomains()` still exist in legacy as bootstrap dependencies, although extracted platform modules now duplicate them.

### Tenant Isolation Rules

- Normal clinic branch uses `user.tenantId` for every tenant-scoped query.
- `users` excludes platform owners with `COALESCE(is_platform_owner, 0) = 0`.
- `clients`, `appointments`, and CRM task helpers apply additional role visibility internally.
- Platform-owner branch intentionally crosses tenants only through `platformTenants()` and returns no clinic-local tenant payloads.

### Role-Based Filtering

- `admin`: receives invitations, consent signatures, feedback requests, gift cards, message logs, and audits.
- `reception`: receives consent signatures, feedback requests, gift cards, and message logs; no invitations or audits.
- `therapist`: receives client/appointment/CRM data according to helper visibility, but bootstrap returns empty consent signatures, feedback requests, gift cards, message logs, invitations, and audits.
- `platformOwner`: receives platform tenant dashboard only; all clinic-local arrays are empty and settings is `{}`.

### Performance Risks

- Bootstrap aggregates many modules in one request and can become the largest first-load payload.
- `platformTenants()` performs per-tenant counts, invoice summaries, recent invoices, and domains, creating N+1 query risk as tenants grow.
- `listClients`, `listAppointments`, CRM events/tasks, message logs, consents, gift cards, and audit all load together even when the current screen may not need them.
- Users, categories, and services are unpaginated.
- Message logs/audits/feedback/gifts depend on helper-level limits, not a shared bootstrap contract.

### Duplication Risks With Extracted Modules

- Catalog, clients, appointments, consents, feedback, gifts, WhatsApp logs, CRM, audit, users, invitations, settings, and platform reads already have extracted modules, but bootstrap still uses legacy helper/query copies.
- Any future behavior fix in an extracted module can drift from bootstrap unless bootstrap delegates to the extracted services or shared repositories.
- Platform `platformTenants()` now exists in both `server/modules/platform/platform.repository.js` and legacy.
- Date/shape normalization for appointments, files, consents, CRM, and billing should not be reimplemented a third time.

### High-Risk Dependencies

- Auth/session shape for `user`, especially `platformOwner` and `tenantId`.
- Platform-owner special response branch used by owner dashboard.
- Therapist visibility in `listClients(user)`, `listAppointments(user)`, and `listCrmTasks(user)`.
- Invitation URL generation depends on request host/proto.
- Consent status and appointment behavior may depend on matching templates/signatures loaded during first screen workflows.
- Frontend likely assumes every top-level key exists even when empty.

### Proposed Extraction Strategy

1. Create a `bootstrap` module that returns the exact same top-level key set.
2. First extract controller/route only while still delegating to one legacy-compatible bootstrap service.
3. Move platform-owner branch separately and compare `platformTenants` output byte-for-byte against current endpoint.
4. Move clinic branch one key group at a time by delegating to existing services/repositories, not by rewriting SQL.
5. Preserve role filtering exactly before any pagination or payload slimming.
6. Only after behavioral parity, consider frontend-driven lazy loading as a separate product change, not part of safe refactor.

### Manual Validation Checklist

- Compare top-level keys for platform owner, admin, reception, and therapist.
- Confirm platform owner gets `tenant: null`, `billing: null`, `settings: {}`, clinic arrays empty, and populated `platformTenants`.
- Confirm admin gets invitations and audits.
- Confirm reception gets operational data but no invitations/audits.
- Confirm therapist visibility remains limited for clients/appointments/CRM tasks and restricted arrays stay empty.
- Confirm all bootstrap keys exist even when arrays are empty.
- Confirm `/api/platform/tenants` and `bootstrap.platformTenants` remain identical for platform owner.
- Run frontend first load for platform owner, clinic admin, reception, and therapist.

## SAFE STEP 31 - BOOTSTRAP ROUTE AND CONTROLLER SHELL

Step 31 extracted only the `/api/bootstrap` route boundary. The aggregation logic remains legacy-owned and unchanged through `handleBootstrapLegacy(req, res)`.

### Moved Endpoint

- `GET /api/bootstrap`

### New Module Files

- `server/modules/bootstrap/bootstrap.routes.js`
- `server/modules/bootstrap/bootstrap.controller.js`
- `server/modules/bootstrap/bootstrap.service.js`

### Integration Notes

- `server/app.js` now registers `bootstrapRoutes` before platform and business modules.
- `handleBootstrapRoute()` handles only `GET /api/bootstrap`.
- `bootstrap.service.js` delegates directly to `handleBootstrapLegacy(req, res)`.
- `server/legacy-runtime.js` still contains the fallback branch:
  `LEGACY FALLBACK - BOOTSTRAP - SAFE TO REMOVE AFTER VALIDATION`

### Behavior Preservation

- Response shape was not changed.
- Bootstrap aggregation was not refactored.
- No module repositories or services replaced the legacy data sources.
- Permissions, tenant isolation, role filtering, and session behavior remain owned by the same legacy helper path.

### Bootstrap Keys Confirmed

`user`, `tenant`, `tenantDomains`, `platformTenants`, `billing`, `users`, `invitations`, `categories`, `services`, `clients`, `crmTasks`, `crmEvents`, `appointments`, `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `messageLogs`, `settings`, `audits`.

### Legacy-Owned Bootstrap Helpers Still Required

- `requireUser`, `currentUser`, `parseCookies`.
- `platformTenants`, `tenantDomains`, `tenantBilling`.
- `inviteUrl`.
- `listClients`, `listAppointments`, `listCrmTasks`, `listCrmEvents`.
- `consentTemplates`, `consentSignatures`.
- `feedbackRequests`, `giftCards`, `listMessageLogs`.
- `clinicSettings`, `listAudit`.
- `rowToUser` from `server/db.js`.

### Validation Result

- `node --check` passed for 114 server JavaScript files.
- Test server started successfully on port `3065`.
- `/api/health` and `/api/version` worked.
- Bootstrap for clinic admin, reception, therapist, and platform owner returned exactly 20 expected keys with no missing or extra keys.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked for platform owner and matched `bootstrap.platformTenants`.
- `POST /api/platform/tenants` with invalid body returned `400`.

### Recommended Next Step

SAFE STEP 32 should extract a bootstrap service boundary internally without changing data sources: keep the same legacy helpers, but make `handleBootstrapLegacy` return a response object before writing JSON. This prepares later key-by-key extraction while preserving exact output.

## SAFE STEP 32 - BOOTSTRAP SERVICE BOUNDARY INTERNAL CLEANUP

Step 32 cleaned only `bootstrap.service.js` so the extracted module now builds the bootstrap response object directly before the controller writes JSON. Routes and endpoint registration were not changed.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/modules/bootstrap/bootstrap.controller.js`
- `server/legacy-runtime.js`
- `server/REFACTOR_STATUS.md`

### Internal Cleanup Performed

- Added `buildBootstrapResponse(req, res)` as the single service entry point.
- Split response construction into `platformOwnerBootstrap(user)` and `clinicBootstrap(req, user)`.
- Added section comments for tenant/platform context, people/invitations, catalog, operational data, legal/feedback/gifts/messaging, settings, and audit.
- Controller now writes the returned response object with the same `json(res, 200, body)` helper.
- Exported legacy-owned helpers from `legacy-runtime.js` so the bootstrap module can call the exact same helper functions without moving them.

### Behavior Preservation

- No route definitions changed in Step 32.
- Response keys remain identical and order was validated.
- SQL strings remain identical to the Step 31 bootstrap logic.
- Legacy helper calls remain unchanged: `requireUser`, `platformTenants`, `tenantDomains`, `tenantBilling`, `inviteUrl`, `listClients`, `listCrmTasks`, `listCrmEvents`, `listAppointments`, `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `listMessageLogs`, `clinicSettings`, and `listAudit`.
- No module repositories or extracted services replaced legacy data sources.
- The legacy fallback handler remains available through `handleBootstrapLegacy`.

### Validation Result

- `node --check` passed for 114 server JavaScript files.
- Test server started successfully on port `3066`.
- `/api/health` and `/api/version` worked.
- Bootstrap for clinic admin, reception, therapist, and platform owner returned exactly the expected 20 keys with no missing or extra keys.
- Key order matched the Step 31 expected order.
- Important counts were validated:
  - clinic admin: users `6`, clients `7`, appointments `2`, platformTenants `0`, giftCards `2`, messageLogs `8`, audits `100`.
  - reception: users `6`, clients `7`, appointments `2`, platformTenants `0`, giftCards `2`, messageLogs `8`, audits `0`.
  - therapist: users `6`, clients `1`, appointments `2`, platformTenants `0`, giftCards `0`, messageLogs `0`, audits `0`.
  - platform owner: users `0`, clients `0`, appointments `0`, platformTenants `3`, giftCards `0`, messageLogs `0`, audits `0`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 33 should extract a bootstrap repository-read boundary for only the direct SQL reads already embedded in bootstrap (`tenant`, `users`, `invitations`, `categories`, `services`) while keeping every SQL string and response field exactly identical. Legacy helper calls for complex sections should remain untouched.

## SAFE STEP 33 - BOOTSTRAP DIRECT SQL REPOSITORY BOUNDARY

Step 33 moved only the simple direct SQL reads from `bootstrap.service.js` into a read-only bootstrap repository. No routes changed and complex legacy helpers were not replaced.

### Modified Files

- `server/modules/bootstrap/bootstrap.repository.js`
- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Repository Functions Created

- `findTenantForBootstrap(tenantId)`
- `listUsersForBootstrap(tenantId)`
- `listInvitationsForBootstrap(tenantId)`
- `listCategoriesForBootstrap(tenantId)`
- `listServicesForBootstrap(tenantId)`

### Exact SQL Moved

```sql
SELECT id, name, slug, status, plan, billing_email AS billingEmail FROM tenants WHERE id = ?
```

```sql
SELECT * FROM users WHERE tenant_id = ? AND COALESCE(is_platform_owner, 0) = 0 ORDER BY id
```

```sql
      SELECT id, email, name, role, token, expires_at AS expiresAt, accepted_at AS acceptedAt, created_at AS createdAt
      FROM user_invitations
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT 50
```

```sql
SELECT * FROM categories WHERE tenant_id = ? AND active = 1 ORDER BY name
```

```sql
SELECT id, name, category_id AS categoryId, duration, price, active FROM services WHERE tenant_id = ? ORDER BY name
```

### Behavior Preservation

- Response keys and key order stayed identical.
- No SQL text was changed beyond moving it into repository functions.
- No writes, deletes, inserts, schema changes, or optimizations were added.
- `rowToUser` still maps users in the service exactly as before.
- `inviteUrl` still decorates invitations in the service exactly as before.
- Complex legacy helpers were not replaced: `requireUser`, `platformTenants`, `tenantDomains`, `tenantBilling`, `listClients`, `listAppointments`, `listCrmTasks`, `listCrmEvents`, `consentTemplates`, `clinicSettings`, `listAudit`, `giftCards`, `feedbackRequests`, and `listMessageLogs`.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3067`.
- `/api/health` and `/api/version` worked.
- Bootstrap returned the exact 20 expected keys in the same order for clinic admin, reception, therapist, and platform owner.
- Direct-read samples were validated:
  - tenant id `1` for clinic roles.
  - users `6`, first user `reception`.
  - admin invitations `2`, first invitation `mkhlaili@gmail.com`; non-admin invitation arrays remained empty.
  - categories `4`, first category `איפור קבוע`.
  - services `5`, first service `איפור קבוע לשפתיים`.
- Complex section counts were validated:
  - clinic admin: clients `7`, appointments `2`, platformTenants `0`, settings `12`, audits `100`.
  - reception: clients `7`, appointments `2`, platformTenants `0`, settings `12`, audits `0`.
  - therapist: clients `1`, appointments `2`, platformTenants `0`, settings `12`, audits `0`.
  - platform owner: platformTenants `3`, clinic-local arrays empty.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.
- `POST /api/platform/tenants` with invalid body returned `400`.

### Recommended Next Step

SAFE STEP 34 should be a bootstrap parity report for complex legacy helper boundaries only, identifying which helper can be safely moved next without changing output. No code movement should happen until that report confirms the smallest safe helper group.

## SAFE STEP 34 - BOOTSTRAP COMPLEX HELPER BOUNDARY REPORT

Step 34 is report-only. No code, routes, SQL, helpers, fallback blocks, or response shapes were changed.

### Helper Boundary Table

| Helper | Purpose | Bootstrap key | Tables touched | Filtering | Existing owner | Read/write | Side effects | Difficulty | Risk | Destination | Safe order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `requireUser` | Resolve current session user or return `401`. | `user`, entire bootstrap gate | `sessions`, `users` | session expiry, `tenant_id`, `active = 1` | Auth module partially; legacy auth/session still exports path | Read-only | Writes `401` response on failure | High | High | shared auth middleware/service later | Step 42+ |
| `platformTenants` | Build platform owner tenant dashboard list with counts, balances, invoices, domains. | `platformTenants` | `tenants`, `subscriptions`, `billing_invoices`, `users`, `clients`, `tenant_domains` | Cross-tenant, platform-owner branch only in bootstrap | `server/modules/platform/platform.repository.js` already has matching read helper | Read-only | None | Medium | High | platform repository/service, then bootstrap import | Step 35 |
| `tenantDomains` | List tenant domains ordered primary first. | `tenantDomains` | `tenant_domains` | `tenant_id` | platform repository and tenant-domains repository already exist | Read-only | None | Low | Low | tenant-domains repository or platform repository | Step 36 |
| `tenantBilling` | Build billing snapshot with tenant, subscription, plan, usage, invoices, catalog. | `billing` | `tenants`, `subscriptions`, `users`, `clients`, `billing_invoices` | `tenant_id`; currently only called behind unreachable platform-owner clinic branch in bootstrap | Billing/WhatsApp/client snapshots exist, but not exact full helper | Read-only | None | Medium | Medium | billing repository/service as exact read helper | Step 41 |
| `listClients` | Return active clients, mapped to frontend fields. | `clients` | `clients` | `tenant_id`; therapist sees assigned clients only | clients repository has `listClientRows` but mapping lives in service | Read-only | None | Medium | High | clients service/repository via exact bootstrap adapter | Step 37 |
| `listAppointments` | Return active appointments with client/service/therapist labels and payment fields. | `appointments` | `appointments`, `clients`, `services`, `users` | `tenant_id`; therapist sees own appointments only | appointments repository has matching row query | Read-only | None | Medium | High | appointments service/repository via exact bootstrap adapter | Step 38 |
| `listCrmTasks` | Return CRM tasks, restricted for therapists. | `crmTasks` | `crm_tasks`, `clients`, `users` | `tenant_id`; therapist filtered by `assignedTo` | CRM repository has `listCrmTaskRows` | Read-only | None | Medium | Medium | CRM repository/service adapter | Step 39 |
| `listCrmEvents` | Return recent CRM events, optionally by client. | `crmEvents` | `crm_events`, `clients`, `users` | `tenant_id`, optional `client_id` | CRM repository has `listCrmEventRows` | Read-only | None | Low | Medium | CRM repository | Step 39 |
| `consentTemplates` | List active consent templates with category name. | `consentTemplates` | `consent_templates`, `categories` | `tenant_id`, `active = 1` | Consents module exists; exact helper still legacy-owned | Read-only | None | Medium | Medium | consents repository exact read helper | Step 40 |
| `consentSignatures` | List recent consent signatures with template/client names. | `consentSignatures` | `consent_signatures`, `consent_templates`, `clients` | `tenant_id`; bootstrap calls only for admin/reception | Consents module exists; exact helper still legacy-owned | Read-only | None | Medium | Medium | consents repository exact read helper | Step 40 |
| `clinicSettings` | Return key/value clinic settings object. | `settings` | `clinic_settings` | `tenant_id` | settings repository and WhatsApp/feedback copies exist | Read-only | None | Low | Medium | settings repository canonical read helper | Step 36 |
| `listAudit` | Return latest audit rows with parsed JSON details. | `audits` | `audit_log`, `users` | `tenant_id`; bootstrap calls only for admin | audit repository has row query, service parses details | Read-only | JSON parse can throw if corrupt details | Low | Medium | audit service/repository exact adapter | Step 36 |
| `inviteUrl` | Build invitation URL from request proto/host. | `invitations` | none | none; depends on request headers and cookie secure config | Invitations module likely owns invite URL behavior conceptually | Pure read/helper | None | Low | Medium | shared URL util later, keep until invitation parity | Step 43+ |
| `rowToUser` | Normalize DB user row shape. | `user`, `users` | none directly | depends on row fields | `server/db.js` canonical owner | Pure mapper | None | Low | Low | keep in `db.js` for now | No move needed |
| `giftCards` | List gift cards with client/service labels. | `giftCards` | `gift_cards`, `clients`, `services` | `tenant_id`; bootstrap calls only for admin/reception | gifts module exists; exact read may also be in WhatsApp repository as `listGiftCards` | Read-only | None | Low | Medium | gifts repository exact read helper | Step 40 |
| `feedbackRequests` | List feedback requests with appointment/client/service details. | `feedbackRequests` | `feedback_requests`, `appointments`, `clients`, `services` | `tenant_id`; bootstrap calls only for admin/reception | feedback repository has `listFeedbackRequests` | Read-only | None | Low | Medium | feedback repository | Step 40 |
| `listMessageLogs` | List latest WhatsApp/message logs. | `messageLogs` | `message_logs` | `tenant_id`; bootstrap calls only for admin/reception | WhatsApp repository has `listMessageLogs` | Read-only | None | Low | Medium | WhatsApp repository | Step 40 |

### Key Risks

- `requireUser` is not a simple read helper because it writes the authentication failure response and carries session behavior. It should stay legacy-owned until a shared auth middleware boundary is intentionally extracted.
- `platformTenants` already exists in `server/modules/platform/platform.repository.js`, but it is cross-tenant and has N+1-style nested reads. It is safe to delegate only after exact parity is verified.
- `listClients`, `listAppointments`, and `listCrmTasks` must preserve therapist visibility exactly.
- `clinicSettings`, `listMessageLogs`, and `feedbackRequests` already have duplicate repository-style implementations; picking one canonical owner should be done one helper at a time.
- `listAudit` parses JSON details after reading rows; moving only the row SQL without preserving parse behavior would change response values.
- `inviteUrl` depends on request headers and deployment/proxy behavior. It should not be generalized until invitation URL parity is explicitly tested.

### Recommended Extraction Order

1. **Step 35 - Bootstrap Platform Read Delegation Only**: switch bootstrap `platformTenants` to the existing platform repository helper after comparing output shape exactly.
2. **Step 36 - Bootstrap Low-Risk Read Helpers Only**: move/delegate `tenantDomains`, `clinicSettings`, and `listAudit` through existing repositories/services with exact response parity.
3. **Step 37 - Bootstrap Clients Helper Only**: delegate `listClients` through clients module while preserving therapist visibility and mapping.
4. **Step 38 - Bootstrap Appointments Helper Only**: delegate `listAppointments` through appointments module while preserving therapist visibility, mapping, payment fields, and date ordering.
5. **Step 39 - Bootstrap CRM Helpers Only**: delegate `listCrmTasks` and `listCrmEvents` through CRM module.
6. **Step 40 - Bootstrap Operational Lists Only**: delegate consents, feedback, gifts, and message logs one module at a time or as tiny read-only adapters if exact parity is proven.
7. **Step 41 - Bootstrap Billing Snapshot Only**: extract `tenantBilling` as exact read-only billing helper.
8. **Step 42+ - Shared Auth Boundary**: address `requireUser/currentUser/parseCookies` only after all bootstrap data helpers are stable.
9. **Step 43+ - Shared URL Utility**: move `inviteUrl` only after invitation module parity tests include forwarded proto/host cases.

### Manual Validation Checklist Before Any Helper Delegation

- Capture bootstrap payload key order for clinic admin, reception, therapist, and platform owner.
- Compare counts and first records for the helper being delegated.
- For therapist-sensitive helpers, compare therapist client, appointment, and CRM visibility.
- For platform helpers, compare `GET /api/platform/tenants` against `bootstrap.platformTenants`.
- Confirm signup remains `403`.
- Confirm invalid platform tenant creation remains `400`.
- Confirm no frontend first-load errors for platform owner and clinic roles.

## SAFE STEP 35 - BOOTSTRAP PLATFORM READ DELEGATION

Step 35 delegated only the bootstrap `platformTenants` helper from legacy to the already extracted platform read repository.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Exact Bootstrap Call Changed

- Before: `platformTenants` imported from `../../legacy-runtime.js`.
- After: `platformTenants` imported from `../platform/platform.repository.js`.
- Call sites stayed the same:
  - `platformTenants: await platformTenants()` in the platform-owner bootstrap branch.
  - `platformTenants: user.platformOwner ? await platformTenants() : []` in the clinic branch, which remains effectively `[]` for clinic users.

### Behavior Preservation

- Only `platformTenants` was delegated.
- No response keys changed.
- Key order stayed identical.
- No platform-owner permissions changed.
- No tenant create/update/reset/invoice/billing code was moved.
- All other bootstrap helpers remain legacy-owned: `requireUser`, `tenantDomains`, `tenantBilling`, `listClients`, `listAppointments`, `listCrmTasks`, `listCrmEvents`, `consentTemplates`, `consentSignatures`, `clinicSettings`, `listAudit`, `inviteUrl`, `rowToUser`, `giftCards`, `feedbackRequests`, and `listMessageLogs`.

### Platform Comparison Result

- `bootstrap.platformTenants` and `GET /api/platform/tenants` matched exactly.
- Same count: `3`.
- Same IDs and order: `3,2,1`.
- Same first-record fields.
- Same compact JSON values.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3069`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap returned 20 keys with no missing/extra keys and `platformTenants: []`.
- Platform-owner bootstrap returned 20 keys with no missing/extra keys and `platformTenants` count `3`.
- `POST /api/signup` remained `403`.
- `POST /api/platform/tenants` with invalid body returned `400`.

### Recommended Next Step

SAFE STEP 36 should delegate the low-risk read helpers only: `tenantDomains`, `clinicSettings`, and `listAudit`, one at a time or in a tiny grouped step, using existing repositories while preserving exact response shape and key order.

## SAFE STEP 36 - BOOTSTRAP LOW-RISK READ HELPERS

Step 36 delegated only three read helpers from bootstrap to existing repositories.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Helpers Delegated

- `tenantDomains` -> `server/repositories/tenant-domains.repository.js`
- `clinicSettings` -> `server/repositories/settings.repository.js`
- `listAudit` -> `server/repositories/audit.repository.js` through local `listAuditForBootstrap()` adapter, preserving the legacy `details: JSON.parse(row.details || "{}")` mapping.

### Behavior Preservation

- No routes changed.
- `/api/bootstrap` response keys and key order stayed identical.
- Tenant filtering stayed `tenant_id` based.
- Role behavior stayed identical:
  - `tenantDomains` remains `[]` for current clinic users because the existing condition is unchanged.
  - `settings` remains loaded for clinic users.
  - `audits` remains admin-only.
- No clients, appointments, CRM, consents, message logs, gifts, feedback, billing, invite URL, user mapper, or auth helper was touched.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3070`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, `settings=12`, first setting `clinicName`, `audits=100`, first audit `login:session`, `clients=7`, `appointments=2`.
- Reception bootstrap: 20 keys, order matched, `settings=12`, `audits=0`, `clients=7`, `appointments=2`.
- Therapist bootstrap: 20 keys, order matched, `settings=12`, `audits=0`, `clients=1`, `appointments=2`.
- Platform-owner bootstrap: 20 keys, order matched, `tenantDomains=0`, `settings=0`, `audits=0`, `platformTenants=3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 37 should delegate only `listClients` through the clients module/repository, with special validation for therapist visibility and exact client field mapping.

## SAFE STEP 37 - BOOTSTRAP CLIENTS HELPER

Step 37 delegated only the bootstrap client list read to the clients repository, preserving the exact legacy mapping inside a bootstrap-local adapter.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `listClients` -> `server/repositories/clients.repository.js` via `listClientRows(user)`.
- Mapping is preserved in bootstrap as `listClientsForBootstrap(user)` and `jsonArrayForBootstrap(value)`.

### Exact SQL Delegated

```sql
SELECT * FROM clients WHERE tenant_id = ? AND active = 1 AND therapist_id = ? ORDER BY updated_at DESC
```

for therapists, and:

```sql
SELECT * FROM clients WHERE tenant_id = ? AND active = 1 ORDER BY updated_at DESC
```

for admin/reception and other non-therapist clinic roles.

### Behavior Preservation

- Only `listClients` changed.
- `/api/bootstrap` response keys and key order stayed identical.
- Client fields stayed identical: `id`, `fname`, `lname`, `phone`, `email`, `therapistId`, `stage`, `source`, `tags`, `lastContactedAt`, `notes`.
- Therapist visibility remains assigned-client based through `therapist_id = user.id`.
- Appointments were not touched.
- CRM, consents, gifts, feedback, message logs, billing, invite URL, user mapper, and auth helpers were not touched.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3071`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, clients `7`, client IDs `3,4,7,2,5,6,1`, appointments `2`, settings `12`, audits `100`.
- Reception bootstrap: 20 keys, order matched, clients `7`, client IDs `3,4,7,2,5,6,1`, appointments `2`, settings `12`, audits `0`.
- Therapist bootstrap: 20 keys, order matched, clients `1`, client IDs `1`, appointments `2`, settings `12`, audits `0`.
- Platform-owner bootstrap: 20 keys, order matched, clients `0`, platformTenants `3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 38 should delegate only `listAppointments` through the appointments repository, with special validation for therapist visibility, appointment ordering, payment fields, and unchanged client counts.

## SAFE STEP 38 - BOOTSTRAP APPOINTMENTS HELPER

Step 38 delegated only the bootstrap appointment list read to the appointments repository, preserving the exact legacy mapping inside a bootstrap-local adapter.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `listAppointments` -> `server/repositories/appointments.repository.js` via `listAppointmentRows(user)`.
- Mapping is preserved in bootstrap as `listAppointmentsForBootstrap(user)`.

### Exact SQL Delegated

```sql
SELECT a.*, c.fname, c.lname, c.phone, s.name AS service_name, s.duration, s.price, u.name AS therapist_name
FROM appointments a
JOIN clients c ON c.id = a.client_id
JOIN services s ON s.id = a.service_id
JOIN users u ON u.id = a.therapist_id
WHERE a.tenant_id = ? AND a.active = 1 AND a.therapist_id = ?
ORDER BY a.date DESC, a.time DESC
```

for therapists, and:

```sql
SELECT a.*, c.fname, c.lname, c.phone, s.name AS service_name, s.duration, s.price, u.name AS therapist_name
FROM appointments a
JOIN clients c ON c.id = a.client_id
JOIN services s ON s.id = a.service_id
JOIN users u ON u.id = a.therapist_id
WHERE a.tenant_id = ? AND a.active = 1
ORDER BY a.date DESC, a.time DESC
```

for admin/reception and other non-therapist clinic roles.

### Behavior Preservation

- Only `listAppointments` changed.
- `/api/bootstrap` response keys and key order stayed identical.
- Appointment fields stayed identical: `id`, `clientId`, `clientName`, `clientPhone`, `serviceId`, `serviceName`, `therapistId`, `therapistName`, `date`, `time`, `status`, `notes`, `duration`, `price`, `paymentStatus`, `paidAmount`.
- Payment fields stayed identical: `paymentStatus: row.payment_status || "unpaid"` and `paidAmount: Number(row.paid_amount || 0)`.
- Therapist visibility remains assigned-appointment based through `a.therapist_id = user.id`.
- Clients were not touched.
- CRM, consents, gifts, feedback, message logs, billing, invite URL, user mapper, and auth helpers were not touched.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3072`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, appointments `2`, appointment IDs `1,2`, clients `7`, settings `12`, audits `100`.
- Reception bootstrap: 20 keys, order matched, appointments `2`, appointment IDs `1,2`, clients `7`, settings `12`, audits `0`.
- Therapist bootstrap: 20 keys, order matched, appointments `2`, appointment IDs `1,2`, clients `1`, settings `12`, audits `0`.
- Sample appointment fields matched: `id=1`, `clientId=1`, `clientName=WhatsApp QA`, `serviceId=1`, `serviceName=עיצוב גבות`, `therapistId=3`, `therapistName=סארה`, `date=2026-05-25`, `time=10:00`, `status=pending`, `price=180`, `paidAmount=0`, `paymentStatus=unpaid`.
- Platform-owner bootstrap: 20 keys, order matched, appointments `0`, clients `0`, platformTenants `3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 39 should delegate only CRM bootstrap helpers: `listCrmTasks` and `listCrmEvents`, with special validation for therapist task visibility and unchanged clients/appointments counts.

## SAFE STEP 39 - BOOTSTRAP CRM HELPERS

Step 39 delegated only the bootstrap CRM read helpers to the CRM repository.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `listCrmTasks` -> `server/repositories/crm.repository.js` via `listCrmTaskRows(user)`.
- `listCrmEvents` -> `server/repositories/crm.repository.js` via `listCrmEventRows(tenantId)`.

### Exact SQL Delegated

CRM tasks:

```sql
SELECT t.id, t.client_id AS clientId, t.assigned_to AS assignedTo, t.type, t.title,
       t.due_date AS dueDate, t.status, t.priority, t.notes, t.completed_at AS completedAt,
       t.created_at AS createdAt, c.fname || ' ' || c.lname AS clientName, c.phone AS clientPhone,
       u.name AS assignedToName
FROM crm_tasks t
JOIN clients c ON c.id = t.client_id
LEFT JOIN users u ON u.id = t.assigned_to
WHERE t.tenant_id = ? AND c.active = 1
ORDER BY CASE t.status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(t.due_date, '9999-12-31'), t.id DESC
LIMIT 150
```

Therapist task filtering remains the existing in-memory filter:

```js
rows.filter((row) => Number(row.assignedTo || 0) === Number(user.id))
```

CRM events:

```sql
SELECT e.id, e.client_id AS clientId, e.user_id AS userId, e.type, e.description,
       e.created_at AS createdAt, c.fname || ' ' || c.lname AS clientName, u.name AS userName
FROM crm_events e
LEFT JOIN clients c ON c.id = e.client_id
LEFT JOIN users u ON u.id = e.user_id
WHERE e.tenant_id = ?
ORDER BY e.id DESC
LIMIT 100
```

### Behavior Preservation

- Only `listCrmTasks` and `listCrmEvents` changed.
- `/api/bootstrap` response keys and key order stayed identical.
- CRM task/event response shapes stayed unchanged because repository rows already use legacy aliases.
- Therapist CRM task visibility remains assigned-user based.
- Clients and appointments were not touched.
- Consents, gifts, feedback, message logs, billing, invite URL, user mapper, and auth helpers were not touched.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3073`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, CRM tasks `4` with IDs `4,2,1,3`, CRM events `19` with IDs `19..1`, clients `7`, appointments `2`, settings `12`, audits `100`.
- Reception bootstrap: 20 keys, order matched, CRM tasks `4` with IDs `4,2,1,3`, CRM events `19`, clients `7`, appointments `2`, settings `12`, audits `0`.
- Therapist bootstrap: 20 keys, order matched, CRM tasks `0`, CRM events `19`, clients `1`, appointments `2`, settings `12`, audits `0`.
- Platform-owner bootstrap: 20 keys, order matched, CRM tasks `0`, CRM events `0`, platformTenants `3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 40 should delegate operational read lists only: `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, and `listMessageLogs`, with validation of admin/reception visibility and therapist empty arrays.

## SAFE STEP 40 - BOOTSTRAP OPERATIONAL LISTS

Step 40 delegated only operational read lists used by bootstrap to existing repositories/modules.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destinations

- `consentTemplates` -> `server/repositories/consents.repository.js` via `listConsentTemplates(tenantId)`.
- `consentSignatures` -> `server/repositories/consents.repository.js` via `listConsentSignatures(tenantId)`.
- `feedbackRequests` -> `server/repositories/feedback.repository.js` via `listFeedbackRequests(tenantId)`.
- `giftCards` -> `server/modules/gifts/gifts.repository.js` via `listGiftCards(tenantId)`.
- `listMessageLogs` -> `server/repositories/whatsapp.repository.js` via `listMessageLogs(tenantId)`.

### Behavior Preservation

- Only operational lists changed.
- `/api/bootstrap` response keys and key order stayed identical.
- Existing role behavior stayed unchanged:
  - `consentTemplates` remains available to clinic roles.
  - `consentSignatures`, `feedbackRequests`, `giftCards`, and `messageLogs` remain admin/reception-only.
  - Therapist receives empty arrays for admin/reception-only operational lists.
- Clients, appointments, CRM helpers, billing, invitation URL, user mapper, and auth helpers were not touched.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3074`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, consentTemplates `1:1`, consentSignatures `5:5,4,3,2,1`, feedbackRequests `2:2,1`, giftCards `2:3,1`, messageLogs `8:9,7,6,5,4,3,2,1`, clients `7`, appointments `2`, CRM tasks `4`, CRM events `19`, settings `12`, audits `100`.
- Reception bootstrap: same operational counts/IDs as admin, audits `0`.
- Therapist bootstrap: consentTemplates `1:1`, consentSignatures `0`, feedbackRequests `0`, giftCards `0`, messageLogs `0`, clients `1`, appointments `2`, CRM tasks `0`, CRM events `19`, settings `12`, audits `0`.
- Platform-owner bootstrap: operational lists all empty and platformTenants `3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 41 should address only `tenantBilling` as an exact read-only bootstrap billing snapshot helper, while leaving `requireUser`, `inviteUrl`, and `rowToUser` unchanged.

## SAFE STEP 41 - BOOTSTRAP TENANT BILLING HELPER

Step 41 delegated only the bootstrap `tenantBilling` helper to the existing billing repository.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `tenantBilling` -> `server/repositories/billing.repository.js`.

### Exact SQL Delegated

The delegated repository helper uses the same read queries as legacy:

```sql
SELECT id, name, slug, status, plan, billing_email AS billingEmail, trial_ends_at AS trialEndsAt FROM tenants WHERE id = ?
```

```sql
SELECT id, provider, provider_customer_id AS providerCustomerId, provider_subscription_id AS providerSubscriptionId,
       status, plan, current_period_end AS currentPeriodEnd, created_at AS createdAt, updated_at AS updatedAt
FROM subscriptions
WHERE tenant_id = ?
ORDER BY id DESC
LIMIT 1
```

```sql
SELECT COUNT(*) AS count FROM users WHERE tenant_id = ? AND active = 1 AND COALESCE(is_platform_owner, 0) = 0
```

```sql
SELECT COUNT(*) AS count FROM clients WHERE tenant_id = ? AND active = 1
```

```sql
SELECT id, number, status, currency, amount, period_start AS periodStart, period_end AS periodEnd,
       due_at AS dueAt, paid_at AS paidAt, notes, created_at AS createdAt, updated_at AS updatedAt
FROM billing_invoices
WHERE tenant_id = ?
ORDER BY id DESC
LIMIT 12
```

### Behavior Preservation

- Only `tenantBilling` changed.
- `/api/bootstrap` response keys and key order stayed identical.
- Current bootstrap-visible billing behavior stayed identical:
  - Clinic users still receive `billing: null`.
  - Platform owner still receives `billing: null`.
- No clients, appointments, CRM, operational lists, invitation URL, user mapper, or auth helper was touched.
- `requireUser`, `inviteUrl`, and `rowToUser` remain unchanged.

### Validation Result

- `node --check` passed for 115 server JavaScript files.
- Test server started successfully on port `3075`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap: 20 keys, order matched, `billing=null`, clients `7`, appointments `2`, CRM tasks `4`, CRM events `19`, operational counts `1,5,2,2,8`, settings `12`, audits `100`.
- Reception bootstrap: 20 keys, order matched, `billing=null`, clients `7`, appointments `2`, CRM tasks `4`, CRM events `19`, operational counts `1,5,2,2,8`, settings `12`, audits `0`.
- Therapist bootstrap: 20 keys, order matched, `billing=null`, clients `1`, appointments `2`, CRM tasks `0`, CRM events `19`, operational counts `1,0,0,0,0`, settings `12`, audits `0`.
- Platform-owner bootstrap: 20 keys, order matched, `billing=null`, platformTenants `3`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 42 should be an auth/bootstrap boundary report only for the remaining shared helpers `requireUser`, `inviteUrl`, and `rowToUser`, because they affect session behavior, proxy URL behavior, and user shape.

## SAFE STEP 42 - AUTH/BOOTSTRAP BOUNDARY REPORT

Step 42 is report-only. No code, routes, SQL, helpers, fallback blocks, session behavior, cookies, or bootstrap response shape were changed.

### Helper Boundary Table

| Helper | Purpose | Used by modules/endpoints | Tables touched | Session/cookie dependency | Tenant isolation dependency | Role/permission dependency | Read-only / side effects | Best destination | Risk | Recommended order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `requireUser(req, res)` from `legacy-runtime.js` | Resolve current user from signed `clinic_session`; write `401` when missing. | Bootstrap module, legacy fallback auth gates, `requirePermission`, `requirePlatformOwner`. | `sessions`, `users` via `currentUser`. | Strong dependency on `parseCookies`, `readSignedToken`, `config.sessionSecret`, session expiry, and cookie name. | Requires `sessions.tenant_id`, then loads matching `users.tenant_id`; defaults missing session tenant to `1`. | Base gate for role checks through `requirePermission` / `requirePlatformOwner`; includes `platformOwner` in user shape. | Reads DB, but writes HTTP `401` response on failure. | Later shared auth middleware/service that preserves legacy response-writing contract or returns a typed auth result. | High | Last; after all bootstrap non-auth helpers are stable. |
| `inviteUrl(req, token)` from `legacy-runtime.js` | Build invitation URLs with forwarded proto/host fallback. | Bootstrap invitations key, legacy invitations fallback. Similar duplicate exists in `server/services/invitations.service.js`. | None. | No session dependency; depends on request headers and `config.cookieSecure`. | None directly. | None directly; output is visible in admin invitation payloads. | Pure helper with deployment/proxy-sensitive output. | Shared URL utility or invitations service helper after forwarded header parity tests. | Medium | After auth report and invitation URL parity tests. |
| `rowToUser(row)` from `server/db.js` | Normalize DB user rows to frontend/session user shape. | `db.current/provisionTenant`, legacy current user and user fallback mapping, bootstrap users key, auth/users/invitations repositories. | None directly; consumes `users` row fields. | None directly, but current-user session path relies on its output. | Emits `tenantId`, defaults missing `tenant_id` to `1`. | Emits `role`, `platformOwner`, `active`, `workdays`, `serviceIds`. | Pure mapper; JSON parsing can throw if malformed arrays. | Keep in `server/db.js` for now or later move to shared user mapper only after broad parity tests. | Medium | Do not move yet; maybe document as canonical mapper. |

### Complete `requireUser` Consumers Found

Legacy helper from `server/legacy-runtime.js`:

- `requirePermission(req, res, key)` in `server/legacy-runtime.js`.
- `requirePlatformOwner(req, res)` in `server/legacy-runtime.js`.
- `POST /api/account/password` legacy fallback.
- `GET /api/search` legacy fallback.
- `GET /api/settings` legacy fallback.
- `GET /api/tenant` legacy fallback.
- `handleBootstrapLegacy(req, res)` fallback for `GET /api/bootstrap`.
- `server/modules/bootstrap/bootstrap.service.js` current extracted bootstrap route.

Indirect legacy consumers through `requirePermission` / `requirePlatformOwner`:

- Legacy invitation fallbacks.
- Legacy billing fallbacks.
- Legacy settings write fallback.
- Remaining `crudRoutes()` legacy fallback resources that still use `requirePermission`.

Separate extracted auth helper with the same name, not the legacy function:

- `server/services/permissions.service.js` exports `requireUser(req)` returning `{ ok, user }` or `{ ok:false, status, body }`.
- Used by extracted controllers/services such as search and settings domain flows.
- This extracted helper depends on `server/services/auth.service.js` `currentUser(parseCookies(req).clinic_session)`.

### `inviteUrl` Consumers Found

- `server/modules/bootstrap/bootstrap.service.js` for bootstrap `invitations`.
- `server/legacy-runtime.js` invitation fallback list/create and legacy bootstrap fallback.
- `server/services/invitations.service.js` has a duplicate local `inviteUrl(req, token)` with the same intended behavior.

### `rowToUser` Consumers Found

- `server/db.js` `provisionTenant()` return shape.
- `server/legacy-runtime.js` `currentUser()`, legacy auth/profile fallbacks, legacy users fallback, legacy bootstrap fallback.
- `server/modules/bootstrap/bootstrap.service.js` for bootstrap `users`.
- `server/repositories/auth.repository.js`.
- `server/repositories/users.repository.js`.
- `server/repositories/invitations.repository.js`.

### Key Risks

- Moving `requireUser` too early can silently change unauthenticated response bodies, cookie/session handling, or platform-owner detection.
- There are two auth boundary styles today: legacy `requireUser(req,res)` writes responses, while extracted `permissions.service.requireUser(req)` returns structured auth results. Mixing them without a compatibility adapter is risky.
- `inviteUrl` depends on `x-forwarded-proto`, `x-forwarded-host`, `req.headers.host`, and `config.cookieSecure`; this is production/proxy-sensitive.
- `rowToUser` is a central shape contract for bootstrap, `/api/me`, login, users, invitations, and tenant provisioning.

### Recommended Extraction Order

1. Keep `rowToUser` in `server/db.js` as the canonical mapper; do not move it unless a dedicated user-mapper parity step is requested.
2. Extract/shared `inviteUrl` only after testing normal host, forwarded host, forwarded proto, and `cookieSecure` behavior.
3. Do a dedicated `requireUser` migration plan before any code movement: list all legacy fallback consumers still active, define a compatibility adapter, and prove identical `401` body/session behavior.

### Recommended Next Safe Step

SAFE STEP 43 should be a final bootstrap parity and cleanup report only: identify which legacy bootstrap fallback code is now duplicate, what can be removed later, and which auth/shared helpers must remain until an auth boundary migration is planned.

## SAFE STEP 43 - FINAL BOOTSTRAP CLEANUP REPORT

Step 43 is report-only. No code, routes, SQL, auth/session/cookie behavior, fallback blocks, or bootstrap response shape were changed.

### Current `/api/bootstrap` Owner Files

- Route registration: `server/modules/bootstrap/bootstrap.routes.js`.
- Controller: `server/modules/bootstrap/bootstrap.controller.js`.
- Response builder: `server/modules/bootstrap/bootstrap.service.js`.
- Direct bootstrap SQL reads: `server/modules/bootstrap/bootstrap.repository.js`.
- Route order: `server/app.js` registers `bootstrapRoutes` before platform and remaining business modules, then falls back to `legacyApi` only if the extracted handler does not handle the route.
- Legacy fallback copy: `server/legacy-runtime.js` still contains `handleBootstrapLegacy(req, res)` and the old `/api/bootstrap` branch.

### Bootstrap Source Map

| Key | Current data source | Ownership status |
| --- | --- | --- |
| `user` | `requireUser(req, res)` from `server/legacy-runtime.js` | Still legacy-owned auth boundary |
| `tenant` | `findTenantForBootstrap()` in `server/modules/bootstrap/bootstrap.repository.js` | Bootstrap repository-owned |
| `tenantDomains` | `tenantDomains()` in `server/repositories/tenant-domains.repository.js`; condition currently returns `[]` for clinic users | Repository-owned |
| `platformTenants` | `platformTenants()` in `server/modules/platform/platform.repository.js` | Platform module-owned |
| `billing` | `tenantBilling()` in `server/repositories/billing.repository.js`; condition currently returns `null` for all visible bootstrap branches | Billing repository-owned |
| `users` | `listUsersForBootstrap()` in bootstrap repository, mapped by `rowToUser()` from `server/db.js` | Mixed: SQL bootstrap-owned, mapper shared DB-owned |
| `invitations` | `listInvitationsForBootstrap()` in bootstrap repository, decorated by `inviteUrl()` from legacy | Mixed: SQL bootstrap-owned, URL helper legacy-owned |
| `categories` | `listCategoriesForBootstrap()` in bootstrap repository | Bootstrap repository-owned |
| `services` | `listServicesForBootstrap()` in bootstrap repository | Bootstrap repository-owned |
| `clients` | `listClientRows()` in `server/repositories/clients.repository.js`, mapped by bootstrap-local adapter | Clients repository-owned with bootstrap adapter |
| `crmTasks` | `listCrmTaskRows()` in `server/repositories/crm.repository.js` | CRM repository-owned |
| `crmEvents` | `listCrmEventRows()` in `server/repositories/crm.repository.js` | CRM repository-owned |
| `appointments` | `listAppointmentRows()` in `server/repositories/appointments.repository.js`, mapped by bootstrap-local adapter | Appointments repository-owned with bootstrap adapter |
| `consentTemplates` | `listConsentTemplates()` in `server/repositories/consents.repository.js` | Consents repository-owned |
| `consentSignatures` | `listConsentSignatures()` in `server/repositories/consents.repository.js`; admin/reception only | Consents repository-owned |
| `feedbackRequests` | `listFeedbackRequests()` in `server/repositories/feedback.repository.js`; admin/reception only | Feedback repository-owned |
| `giftCards` | `listGiftCards()` in `server/modules/gifts/gifts.repository.js`; admin/reception only | Gifts module-owned |
| `messageLogs` | `listMessageLogs()` in `server/repositories/whatsapp.repository.js`; admin/reception only | WhatsApp repository-owned |
| `settings` | `clinicSettings()` in `server/repositories/settings.repository.js` | Settings repository-owned |
| `audits` | `listAuditRows()` in `server/repositories/audit.repository.js`, parsed by bootstrap-local adapter; admin only | Audit repository-owned with bootstrap adapter |

### Keys Still Depending On `legacy-runtime.js`

- `user`: depends on legacy `requireUser(req, res)`.
- `invitations`: depends on legacy `inviteUrl(req, token)`.
- Controller response writing still imports legacy `json(res, status, data)`.
- `users`: still depends on shared `rowToUser()` from `server/db.js`, not legacy, but this remains a shared mapper boundary.

### Remaining Legacy Exports Used By Bootstrap

- `json` from `server/legacy-runtime.js`, used by `bootstrap.controller.js`.
- `requireUser` from `server/legacy-runtime.js`, used by `bootstrap.service.js`.
- `inviteUrl` from `server/legacy-runtime.js`, used by `bootstrap.service.js`.

### Remaining Duplicate Bootstrap/Fallback Code In `legacy-runtime.js`

- The old `/api/bootstrap` route branch still exists and calls `handleBootstrapLegacy(req, res)`.
- `handleBootstrapLegacy(req, res)` still rebuilds the complete bootstrap response using the old legacy helper/query path.
- Legacy helper implementations still exist for data now delegated by extracted bootstrap:
  - `platformTenants`, `tenantDomains`, `tenantBilling`.
  - `listClients`, `listAppointments`, `listCrmTasks`, `listCrmEvents`.
  - `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `listMessageLogs`.
  - `clinicSettings`, `listAudit`.
- These legacy helpers may still be used by other legacy fallback endpoints, so they should not be deleted as part of bootstrap cleanup alone.

### Is `handleBootstrapLegacy` Still Reachable?

Yes, but only as fallback:

- `server/app.js` matches `GET /api/bootstrap` through `bootstrapRoutes`.
- `handleBootstrapRoute()` currently returns `true` for `GET /api/bootstrap`.
- If `handleBootstrapRoute()` ever returned `false` or failed before writing a response, `server/app.js` would call `legacyApi(req, res, url)`.
- Inside `legacyApi`, the old `/api/bootstrap` branch calls `handleBootstrapLegacy(req, res)`.

Under normal current behavior, extracted bootstrap handles the route first and the fallback should not run.

### Can Legacy `/api/bootstrap` Fallback Be Removed Later?

Not yet.

It can become a safe removal candidate only after:

- `requireUser` is no longer imported from `legacy-runtime.js` by bootstrap.
- `inviteUrl` is no longer imported from `legacy-runtime.js` by bootstrap.
- `json` response helper is moved or replaced by a shared response utility.
- Parity tests prove extracted bootstrap handles unauthenticated, clinic admin, reception, therapist, and platform-owner cases without fallback.
- Other legacy endpoints no longer need the same helper code that would be deleted.

The old `/api/bootstrap` branch itself can be removed before deleting all helper implementations, but only after route-level fallback parity is tested and the fallback branch is no longer needed as a safety net.

### Risks Before Moving `requireUser`

- Legacy `requireUser(req, res)` writes the `401` response directly, while extracted `permissions.service.requireUser(req)` returns a structured auth result. A direct swap would change control flow unless wrapped carefully.
- Session behavior depends on `clinic_session`, `readSignedToken`, `config.sessionSecret`, `sessions.expires_at`, `sessions.tenant_id`, and active user lookup.
- `currentUser()` defaults missing `session.tenant_id` to `1`; changing this could affect older sessions.
- `rowToUser()` controls `tenantId`, `role`, `platformOwner`, `workdays`, `serviceIds`, and `active`.
- `/api/me`, login, legacy permission checks, bootstrap, search/settings/tenant fallbacks, and remaining legacy `crudRoutes()` paths all depend on compatible auth shape.

### Recommended Cleanup Order

1. **rowToUser extraction/documentation**: keep `rowToUser` in `server/db.js` as canonical for now; if moved later, create `server/utils/user-mapper.js` and re-export from `db.js` first to avoid changing import behavior.
2. **inviteUrl extraction**: create a shared URL helper only after testing `host`, `x-forwarded-host`, `x-forwarded-proto`, and `config.cookieSecure`; then update both bootstrap and invitations service together.
3. **requireUser/auth boundary extraction**: create a compatibility wrapper that preserves direct response writing for legacy-style consumers and structured auth result for extracted controllers; do not remove old helper until all consumers are migrated.
4. **bootstrap fallback removal**: remove only the legacy `/api/bootstrap` branch after the extracted route owns auth, URL, response writing, and mapper boundaries, with explicit unauthenticated/role parity tests.
5. **legacy-runtime removal**: defer until all active legacy endpoints and shared exports such as `json`, static serving, upload/PDF/backup fallback paths, and remaining `crudRoutes()` behavior are independently owned.

### Recommended Next 3 Safe Steps

1. **SAFE STEP 44 - Shared Response JSON Helper Boundary Only**: move or wrap `json(res, status, data)` into a shared utility while preserving exact headers/body behavior, because many extracted controllers still import it from legacy.
2. **SAFE STEP 45 - Invitation URL Helper Extraction Only**: extract `inviteUrl` to a shared utility and update bootstrap plus invitations service after forwarded-header parity tests.
3. **SAFE STEP 46 - Auth Boundary Migration Report Only**: produce a detailed migration plan for `requireUser/currentUser/parseCookies` consumers before any auth code movement.

## SAFE STEP 44 - SHARED RESPONSE JSON HELPER

Step 44 extracted only the shared JSON response helper. No route, endpoint, SQL, auth/session/cookie, `requireUser`, `inviteUrl`, or `rowToUser` behavior was changed.

### Modified Files

- `server/shared/http/json-response.js`
- `server/legacy-runtime.js`
- `server/modules/bootstrap/bootstrap.controller.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `json(res, status, data)` now lives in `server/shared/http/json-response.js`.
- `server/legacy-runtime.js` imports and re-exports the same helper for compatibility.
- `server/modules/bootstrap/bootstrap.controller.js` imports directly from the shared helper.

### Preserved Behavior

The helper body remains:

```js
const body = JSON.stringify(data);
res.writeHead(status, {
  "Content-Type": "application/json; charset=utf-8",
  "Content-Length": Buffer.byteLength(body),
  "X-Content-Type-Options": "nosniff",
});
res.end(body);
```

### Compatibility Notes

- Existing controllers that still import `json` from `legacy-runtime.js` continue to work because the legacy export remains.
- Bootstrap no longer imports `json` from `legacy-runtime.js`.
- `requireUser`, `inviteUrl`, and `rowToUser` were not touched.
- No endpoint logic was changed.

### Validation Result

- `node --check` passed for 116 server JavaScript files.
- Test server started successfully on port `3078`.
- `/api/health` and `/api/version` worked.
- Unauthenticated `GET /api/bootstrap` remained `401` with JSON headers and body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Clinic admin login, `/api/me`, and `/api/bootstrap` worked; bootstrap returned 20 ordered keys.
- Platform-owner bootstrap worked; bootstrap returned 20 ordered keys and 3 platform tenants.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Recommended Next Step

SAFE STEP 45 should extract only the invitation URL helper, updating bootstrap and invitations service to use one shared helper while preserving forwarded-host/proto and `cookieSecure` behavior exactly.

## SAFE STEP 45 - INVITATION URL HELPER EXTRACTION

Step 45 extracted only the invitation URL helper. No routes, SQL, auth/session/cookie behavior, invitation token generation, storage, accept flow, `requireUser`, or `rowToUser` behavior was changed.

### Modified Files

- `server/shared/http/url-helpers.js`
- `server/legacy-runtime.js`
- `server/modules/bootstrap/bootstrap.service.js`
- `server/services/invitations.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- `inviteUrl(req, token)` now lives in `server/shared/http/url-helpers.js`.
- `server/legacy-runtime.js` imports and re-exports the same helper for compatibility.
- `server/modules/bootstrap/bootstrap.service.js` imports directly from the shared helper.
- `server/services/invitations.service.js` imports directly from the shared helper.

### Preserved Behavior

The helper body remains:

```js
const proto = req.headers["x-forwarded-proto"] || (config.cookieSecure ? "https" : "http");
const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:3000";
return `${proto}://${host}/?invite=${encodeURIComponent(token)}`;
```

### Validation Result

- `node --check` passed for 117 server JavaScript files.
- Test server started successfully on port `3079`.
- `/api/health` and `/api/version` worked.
- Clinic admin bootstrap returned 20 ordered keys and 2 invitations.
- Invitation URL behavior with fresh sessions:
  - Normal host: `http://127.0.0.1:3079/?invite=...`
  - `x-forwarded-host: proxy.example.test:9443`: `http://proxy.example.test:9443/?invite=...`
  - `x-forwarded-proto: https`: `https://127.0.0.1:3079/?invite=...`
  - Both forwarded host/proto: `https://public.example.test/?invite=...`
- Unauthenticated `GET /api/bootstrap` remained `401`.
- `POST /api/signup` remained `403`.
- `GET /api/platform/tenants` still worked and returned 3 tenants.

### Compatibility Notes

- Legacy invitation fallback still works because `legacy-runtime.js` re-exports `inviteUrl`.
- Bootstrap no longer imports `inviteUrl` from `legacy-runtime.js`.
- Invitations service no longer keeps its own duplicate local helper.
- `requireUser` and `rowToUser` were not touched.

### Recommended Next Step

SAFE STEP 46 should be an auth boundary migration report only for `requireUser/currentUser/parseCookies`, including a consumer-by-consumer migration order and compatibility strategy before any auth code movement.

## SAFE STEP 46 - AUTH BOUNDARY MIGRATION REPORT

Step 46 is report-only. No code, routes, SQL, auth/session/cookie behavior, response status/body, bootstrap behavior, login/logout/me behavior, or fallback code was changed.

### Legacy Auth Boundary

Legacy auth still lives in `server/legacy-runtime.js` and is used by bootstrap plus legacy fallback endpoints.

| Helper | Exact behavior |
| --- | --- |
| `parseCookies(req)` | Reads `req.headers.cookie || ""`, splits on `;`, decodes each value with `decodeURIComponent`, and returns a plain object keyed by cookie name. |
| `currentUser(req)` | Reads `clinic_session`, verifies the signed token with `config.sessionSecret`, reads `sessions` by `id` with `expires_at > Date.now()`, then reads active `users` by `id`, `tenant_id = session.tenant_id || 1`, and `active = 1`; maps the row with `rowToUser()`. |
| `requireUser(req, res)` | Calls legacy `currentUser(req)`. On success, returns the mapped user object directly. On failure, writes `401` immediately with `{ error: "״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„" }` and returns `null`. |
| `requirePermission(req, res, key)` | Calls legacy `requireUser`. Platform owners receive `403` with `Platform owners must use the platform administration API.`. Non-permitted clinic roles receive `403` with the legacy localized error body. On success, returns the user object. |
| `requirePlatformOwner(req, res)` | Calls legacy `requireUser`. Non-platform owners receive `403` with `Platform owner access is required.`. On success, returns the user object. |

Legacy unauthenticated, invalid cookie, invalid signature, missing session, expired session, and inactive user all collapse into the same `401` response from `requireUser`.

### Tenant And Platform Handling

- Tenant isolation comes from the `sessions.tenant_id` value and the user lookup condition `WHERE id = ? AND tenant_id = ? AND active = 1`.
- Older or malformed sessions with no `tenant_id` still default to tenant `1` through `session.tenant_id || 1`.
- Platform owners are not special inside `currentUser` or `requireUser`; they are normal mapped users with `platformOwner: true`.
- Platform-owner restrictions happen only in `requirePermission` and `requirePlatformOwner`.

### Structured Auth Boundary

Structured auth already exists in `server/services/auth.service.js` and `server/services/permissions.service.js`.

| Helper | Exact behavior |
| --- | --- |
| `auth.service.parseCookies(req)` | Same parsing algorithm as legacy: reads `req.headers.cookie || ""`, splits on `;`, decodes values, returns a cookie object. |
| `auth.service.currentUser(token)` | Accepts the token directly, verifies it with `config.sessionSecret`, reads active session through `auth.repository.findActiveSession(id, Date.now())`, reads active user through `auth.repository.findActiveUser(session.user_id, session.tenant_id || 1)`, then maps through `toUser()` / `rowToUser()`. |
| `permissions.service.requireUser(req)` | Parses `clinic_session`, calls structured `currentUser(token)`, and returns `{ ok: true, user }` on success or `{ ok: false, status: 401, body: { error: loginRequiredError } }` on failure. It does not write to `res`. |
| `permissions.service.requirePermission(req, key)` | Calls structured `requireUser`. Platform owners get structured `403`, missing permission gets structured `403`, success returns `{ ok: true, user }`. |
| `permissions.service.requirePlatformOwner(req)` | Calls structured `requireUser`; non-platform owners get structured `403`, platform owners pass through. |

### Difference Table

| Area | Legacy helper | Structured helper | Migration impact |
| --- | --- | --- | --- |
| Signature | `requireUser(req, res)` | `requireUser(req)` | Bootstrap and fallback code need an adapter if response-writing behavior is preserved. |
| Failure behavior | Writes JSON response immediately and returns `null` | Returns `{ ok: false, status, body }` | Direct replacement would stop automatic `401` writes. |
| Success behavior | Returns user object | Returns `{ ok: true, user }` | Call sites must unwrap `.user`. |
| Current user input | Full `req` object | Session token for `currentUser`, full `req` for permission wrapper | Cookie parsing boundary must stay stable. |
| Cookie behavior | `clinic_session`; `HttpOnly; SameSite=Lax; Path=/`; `Secure` when configured | Same cookie name and attributes in auth service | Compatible, but should remain centrally tested. |
| Session SQL | Direct SQL in legacy runtime | Same SQL through auth repository | Compatible if repository remains unchanged. |
| 401 body | Legacy corrupted/localized string | Structured corrupted/localized string constant | Must compare before replacing bootstrap/fallback users, because bodies are not visibly identical in source. |
| Platform owner handling | Enforced in legacy permission/platform wrappers | Enforced in structured permission/platform wrappers | Same intended behavior, but response body parity must be verified per endpoint. |

### Direct Consumers Of Legacy `requireUser`

- `server/modules/bootstrap/bootstrap.service.js`: `buildBootstrapResponse(req, res)` still imports and calls legacy `requireUser(req, res)`.
- `server/legacy-runtime.js`: `requirePermission(req, res, key)` calls legacy `requireUser`.
- `server/legacy-runtime.js`: `requirePlatformOwner(req, res)` calls legacy `requireUser`.
- `server/legacy-runtime.js`: legacy fallback `POST /api/account/password`.
- `server/legacy-runtime.js`: legacy fallback `GET /api/search`.
- `server/legacy-runtime.js`: legacy fallback `GET /api/settings`.
- `server/legacy-runtime.js`: legacy fallback `GET /api/tenant`.
- `server/legacy-runtime.js`: legacy fallback `handleBootstrapLegacy(req, res)`.

### Indirect Consumers Through Legacy `requirePermission`

Legacy fallback paths still call `requirePermission`, which calls legacy `requireUser`:

- invitations fallback: `GET /api/invitations`, `POST /api/invitations`, `DELETE /api/invitations/:id`.
- message logs / feedback / CRM fallback paths: `GET /api/message-logs`, `GET /api/crm`.
- settings fallback: `PUT /api/settings`.
- `crudRoutes()` fallback resources: users, categories, services, clients, CRM, appointments, consents, feedback, gifts, reports, audit, and related nested legacy handlers.

### Indirect Consumers Through Legacy `requirePlatformOwner`

Legacy fallback paths still call `requirePlatformOwner`, which calls legacy `requireUser`:

- legacy billing fallback: `/api/billing`, `/api/billing/invoices`, `/api/billing/invoices/:id`.
- platform fallback routes: `GET/POST/PUT /api/platform/tenants`, reset-password, invoices, auto billing.
- tenant/domain fallback routes: `/api/tenant`, `/api/tenant/domains`, `/api/tenant/domains/:id`.
- system fallback routes: `/api/system/export`, `/api/system/restore`.

### Extracted Consumers Already Using Structured Auth

These modules/controllers already use `services/permissions.service.js` or `services/auth.service.js` rather than legacy `requireUser`:

- auth controller: login/logout/me through `auth.service`.
- account module: current-user password change through `auth.service.currentUser`.
- search, settings, users, invitations, clients, appointments, files, consents, reports, audit, feedback, CRM, billing, WhatsApp, catalog, gifts, tenant domains, and platform module controllers through structured `requireUser`, `requirePermission`, or `requirePlatformOwner`.

### Legacy Fallback Only Consumers

The legacy consumers above are active only if extracted route handlers do not handle the route, except `bootstrap.service.js`, which still directly imports legacy `requireUser` during normal extracted bootstrap handling. This makes bootstrap the only current extracted path still intentionally crossing the legacy auth boundary.

### Recommended Target Design

1. Create a shared auth boundary that exposes a side-effect-free current-user function:
   - `getCurrentUserFromRequest(req)` or equivalent.
   - Same `clinic_session`, same signed-token verification, same session lookup, same `session.tenant_id || 1`, same active user lookup, same `rowToUser` mapping.
2. Keep a structured wrapper:
   - returns `{ ok, user, status, body }`.
   - used by extracted controllers.
3. Keep a legacy compatibility wrapper:
   - accepts `(req, res)`.
   - writes the exact legacy `401` body and returns `null` on failure.
   - returns the direct user object on success.
4. Delegate legacy `requirePermission` and `requirePlatformOwner` only after their response bodies are parity-tested.

### Required Compatibility Adapter

Before moving bootstrap off legacy `requireUser`, add an adapter with the exact legacy contract:

```js
async function requireUserResponse(req, res) {
  const auth = await requireUserResult(req);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return null;
  }
  return auth.user;
}
```

The adapter must preserve the legacy `401` body exactly for `/api/bootstrap` before bootstrap can safely stop importing `requireUser` from `legacy-runtime.js`.

### Migration Order

1. **rowToUser shared mapper boundary**: keep `rowToUser` behavior canonical; if moved, re-export from `server/db.js` first.
2. **structured currentUser helper boundary**: centralize cookie parsing and session lookup without changing SQL or cookie names.
3. **bootstrap requireUser delegation**: switch bootstrap to a compatibility adapter that still writes the same `401` body.
4. **requirePermission delegation**: migrate legacy permission wrapper through a compatibility layer after endpoint-level `403` parity checks.
5. **requirePlatformOwner delegation**: migrate platform-owner wrapper after platform route parity checks.
6. **fallback removal**: remove duplicate fallback auth only after no route imports or calls legacy auth helpers.

### Manual Auth Parity Checklist

- No `clinic_session` cookie: same `401` status/body.
- Invalid cookie signature: same `401` status/body.
- Missing/expired `sessions` row: same `401` status/body.
- Inactive user row: same `401` status/body.
- Clinic admin: `/api/me` and `/api/bootstrap` remain unchanged.
- Reception: `/api/bootstrap` role-filtered payload remains unchanged.
- Therapist: `/api/bootstrap` visibility-filtered payload remains unchanged.
- Platform owner: `/api/bootstrap` and `/api/platform/tenants` remain unchanged.
- Clinic user calling platform routes: permission behavior remains unchanged.
- Platform owner calling clinic module routes: `403` behavior remains unchanged.

### Validation Result

- `node --check` passed for 117 server JavaScript files.
- Test server started successfully on port `3080`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- Clinic admin login, `/api/me`, and `/api/bootstrap` returned `200`; bootstrap returned the same 20-key order.
- Reception login, `/api/me`, and `/api/bootstrap` returned `200`; bootstrap returned the same 20-key order.
- Therapist login, `/api/me`, and `/api/bootstrap` returned `200`; bootstrap returned the same 20-key order and therapist-scoped client visibility.
- Platform-owner login, `/api/me`, `/api/bootstrap`, and `GET /api/platform/tenants` returned `200`; bootstrap returned 3 platform tenants and the platform tenants endpoint returned 3 tenants.

### Recommended Next Step

SAFE STEP 47 should extract only the `rowToUser` mapper boundary or add an auth compatibility adapter report/test, before changing bootstrap's `requireUser` import.

## SAFE STEP 47 - ROWTOUSER MAPPER BOUNDARY

Step 47 extracted only the `rowToUser` mapper boundary. No routes, SQL, login/logout/me behavior, `/api/bootstrap` behavior, auth/session/cookie behavior, `requireUser`, `requirePermission`, `requirePlatformOwner`, response shapes, or fallback behavior were changed.

### Modified Files

- `server/shared/auth/user-mapper.js`
- `server/db.js`
- `server/repositories/auth.repository.js`
- `server/repositories/users.repository.js`
- `server/repositories/invitations.repository.js`
- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Destination

- Canonical mapper destination: `server/shared/auth/user-mapper.js`.
- `server/db.js` now imports and re-exports `rowToUser` for legacy compatibility.
- `server/legacy-runtime.js` still imports `rowToUser` from `server/db.js`, so legacy fallback imports remain compatible.

### Preserved Mapping

The mapper body was moved without changing fields or defaults:

```js
{
  id: row.id,
  tenantId: row.tenant_id || 1,
  username: row.username,
  email: row.email || "",
  name: row.name,
  title: row.title,
  role: row.role,
  workdays: JSON.parse(row.workdays || "[]"),
  serviceIds: JSON.parse(row.service_ids || "[]"),
  platformOwner: Boolean(row.is_platform_owner),
  active: Boolean(row.active),
}
```

`password_hash` remains excluded exactly as before.

### Import Boundary Notes

- Safe extracted imports now use the shared mapper directly:
  - `server/repositories/auth.repository.js`
  - `server/repositories/users.repository.js`
  - `server/repositories/invitations.repository.js`
  - `server/modules/bootstrap/bootstrap.service.js`
- Compatibility imports through `server/db.js` remain active for:
  - `server/legacy-runtime.js`
  - internal `server/db.js` provisioning return shape.

### Validation Result

- `node --check` passed for 118 server JavaScript files.
- Test server started successfully on port `3081`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` remained `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `/api/me.user` matched `/api/bootstrap.user` exactly for:
  - `clinic-admin`: role `admin`, `platformOwner: false`, 20 bootstrap keys.
  - `reception`: role `reception`, `platformOwner: false`, 20 bootstrap keys.
  - `sara`: role `therapist`, `platformOwner: false`, 20 bootstrap keys, therapist-scoped clients preserved.
  - `admin`: role `admin`, `platformOwner: true`, 20 bootstrap keys, 3 platform tenants.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.

### Production Risk

Low. The mapper logic was moved verbatim, old `server/db.js` export remains available, and auth/session/cookie behavior was not touched. Main residual risk is import-cycle sensitivity in future edits, so `server/shared/auth/user-mapper.js` should remain dependency-free.

### Recommended Next Step

SAFE STEP 48 should introduce or report an auth compatibility adapter for `requireUser` without changing consumers yet, so bootstrap can later move off `legacy-runtime.js` while preserving the exact legacy `401` response contract.

## SAFE STEP 48 - AUTH COMPATIBILITY ADAPTER

Step 48 created a shared auth compatibility adapter only. No production route was switched to it. No login/logout/me behavior, `/api/bootstrap` behavior, sessions, cookies, SQL behavior, status codes, response bodies, `requireUser`, `requirePermission`, `requirePlatformOwner`, or fallback code was changed.

### Modified Files

- `server/shared/auth/current-user.js`
- `server/REFACTOR_STATUS.md`

### New Adapter Functions

- `parseRequestCookies(req)`: same cookie parsing algorithm as legacy `parseCookies(req)`.
- `resolveCurrentUser(req)`: structured current-user resolver that returns `{ ok: true, user }` or `{ ok: false, status: 401, body }`.
- `requireCurrentUserCompat(req, res)`: optional compatibility wrapper that writes the same legacy `401` JSON response and returns `null` on failure, or returns the direct user object on success.
- `legacyLoginRequiredBody`: shared constant for the exact legacy bootstrap/auth `401` body.

### Exact Behavior Covered

- No `clinic_session` cookie: structured `401` with the legacy login-required body.
- Invalid session token format/signature: structured `401` with the legacy login-required body.
- Missing or expired/deleted session row: structured `401` with the legacy login-required body.
- Inactive or missing user row: structured `401` with the legacy login-required body.
- Active clinic user: returns `{ ok: true, user }` using the shared `rowToUser` mapper.
- Platform-owner user: returns `{ ok: true, user }` with `platformOwner: true`; platform-owner restrictions remain outside this adapter, exactly like legacy `requireUser`.
- Cookies are not cleared by the adapter, matching legacy `requireUser`.

The adapter preserves the legacy SQL behavior:

```sql
SELECT tenant_id, user_id FROM sessions WHERE id = ? AND expires_at > ?
SELECT * FROM users WHERE id = ? AND tenant_id = ? AND active = 1
```

It also preserves `session.tenant_id || 1` tenant fallback behavior.

### Production Route Status

- No production route imports or calls `resolveCurrentUser`.
- No production route imports or calls `requireCurrentUserCompat`.
- `legacy-runtime.js` `requireUser` is unchanged and remains the active auth path for extracted bootstrap plus legacy fallbacks.
- `permissions.service.js` is unchanged.

### Validation Result

- `node --check` passed for 119 server JavaScript files.
- `rg` confirmed the new adapter functions are referenced only inside `server/shared/auth/current-user.js`.
- Direct adapter smoke test:
  - no cookie returned `{ ok: false, status: 401 }` with the legacy body.
  - invalid token returned `{ ok: false, status: 401 }` with the legacy body.
  - active platform-owner session returned `{ ok: true }`, username `admin`, `platformOwner: true`, and the expected user keys.
- Test server started successfully on port `3082`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` remained `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- Clinic admin, reception, therapist, and platform-owner login all returned `200`.
- `/api/me.user` still matched `/api/bootstrap.user` exactly for clinic admin, reception, therapist, and platform-owner.
- `/api/bootstrap` returned the same 20-key order for all tested roles.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.

### Production Risk

Very low. This step only added an unused shared adapter and did not change active route wiring. The main risk to control in the next step is exact `401` response parity when bootstrap is eventually switched from legacy `requireUser` to `requireCurrentUserCompat`.

### Recommended Next Step

SAFE STEP 49 should switch only `/api/bootstrap` from legacy `requireUser` to `requireCurrentUserCompat`, with strict unauthenticated/body parity checks and no changes to `requirePermission` or `requirePlatformOwner`.

## SAFE STEP 49 - BOOTSTRAP AUTH ADAPTER SWITCH

Step 49 switched only the `/api/bootstrap` auth lookup from legacy `requireUser(req, res)` to `requireCurrentUserCompat(req, res)`. No other route, login/logout/me behavior, session behavior, cookie behavior, SQL, `requirePermission`, `requirePlatformOwner`, response keys, key order, fallback code, or legacy `requireUser` implementation was changed.

### Modified Files

- `server/modules/bootstrap/bootstrap.service.js`
- `server/REFACTOR_STATUS.md`

### Exact Call Changed

In `server/modules/bootstrap/bootstrap.service.js`:

```js
const user = await requireUser(req, res);
```

was replaced with:

```js
const user = await requireCurrentUserCompat(req, res);
```

The import changed from `../../legacy-runtime.js` to `../../shared/auth/current-user.js`.

### Scope Confirmation

- Only `/api/bootstrap` auth lookup changed.
- `legacy-runtime.js` still defines and exports `requireUser`.
- `requirePermission` was not changed.
- `requirePlatformOwner` was not changed.
- Legacy consumers for account password, search, settings, tenant, platform routes, and fallback routes were not changed.
- Bootstrap aggregation and data source calls were not changed.

### Parity Results

- No cookie `GET /api/bootstrap`: `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Invalid `clinic_session` cookie `GET /api/bootstrap`: `401` with the same body.
- `clinic-admin`:
  - login `200`, `/api/me` `200`, `/api/bootstrap` `200`.
  - 20 bootstrap keys in exact order.
  - `/api/me.user` matched `/api/bootstrap.user`.
  - clients `7`, appointments `2`, platformTenants `0`.
- `reception`:
  - login `200`, `/api/me` `200`, `/api/bootstrap` `200`.
  - 20 bootstrap keys in exact order.
  - `/api/me.user` matched `/api/bootstrap.user`.
  - clients `7`, appointments `2`, platformTenants `0`.
- `sara` therapist:
  - login `200`, `/api/me` `200`, `/api/bootstrap` `200`.
  - 20 bootstrap keys in exact order.
  - `/api/me.user` matched `/api/bootstrap.user`.
  - clients `1`, appointments `2`, platformTenants `0`.
- `admin` platform-owner:
  - login `200`, `/api/me` `200`, `/api/bootstrap` `200`.
  - 20 bootstrap keys in exact order.
  - `/api/me.user` matched `/api/bootstrap.user`.
  - tenant `null`, clients `0`, appointments `0`, platformTenants `3`.
  - `GET /api/platform/tenants` returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` remained `401`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`

### Validation Result

- `node --check` passed for 119 server JavaScript files.
- Test server started successfully on port `3083`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- All parity tests above passed.

### Production Risk

Low. The switched call preserves the same direct user/null contract for bootstrap, writes the same unauthenticated `401` body through the shared JSON helper, and uses the same session SQL and `rowToUser` mapper. Legacy `requireUser` remains intact for all legacy fallback consumers.

### Recommended Next Step

SAFE STEP 50 should be a `requirePermission` compatibility boundary report or adapter-only step, before any legacy permission consumers are migrated.

## SAFE STEP 50 - PERMISSION BOUNDARY REPORT

Step 50 is report-only. No code, routes, `/api/bootstrap`, auth/session/cookie behavior, `requireUser`, `requirePermission`, `requirePlatformOwner`, SQL, response status/body, or fallback code was changed.

### Legacy `requirePermission` Behavior

Legacy implementation lives in `server/legacy-runtime.js`.

```js
async function requirePermission(req, res, key) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.platformOwner) {
    json(res, 403, { error: "Platform owners must use the platform administration API." });
    return null;
  }
  if (!permissions[key]?.includes(user.role)) {
    json(res, 403, { error: "„״§ ״×…„ƒ ״µ„״§״­״© „‡״°‡ ״§„״¹…„״©" });
    return null;
  }
  return user;
}
```

Exact behavior:

- Calls legacy `requireUser(req, res)` first.
- If unauthenticated, invalid cookie, missing/expired session, or inactive user: legacy `requireUser` writes `401` and `requirePermission` returns `null`.
- If authenticated user is a platform owner: writes `403` with `Platform owners must use the platform administration API.` and returns `null`.
- If `permissions[key]` does not include `user.role`: writes `403` with the legacy localized permission body and returns `null`.
- On success: returns the direct user object.
- Allowed roles are defined by `permissions`:
  - `users`, `categories`, `services`, `reports`, `audit`, `settings_write`, `appointments_delete`: `admin`.
  - `consents`: `admin`, `reception`, `therapist`.
  - `consents_write`, `feedback`, `gifts`, `clients_write`: `admin`, `reception`.
  - `clients_read`, `crm`, `crm_write`, `appointments_read`, `appointments_write`: `admin`, `reception`, `therapist`.

### Legacy `requirePlatformOwner` Behavior

Legacy implementation lives in `server/legacy-runtime.js`.

```js
async function requirePlatformOwner(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.platformOwner) {
    json(res, 403, { error: "Platform owner access is required." });
    return null;
  }
  return user;
}
```

Exact behavior:

- Calls legacy `requireUser(req, res)` first.
- If unauthenticated, invalid cookie, missing/expired session, or inactive user: legacy `requireUser` writes `401` and `requirePlatformOwner` returns `null`.
- If authenticated user does not have `platformOwner: true`: writes `403` with `Platform owner access is required.` and returns `null`.
- On success: returns the direct platform-owner user object.

### Structured Helper Comparison

Structured helpers live in `server/services/permissions.service.js`.

| Area | Legacy runtime | Structured permissions service |
| --- | --- | --- |
| `requirePermission` signature | `(req, res, key)` | `(req, key)` |
| `requirePlatformOwner` signature | `(req, res)` | `(req)` |
| Failure response | Writes JSON directly and returns `null` | Returns `{ ok: false, status, body }` |
| Success response | Returns user object | Returns `{ ok: true, user }` |
| 401 source | Legacy `requireUser` | Structured `requireUser` from permissions service |
| Platform owner blocked from clinic APIs | Same text body | Same text body |
| Non-platform owner blocked from platform APIs | Same text body | Same text body |
| Permission map | Shared `permissions` object | Same `permissions` object |
| Main migration risk | Direct response-writing contract | Callers must write response from structured result |

Important parity note: the visible source strings for the structured `401` and localized `403` bodies are not byte-identical to legacy strings. Any migration must compare the actual endpoint response body before switching legacy consumers.

### Direct Consumers Of Legacy `requirePermission`

These direct consumers remain in `server/legacy-runtime.js`:

- `GET /api/invitations` fallback: key `users`.
- `POST /api/invitations` fallback: key `users`.
- `DELETE /api/invitations/:id` fallback: key `users`.
- `GET /api/message-logs` fallback: key `feedback`.
- `GET /api/crm` fallback: key `crm`.
- `PUT /api/settings` fallback: key `settings_write`.
- `crudRoutes()` users fallback: key `users`.
- `crudRoutes()` categories fallback: key `categories`.
- `crudRoutes()` services fallback: key `services`.
- `crudRoutes()` client files/list/download/delete fallback: keys `clients_read` / `clients_write`.
- `crudRoutes()` clients fallback: keys `clients_read` / `clients_write`.
- `crudRoutes()` CRM fallback: keys `crm` / `crm_write`.
- `crudRoutes()` appointments fallback: keys `appointments_read` / `appointments_write` / `appointments_delete`.
- `crudRoutes()` consents fallback: keys `consents` / `consents_write`.
- `crudRoutes()` feedback fallback: key `feedback`.
- `crudRoutes()` gifts fallback: key `gifts`.
- `crudRoutes()` reports fallback: key `reports`.
- `crudRoutes()` audit fallback: key `audit`.

### Direct Consumers Of Legacy `requirePlatformOwner`

These direct consumers remain in `server/legacy-runtime.js`:

- `GET /api/billing` fallback.
- `PUT /api/billing` fallback.
- `POST /api/billing/invoices` fallback.
- `PUT /api/billing/invoices/:id` fallback.
- `GET /api/platform/tenants` fallback.
- `POST /api/platform/tenants` fallback.
- `POST /api/platform/tenants/:id/invoices` fallback.
- `PUT /api/platform/invoices/:id` fallback.
- `POST /api/platform/billing/auto-run` fallback.
- `POST /api/platform/tenants/:id/reset-password` fallback.
- `PUT /api/platform/tenants/:id` fallback.
- `PUT /api/tenant` fallback.
- `GET /api/tenant/domains` fallback.
- `POST /api/tenant/domains` fallback.
- `PUT /api/tenant/domains/:id` fallback.
- `DELETE /api/tenant/domains/:id` fallback.
- `GET /api/system/export` active legacy endpoint.
- `POST /api/system/restore` active legacy endpoint.

### Active Endpoints vs Fallback-Only Consumers

Active legacy permission/platform-owner consumers:

- `GET /api/system/export`.
- `POST /api/system/restore`.
- Any legacy endpoint whose extracted route is not registered or intentionally does not handle the request.

Fallback-only consumers under current route order:

- Invitations, billing, platform tenant read/update/create, platform invoices, platform auto billing, platform reset password, tenant domains, settings, search, users, clients, files, appointments, CRM, consents, feedback, gifts, reports, audit, catalog, and message logs have extracted routes that should take precedence before legacy fallback.
- The old legacy branches remain as safety fallback and should not be deleted until route-level parity and fallback reachability are audited per module.

### Extracted Modules No Longer Depending On Legacy Permissions

These extracted controllers/modules use `server/services/permissions.service.js` or `server/services/auth.service.js` instead of legacy permission helpers:

- auth, account, bootstrap, search, settings, tenant domains.
- users, invitations, clients, appointments, files.
- consents, reports, audit, feedback, CRM, billing, WhatsApp.
- catalog, gifts.
- platform read/update/provisioning/invoices/auto-billing/reset-password.

Bootstrap now uses `requireCurrentUserCompat` and no longer imports legacy `requireUser`.

### Recommended Compatibility Adapter Design

Add shared compatibility wrappers only after this report:

```js
async function requirePermissionCompat(req, res, key) {
  const auth = await requirePermissionResult(req, key);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return null;
  }
  return auth.user;
}

async function requirePlatformOwnerCompat(req, res) {
  const auth = await requirePlatformOwnerResult(req);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return null;
  }
  return auth.user;
}
```

Compatibility requirements:

- Use the same current-user adapter as bootstrap.
- Preserve direct `user/null` return contract for legacy-style callers.
- Preserve exact legacy `401`, platform-owner clinic-route `403`, missing-permission `403`, and platform-owner-required `403` response bodies.
- Do not switch active legacy consumers until endpoint-level parity is measured.

### Safest Migration Order

1. Adapter-only step for `requirePermissionCompat` and `requirePlatformOwnerCompat`, unused by production routes.
2. Switch one low-risk fallback-only legacy branch to `requirePermissionCompat` only after confirming the extracted route still wins.
3. Switch legacy `crudRoutes()` permission calls in grouped batches, with direct fallback tests.
4. Switch legacy platform-owner wrappers for fallback-only platform routes.
5. Leave active system export/restore platform-owner checks until backup/restore is extracted or separately parity-tested.
6. Only after all consumers migrate, remove legacy `requirePermission` and `requirePlatformOwner`.

### Manual Permission Parity Checklist

- Unauthenticated request to a clinic permission endpoint: same `401`.
- Invalid `clinic_session`: same `401`.
- Valid admin: allowed for admin-only permissions.
- Valid reception: denied for admin-only permissions, allowed for reception permissions.
- Valid therapist: denied for write/admin permissions, allowed for therapist-readable permissions.
- Platform owner calling clinic module route: same `403` text.
- Non-platform-owner calling platform route: same `403` text.
- Platform owner calling platform route: succeeds.
- Inactive user session: same `401` if easy to prepare in a disposable DB.

### Validation Result

- `node --check` passed for 119 server JavaScript files.
- Test server started successfully on port `3084`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Clinic admin login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order.
- Reception login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order.
- Therapist login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order and therapist-scoped client visibility.
- Platform-owner login and `/api/bootstrap` returned `200`; bootstrap returned 3 platform tenants.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`

### Recommended Next Step

SAFE STEP 51 should create unused `requirePermissionCompat` and `requirePlatformOwnerCompat` adapters only, with no route switching.

## SAFE STEP 51 - PERMISSION COMPATIBILITY ADAPTERS

Step 51 created compatibility adapters for legacy permission and platform-owner behavior only. No production route was switched to them. No legacy `requirePermission`, legacy `requirePlatformOwner`, routes, `/api/bootstrap`, login/logout/me, sessions/cookies, SQL behavior, status codes, response bodies, or fallback code were changed.

### Modified Files

- `server/shared/auth/permissions-compat.js`
- `server/REFACTOR_STATUS.md`

### Adapter Function Names

- `requirePermissionCompat(req, res, keyOrAllowedRoles)`
- `requirePlatformOwnerCompat(req, res)`

Supporting exported constants:

- `legacyPlatformClinicApiBody`
- `legacyForbiddenBody`
- `legacyPlatformOwnerRequiredBody`

### Exact Bodies Matched

`401` unauthenticated/invalid session body comes from `resolveCurrentUser()`:

```json
{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}
```

`403` platform owner blocked from clinic API:

```json
{"error":"Platform owners must use the platform administration API."}
```

`403` authenticated clinic user missing required permission:

```json
{"error":"„״§ ״×…„ƒ ״µ„״§״­״© „‡״°‡ ״§„״¹…„״©"}
```

`403` non-platform-owner blocked from platform API:

```json
{"error":"Platform owner access is required."}
```

### Behavior Covered

- `requirePermissionCompat` uses `resolveCurrentUser(req)` internally.
- It writes the same `401` body for unauthenticated or invalid sessions.
- It writes the same `403` body when a platform owner calls a clinic permission route.
- It writes the same `403` body when the authenticated clinic role is not allowed.
- It returns the same user object shape on allowed roles.
- It supports either a permission key from the shared `permissions` map or a direct allowed-role array.
- `requirePlatformOwnerCompat` uses `resolveCurrentUser(req)` internally.
- It writes the same `401` body for unauthenticated or invalid sessions.
- It writes the same `403` body for non-platform-owner users.
- It returns the same user object shape for platform-owner users.

### Route Switch Confirmation

- `rg` confirmed `requirePermissionCompat`, `requirePlatformOwnerCompat`, and the new legacy body constants are referenced only inside `server/shared/auth/permissions-compat.js`.
- No production route imports the new adapters.
- Legacy `requirePermission` and `requirePlatformOwner` remain unchanged in `server/legacy-runtime.js`.

### Isolated Adapter Parity Smoke Test

- `requirePermissionCompat` with no cookie wrote `401` with the legacy login-required body.
- `requirePermissionCompat` with platform-owner user on clinic permission wrote `403` with `Platform owners must use the platform administration API.`
- `requirePermissionCompat` with reception user on `users` permission wrote `403` with the legacy localized permission body.
- `requirePermissionCompat` with clinic admin on `users` permission returned user `clinic-admin`.
- `requirePlatformOwnerCompat` with no cookie wrote `401` with the legacy login-required body.
- `requirePlatformOwnerCompat` with clinic admin wrote `403` with `Platform owner access is required.`
- `requirePlatformOwnerCompat` with platform owner returned user `admin`.

### Production Behavior Validation

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3085`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401` with the expected body.
- Clinic admin login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order.
- Reception login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order.
- Therapist login and `/api/bootstrap` returned `200`; bootstrap kept the 20-key order and therapist-scoped client visibility.
- Platform-owner login and `/api/bootstrap` returned `200`; bootstrap returned 3 platform tenants.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`

### Production Risk

Very low. This step added unused adapters only, and active production route behavior was verified unchanged. The next risk point is the first actual legacy consumer switch, which should be fallback-only and validated with direct fallback reachability checks.

### Recommended Next Step

SAFE STEP 52 should switch only a low-risk fallback-only legacy permission consumer to `requirePermissionCompat`, or produce a fallback reachability report before switching.

## SAFE STEP 52 - LEGACY FALLBACK REACHABILITY REPORT

Step 52 is report-only. No code, routes, permissions, auth/session/cookie behavior, `/api/bootstrap`, `requirePermission`, `requirePlatformOwner`, or fallback code was changed.

### Route Ordering Summary

`server/app.js` registers extracted route definitions first, then calls `legacyApi(req, res, url)` only when:

- a route matched but its extracted controller returns `false`;
- a route matched with no `module` and therefore falls through to the final legacy handler;
- no extracted route matched.

Current `registeredRoutes` order:

1. status
2. auth
3. account
4. signup
5. bootstrap
6. platform
7. files
8. consents
9. search
10. audit
11. feedback
12. CRM
13. billing
14. WhatsApp
15. catalog
16. gifts
17. clients
18. appointments
19. users
20. invitations
21. reports
22. settings

Important reachability detail:

- `authRoutes` still includes `POST /api/signup` and `POST /api/account/password` without a module before the dedicated `signupRoutes` and `accountRoutes`. That makes those two legacy handlers active in normal flow today.
- `filesRoutes` includes `GET /api/system/export` and `POST /api/system/restore` without a module. Those two system endpoints are active legacy routes today.

### Legacy Routes Still Defined

| Legacy route or family | Current classification | Reason / notes |
| --- | --- | --- |
| `GET /api/health` | Duplicate unreachable in normal flow | Extracted status route handles first. Safe removal candidate after status fallback audit. |
| `GET /api/version` | Duplicate unreachable in normal flow | Extracted status route handles first. Safe removal candidate after status fallback audit. |
| `GET /api/public/feedback/:token` | Fallback-only reachable | Extracted feedback route handles first. Keep until public feedback parity/fallback removal. |
| `POST /api/public/feedback/:token` | Fallback-only reachable | Extracted feedback route handles first. Keep until public feedback parity/fallback removal. |
| `POST /api/signup` | Active reachable | `authRoutes` catches this with no module before `signupRoutes`; legacy disabled-signup branch is currently active. Must keep for now or fix route ordering in a separate safe step. |
| `GET /api/invitations/:token` | Fallback-only reachable | Extracted invitations route handles first. Keep until invitation public preview parity/fallback removal. |
| `POST /api/invitations/:token/accept` | Fallback-only reachable | Extracted invitations route handles first. Keep until invitation accept parity/fallback removal. |
| `POST /api/login` | Duplicate unreachable in normal flow | Extracted auth route handles first. Safe removal candidate later. |
| `POST /api/logout` | Duplicate unreachable in normal flow | Extracted auth route handles first. Safe removal candidate later. |
| `POST /api/account/password` | Active reachable | `authRoutes` catches this with no module before `accountRoutes`; legacy account password branch is currently active. Must keep for now or fix route ordering in a separate safe step. |
| `GET /api/me` | Duplicate unreachable in normal flow | Extracted auth route handles first. Safe removal candidate later. |
| `GET /api/invitations` | Fallback-only reachable | Extracted invitations route handles first. |
| `POST /api/invitations` | Fallback-only reachable | Extracted invitations route handles first. |
| `DELETE /api/invitations/:id` | Fallback-only reachable | Extracted invitations route handles first. |
| `GET /api/billing` | Fallback-only reachable | Extracted billing route handles first. |
| `PUT /api/billing` | Fallback-only reachable | Extracted billing route handles first. |
| `POST /api/billing/invoices` | Fallback-only reachable | Extracted billing route handles first. |
| `PUT /api/billing/invoices/:id` | Fallback-only reachable | Extracted billing route handles first. |
| `GET /api/search` | Fallback-only reachable | Extracted search route handles first. |
| `GET /api/message-logs` | Fallback-only reachable | Extracted WhatsApp route handles first. |
| `GET /api/crm` | Fallback-only reachable | Extracted CRM route handles first. |
| `GET /api/platform/tenants` | Fallback-only reachable | Extracted platform route handles first. |
| `POST /api/platform/tenants` | Fallback-only reachable | Extracted platform provisioning route handles first. |
| `POST /api/platform/tenants/:id/invoices` | Fallback-only reachable | Extracted platform invoices route handles first. |
| `PUT /api/platform/invoices/:id` | Fallback-only reachable | Extracted platform invoices route handles first. |
| `POST /api/platform/billing/auto-run` | Fallback-only reachable | Extracted platform billing route handles first. |
| `POST /api/platform/tenants/:id/reset-password` | Fallback-only reachable | Extracted platform password route handles first. |
| `PUT /api/platform/tenants/:id` | Fallback-only reachable | Extracted platform route handles first. |
| `GET /api/settings` | Fallback-only reachable | Extracted settings route handles first. |
| `PUT /api/settings` | Fallback-only reachable | Extracted settings route handles first. |
| `GET /api/tenant` | Fallback-only reachable | Extracted settings route handles first. |
| `PUT /api/tenant` | Fallback-only reachable | Extracted settings route handles first. |
| `GET /api/tenant/domains` | Fallback-only reachable | Extracted tenant-domain route handles first. |
| `POST /api/tenant/domains` | Fallback-only reachable | Extracted tenant-domain route handles first. |
| `PUT /api/tenant/domains/:id` | Fallback-only reachable | Extracted tenant-domain route handles first. |
| `DELETE /api/tenant/domains/:id` | Fallback-only reachable | Extracted tenant-domain route handles first. |
| `GET /api/system/export` | Active reachable | Route exists without extracted module handler, so legacy system export is active. Must keep until system module extraction. |
| `POST /api/system/restore` | Active reachable | Route exists without extracted module handler, so legacy restore is active. Must keep until system module extraction. |
| `GET /api/bootstrap` | Duplicate fallback-only | Extracted bootstrap handles first. Legacy fallback exists if extracted handler returns `false`. |
| `crudRoutes() /api/users*` | Fallback-only reachable | Extracted users route handles normal resource paths first. |
| `crudRoutes() /api/categories*` | Fallback-only reachable | Extracted catalog route handles normal resource paths first. |
| `crudRoutes() /api/services*` | Fallback-only reachable | Extracted catalog route handles normal resource paths first. |
| `crudRoutes() GET /api/clients/:id/history` | Duplicate fallback-only | Extracted clients controller handles `history`; legacy fallback remains duplicate. |
| `crudRoutes() /api/clients/:id/files` | Fallback-only reachable | Extracted files route handles exact files paths first. Legacy remains fallback. |
| `crudRoutes() /api/client-files/:id/download` | Fallback-only reachable | Extracted files route handles first. |
| `crudRoutes() DELETE /api/client-files/:id` | Fallback-only reachable | Extracted files route handles first. |
| `crudRoutes() /api/clients*` | Fallback-only reachable | Extracted clients route handles normal resource paths first. |
| `crudRoutes() /api/crm-tasks*` | Fallback-only reachable | Extracted CRM route handles first. |
| `crudRoutes() /api/appointments*` | Fallback-only reachable | Extracted appointments route handles normal resource paths first. |
| `crudRoutes() POST /api/appointments/:id/whatsapp` | Fallback-only reachable | Extracted WhatsApp route handles first. |
| `crudRoutes() /api/consents*` | Fallback-only reachable | Extracted consents route handles first. |
| `crudRoutes() /api/feedback*` | Fallback-only reachable | Extracted feedback route handles first. |
| `crudRoutes() /api/gifts` and `PUT /api/gifts/:id` | Fallback-only reachable | Extracted gifts route handles CRUD first. |
| `crudRoutes() POST /api/gifts/:id/whatsapp` | Fallback-only reachable | Extracted WhatsApp route handles first. |
| `crudRoutes() /api/reports*` | Fallback-only reachable | Extracted reports route handles `/api/reports`; unknown `/api/reports/*` may still fall to legacy 404-like behavior. |
| `crudRoutes() /api/audit*` | Fallback-only reachable | Extracted audit route handles `/api/audit`; unknown subpaths may still fall to legacy. |
| `crudRoutes()` final `404` | Active fallback | Any unmatched `/api/*` still reaches legacy and returns the legacy 404 JSON. Must keep until global API 404 is extracted. |

### Remaining Active Legacy Routes

| Endpoint | Helper used | Data touched | Risk |
| --- | --- | --- | --- |
| `POST /api/signup` | none | none; disabled response only | Low, but route ordering currently makes legacy active. |
| `POST /api/account/password` | legacy `requireUser` | `users`, `sessions`, `audit_log`; changes password and clears sessions | High; mutating auth/account behavior. |
| `GET /api/system/export` | legacy `requirePlatformOwner` | backup creation, filesystem backup read, `audit_log` | High; backup/export and filesystem behavior. |
| `POST /api/system/restore` | legacy `requirePlatformOwner` | multipart upload, backup validation, filesystem restore staging, process restart, `audit_log` | Very high; restore/restart behavior. |
| unmatched `/api/*` final 404 | none | none | Low; global fallback behavior. |

### Legacy Helpers Still Exported

| Export | Still needed why |
| --- | --- |
| `api` | Used by `server/app.js` as the legacy fallback handler. |
| `serveStatic` | Used by `server/app.js` for non-API static serving. |
| `json` | Still imported by many extracted controllers; safe shared JSON extraction happened, but controller imports have not been migrated yet. |
| `requireUser` | Still used inside `legacy-runtime.js` active/fallback endpoints; no extracted module imports it now after bootstrap switch. |
| `handleBootstrapLegacy` | Kept as legacy fallback for `/api/bootstrap`. |
| `inviteUrl` | Re-exported for compatibility; main extracted users now use shared URL helper, but legacy invitation fallbacks still use it. |
| `clinicSettings`, `tenantDomains`, `tenantBilling` | Used by legacy fallback handlers and exported for compatibility with prior boundaries. |
| `platformTenants` | Used by legacy platform fallback handlers and exported for compatibility. |
| `listClients`, `listAppointments`, `listCrmTasks`, `listCrmEvents`, `consentTemplates`, `consentSignatures`, `feedbackRequests`, `giftCards`, `listMessageLogs`, `listAudit` | Still used by legacy fallback handlers and exported as legacy compatibility helpers. |
| `createClinovaServer` | Kept for any legacy standalone server compatibility path. |

Note: `requirePermission` and `requirePlatformOwner` are not exported from `legacy-runtime.js`, but remain internally active for legacy fallback and system routes.

### Extracted Modules Still Importing `legacy-runtime.js`

No extracted module imports legacy auth helpers anymore, but many still import legacy `json`.

- `server/app.js`: `api`, `serveStatic`, `json`.
- Controllers importing `json` from legacy: auth, users, invitations, clients, appointments, settings, tenant-domains, files, consents, search, reports, audit, feedback, CRM, billing, WhatsApp.
- Module controllers importing `json` from legacy: status, account, signup, catalog, gifts, platform read/update, platform provisioning, platform invoices, platform billing, platform password.

### Routes That Can Later Switch Safely To Compat Permissions

Good candidates after direct fallback reachability tests:

- Fallback-only clinic permission reads/writes in `crudRoutes()` for users, categories, services, reports, audit, CRM, feedback, gifts.
- Fallback-only invitation authenticated routes.
- Fallback-only settings `PUT /api/settings`.
- Fallback-only WhatsApp/message-log/gift/appointment WhatsApp routes.

Good candidates for `requirePlatformOwnerCompat` later:

- Fallback-only platform tenants read/update/create.
- Fallback-only platform invoices and auto billing, after validation-only tests.
- Fallback-only tenant domains.

### Routes That Should Not Be Touched Yet

- `POST /api/account/password`: active legacy, mutates password and sessions. Fix route ordering or extract parity separately first.
- `GET /api/system/export`: active legacy, filesystem/backup behavior.
- `POST /api/system/restore`: active legacy, restore/restart behavior.
- `POST /api/signup`: active legacy only because of route ordering; safest next step is route-order correction or explicit confirmation before touching logic.
- Any backup/restore/static serving helpers.
- Global unmatched `/api/*` 404 fallback, until a dedicated API 404 handler is added.

### Recommended Next 3 Safe Steps

1. **SAFE STEP 53 - Auth Route Ordering Report/Fix**: inspect and fix only route ordering for `POST /api/signup` and `POST /api/account/password` so extracted modules handle them, with exact response parity.
2. **SAFE STEP 54 - JSON Import Migration Report/Adapter**: migrate extracted controllers from legacy `json` import to shared `json-response.js`, one low-risk group at a time.
3. **SAFE STEP 55 - System Backup/Restore Boundary Report**: document export/restore before extracting the remaining active high-risk legacy system endpoints.

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3086`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Clinic admin, reception, therapist, and platform-owner login plus `/api/bootstrap` returned `200`.
- Bootstrap kept the 20-key order for all tested roles.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Normal clinic protected endpoint smoke test: `GET /api/clients` as clinic admin returned `200` with 7 clients.
- Platform protected endpoint smoke test: `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.

## SAFE STEP 53 - ROUTE ORDERING FIX FOR SIGNUP + ACCOUNT

Step 53 made the extracted signup/account route definitions win before the overlapping auth fallback definitions. No login/logout/me, sessions/cookies, SQL, permissions, bootstrap, platform routes, system export/restore, or legacy fallback implementation was changed.

### Modified Files

- `server/app.js`
- `server/modules/account/account.controller.js`
- `server/modules/account/account.service.js`
- `server/REFACTOR_STATUS.md`

### Exact Route Ordering Change

In `server/app.js`, `accountRoutes` and `signupRoutes` now register before `authRoutes`:

```js
const registeredRoutes = [
  ...statusRoutes,
  ...accountRoutes,
  ...signupRoutes,
  ...authRoutes,
  ...
];
```

Before this step, `authRoutes` appeared before both modules and contained overlapping route definitions for `POST /api/signup` and `POST /api/account/password`.

### Parity Alignment

During pre-check, `POST /api/account/password` was confirmed active in legacy and returned the legacy `401` body. The extracted account module had equivalent behavior but different mojibake/localized text constants, so the account module constants were aligned to the legacy bodies before route ordering was changed. This preserved external endpoint behavior while making the extracted module active.

Aligned account module response bodies:

- unauthenticated `401`:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- invalid short new password `400`:
  `{"error":"ƒ„…״© ״§„…״±ˆ״± ״§„״¬״¯״¯״© ״¬״¨ ״£† ״×ƒˆ† 8 ״£״­״± ״¹„‰ ״§„״£‚„"}`
- invalid current password `400`:
  `{"error":"ƒ„…״© ״§„…״±ˆ״± ״§„״­״§„״© ״÷״± ״µ״­״­״©"}`

No password hashing, session invalidation, audit logging, or database behavior was changed.

### Active Handler Confirmation

- `POST /api/signup` is now matched by `signupRoutes` before the overlapping auth route entry.
- `POST /api/account/password` is now matched by `accountRoutes` before the overlapping auth route entry.
- `POST /api/login`, `POST /api/logout`, and `GET /api/me` still match `authRoutes` unchanged.
- Legacy fallback still exists and remains available if a matched extracted controller returns `false` or an unmatched route reaches `legacyApi`.

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3088`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked for `clinic-admin` and `admin`.
- `GET /api/me` worked for `clinic-admin`.
- `GET /api/bootstrap` worked for clinic admin, reception, therapist, and platform-owner; key order remained unchanged.
- `POST /api/account/password` unauthenticated returned `401` with the legacy body.
- `POST /api/account/password` authenticated with invalid short `newPassword` returned `400` with the legacy validation body.
- Password change was not executed because the invalid-body validation covered the requested safety path without mutating a test account.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` remained `401`.
- Unauthenticated `GET /api/system/export` returned `401`, confirming the legacy protected system route remains reachable and protected.
- Unauthenticated `POST /api/system/restore` returned `401`, confirming the legacy protected system route remains reachable and protected.

### Production Risk

Low to medium. The route ordering change is small and constrained, and account response constants were aligned to preserve existing behavior. The main risk is that `POST /api/account/password` is now actively handled by the extracted module, so future password-related changes should be made in the account module rather than legacy fallback.

### Recommended Next Step

SAFE STEP 54 should migrate extracted controllers from importing `json` from `legacy-runtime.js` to `server/shared/http/json-response.js`, starting with a small low-risk controller group and no endpoint behavior changes.

## SAFE STEP 54 - REPLACE LEGACY JSON IMPORTS BATCH 1

Step 54 replaced `json` imports from `legacy-runtime.js` with the shared `json` helper in a small first batch only. No endpoint logic, routes, status codes, response body shapes, auth/session/cookie behavior, SQL, fallback code, or legacy `json` export was changed.

### Modified Files

- `server/modules/status/status.controller.js`
- `server/modules/signup/signup.controller.js`
- `server/modules/account/account.controller.js`
- `server/controllers/auth.controller.js`
- `server/controllers/search.controller.js`
- `server/controllers/audit.controller.js`
- `server/controllers/reports.controller.js`
- `server/controllers/users.controller.js`
- `server/REFACTOR_STATUS.md`

### Import Changes

Changed from legacy imports such as:

```js
import { json } from "../legacy-runtime.js";
```

or:

```js
import { json } from "../../legacy-runtime.js";
```

to shared imports:

```js
import { json } from "../shared/http/json-response.js";
```

or:

```js
import { json } from "../../shared/http/json-response.js";
```

### Files Changed From Legacy JSON To Shared JSON

- `server/modules/status/status.controller.js`
- `server/modules/signup/signup.controller.js`
- `server/modules/account/account.controller.js`
- `server/controllers/auth.controller.js`
- `server/controllers/search.controller.js`
- `server/controllers/audit.controller.js`
- `server/controllers/reports.controller.js`
- `server/controllers/users.controller.js`

### Legacy JSON Export

- `server/legacy-runtime.js` still exports `json`.
- `server/app.js` and remaining controllers/modules can still import legacy `json` until later batches.

### Remaining Files Still Importing `json` From `legacy-runtime.js`

- `server/app.js`
- `server/controllers/appointments.controller.js`
- `server/controllers/billing.controller.js`
- `server/controllers/clients.controller.js`
- `server/controllers/consents.controller.js`
- `server/controllers/crm.controller.js`
- `server/controllers/feedback.controller.js`
- `server/controllers/files.controller.js`
- `server/controllers/invitations.controller.js`
- `server/controllers/settings.controller.js`
- `server/controllers/tenant-domains.controller.js`
- `server/controllers/whatsapp.controller.js`
- `server/modules/catalog/catalog.controller.js`
- `server/modules/gifts/gifts.controller.js`
- `server/modules/platform/platform.controller.js`
- `server/modules/platform/platform-provisioning.controller.js`
- `server/modules/platform/platform-password.controller.js`
- `server/modules/platform/platform-invoices.controller.js`
- `server/modules/platform/platform-billing.controller.js`

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3089`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked for clinic admin and platform owner.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform owner.
- `GET /api/clients` as clinic admin returned `200` with 7 clients.
- `GET /api/platform/tenants` as platform owner returned `200` with 3 tenants.
- Representative endpoints from each changed controller/module:
  - status: `GET /api/health`, `GET /api/version`.
  - signup: `POST /api/signup`.
  - account: unauthenticated `POST /api/account/password` returned `401`.
  - auth: `POST /api/login`, `GET /api/me`.
  - search: `GET /api/search?q=test` returned `200` with `clients,appointments,services`.
  - audit: `GET /api/audit` returned `200`.
  - reports: `GET /api/reports` returned `200`.
  - users: `GET /api/users` returned `200`.
- Unauthenticated `GET /api/system/export` remained `401`.
- Unauthenticated `POST /api/system/restore` remained `401`.

### Production Risk

Very low. This batch changed import sources only, and both helpers point to the same implementation shape. Legacy `json` remains exported for remaining files and fallback compatibility.

### Recommended Next Step

SAFE STEP 55 should migrate the next small batch of legacy `json` imports, preferably low-risk business controllers such as clients, appointments, files, reports-adjacent modules, or produce a system backup/restore boundary report if prioritizing active legacy endpoints.

## SAFE STEP 55 - JSON IMPORT MIGRATION BATCH 2

Step 55 replaced remaining low-risk business controller `json` imports from `legacy-runtime.js` with the shared `json` helper. This was import-only. No endpoint logic, routes, status codes, response body shapes, auth/session/cookie behavior, SQL, fallback code, system export/restore behavior, or `server/app.js` was changed.

### Modified Files

- `server/controllers/clients.controller.js`
- `server/controllers/appointments.controller.js`
- `server/controllers/files.controller.js`
- `server/controllers/feedback.controller.js`
- `server/controllers/crm.controller.js`
- `server/controllers/consents.controller.js`
- `server/controllers/settings.controller.js`
- `server/controllers/tenant-domains.controller.js`
- `server/REFACTOR_STATUS.md`

### Files Changed From Legacy JSON To Shared JSON

- `server/controllers/clients.controller.js`
- `server/controllers/appointments.controller.js`
- `server/controllers/files.controller.js`
- `server/controllers/feedback.controller.js`
- `server/controllers/crm.controller.js`
- `server/controllers/consents.controller.js`
- `server/controllers/settings.controller.js`
- `server/controllers/tenant-domains.controller.js`

Each changed file now imports:

```js
import { json } from "../shared/http/json-response.js";
```

### Skipped Files

No target file in this batch was skipped. Each target controller imported only `json` from `legacy-runtime.js`, so no mixed legacy-helper split was needed.

### Legacy JSON Export

- `server/legacy-runtime.js` still exports `json`.
- No fallback or legacy export was removed.

### Remaining Files Still Importing `json` From `legacy-runtime.js`

- `server/app.js`
- `server/controllers/billing.controller.js`
- `server/controllers/invitations.controller.js`
- `server/controllers/whatsapp.controller.js`
- `server/modules/catalog/catalog.controller.js`
- `server/modules/gifts/gifts.controller.js`
- `server/modules/platform/platform.controller.js`
- `server/modules/platform/platform-provisioning.controller.js`
- `server/modules/platform/platform-password.controller.js`
- `server/modules/platform/platform-invoices.controller.js`
- `server/modules/platform/platform-billing.controller.js`

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3090`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- `GET /api/clients` returned `200` with 7 clients.
- `GET /api/appointments` returned `200` with 2 appointments.
- `GET /api/clients/:id/files` returned `200` with 1 file for the sampled client.
- `GET /api/feedback` returned `200` with 2 feedback requests.
- `GET /api/crm` returned `200` with `tasks,events`.
- `GET /api/consents` returned `200` with 1 consent.
- `GET /api/settings` returned `200`.
- `GET /api/tenant/domains` as platform-owner returned `200` with 1 domain.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/system/export` remained `401`.
- Unauthenticated `POST /api/system/restore` remained `401`.

### Production Risk

Very low. This batch changed import sources only and all representative endpoints returned expected successful or protected responses. Legacy `json` remains exported for remaining modules and fallback.

### Recommended Next Step

SAFE STEP 56 should migrate the remaining non-platform `json` imports, such as billing, invitations, WhatsApp, catalog, and gifts, leaving platform/app.js for a final dedicated batch.

## SAFE STEP 56 - JSON IMPORT MIGRATION BATCH 3

Step 56 replaced the remaining non-platform controller/module `json` imports from `legacy-runtime.js` with the shared `json` helper. This was import-only. No endpoint logic, routes, status codes, response body shapes, auth/session/cookie behavior, SQL, fallback code, platform controller, system export/restore behavior, or `server/app.js` was changed.

### Modified Files

- `server/controllers/billing.controller.js`
- `server/controllers/invitations.controller.js`
- `server/controllers/whatsapp.controller.js`
- `server/modules/catalog/catalog.controller.js`
- `server/modules/gifts/gifts.controller.js`
- `server/REFACTOR_STATUS.md`

### Files Changed From Legacy JSON To Shared JSON

- `server/controllers/billing.controller.js`
- `server/controllers/invitations.controller.js`
- `server/controllers/whatsapp.controller.js`
- `server/modules/catalog/catalog.controller.js`
- `server/modules/gifts/gifts.controller.js`

Each changed file now imports from:

```js
../shared/http/json-response.js
```

or:

```js
../../shared/http/json-response.js
```

### Skipped Files

No target file in this batch was skipped. Each target file imported only `json` from `legacy-runtime.js`, so no mixed legacy-helper split was needed.

### Legacy JSON Export

- `server/legacy-runtime.js` still exports `json`.
- No fallback or legacy export was removed.

### Remaining Files Still Importing `json` From `legacy-runtime.js`

- `server/app.js`
- `server/modules/platform/platform.controller.js`
- `server/modules/platform/platform-provisioning.controller.js`
- `server/modules/platform/platform-password.controller.js`
- `server/modules/platform/platform-invoices.controller.js`
- `server/modules/platform/platform-billing.controller.js`

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3091`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- `GET /api/billing` as platform owner returned `200`.
- `GET /api/invitations` returned `200` with 2 invitations.
- `GET /api/message-logs` returned `200` with 8 message logs.
- `GET /api/categories` returned `200` with 4 categories.
- `GET /api/services` returned `200` with 5 services.
- `GET /api/gifts` returned `200` with 2 gifts.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/system/export` remained `401`.
- Unauthenticated `POST /api/system/restore` remained `401`.

### Production Risk

Very low. This batch changed import sources only and all representative endpoints returned expected responses. Legacy `json` remains exported for `server/app.js`, platform controllers, and fallback compatibility.

### Recommended Next Step

SAFE STEP 57 should migrate platform controller `json` imports to the shared helper in one focused platform-only batch, leaving `server/app.js` and legacy export untouched.

## SAFE STEP 57 - JSON IMPORT MIGRATION PLATFORM-ONLY BATCH

Step 57 replaced platform controller `json` imports from `legacy-runtime.js` with the shared `json` helper. This was import-only. No endpoint logic, routes, status codes, response body shapes, auth/session/cookie behavior, SQL, fallback code, system export/restore behavior, or `server/app.js` was changed.

### Modified Files

- `server/modules/platform/platform.controller.js`
- `server/modules/platform/platform-provisioning.controller.js`
- `server/modules/platform/platform-password.controller.js`
- `server/modules/platform/platform-invoices.controller.js`
- `server/modules/platform/platform-billing.controller.js`
- `server/REFACTOR_STATUS.md`

### Platform Files Changed From Legacy JSON To Shared JSON

- `server/modules/platform/platform.controller.js`
- `server/modules/platform/platform-provisioning.controller.js`
- `server/modules/platform/platform-password.controller.js`
- `server/modules/platform/platform-invoices.controller.js`
- `server/modules/platform/platform-billing.controller.js`

Each changed file now imports:

```js
import { json } from "../../shared/http/json-response.js";
```

### Skipped Files

No target file was skipped. Each platform target imported only `json` from `legacy-runtime.js`, so no mixed legacy-helper split was needed.

### Legacy JSON Export

- `server/legacy-runtime.js` still exports `json`.
- No fallback or legacy export was removed.

### Remaining Files Still Importing `json` From `legacy-runtime.js`

- `server/app.js`

This remaining import is intentional for the app-level error handler and legacy fallback integration.

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3092`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `POST /api/platform/tenants` with invalid body returned `400`.
- `PUT /api/platform/tenants/:id` with invalid body returned `400`.
- `POST /api/platform/tenants/:id/reset-password` with invalid body returned `400`.
- Unauthenticated `POST /api/platform/billing/auto-run` returned `401`.
- Unauthenticated `GET /api/system/export` remained `401`.
- Unauthenticated `POST /api/system/restore` remained `401`.

### Production Risk

Very low. This step changed import sources only in platform controllers and all platform validation/protected-route smoke tests returned expected statuses. Legacy `json` remains exported and `server/app.js` remains untouched.

### Recommended Next Step

SAFE STEP 58 should handle the final `server/app.js` `json` import boundary, likely by importing `json` from `server/shared/http/json-response.js` while keeping `legacyApi` and `serveStatic` from `legacy-runtime.js`, with app-level error response parity checks.

## SAFE STEP 58 - FINAL JSON IMPORT CLEANUP IN APP.JS

Step 58 removed the final `json` import from `legacy-runtime.js` in `server/app.js` and imported `json` from the shared helper instead. This was import-only. No routes, route order, endpoint logic, status codes, response body shapes, auth/session/cookie behavior, SQL, fallback code, or legacy export was changed.

### Modified Files

- `server/app.js`
- `server/REFACTOR_STATUS.md`

### Exact `server/app.js` Import Change

Before:

```js
import { api as legacyApi, serveStatic, json } from "./legacy-runtime.js";
```

After:

```js
import { api as legacyApi, serveStatic } from "./legacy-runtime.js";
import { json } from "./shared/http/json-response.js";
```

### Legacy Import Boundary

- `api` still comes from `server/legacy-runtime.js` as `legacyApi`.
- `serveStatic` still comes from `server/legacy-runtime.js`.
- `json` now comes from `server/shared/http/json-response.js`.
- `server/legacy-runtime.js` still exports `json` temporarily.

### Remaining Imports From `legacy-runtime.js`

- `server/app.js` imports only:
  - `api as legacyApi`
  - `serveStatic`

No other server JavaScript file imports from `legacy-runtime.js` after this step.

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3093`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `POST /api/login` worked.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- Unauthenticated `GET /api/system/export` remained `401`.
- Unauthenticated `POST /api/system/restore` remained `401`.
- Unmatched `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`

### Production Risk

Very low. This step changed only the source of the app-level `json` helper import. The helper implementation is shared and already validated across extracted controllers. Legacy fallback, static serving, and legacy API import remain intact.

### Recommended Next Step

SAFE STEP 59 should be a legacy-runtime export/dependency report to determine which legacy exports can be removed later and which remain required for `legacyApi`, `serveStatic`, system export/restore, and fallback behavior.

## SAFE STEP 59 - LEGACY RUNTIME EXPORT/DEPENDENCY REPORT

Step 59 is report-only. No code, imports, routes, endpoint logic, auth/session/cookie behavior, SQL, fallback code, or legacy exports were changed.

### Remaining Imports From `legacy-runtime.js`

Only one server file imports from `legacy-runtime.js`:

```js
// server/app.js
import { api as legacyApi, serveStatic } from "./legacy-runtime.js";
```

No extracted controller, module, repository, service, or shared helper imports from `legacy-runtime.js` anymore.

### Remaining Exports From `legacy-runtime.js`

Current export list:

- `api`
- `clinicSettings`
- `consentSignatures`
- `consentTemplates`
- `createClinovaServer`
- `feedbackRequests`
- `giftCards`
- `handleBootstrapLegacy`
- `inviteUrl`
- `json`
- `listAppointments`
- `listAudit`
- `listClients`
- `listCrmEvents`
- `listCrmTasks`
- `listMessageLogs`
- `platformTenants`
- `requireUser`
- `serveStatic`
- `tenantBilling`
- `tenantDomains`

### Actively Used Exports

Only these are imported outside `legacy-runtime.js` today:

- `api`, imported by `server/app.js` as `legacyApi`.
- `serveStatic`, imported by `server/app.js`.

These are therefore must-keep exports right now.

### Compatibility-Only Exports No Longer Imported

The following exports are not imported anywhere outside `legacy-runtime.js` now:

- `json`
- `requireUser`
- `inviteUrl`
- `handleBootstrapLegacy`
- `clinicSettings`
- `tenantDomains`
- `tenantBilling`
- `platformTenants`
- `listClients`
- `listAppointments`
- `listCrmTasks`
- `listCrmEvents`
- `consentTemplates`
- `consentSignatures`
- `feedbackRequests`
- `giftCards`
- `listMessageLogs`
- `listAudit`
- `createClinovaServer`

They may still be used internally by `api`, `crudRoutes`, `serveStatic`, or legacy fallback code, so the exports can be removed later only after confirming no external compatibility path requires them.

### Remaining Active Legacy Routes

Active legacy behavior still exists through `legacyApi`:

| Endpoint / behavior | Status | Notes |
| --- | --- | --- |
| `GET /api/system/export` | Active legacy route | Protected by legacy `requirePlatformOwner`; creates a backup and streams it. |
| `POST /api/system/restore` | Active legacy route | Protected by legacy `requirePlatformOwner`; handles multipart restore upload, backup validation, staging, audit, and process exit. |
| unmatched `/api/*` | Active legacy fallback | `crudRoutes()` final fallback returns legacy `404` body. |

### Signup And Account Routing

- `POST /api/signup` now reaches the extracted signup module first, not legacy, after Step 53 route ordering.
- `POST /api/account/password` now reaches the extracted account module first, not legacy, after Step 53 route ordering.
- Legacy branches for both still exist as fallback code but should not run in normal route flow.

### `serveStatic` Responsibilities

`serveStatic(req, res, url)` currently:

- Maps `/` to `index.html`.
- Decodes URL pathname and joins it under `publicDir`.
- Blocks paths that escape `publicDir` with `403`.
- Falls back to `index.html` when a file is missing or points to a directory.
- Sets `Content-Type` based on `mimeTypes`.
- Adds `X-Content-Type-Options: nosniff`.
- Reads and returns the static file synchronously.

It can move later into a dedicated static server utility, but only with parity tests for:

- `/`
- `/index.html`
- existing JS/CSS/SVG assets
- unknown frontend routes falling back to `index.html`
- path traversal attempts returning `403`

### `legacyApi` Responsibilities

`api(req, res, url)` still provides:

- Active system export/restore endpoints.
- Legacy fallback branches for previously extracted endpoints if an extracted controller returns `false`.
- Legacy public feedback and invitation fallbacks.
- Legacy CRUD/resource fallback via `crudRoutes()`.
- Legacy unmatched API `404`.
- Internal use of legacy auth helpers, permission checks, file helpers, WhatsApp helpers, backup/restore helpers, and response helper.

It can be replaced later only after:

- system export/restore are extracted;
- global `/api/*` 404 fallback is extracted;
- route-level fallback paths are proven unreachable or intentionally removed;
- static serving is separated from the legacy module or kept as a dedicated export.

### Safe Removal Candidates Later

Safe only after targeted validation:

- External exports not imported outside `legacy-runtime.js`, starting with compatibility-only exports such as `json`, `inviteUrl`, and `handleBootstrapLegacy`.
- Legacy fallback branches for modules with complete extracted ownership, once fallback reachability is explicitly tested.
- Duplicate login/logout/me/signup/account/bootstrap branches after a legacy API fallback cleanup plan.
- Legacy public feedback/invitations branches after parity and fallback removal checks.

### Must Keep For Now

- `api` export, because `server/app.js` uses it as `legacyApi`.
- `serveStatic` export, because `server/app.js` uses it for non-API requests.
- `GET /api/system/export` legacy route.
- `POST /api/system/restore` legacy route.
- unmatched `/api/*` 404 fallback.
- Internal legacy helpers required by `api` and `crudRoutes`.
- `json` export temporarily, until a dedicated export cleanup step confirms no external plugin/test/runtime compatibility expectation relies on it.

### Recommended Next 3 Safe Steps

1. **SAFE STEP 60 - System Export/Restore Boundary Report Only**: document backup/restore dependencies before extracting active system endpoints.
2. **SAFE STEP 61 - Static Serving Boundary Report Only**: document `serveStatic` behavior before moving static serving out of `legacy-runtime.js`.
3. **SAFE STEP 62 - Legacy API 404/Fallback Boundary Report Only**: document unmatched `/api/*` 404 and fallback branch removal order before deleting legacy fallback code.

### Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3094`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` remained `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `POST /api/account/password` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/login` worked.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- `GET /api/platform/tenants` as platform-owner returned `200` with 3 tenants.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.

## SAFE STEP 63 - LEGACY API 404/FALLBACK BOUNDARY REPORT

### Current Import From `legacy-runtime.js`

`server/app.js` currently imports only:

- `api as legacyApi` from `server/legacy-runtime.js`

Static serving no longer comes from `legacy-runtime.js`; `server/app.js` imports `serveStatic` from `server/shared/http/static-server.js`.

### What `legacyApi` Currently Does

`legacyApi` is the exported `api(req, res, url)` function from `server/legacy-runtime.js`.

It currently provides:

1. Active legacy handling for system export/restore.
2. Compatibility fallback branches for many endpoints already extracted to modules.
3. Legacy fallback for unmatched `/api/*` through `crudRoutes()`.
4. Legacy auth, permission, multipart, backup, file, WhatsApp, and SQL helper usage for fallback-only code.

### Active Endpoints Still Owned By `legacyApi`

These remain active in normal route flow:

| Endpoint / behavior | Why active | Current owner |
| --- | --- | --- |
| `GET /api/system/export` | `files.routes.js` lists it without a module, so `app.js` falls through to `legacyApi`. | `legacy-runtime.js` |
| `POST /api/system/restore` | `files.routes.js` lists it without a module, so `app.js` falls through to `legacyApi`. | `legacy-runtime.js` |
| unmatched `/api/*` | no registered route matches, so `app.js` calls `legacyApi`, then `crudRoutes()` returns final 404. | `legacy-runtime.js` |

### Duplicate Extracted Endpoints Still Inside `legacyApi`

The following legacy branches still exist but are shadowed by extracted modules during normal successful route flow:

- Status/account/auth:
  - `GET /api/health`
  - `GET /api/version`
  - `POST /api/signup`
  - `POST /api/login`
  - `POST /api/logout`
  - `POST /api/account/password`
  - `GET /api/me`
- Bootstrap:
  - `GET /api/bootstrap`
- Invitations:
  - `GET /api/invitations`
  - `POST /api/invitations`
  - `DELETE /api/invitations/:id`
  - `GET /api/invitations/:token`
  - `POST /api/invitations/:token/accept`
- Feedback:
  - `GET /api/public/feedback/:token`
  - `POST /api/public/feedback/:token`
  - `GET /api/feedback`
  - `POST /api/feedback`
- Billing:
  - `GET /api/billing`
  - `PUT /api/billing`
  - `POST /api/billing/invoices`
  - `PUT /api/billing/invoices/:id`
- Search and CRM:
  - `GET /api/search`
  - `GET /api/crm`
  - `GET/POST/PUT /api/crm-tasks...`
- WhatsApp:
  - `GET /api/message-logs`
  - `POST /api/appointments/:id/whatsapp`
  - `POST /api/gifts/:id/whatsapp`
- Platform:
  - `GET /api/platform/tenants`
  - `POST /api/platform/tenants`
  - `PUT /api/platform/tenants/:id`
  - `POST /api/platform/tenants/:id/invoices`
  - `PUT /api/platform/invoices/:id`
  - `POST /api/platform/billing/auto-run`
  - `POST /api/platform/tenants/:id/reset-password`
- Settings and tenant domains:
  - `GET /api/settings`
  - `PUT /api/settings`
  - `GET /api/tenant`
  - `PUT /api/tenant`
  - `GET/POST /api/tenant/domains`
  - `PUT/DELETE /api/tenant/domains/:id`
- CRUD/resource fallbacks:
  - users
  - categories
  - services
  - clients
  - client files
  - appointments
  - consents
  - gift cards
  - reports
  - audit

### Reachability In Normal Route Order

- Extracted modules are registered before the legacy fallback.
- During normal successful route flow, extracted modules should handle their endpoints and return before `legacyApi`.
- Duplicate legacy branches are still reachable only if:
  - an extracted route matches but its controller returns `false`;
  - a broad resource route matches a path the module intentionally declines;
  - a route is deliberately registered without a module, as system export/restore are today.
- `GET /api/system/export`, `POST /api/system/restore`, and unmatched `/api/*` are the only intended active legacy responsibilities right now.

### Exact `/api/unknown` Behavior

Current unmatched API fallback:

- status `404`
- content type `application/json; charset=utf-8`
- body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`

### Exact System Export / Restore Permission Behavior

Unauthenticated requests:

- `GET /api/system/export` returns status `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/system/restore` returns status `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`

Authenticated non-platform-owner requests:

- `GET /api/system/export` returns status `403` with body:
  `{"error":"Platform owner access is required."}`
- `POST /api/system/restore` returns status `403` with body:
  `{"error":"Platform owner access is required."}`

### What Must Be Extracted Before `legacyApi` Can Be Removed

Required before removing `legacyApi` import from `server/app.js`:

1. Extract `GET /api/system/export`.
2. Extract `POST /api/system/restore`.
3. Add an explicit final `/api/*` 404 handler in `server/app.js` or a small API fallback helper.
4. Prove extracted controllers no longer need legacy fallback branches.
5. Remove or disable route-level fallback calls to `legacyApi`.
6. Remove duplicate legacy endpoint branches only after active/fallback reachability validation.

### Safe Removal Candidates Inside `legacyApi`

Safe later, only after explicit validation:

- Duplicate branches for exact endpoints now owned by modules:
  - health/version
  - signup
  - login/logout/me
  - account password
  - bootstrap
  - platform routes
  - billing
  - settings/domain
  - public feedback
  - invitations
- Duplicate CRUD/resource branches for:
  - users
  - categories/services
  - clients/files
  - appointments
  - consents
  - feedback
  - gifts
  - reports/audit
- Compatibility-only helper exports once no internal fallback references remain.

### Must Keep For Now

- `api` export from `legacy-runtime.js`.
- Active system export/restore branches.
- Final unmatched `/api/*` 404 fallback.
- Internal helpers used by active system endpoints and fallback branches:
  - `requireUser`
  - `requirePlatformOwner`
  - `readMultipart`
  - `safeFileName`
  - `assertValidSqliteBackup`
  - `createBackup`
  - `audit`
- Duplicate legacy branches until route-level fallback removal is done deliberately.

### Recommended Extraction Order

1. **System export endpoint**: extract `GET /api/system/export` with exact binary headers and permission behavior.
2. **System restore endpoint**: extract `POST /api/system/restore` with exact staging and safety behavior.
3. **Final `/api/*` 404 fallback**: add explicit non-legacy fallback in `server/app.js`.
4. **Route fallback cleanup**: remove `legacyApi` fallback calls for modules proven complete.
5. **Delete duplicate legacy branches**: remove shadowed endpoint branches in small batches.
6. **Remove `legacyApi` import**: only after no active route or fallback path calls it.
7. **Reduce/delete `legacy-runtime.js`**: only after remaining exports are gone or moved.

### Step 63 Validation Result

- `node --check` passed for 121 server JavaScript files.
- Test server started successfully on port `3098`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- Unauthenticated `GET /api/system/export` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Unauthenticated `POST /api/system/restore` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `GET /api/system/export` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `POST /api/system/restore` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- Unauthenticated `GET /api/bootstrap` returned `401`.
- `POST /api/signup` returned `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- `GET /` returned `200` and the HTML shell.

## SAFE STEP 64 - SYSTEM EXPORT ENDPOINT EXTRACTION ONLY

### Moved Endpoint

Moved only:

- `GET /api/system/export`

New owner:

- `server/modules/system/system.routes.js`
- `server/modules/system/system.controller.js`
- `server/modules/system/system.service.js`
- `server/modules/system/system.repository.js`

### Integration

- `server/app.js` imports `systemRoutes` and `handleSystemRoute`.
- `systemRoutes` is registered before `filesRoutes`, so `GET /api/system/export` is handled by the system module first.
- `server/app.js` retains a `legacyApi` fallback for the system module.
- `POST /api/system/restore` was not moved and still reaches `legacyApi`.
- unmatched `/api/*` final 404 was not moved and still reaches `legacyApi`.

### Behavior Preserved

The extracted export endpoint preserves:

- platform-owner-only permission behavior via `requirePlatformOwnerCompat`;
- exact `401` login-required body;
- exact `403 {"error":"Platform owner access is required."}` body;
- `createBackup({ reason: "download-export" })`;
- full database export only;
- no upload directory inclusion;
- SQLite `application/vnd.sqlite3` response;
- PostgreSQL `application/octet-stream` response when `DATABASE_URL` is set;
- `Content-Disposition` filename pattern `clinova-<timestamp>.<sqlite|dump>`;
- `Content-Length`;
- `X-Content-Type-Options: nosniff`;
- audit action `export` on entity `system` after response end.

### Legacy Fallback

The old legacy export branch remains in `server/legacy-runtime.js` with the comment:

`LEGACY FALLBACK - SYSTEM EXPORT - SAFE TO REMOVE AFTER VALIDATION`

### Step 64 Validation Result

- `node --check` passed for 125 server JavaScript files.
- Test server started successfully on port `3099`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/system/export` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `GET /api/system/export` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `GET /api/system/export` as platform-owner returned `200` download with:
  - `Content-Type: application/vnd.sqlite3`
  - `Content-Disposition: attachment; filename="clinova-2026-06-01-19-23-46.sqlite"`
  - `Content-Length: 331776`
  - `X-Content-Type-Options: nosniff`
- Downloaded export copy passed SQLite `PRAGMA integrity_check` with result `ok`; the temporary downloaded copy was deleted.
- Unauthenticated `POST /api/system/restore` still returned `401`.
- `POST /api/system/restore` as clinic admin still returned `403`, confirming restore remains legacy-protected.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/bootstrap` worked.
- `POST /api/signup` remained `403`.
- `GET /` returned `200` and the HTML shell.

## SAFE STEP 65 - SYSTEM RESTORE BOUNDARY PREP REPORT

### Current Restore Endpoint Behavior

`POST /api/system/restore` is still implemented in `server/legacy-runtime.js`.

Current flow:

1. Calls legacy `requirePlatformOwner(req, res)`.
2. Stops immediately if no platform-owner user is returned.
3. If `config.databaseUrl` is set, returns PostgreSQL restore block response.
4. Parses multipart form data using legacy `readMultipart(req)`.
5. Reads uploaded file from `files.backup`.
6. If the `backup` file is missing or empty, returns validation `400`.
7. Creates `config.backup.dir/restore-uploads`.
8. Writes uploaded backup to `restore-uploads/<Date.now()>-<safeFileName>`.
9. Validates uploaded file as SQLite using `assertValidSqliteBackup(source)`.
10. Creates a safety backup using `createBackup({ reason: "before-restore" })`.
11. Copies uploaded source to `config.backup.dir/pending-restore.sqlite`.
12. Writes `config.backup.dir/pending-restore.json`.
13. Writes audit action `restore_scheduled`.
14. Returns `200 {"ok":true,"safetyBackup":"<path>","restarting":true}`.
15. Schedules `process.exit(0)` after 500ms.

### Exact Permission Requirement

- Required user: valid session user with `platformOwner === true`.
- Helper: legacy `requirePlatformOwner`.
- Normal clinic admins, reception users, and therapists must not be allowed to restore.

### Exact `401` / `403` Behavior

Unauthenticated request:

- status `401`
- body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`

Authenticated non-platform-owner request:

- status `403`
- body:
  `{"error":"Platform owner access is required."}`

### SQLite Behavior

- Restore upload is supported only when `DATABASE_URL` is not set.
- Uploaded file must pass SQLite `PRAGMA integrity_check`.
- Restore request does not directly replace the live open SQLite database.
- Restore is staged as `pending-restore.sqlite`.
- Actual replacement happens on next application startup in `server/db.js`.

### PostgreSQL Behavior

- Web restore is disabled when `config.databaseUrl` is set.
- Response:
  - status `400`
  - body `{"error":"Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups."}`
- PostgreSQL restore is expected to be handled outside the web endpoint with PostgreSQL tooling.

### Uploaded File Handling

- Request must be multipart with a boundary.
- Body size is limited by `readRawBody(req, config.uploads.maxBytes)`.
- `UPLOAD_MAX_MB` controls `config.uploads.maxBytes`; default is 10 MB.
- The endpoint expects file field name `backup`.
- Filename is sanitized through legacy `safeFileName`.
- File bytes are decoded through the legacy multipart parser using latin1 conversion.
- No MIME type allowlist is enforced for restore uploads.
- No extension check is enforced.
- Validation depends on SQLite integrity check, not MIME or extension.

### Validation Checks

Current validation checks:

- platform-owner auth before parsing body;
- PostgreSQL mode blocked;
- multipart boundary required;
- request size must not exceed `config.uploads.maxBytes`;
- uploaded `backup` file must exist and be non-empty;
- uploaded backup must pass SQLite `PRAGMA integrity_check`.

Current validation gaps to preserve during safe extraction:

- no extension check;
- no MIME allowlist;
- no schema compatibility check beyond SQLite integrity;
- no explicit tenant/product version compatibility check;
- no confirmation token or second approval step.

These gaps should not be fixed during extraction; hardening belongs to a later product/security step.

### Temporary / Pending File Paths

Restore upload paths:

- Upload directory:
  `config.backup.dir/restore-uploads`
- Saved uploaded source:
  `config.backup.dir/restore-uploads/<Date.now()>-<safeFileName(file.filename)>`
- Pending restore DB:
  `config.backup.dir/pending-restore.sqlite`
- Pending metadata:
  `config.backup.dir/pending-restore.json`

Pending metadata fields:

- `uploadedName`
- `source`
- `requestedBy`
- `safetyBackup`
- `createdAt`

### Backup-Before-Restore Behavior

Before staging the pending restore, the endpoint calls:

`createBackup({ reason: "before-restore" })`

For SQLite, this creates a full backup of the current database using `VACUUM INTO`.

The backup path is returned to the caller in:

- response field `safetyBackup`
- pending metadata field `safetyBackup`
- audit details field `safetyBackup`

### Process Restart Behavior

After writing pending files and audit:

1. Response is sent with `restarting: true`.
2. The endpoint schedules `process.exit(0)` after 500ms.
3. The process manager or runtime must restart the app.
4. If no process manager restarts the process, the app stays down.

### What Happens On Next Startup

`server/db.js` runs `applyPendingSqliteRestore()` before creating the SQLite adapter.

If `pending-restore.sqlite` exists:

1. Creates database and backup directories if needed.
2. Copies current `config.databasePath` to `before-pending-restore-<timestamp>.sqlite` if it exists.
3. Deletes SQLite WAL and SHM files:
   - `<databasePath>-wal`
   - `<databasePath>-shm`
4. Copies `pending-restore.sqlite` to `config.databasePath`.
5. Deletes `pending-restore.sqlite`.
6. Deletes `pending-restore.json`.
7. Opens the restored database.

### Risks And Failure Modes

- Critical data-loss risk if the uploaded SQLite file is valid but wrong, old, or from another environment.
- All tenants are affected because the full database is replaced.
- Restore can remove recent data created after the backup.
- Upload parser has no MIME/extension guard.
- A valid SQLite file with incompatible schema can pass integrity check but break app behavior.
- Process exits intentionally; without a process manager, service availability can be lost.
- Failure after writing pending files but before restart can leave a restore scheduled for the next startup.
- Failure during startup replacement can leave recovery dependent on safety backups.
- `pending-restore.json` is metadata only and is deleted after apply.
- Safety backup retention cleanup may remove older backups according to `BACKUP_RETENTION`.
- The endpoint writes uploaded backup source under `restore-uploads`; those uploaded source files are not cleaned by the endpoint.

### Data Loss Risks

Restore replaces the whole SQLite database file. It can overwrite:

- tenants;
- users and sessions;
- clients;
- appointments;
- billing data;
- platform data;
- audit logs;
- settings;
- file metadata;
- message logs;
- all other tables in the SQLite database.

Physical upload files are not restored by this endpoint unless they are separately present on disk.

### Safe Extraction Module Design

Recommended future files:

- `server/modules/system/system-restore.routes.js` or extend `system.routes.js`
- `server/modules/system/system-restore.controller.js`
- `server/modules/system/system-restore.service.js`
- `server/modules/system/system-restore.repository.js`
- `server/modules/system/sqlite-restore.js`

Recommended shared helper extraction only if exact behavior is preserved:

- multipart parser from legacy into `server/shared/http/multipart.js`;
- `safeFileName` into `server/shared/files/safe-file-name.js`;
- `assertValidSqliteBackup` into system restore utility.

### Should Restore Be Split?

Yes, internally it should be split when extracted, while keeping the public endpoint behavior identical:

1. **upload/validate**
   - parse multipart;
   - enforce body limit;
   - require `backup`;
   - write source file;
   - run SQLite integrity check.
2. **schedule pending restore**
   - create safety backup;
   - copy source to `pending-restore.sqlite`;
   - write pending metadata;
   - write audit;
   - return same response;
   - schedule process exit.
3. **apply pending restore on startup**
   - keep current `server/db.js` behavior unchanged in the first extraction;
   - consider moving later only after restore parity is proven.

### Tests That Must NOT Run On Production

Do not run these on production data:

- Uploading a valid backup to `/api/system/restore`.
- Confirming restart/apply behavior on the live DB.
- Manually creating `pending-restore.sqlite`.
- Deleting or editing pending restore files.
- Testing schema-incompatible restores.
- Testing failed startup restore recovery.

These must be run only on a disposable local SQLite copy.

### Manual Validation Checklist

Non-destructive checks:

- `GET /api/health = 200`
- `GET /api/version = 200`
- `POST /api/system/restore` without login returns exact `401`
- `POST /api/system/restore` as clinic admin returns exact `403`
- `POST /api/system/restore` as platform-owner with missing multipart boundary returns exact safe validation error
- `POST /api/system/restore` as platform-owner with multipart but no `backup` file returns exact missing file error
- `GET /api/system/export` as platform-owner still works
- `GET /api/unknown` returns exact legacy `404`
- `GET /api/bootstrap` works
- `GET /` returns `200`

Destructive checks for disposable DB only:

- Upload known-valid SQLite backup.
- Confirm `safetyBackup` path exists.
- Confirm `pending-restore.sqlite` and `pending-restore.json` are created.
- Confirm process exits.
- Restart app and confirm pending restore is applied.
- Confirm pending files are removed.
- Confirm safety backup can restore original state if needed.

### Step 65 Validation Result

- `node --check` passed for 125 server JavaScript files.
- Test server started successfully on port `3100`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `POST /api/system/restore` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/system/restore` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `POST /api/system/restore` as platform-owner with missing/invalid body returned `400` with body:
  `{"error":"׳‘׳§׳©׳× ׳”׳¢׳׳׳” ׳׳ ׳×׳§׳™׳ ׳”"}`
- `POST /api/system/restore` as platform-owner with multipart but no `backup` file returned `400` with body:
  `{"error":"Choose a backup file to restore."}`
- No valid restore was performed.
- No `pending-restore.sqlite` was created by validation.
- `GET /api/system/export` as platform-owner still returned `200` download; downloaded temporary copy passed SQLite `PRAGMA integrity_check` with `ok` and was deleted.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/bootstrap` worked.
- `GET /` returned `200` and the HTML shell.

## SAFE STEP 67 - FINAL API 404 FALLBACK EXTRACTION ONLY

### Moved Fallback

Moved only the final unmatched `/api/*` 404 fallback to:

- `server/shared/http/api-not-found.js`

The new helper exports:

- `apiNotFoundBody`
- `apiNotFound(res)`

### Behavior Preserved

Unmatched API requests still return:

- status `404`
- body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- JSON response behavior through the shared `json` helper.

### `server/app.js` Integration

- `server/app.js` imports `apiNotFound` from `server/shared/http/api-not-found.js`.
- If `handleApi()` finds no matching registered route, it now calls `apiNotFound(res)` instead of calling `legacyApi`.
- Route-level module fallbacks still call `legacyApi` when a matched controller returns `false`.
- `legacyApi` import remains because duplicate fallback branches still exist and are still used as compatibility fallback for matched routes.

### Confirmed Unchanged Areas

- No module routes changed.
- `GET /api/system/export` remains owned by the system module.
- `POST /api/system/restore` remains owned by the system module.
- Duplicate legacy branches remain untouched.
- Static serving remains unchanged.
- Auth/session/cookies were not changed.
- SQL was not changed.

### Step 67 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3102`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `POST /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` returned `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `GET /api/bootstrap` returned `401`.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.
- `GET /` returned `200` and the HTML shell.
- `GET /non-existing-static-file` returned `200` and the HTML shell.

## SAFE STEP 68 - LEGACY FALLBACK CALLS REACHABILITY REPORT

### Current `legacyApi` Call Sites In `server/app.js`

`server/app.js` still imports:

- `api as legacyApi` from `server/legacy-runtime.js`

It calls `legacyApi(req, res, url)` from these `handleApi()` branches:

| Line group | Branch | Condition |
| --- | --- | --- |
| status | `matchedRoute.module === "status"` | status controller returns `false` |
| auth | `matchedRoute.module === "auth"` | auth controller returns `false` |
| account | `matchedRoute.module === "account"` | account controller returns `false` |
| signup | `matchedRoute.module === "signup"` | signup controller returns `false` |
| bootstrap | `matchedRoute.module === "bootstrap"` | bootstrap controller returns `false` |
| platform | `matchedRoute.module === "platform"` | platform controller returns `false` |
| platform-provisioning | `matchedRoute.module === "platform-provisioning"` | provisioning controller returns `false` |
| platform-invoices | `matchedRoute.module === "platform-invoices"` | invoice controller returns `false` |
| platform-billing | `matchedRoute.module === "platform-billing"` | billing controller returns `false` |
| platform-password | `matchedRoute.module === "platform-password"` | password controller returns `false` |
| system | `matchedRoute.module === "system"` | system controller returns `false` |
| users | `matchedRoute.module === "users"` | users controller returns `false` |
| invitations | `matchedRoute.module === "invitations"` | invitations controller returns `false` |
| clients | `matchedRoute.module === "clients"` | clients controller returns `false` |
| appointments | `matchedRoute.module === "appointments"` | appointments controller returns `false` |
| settings | `matchedRoute.module === "settings"` | settings controller returns `false` |
| tenant-domains | `matchedRoute.module === "tenant-domains"` | tenant domain controller returns `false` |
| files | `matchedRoute.module === "files"` | files controller returns `false` |
| consents | `matchedRoute.module === "consents"` | consents controller returns `false` |
| search | `matchedRoute.module === "search"` | search controller returns `false` |
| reports | `matchedRoute.module === "reports"` | reports controller returns `false` |
| audit | `matchedRoute.module === "audit"` | audit controller returns `false` |
| feedback | `matchedRoute.module === "feedback"` | feedback controller returns `false` |
| crm | `matchedRoute.module === "crm"` | CRM controller returns `false` |
| billing | `matchedRoute.module === "billing"` | billing controller returns `false` |
| whatsapp | `matchedRoute.module === "whatsapp"` | WhatsApp controller returns `false` |
| catalog | `matchedRoute.module === "catalog"` | catalog controller returns `false` |
| gifts | `matchedRoute.module === "gifts"` | gifts controller returns `false` |
| unknown matched module | fallback inside matched-route block | unexpected matched module without explicit branch |

There is no longer a `legacyApi` call for the no-route-matched case. That path now uses `apiNotFound(res)`.

### Conditions Under Which `legacyApi` Is Called

`legacyApi` is called only after a registered route matches and its module controller declines the request by returning `false`.

Examples where this can still happen:

- Broad resource route matches a path the module intentionally does not own.
- Method/path combination is matched by a broad route but the controller has no exact handler.
- A controller has defensive `return false` logic despite route matching.

### Reachability In Normal Flow

Most exact routes should never hit `legacyApi` in normal flow because their controllers handle the exact path and return `true`.

However, some broad resource routes can still reach `legacyApi` today:

- `clientsRoutes` uses `resource("clients")`; `handleClientsRoute()` returns `false` for subpaths other than `history`, so paths like `/api/clients/:id/files` can rely on later route order or fallback behavior.
- `appointmentsRoutes` uses `resource("appointments")`; `handleAppointmentsRoute()` returns `false` for subpaths, while WhatsApp uses a separate route.
- `consentsRoutes` uses `resource("consents")`; most known subpaths are handled, but unknown subpaths can return `false`.
- `giftsRoutes` exact/matches routes cover CRUD only; WhatsApp gift route is owned by WhatsApp routes, but fallback remains if a matched gift route is declined.
- Platform and system route controllers have exact defensive false paths, but their route matchers are already exact or regex-specific.

Because route matching uses the first matching route only, broad route ordering is important. Removing `legacyApi` without first tightening route matchers or handling all declined paths would change behavior for some edge paths.

### Endpoints Still Handled Only By `legacyApi`

No intended active endpoint should now be handled only by `legacyApi`.

Confirmed ownership:

- `GET /api/system/export` is handled by the system module.
- `POST /api/system/restore` is handled by the system module.
- unmatched `/api/*` is handled by `apiNotFound`.

Remaining `legacyApi` responsibility is compatibility fallback for duplicate legacy branches and declined matched routes.

### What Would Happen If `legacyApi` Calls Were Removed Now`

If `legacyApi` calls were removed immediately:

- Exact happy-path module endpoints would likely continue to work.
- Some edge paths under broad resource matchers could stop falling back to legacy behavior.
- Duplicate legacy behavior would no longer protect routes whose extracted controller returns `false`.
- The app would need a clear per-module fallback replacement, usually `apiNotFound(res)`, for declined matched routes.
- Any hidden frontend call depending on a legacy-only subpath would become `404`.

### Safe Removal Plan For `legacyApi` Calls

1. Build a route/controller declined-path matrix for every controller that can return `false`.
2. Tighten broad `resource()` routes where safe, especially:
   - clients
   - appointments
   - consents
   - CRM
   - users
   - catalog
3. For each module, replace `legacyApi` fallback with `apiNotFound(res)` only after proving no valid endpoint depends on fallback.
4. Remove fallbacks in small batches:
   - exact low-risk modules first: status, signup, account, auth, bootstrap, system, search, audit.
   - platform exact routes next.
   - business broad routes last.
5. After all `await legacyApi` calls are gone from `app.js`, remove the `legacyApi` import.
6. Only then begin deleting duplicate branches inside `legacy-runtime.js`.

### Manual Parity Checklist For Later Fallback Removal

Before removing any module fallback:

- exact happy-path endpoint still returns same status/body.
- invalid method/path returns same `404` or same legacy behavior.
- unauthenticated protected route returns same `401`.
- forbidden role returns same `403`.
- broad resource subpaths are explicitly tested.
- frontend smoke test still loads and major workflows still work.

Global checklist:

- `GET /api/health = 200`
- `GET /api/version = 200`
- `POST /api/signup = 403`
- `POST /api/account/password` without login returns `401`
- `GET /api/bootstrap` without login returns `401`
- `GET /api/system/export` without login returns `401`
- `POST /api/system/restore` without login returns `401`
- `GET /api/unknown = 404`
- `GET / = 200`
- representative clinic endpoint returns expected response.
- representative platform endpoint returns expected response.

### Step 68 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3103`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` returned `403`.
- Unauthenticated `POST /api/account/password` returned `401`.
- Unauthenticated `GET /api/bootstrap` returned `401`.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.
- `GET /api/unknown` returned `404`.
- `GET /` returned `200`.
- Representative clinic endpoint `GET /api/clients` as clinic admin returned `200`.
- Representative platform endpoint `GET /api/platform/tenants` as platform-owner returned `200`.

## SAFE STEP 69 - REMOVE LEGACY FALLBACK CALLS FOR EXACT LOW-RISK MODULES ONLY

### Removed `legacyApi` Fallback Calls

Removed `await legacyApi(req, res, url)` fallback calls only from these low-risk branches in `server/app.js`:

- `status`
- `auth`
- `account`
- `signup`
- `bootstrap`
- `system`
- `search`

Each removed fallback was replaced with `apiNotFound(res)` for the defensive case where a matched exact route controller returns `false`.

### Branches Intentionally Not Touched

The following branches still keep `legacyApi` fallback because they are broad, resource-based, platform-sensitive, or business-flow-heavy:

- platform
- platform-provisioning
- platform-invoices
- platform-billing
- platform-password
- users
- invitations
- clients
- appointments
- settings
- tenant-domains
- files
- consents
- reports
- audit
- feedback
- CRM
- billing
- WhatsApp
- catalog
- gifts
- unknown matched-module fallback inside the matched-route block

### Confirmed Unchanged Areas

- `legacy-runtime.js` was not deleted.
- `legacyApi` import remains in `server/app.js`.
- Route order was not changed.
- Endpoint logic was not changed.
- System export/restore behavior was not changed.
- Static serving was not changed.
- Auth/session/cookies were not changed.
- SQL was not changed.

### Step 69 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3104`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/signup` returned `403` with body:
  `{"error":"Clinic creation is managed by the platform owner."}`
- Unauthenticated `POST /api/account/password` returned `401`.
- `POST /api/login` worked for clinic admin.
- `GET /api/me` worked after login.
- `POST /api/logout` worked and returned `{"ok":true}`.
- `GET /api/bootstrap` without login returned `401`.
- `GET /api/bootstrap` authenticated returned `200`.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.
- Unauthenticated `GET /api/search?q=test` returned `401`.
- Authenticated `GET /api/search?q=sara` returned `200`.
- `GET /api/audit` as clinic admin returned `200`.
- `GET /api/reports` as clinic admin returned `200`.
- `GET /api/users` as clinic admin returned `200`.
- `GET /api/unknown` returned `404`.
- Broad route `GET /api/clients` as clinic admin returned `200`.
- Platform route `GET /api/platform/tenants` as platform-owner returned `200`.

## SAFE STEP 70 - REMOVE LEGACY FALLBACK CALLS FOR PLATFORM ROUTES ONLY

### Removed `legacyApi` Fallback Calls

Removed `await legacyApi(req, res, url)` fallback calls only from these platform branches in `server/app.js`:

- `platform`
- `platform-provisioning`
- `platform-invoices`
- `platform-billing`
- `platform-password`

Each removed fallback was replaced with `apiNotFound(res)` for the defensive case where a matched platform route controller returns `false`.

### Platform Endpoints Covered

These extracted platform endpoints are now fully owned by platform modules without legacy fallback in normal branch flow:

- `GET /api/platform/tenants`
- `POST /api/platform/tenants`
- `PUT /api/platform/tenants/:id`
- `POST /api/platform/tenants/:id/reset-password`
- `POST /api/platform/tenants/:id/invoices`
- `PUT /api/platform/invoices/:id`
- `POST /api/platform/billing/auto-run`

### Branches Intentionally Not Touched

Business/broad routes still keep `legacyApi` fallback:

- users
- invitations
- clients
- appointments
- settings
- tenant-domains
- files
- consents
- reports
- audit
- feedback
- CRM
- billing
- WhatsApp
- catalog
- gifts
- unknown matched-module fallback inside the matched-route block

### Confirmed Unchanged Areas

- `legacy-runtime.js` was not deleted.
- `legacyApi` import remains in `server/app.js`.
- Route order was not changed.
- Endpoint logic was not changed.
- Auth/session/cookies were not changed.
- SQL was not changed.
- System export/restore were not changed.
- Static serving was not changed.

### Step 70 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3105`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/platform/tenants` returned `401`.
- `GET /api/platform/tenants` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `GET /api/platform/tenants` as platform-owner returned `200`.
- `POST /api/platform/tenants` with invalid body as platform-owner returned `400` with body:
  `{"error":"Clinic name is required."}`
- `PUT /api/platform/tenants/1` with invalid body as platform-owner returned `400` with body:
  `{"error":"Valid tenant, plan, and status are required."}`
- `POST /api/platform/tenants/1/reset-password` with invalid body as platform-owner returned `400` with body:
  `{"error":"Password must be at least 8 characters."}`
- `POST /api/platform/tenants/999999/invoices` returned `404` with body:
  `{"error":"Tenant not found"}`
- `PUT /api/platform/invoices/999999` with invalid body returned `400` with body:
  `{"error":"Valid invoice and status are required."}`
- Unauthenticated `POST /api/platform/billing/auto-run` returned `401`.
- `POST /api/platform/billing/auto-run` as platform-owner with `runDate: "1900-01-01"` returned `200` with `tenants` and `result` shape.
- Billing invoice count remained `8` before and after the auto-run validation, so no test invoice was created.
- `GET /api/unknown` returned `404`.
- `GET /api/bootstrap` worked for clinic admin.
- Broad route `GET /api/clients` as clinic admin returned `200`.

## SAFE STEP 71 - REMOVE LEGACY FALLBACK CALLS FOR REPORTS/AUDIT/USERS ONLY

### Removed `legacyApi` Fallback Calls

Removed `await legacyApi(req, res, url)` fallback calls only from these branches in `server/app.js`:

- `users`
- `reports`
- `audit`

Each removed fallback was replaced with `apiNotFound(res)` for the defensive case where a matched route controller returns `false`.

### Branches Intentionally Not Touched

Business workflow and broad routes still keep `legacyApi` fallback:

- invitations
- clients
- appointments
- settings
- tenant-domains
- files
- consents
- feedback
- CRM
- billing
- WhatsApp
- catalog
- gifts
- unknown matched-module fallback inside the matched-route block

### Confirmed Unchanged Areas

- `legacy-runtime.js` was not deleted.
- `legacyApi` import remains in `server/app.js`.
- Route order was not changed.
- Endpoint logic was not changed.
- Auth/session/cookies were not changed.
- SQL was not changed.

### Step 71 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3106`.
- Unauthenticated `GET /api/reports` returned `401`.
- `GET /api/reports` as clinic admin returned `200`.
- Unauthenticated `GET /api/audit` returned `401`.
- `GET /api/audit` as clinic admin returned `200`.
- Unauthenticated `GET /api/users` returned `401`.
- `GET /api/users` as clinic admin returned `200`.
- Representative invalid subroutes returned `404` with the standard API not-found body:
  - `GET /api/users/999/unknown`
  - `GET /api/reports/unknown`
  - `GET /api/audit/unknown`
- `GET /api/unknown` returned `404`.
- `GET /api/bootstrap` worked for clinic admin.
- Broad route `GET /api/clients` as clinic admin returned `200`.
- Broad route `GET /api/appointments` as clinic admin returned `200`.
- Platform route `GET /api/platform/tenants` as platform-owner returned `200`.

## SAFE STEP 72 - BROAD BUSINESS FALLBACK BOUNDARY REPORT

### Scope

This step inspected remaining broad/business branches in `server/app.js` that still keep `legacyApi` fallback:

- invitations
- clients
- appointments
- settings / tenant-domains
- files
- consents
- feedback
- CRM
- billing
- WhatsApp
- catalog
- gifts

No code, routes, imports, SQL, auth/session/cookies, or endpoint behavior was changed in this step.

### Route Branch Matrix

| Branch | Route matcher pattern | Extracted module owns | Known subroutes handled | Subroutes returning `false` / fallback reachable | Legacy duplicate exists | Risk removing fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `clients` | `resource("clients")` for GET/POST/PUT/DELETE | client list/create/update/delete and `GET /api/clients/:id/history` | `/api/clients`, `/api/clients/:id`, `/api/clients/:id/history` | `/api/clients/:id/files` returns `false` in clients controller, but because `clientsRoutes` appears before `filesRoutes`, this path can still reach legacy fallback instead of files module. | Yes | **High** |
| `appointments` | `resource("appointments")` for GET/POST/PUT/DELETE | appointment list/create/update/delete | `/api/appointments`, `/api/appointments/:id` | `/api/appointments/:id/whatsapp` returns `false`; because appointments routes appear before WhatsApp routes, this path can still reach legacy fallback. | Yes | **High** |
| `files` | regex exact-ish file routes | client file list/upload/download/delete | `/api/clients/:id/files`, `/api/client-files/:id/download`, `/api/client-files/:id` | Controller returns `false` only for unexpected matched edge cases; normal file endpoints are handled. However route-order issue means `/api/clients/:id/files` may be captured by clients branch first. | Yes | **Medium** |
| `CRM` | exact `/api/crm` plus `resource("crm-tasks")` | CRM dashboard/tasks/events/task create/update | `/api/crm`, `/api/crm-tasks`, `/api/crm-tasks/:id` | Unknown CRM task subpaths can return `false`. | Yes | **Medium** |
| `consents` | `resource("consents")` for GET/POST/DELETE | consent list/upload/delete/download/sign | `/api/consents`, `/api/consents/:id/download`, `/api/consents/:id/sign`, `/api/consents/:id` delete | Unknown consent subpaths can return `false`; binary PDF responses increase regression risk. | Yes | **High** |
| `feedback` | `startsWith("/api/public/feedback/")`, exact `/api/feedback` | public feedback preview/submit and protected feedback list/create | `/api/public/feedback/:token`, `/api/feedback` | Public startsWith route can match malformed deeper paths and return based on token parsing; fallback still reachable for unsupported exact `/api/feedback` methods. | Yes | **Medium** |
| `billing` | exact `/api/billing`, exact `/api/billing/invoices`, startsWith invoice update | tenant billing read/update, invoice create/update | `/api/billing`, `/api/billing/invoices`, `/api/billing/invoices/:id` | startsWith invoice route can catch malformed subpaths. Permission-sensitive. | Yes | **Medium** |
| `invitations` | exact `/api/invitations`, startsWith token routes, regex accept, startsWith delete | invite list/create/delete/public preview/accept | `/api/invitations`, `/api/invitations/:token`, `/api/invitations/:token/accept` | startsWith may catch malformed invitation paths; token parsing is sensitive. | Yes | **Medium** |
| `WhatsApp` | exact `/api/message-logs`, regex appointment/gift send | message logs, appointment WhatsApp send, gift WhatsApp send | `/api/message-logs`, `/api/appointments/:id/whatsapp`, `/api/gifts/:id/whatsapp` | Appointment/gift send can be shadowed by appointments/gifts branch order before WhatsApp. | Yes | **High** |
| `catalog` | `resource("categories")`, `resource("services")` | category/service CRUD | `/api/categories`, `/api/categories/:id`, `/api/services`, `/api/services/:id` | Unknown subpaths under categories/services can return `false`; otherwise stable. | Yes | **Medium** |
| `gifts` | exact `/api/gifts`, regex `/api/gifts/:id` PUT | gifts CRUD | `/api/gifts`, `/api/gifts/:id` PUT | `/api/gifts/:id/whatsapp` is owned by WhatsApp route but gifts exact/regex does not catch it, so less shadowing than appointments. | Yes | **Low-Medium** |
| `settings` | exact settings/tenant paths | settings and tenant profile read/update | `/api/settings`, `/api/tenant` | Exact routes only; lower risk, but not part of requested business list and still retained. | Yes | **Low** |
| `tenant-domains` | exact `/api/tenant/domains`, startsWith domain id | domain CRUD | `/api/tenant/domains`, `/api/tenant/domains/:id` | startsWith can catch malformed subpaths. Platform-owner sensitive. | Yes | **Medium** |

### Route-Order Findings

Current `registeredRoutes` order means:

- `clientsRoutes` comes before `filesRoutes`; therefore `GET /api/clients/:id/files` matches `clients` first. Since `handleClientsRoute()` returns `false` for that subpath, the current `legacyApi` fallback can still serve it. Removing the clients fallback before tightening routes would likely break client files.
- `appointmentsRoutes` comes before `whatsappRoutes`; therefore `POST /api/appointments/:id/whatsapp` matches `appointments` first. Since `handleAppointmentsRoute()` returns `false` for subpaths, legacy fallback can still serve/send WhatsApp behavior.
- `giftsRoutes` is narrower and does not match `/api/gifts/:id/whatsapp`; WhatsApp route can own that path directly.
- `consentsRoutes` is broad and owns several binary/signature subflows; fallback removal should be delayed until all subpaths are tested.

### Fallback Reachability Conclusion

The remaining `legacyApi` fallbacks are still reachable for several real or edge paths because of broad resource matchers and route order. They should not be removed as a single batch.

The most important reachable fallback paths to protect before removal:

- `/api/clients/:id/files`
- `/api/appointments/:id/whatsapp`
- malformed or deeper subpaths under:
  - `/api/consents/*`
  - `/api/crm-tasks/*`
  - `/api/billing/invoices/*`
  - `/api/invitations/*`
  - `/api/tenant/domains/*`

### Recommended Removal Order

1. **Settings exact routes**: low risk if included in a later exact-route cleanup.
2. **Gifts CRUD**: relatively narrow; validate `/api/gifts` and `/api/gifts/:id/whatsapp`.
3. **Catalog**: category/service CRUD, after invalid subpath parity.
4. **Feedback**: public token flow requires careful token tests.
5. **Billing / Invitations / Tenant domains**: permission-sensitive and startsWith route matching.
6. **CRM**: task subroutes and role behavior.
7. **Files**: binary/download/upload behavior.
8. **Consents**: PDF/signature and legal-flow behavior.
9. **Appointments**: WhatsApp/status/payment/consent interactions.
10. **Clients**: file/history/details route-order issue; should be fixed only after route order or matcher tightening.

### Required Validation Endpoints By Branch

- Clients:
  - `GET /api/clients`
  - `GET /api/clients/:id/history`
  - `GET /api/clients/:id/files`
  - invalid client subpath
- Appointments:
  - `GET /api/appointments`
  - `POST /api/appointments/:id/whatsapp`
  - invalid appointment subpath
- Files:
  - `GET /api/clients/:id/files`
  - `GET /api/client-files/:id/download` where available
  - `DELETE /api/client-files/:id` only with safe test data
- CRM:
  - `GET /api/crm`
  - `GET /api/crm-tasks`
  - invalid CRM task subpath
- Consents:
  - `GET /api/consents`
  - `GET /api/consents/:id/download` where available
  - `POST /api/consents/:id/sign` only with safe test data
- Feedback:
  - `GET /api/feedback`
  - public token preview/submit with safe token
- Billing:
  - `GET /api/billing`
  - invalid invoice update path/body
- Invitations:
  - `GET /api/invitations`
  - invitation token preview with known token if available
- WhatsApp:
  - `GET /api/message-logs`
  - appointment/gift send endpoints only in dry-run/safe config
- Catalog:
  - `GET /api/categories`
  - `GET /api/services`
  - invalid category/service subpath
- Gifts:
  - `GET /api/gifts`
  - `POST /api/gifts/:id/whatsapp` in safe config

### Step 72 Validation Result

- `node --check` passed for 126 server JavaScript files.
- Test server started successfully on port `3107`.
- `GET /api/clients` as clinic admin returned `200`.
- Invalid clients subroute `GET /api/clients/3/unknown` returned `200` with the clients list through current fallback behavior, confirming clients fallback is reachable and behavior-changing.
- `GET /api/appointments` as clinic admin returned `200`.
- Invalid appointments subroute `GET /api/appointments/1/unknown` returned `200` with the appointments list through current fallback behavior, confirming appointments fallback is reachable and behavior-changing.
- `GET /api/clients/3/files` returned `200`.
- `GET /api/crm` returned `200`.
- `GET /api/consents` returned `200`.
- `GET /api/feedback` returned `200`.
- `GET /api/billing` as clinic admin returned `403`; as platform-owner returned `200`.
- `GET /api/invitations` returned `200`.
- `GET /api/message-logs` returned `200`.
- `GET /api/categories` returned `200`.
- `GET /api/services` returned `200`.
- `GET /api/gifts` returned `200`.
- `GET /api/unknown` returned `404`.
- `GET /api/bootstrap` worked for clinic admin.
- `GET /api/platform/tenants` worked as platform-owner.

## SAFE STEP 66 - SYSTEM RESTORE ENDPOINT EXTRACTION ONLY

### Moved Endpoint

Moved only:

- `POST /api/system/restore`

Existing system module files now own both system endpoints:

- `server/modules/system/system.routes.js`
- `server/modules/system/system.controller.js`
- `server/modules/system/system.service.js`
- `server/modules/system/system.repository.js`

### Behavior Preserved

The extracted restore endpoint preserves:

- platform-owner-only permission behavior via `requirePlatformOwnerCompat`;
- exact `401` login-required body;
- exact `403 {"error":"Platform owner access is required."}` body;
- PostgreSQL `400` block behavior;
- legacy multipart boundary handling;
- `UPLOAD_MAX_MB` request size behavior through `config.uploads.maxBytes`;
- restore field name `backup`;
- missing file validation;
- SQLite `PRAGMA integrity_check` validation;
- `config.backup.dir/restore-uploads` path behavior;
- `createBackup({ reason: "before-restore" })`;
- `pending-restore.sqlite`;
- `pending-restore.json`;
- `restore_scheduled` audit behavior;
- response `{"ok":true,"safetyBackup":"<path>","restarting":true}`;
- `process.exit(0)` scheduled after 500ms;
- apply-on-next-start behavior remains unchanged in `server/db.js`.

No MIME or extension checks were added.

### Integration

- `server/modules/system/system.routes.js` now registers `POST /api/system/restore`.
- `server/app.js` already registers `systemRoutes` before `filesRoutes` and before `legacyApi` fallback.
- `GET /api/system/export` was not changed in this step.
- final `/api/*` 404 fallback was not changed.

### Legacy Fallback

The old legacy restore branch remains in `server/legacy-runtime.js` with the comment:

`LEGACY FALLBACK - SYSTEM RESTORE - SAFE TO REMOVE AFTER VALIDATION`

### Step 66 Validation Result

- `node --check` passed for 125 server JavaScript files.
- Test server started successfully on port `3101`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `POST /api/system/restore` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `POST /api/system/restore` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `POST /api/system/restore` as platform-owner with missing/invalid body returned `400` with body:
  `{"error":"׳‘׳§׳©׳× ׳”׳¢׳׳׳” ׳׳ ׳×׳§׳™׳ ׳”"}`
- `POST /api/system/restore` as platform-owner with multipart but no `backup` file returned `400` with body:
  `{"error":"Choose a backup file to restore."}`
- `backups/pending-restore.sqlite` did not exist after validation.
- `backups/pending-restore.json` did not exist after validation.
- No valid restore was executed.
- `GET /api/system/export` as platform-owner still returned `200` download; downloaded temporary copy passed SQLite `PRAGMA integrity_check` with `ok` and was deleted.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/bootstrap` worked.
- `GET /` returned `200` and the HTML shell.

## SAFE STEP 62 - STATIC SERVING EXTRACTION ONLY

### Moved Helper

`serveStatic(req, res, url)` was moved to:

- `server/shared/http/static-server.js`

The helper was copied with the same behavior:

- same `publicDir = resolve("client")`
- same MIME map
- same `/` to `index.html` behavior
- same missing file SPA fallback
- same `filePath.startsWith(publicDir)` path traversal guard
- same `403 Forbidden` body
- same `X-Content-Type-Options: nosniff`
- same synchronous file reads

### Import / Export Boundary

- `server/app.js` now imports `serveStatic` directly from `server/shared/http/static-server.js`.
- `server/app.js` still imports only `api as legacyApi` from `server/legacy-runtime.js`.
- `server/legacy-runtime.js` imports `serveStatic` from the shared helper and still exports `serveStatic` temporarily for compatibility.
- `createClinovaServer()` inside `legacy-runtime.js` still calls the imported shared `serveStatic`.

### Confirmed Unchanged Areas

- No routes changed.
- API routing and `legacyApi` fallback were not changed.
- `/api/*` requests still never reach `serveStatic`.
- System export/restore were not touched.
- Auth/session/cookies were not touched.
- JSON helper/export behavior was not touched.
- Static SPA fallback behavior was preserved.

### Step 62 Validation Result

- `node --check` passed for 121 server JavaScript files.
- Test server started successfully on port `3097`.
- `GET /` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- `GET /index.html` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- `GET /logo.svg` returned `200`, `image/svg+xml`.
- `GET /non-existing-static-file` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- Encoded traversal attempt `GET /..%2Fserver%2Fapp.js` returned `403 Forbidden`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401`.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`

## SAFE STEP 61 - STATIC SERVING BOUNDARY REPORT

### Static Serving Location

- Active static serving is called from `server/app.js`.
- `server/app.js` sends every request whose pathname does not start with `/api/` to `serveStatic(req, res, url)`.
- `serveStatic` is still implemented and exported by `server/legacy-runtime.js`.
- No code, imports, route order, endpoint behavior, or API fallback behavior was changed in this step.

### Current `serveStatic` Responsibilities

`serveStatic(req, res, url)` currently:

1. Uses `publicDir = resolve("client")`.
2. Maps `/` to `client/index.html`.
3. Maps any other non-API pathname to `join(publicDir, decodeURIComponent(url.pathname))`.
4. Blocks resolved paths that do not start with `publicDir`.
5. If the target file is missing or is a directory, falls back to `client/index.html`.
6. Determines content type from a small local MIME map.
7. Adds `X-Content-Type-Options: nosniff`.
8. Reads and sends the file synchronously with `readFileSync`.

### How `/` Is Served

- `GET /` resolves directly to `client/index.html`.
- Response status is `200`.
- Response content type is `text/html; charset=utf-8`.
- This is the main app shell.

### How Static Assets Are Served

Existing files under `client/` are served directly. Current visible root assets include:

- `client/index.html`
- `client/app.js`
- `client/styles.css`
- `client/logo.svg`
- `client/feedback.html`

Example:

- `GET /logo.svg` resolves to `client/logo.svg`.
- Response status is `200`.
- Response content type is `image/svg+xml`.

### Missing Static File Behavior

- Missing non-API paths do not return `404`.
- Missing non-API paths fall back to `client/index.html`.
- Example: `GET /non-existing-static-file` returns status `200` with the HTML app shell.
- This behavior supports frontend SPA/browser routes.

### Unmatched `/api/*` Behavior

- `server/app.js` routes every pathname starting with `/api/` into `handleApi`.
- If no extracted route matches, `handleApi` calls `legacyApi(req, res, url)`.
- `legacyApi` eventually reaches the legacy unmatched API fallback and returns:
  - status `404`
  - JSON body `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `/api/*` requests never use `serveStatic` and never fall back to `index.html`.

### SPA Fallback

- SPA fallback exists for non-API paths only.
- Missing files and directory paths are served as `client/index.html`.
- This is important for frontend client-side routes and should be preserved exactly during extraction.

### MIME / Content-Type Behavior

Current MIME map in `legacy-runtime.js`:

| Extension | Content-Type |
| --- | --- |
| `.html` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js` | `text/javascript; charset=utf-8` |
| `.svg` | `image/svg+xml` |
| `.jpg` | `image/jpeg` |
| `.png` | `image/png` |
| `.webp` | `image/webp` |
| `.pdf` | `application/pdf` |
| other | `application/octet-stream` |

Every static response also includes:

- `X-Content-Type-Options: nosniff`

### Path Traversal Protection

- `serveStatic` builds the target path with `join(publicDir, decoded pathname)`.
- It then checks `filePath.startsWith(publicDir)`.
- If the path escapes `publicDir`, it returns:
  - status `403`
  - plain body `Forbidden`
- This protection is simple and must be preserved byte-for-byte initially if extracted.
- A later hardening step may use stronger path normalization checks, but that must not happen during safe extraction.

### Dependencies Used By `serveStatic`

- `publicDir` from `resolve("client")`.
- `mimeTypes` local object.
- Node `fs` helpers:
  - `existsSync`
  - `statSync`
  - `readFileSync`
- Node `path` helpers:
  - `join`
  - `extname`
- URL path decoding through `decodeURIComponent(url.pathname)`.

### Can `serveStatic` Move Later?

Yes, but only as a behavior-preserving extraction.

Recommended destination:

- `server/shared/static/serve-static.js`

Alternative destination:

- `server/modules/static/static.service.js`

The safest first move is a shared static utility because static serving is not a business module and is used by the server bootstrap layer.

### Safe Extraction Plan

1. Create `server/shared/static/serve-static.js`.
2. Move only `mimeTypes`, `publicDir`, and `serveStatic` unchanged.
3. Keep `legacy-runtime.js` exporting `serveStatic` temporarily as a compatibility re-export.
4. Update `server/app.js` to import `serveStatic` from the shared static helper.
5. Do not change API routing or `legacyApi`.
6. Validate `/`, `/index.html`, `/logo.svg`, missing non-API SPA fallback, traversal protection, `/api/unknown`, and core API endpoints.
7. Remove legacy `serveStatic` export only in a later explicit cleanup step.

### Manual Validation Checklist

Before and after extraction:

- `GET /` returns `200` HTML shell.
- `GET /index.html` returns `200` HTML shell.
- `GET /logo.svg` returns `200` SVG.
- `GET /styles.css` returns `200` CSS.
- `GET /app.js` returns `200` JavaScript.
- `GET /non-existing-static-file` returns `200` HTML shell.
- Path traversal attempt returns `403 Forbidden`.
- `GET /api/unknown` returns legacy `404` JSON.
- `GET /api/health` returns `200`.
- `GET /api/version` returns `200`.
- `GET /api/bootstrap` without login returns `401`.
- `GET /api/system/export` without login returns `401`.
- `POST /api/system/restore` without login returns `401`.

### Step 61 Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3096`.
- `GET /` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- `GET /index.html` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- `GET /logo.svg` returned `200`, `image/svg+xml`.
- `GET /non-existing-static-file` returned `200`, `text/html; charset=utf-8`, and the HTML shell.
- Encoded traversal attempt `GET /..%2Fserver%2Fapp.js` returned `403 Forbidden`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- Unauthenticated `GET /api/bootstrap` returned `401`.
- Unauthenticated `GET /api/system/export` returned `401`.
- Unauthenticated `POST /api/system/restore` returned `401`.
- Static root `GET /` returned `200` and loaded the HTML shell beginning with `<!doctype html>`.

## SAFE STEP 60 - SYSTEM EXPORT/RESTORE BOUNDARY REPORT

### Endpoint Location

- `GET /api/system/export` is still implemented in `server/legacy-runtime.js` inside `api(req, res, url)`.
- `POST /api/system/restore` is still implemented in `server/legacy-runtime.js` inside `api(req, res, url)`.
- Both paths are listed in `server/routes/files.routes.js` without a module, so `server/app.js` intentionally falls through to `legacyApi`.
- No route, import, SQL, auth, or behavior was changed in this step.

### `GET /api/system/export` Current Behavior

1. Calls legacy `requirePlatformOwner(req, res)`.
2. If unauthenticated, returns legacy `401` JSON.
3. If authenticated but not `platformOwner`, returns `403` JSON:
   `{"error":"Platform owner access is required."}`
4. Calls `createBackup({ reason: "download-export" })`.
5. Reads the generated backup file fully into memory with `readFileSync(exportBackup.target)`.
6. Sends the backup as a download with:
   - SQLite: `Content-Type: application/vnd.sqlite3`, filename `clinova-<timestamp>.sqlite`
   - PostgreSQL: `Content-Type: application/octet-stream`, filename `clinova-<timestamp>.dump`
   - `Content-Length`
   - `X-Content-Type-Options: nosniff`
7. Writes audit log action `export` on entity `system`.

### `POST /api/system/restore` Current Behavior

1. Calls legacy `requirePlatformOwner(req, res)`.
2. If unauthenticated, returns legacy `401` JSON.
3. If authenticated but not `platformOwner`, returns `403` JSON:
   `{"error":"Platform owner access is required."}`
4. If `DATABASE_URL` is set, returns `400` JSON:
   `{"error":"Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups."}`
5. Parses multipart request with legacy `readMultipart(req)`.
6. Expects uploaded file under `files.backup`.
7. If missing or empty, returns `400` JSON:
   `{"error":"Choose a backup file to restore."}`
8. Stores uploaded file under `config.backup.dir/restore-uploads/<timestamp>-<safe filename>`.
9. Runs SQLite `PRAGMA integrity_check` through `assertValidSqliteBackup(source)`.
10. Creates safety backup with `createBackup({ reason: "before-restore" })`.
11. Copies uploaded DB to `config.backup.dir/pending-restore.sqlite`.
12. Writes `config.backup.dir/pending-restore.json` metadata: `uploadedName`, `source`, `requestedBy`, `safetyBackup`, `createdAt`.
13. Writes audit log action `restore_scheduled` on entity `system`.
14. Returns `200` JSON:
    `{"ok":true,"safetyBackup":"<path>","restarting":true}`
15. Schedules `process.exit(0)` after 500ms.

### Required Permissions

| Endpoint | Auth helper | Required user |
| --- | --- | --- |
| `GET /api/system/export` | legacy `requirePlatformOwner` | Valid session user with `platformOwner === true` |
| `POST /api/system/restore` | legacy `requirePlatformOwner` | Valid session user with `platformOwner === true` |

These endpoints must not be migrated to normal clinic admin permissions. They are cross-tenant system operations.

### Data Included In Export

SQLite export copies the whole SQLite database file using `VACUUM INTO`.

PostgreSQL export creates a custom-format dump using `pg_dump --format=custom --no-owner`.

Therefore the database export includes all database tables currently in the schema, including:

- `tenants`
- `subscriptions`
- `tenant_domains`
- `billing_invoices`
- `users`
- `categories`
- `services`
- `clients`
- `crm_tasks`
- `crm_events`
- `appointments`
- `clinic_settings`
- `client_files`
- `consent_templates`
- `consent_signatures`
- `feedback_requests`
- `gift_cards`
- `message_logs`
- `sessions`
- `user_invitations`
- `audit_log`

### Files, Uploads, And Settings

- Upload binaries under `config.uploads.dir` are not included by the current export path.
- Backup files under `config.backup.dir` are not included as separate files.
- Runtime `.env` values are not included.
- Static frontend files are not included.
- `clinic_settings` database rows are included because the full database is exported.
- `client_files` metadata rows are included, but the physical uploaded files they reference are not included.

### SQLite Behavior

- Backup uses Node `DatabaseSync` and SQLite `VACUUM INTO`.
- Backup source is `config.databasePath`.
- Backup target is `config.backup.dir/clinova-sqlite-<timestamp><db extension>`.
- Restore upload is supported only for SQLite.
- Uploaded restore file is validated with `PRAGMA integrity_check`.
- Restore is staged, not copied directly over the live DB during the request.
- `server/db.js` applies `pending-restore.sqlite` at next process startup before opening the SQLite adapter.
- During pending restore application, current DB is copied to `before-pending-restore-<timestamp>.sqlite`, WAL/SHM files are removed, pending DB is copied to `config.databasePath`, and pending metadata is removed.

### PostgreSQL Behavior

- Backup requires `DATABASE_URL`.
- Backup uses external `pg_dump`.
- If `DATABASE_SSL=true`, the dump URL receives `sslmode=require` or `sslmode=verify-full` depending on `DATABASE_SSL_REJECT_UNAUTHORIZED`.
- Restore upload through `/api/system/restore` is disabled for PostgreSQL and returns `400`.
- PostgreSQL restore must be handled outside the web endpoint with PostgreSQL-native tooling such as `pg_restore`.

### Backup File Format

| Engine | Export implementation | Download extension | Server-side backup file |
| --- | --- | --- | --- |
| SQLite | `VACUUM INTO` | `.sqlite` | `clinova-sqlite-<timestamp>.sqlite` or original DB extension |
| PostgreSQL | `pg_dump --format=custom --no-owner` | `.dump` | `clinova-postgres-<timestamp>.dump` |

Backup retention is controlled by `config.backup.retention` and cleanup removes old `clinova-*.sqlite` and `clinova-*.dump` files after each backup.

### Restore Safety Checks

- Requires platform-owner permission before any upload parsing or file writing.
- PostgreSQL restore is blocked.
- Upload must be multipart and include a non-empty `backup` file.
- Filename is sanitized by legacy `safeFileName`.
- Uploaded SQLite file must pass `PRAGMA integrity_check`.
- A safety backup is created before staging the restore.
- Restore is staged in `pending-restore.sqlite` and applied at next process startup.
- Request returns before process exits; actual DB replacement happens during startup.

### Restore Side Effects

- Writes uploaded file into `config.backup.dir/restore-uploads`.
- Creates a safety backup in `config.backup.dir`.
- Writes `pending-restore.sqlite`.
- Writes `pending-restore.json`.
- Writes audit row `restore_scheduled`.
- Calls `process.exit(0)` after response.
- On next startup, replaces the SQLite database file with the pending backup.

### Error / Status / Body Behavior

| Case | Endpoint | Status/body |
| --- | --- | --- |
| No or invalid session | Both | legacy `401` login-required JSON |
| Valid non-platform user | Both | `403 {"error":"Platform owner access is required."}` |
| PostgreSQL restore upload | `POST /api/system/restore` | `400 {"error":"Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups."}` |
| Missing restore file | `POST /api/system/restore` | `400 {"error":"Choose a backup file to restore."}` |
| Invalid SQLite backup | `POST /api/system/restore` | `400` with `"SQLite backup integrity check failed."` through app error handling |
| Successful export | `GET /api/system/export` | `200` binary download |
| Successful restore schedule | `POST /api/system/restore` | `200 {"ok":true,"safetyBackup":"<path>","restarting":true}` |

### External Dependencies

- Node built-ins: `fs`, `path`, `child_process`.
- Node SQLite binding: `node:sqlite` / `DatabaseSync`.
- External executable for PostgreSQL backup: `pg_dump`.
- Database adapter startup logic in `server/db.js`.
- Config values: `DATABASE_PATH`, `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `BACKUP_DIR`, `BACKUP_RETENTION`, `UPLOAD_MAX_MB`.

### Endpoint Risk Levels

| Endpoint | Risk | Reason |
| --- | --- | --- |
| `GET /api/system/export` | High | Cross-tenant full database export, creates backup files, reads whole backup into memory, depends on `pg_dump` for PostgreSQL. |
| `POST /api/system/restore` | Critical | Can replace the whole SQLite database after restart, exits the process, writes pending restore files, and can affect all tenants. |

### Recommended Module Destination

Recommended future module:

- `server/modules/system/system.routes.js`
- `server/modules/system/system.controller.js`
- `server/modules/system/system.service.js`
- `server/modules/system/system-backup.repository.js` or `system.repository.js`

Suggested shared utilities:

- `server/shared/files/multipart.js` only if exact legacy multipart behavior is preserved.
- `server/shared/files/safe-file-name.js` only if exact filename behavior is preserved.
- `server/modules/system/sqlite-restore.js` for `assertValidSqliteBackup` and pending restore staging.

### Safest Extraction Order

1. Extract `GET /api/system/export` route/controller/service only, keeping `createBackup` untouched.
2. Validate binary headers, unauthenticated behavior, and non-platform-owner behavior.
3. Extract SQLite restore helper functions internally under a system module without changing behavior.
4. Extract `POST /api/system/restore` only after validation on a disposable local SQLite database.
5. Keep `server/db.js` pending-restore startup behavior unchanged until restore parity is proven.
6. Keep PostgreSQL restore blocked unless a later product decision adds a separate controlled restore process.

### Manual Validation Checklist

Before and after extraction:

- `GET /api/system/export` without login returns exact `401`.
- `POST /api/system/restore` without login returns exact `401`.
- `GET /api/system/export` as normal clinic admin returns exact `403`.
- `POST /api/system/restore` as normal clinic admin returns exact `403`.
- `GET /api/system/export` as platform-owner returns binary download headers.
- `POST /api/system/restore` with missing file as platform-owner returns exact `400`.
- PostgreSQL mode restore returns exact `400`.
- Static root `/` still returns app shell.
- unmatched `/api/unknown` still returns legacy `404`.
- On disposable SQLite DB only, upload a known-valid backup and confirm staged pending restore, safety backup, restart application, and pending file cleanup.

### Step 60 Validation Result

- `node --check` passed for 120 server JavaScript files.
- Test server started successfully on port `3095`.
- `GET /api/health` returned `200`.
- `GET /api/version` returned `200`.
- `POST /api/login` worked for clinic admin and platform-owner.
- `GET /api/me` worked.
- `GET /api/bootstrap` worked for clinic admin and platform-owner.
- Unauthenticated `GET /api/system/export` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- Unauthenticated `POST /api/system/restore` returned `401` with body:
  `{"error":"״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„"}`
- `GET /api/system/export` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- `POST /api/system/restore` as clinic admin returned `403` with body:
  `{"error":"Platform owner access is required."}`
- No destructive restore was performed.
- Static root `GET /` returned `200` and loaded the HTML shell beginning with `<!doctype html>`.
- `GET /api/unknown` returned `404` with body:
  `{"error":"״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯"}`
## SAFE STEP 73 - ROUTE ORDER / MATCHER BOUNDARY REPORT

### Scope
This step inspected route order and matcher behavior only. No route order, matcher, controller, service, repository, SQL, auth/session/cookie, or fallback behavior was changed.

### Current Broad Route Order

Relevant order in `server/app.js` today:

1. `filesRoutes`
2. `consentsRoutes`
3. `feedbackRoutes`
4. `crmRoutes`
5. `billingRoutes`
6. `whatsappRoutes`
7. `catalogRoutes`
8. `giftsRoutes`
9. `clientsRoutes`
10. `appointmentsRoutes`
11. `invitationsRoutes`
12. `settingsRoutes`

Important current protections:

- `filesRoutes` is before `clientsRoutes`, so exact `/api/clients/:id/files` is owned by Files before Clients can overmatch.
- `whatsappRoutes` is before `appointmentsRoutes`, so exact `/api/appointments/:id/whatsapp` is owned by WhatsApp before Appointments can overmatch.
- `whatsappRoutes` is before `giftsRoutes`, and `giftsRoutes` uses exact/ID-only matchers, so `/api/gifts/:id/whatsapp` remains owned by WhatsApp.

### Broad Branch Boundary Table

| Branch | Current matcher/order | Extracted module endpoints | Declined/overmatched subroutes | Legacy fallback reachable? | Legacy duplicate exists? | Risk removing fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `files` | Exact regexes before Clients | `GET/POST /api/clients/:id/files`, `GET /api/client-files/:id/download`, `DELETE /api/client-files/:id` | `/api/clients/:id/files/:extra` does not match Files, then may reach Clients and legacy | Yes, through later broad Clients branch for nested file-like paths | Yes | Medium |
| `clients` | `resource("clients")`, after Files | `GET/POST /api/clients`, `PUT/DELETE /api/clients/:id`, `GET /api/clients/:id/history` | `/api/clients/:id/unknown`, `/api/clients/:id/files/:extra` | Yes | Yes | High |
| `whatsapp` | Exact `/api/message-logs`, exact appointment/gift send regexes before Appointments/Gifts | `GET /api/message-logs`, `POST /api/appointments/:id/whatsapp`, `POST /api/gifts/:id/whatsapp` | Exact regexes limit most overmatch; authenticated send routes can have external/log side effects | Low, only if handler declines a matched exact route | Yes | Medium |
| `appointments` | `resource("appointments")`, after WhatsApp | `GET/POST /api/appointments`, `PUT/DELETE /api/appointments/:id` | `/api/appointments/:id/unknown`; status/payment subroutes are not yet clearly owned by extracted Appointments | Yes | Yes | High |
| `consents` | `resource("consents")` | `GET/POST /api/consents`, `DELETE /api/consents/:id`, `POST /api/consents/:id/sign`, `GET /api/consents/:id/download` | `/api/consents/:id/unknown` returns false and can fall back | Yes | Yes | High |
| `crm` | Exact `/api/crm`, `resource("crm-tasks")` | `GET /api/crm`, `GET/POST/PUT /api/crm-tasks` | `GET /api/crm-tasks/:id/unknown` is overaccepted by CRM task list behavior because GET ignores extra path depth | Mostly not needed for normal CRM, but fallback remains | Yes | Medium |
| `feedback` | Exact `/api/feedback`, `startsWith("/api/public/feedback/")` | `GET/POST /api/feedback`, public feedback token GET/POST | `startsWith` means malformed public feedback nested paths are treated as token paths using the last segment | Yes for handler false cases | Yes | Medium |
| `billing` | Exact `/api/billing`, exact create invoice, `startsWith("/api/billing/invoices/")` for PUT | `GET/PUT /api/billing`, `POST /api/billing/invoices`, `PUT /api/billing/invoices/:id` | `PUT /api/billing/invoices/:id/extra` overmatches and parses last segment as invoice id | Yes | Yes | Medium |
| `invitations` | Exact list/create, `startsWith("/api/invitations/")`, regex accept | `GET/POST /api/invitations`, `GET /api/invitations/:token`, `POST /api/invitations/:token/accept`, `DELETE /api/invitations/:id` | `GET /api/invitations/:token/extra` is treated as preview for last path segment | Yes | Yes | Medium |
| `catalog` | `resource("categories")`, `resource("services")` | Categories/services GET/POST/PUT/DELETE | `GET /api/categories/:id/unknown` and `GET /api/services/:id/unknown` are overaccepted by list behavior | Yes for declined non-GET/malformed cases | Yes | Medium |
| `gifts` | Exact `/api/gifts`, exact `PUT /api/gifts/:id` | `GET/POST /api/gifts`, `PUT /api/gifts/:id` | Invalid gift subroutes usually do not match Gifts; `/api/gifts/:id/whatsapp` is handled by WhatsApp | Low | Yes | Low |

### Required Findings

Invalid or malformed paths that can still return `200` because of broad matching or fallback behavior:

- `/api/clients/:id/unknown` can still reach Clients then legacy fallback.
- `/api/clients/:id/files/:extra` does not match Files, then can be caught by broad Clients/legacy behavior.
- `/api/appointments/:id/unknown` can still reach Appointments then legacy fallback.
- `/api/consents/:id/unknown` can still reach Consents then legacy fallback.
- `/api/categories/:id/unknown` and `/api/services/:id/unknown` are overaccepted by Catalog GET list behavior.
- `/api/crm-tasks/:id/unknown` is overaccepted by CRM GET task-list behavior.
- `/api/public/feedback/:token/extra` is treated as a public feedback token path using the final segment.
- `/api/billing/invoices/:id/extra` is matched by the billing `startsWith` matcher and parses the final segment as invoice id.
- `/api/invitations/:token/extra` is matched by the invitations `startsWith` matcher and treated as a preview token path using the final segment.

Nested routes that must keep precedence before parent resource routes:

- Files before Clients:
  - `/api/clients/:id/files`
  - `/api/client-files/:id/download`
  - `/api/client-files/:id`
- WhatsApp before Appointments and Gifts:
  - `/api/appointments/:id/whatsapp`
  - `/api/gifts/:id/whatsapp`
- Consent download/sign subflows must be explicitly handled before replacing fallback:
  - `/api/consents/:id/download`
  - `/api/consents/:id/sign`
- Billing invoice nested paths must become exact before fallback removal:
  - `/api/billing/invoices/:id`
- Invitation accept must remain more specific than preview/delete:
  - `/api/invitations/:token/accept`

### Route-Order Risk Summary

The highest risk is no longer simple route order for Files/Clients or WhatsApp/Appointments, because the current order already puts the nested owners first. The remaining risk is broad matchers and controllers that either return `false` for unknown subpaths and then rely on `legacyApi`, or accept extra path segments and return list data with status `200`.

### Safest Tightening Method

1. Tighten Clients/Files first:
   - keep Files before Clients;
   - make Clients match only `/api/clients`, `/api/clients/:id`, and `/api/clients/:id/history`;
   - decide whether legacy `200` behavior for invalid client subpaths must be preserved temporarily.
2. Tighten Appointments/WhatsApp second:
   - keep WhatsApp before Appointments;
   - explicitly map any real appointment status/payment subroutes before removing fallback;
   - make unknown appointment subpaths return the shared API 404 only after parity is accepted.
3. Tighten Consents third:
   - exact-match list/upload/delete/download/sign paths;
   - validate binary download and signature flows before fallback removal.
4. Tighten medium-risk broad matchers:
   - CRM task routes;
   - Billing invoice routes;
   - Invitations token/accept/delete routes;
   - Catalog categories/services routes.
5. Remove Gifts fallback late but it is low risk because matchers are already narrow.

### Validation Endpoints

Required validation before changing any broad fallback later:

- Clients/Files: `GET /api/clients`, `GET /api/clients/:id/files`, `GET /api/clients/:id/files/:extra`, `GET /api/clients/:id/unknown`.
- Appointments/WhatsApp: `GET /api/appointments`, `GET /api/appointments/:id/unknown`, unauthenticated or otherwise safe `POST /api/appointments/:id/whatsapp`.
- Consents: `GET /api/consents`, `GET /api/consents/:id/unknown`, valid download/sign tests on disposable data.
- CRM: `GET /api/crm`, `GET /api/crm-tasks`, `GET /api/crm-tasks/:id/unknown`.
- Feedback: `GET /api/feedback`, public feedback token preview, malformed public feedback path.
- Billing: `GET /api/billing`, `PUT /api/billing/invoices/:id` invalid-body/status tests, malformed invoice path.
- Invitations: `GET /api/invitations`, token preview, accept path, malformed token path.
- Catalog: `GET /api/categories`, `GET /api/categories/:id/unknown`, `GET /api/services`, `GET /api/services/:id/unknown`.
- Gifts: `GET /api/gifts`, `GET /api/gifts/:id/unknown`, `POST /api/gifts/:id/whatsapp` without side effects if possible.

### Recommended Next Safe Step

SAFE STEP 74 should tighten Clients/Files boundaries only, without deleting legacy fallback globally:

- Preserve current order: Files before Clients.
- Add exact client/file matchers or controller guards for Clients and Files.
- Replace only the Clients/Files legacy fallback after proving all real file/profile/history paths are owned by extracted modules.
- Keep Appointments/WhatsApp and all other business fallbacks unchanged.

### SAFE STEP 73 Validation Observations

Non-destructive validation confirmed the route-order and overmatch findings:

| Endpoint | Result | Boundary note |
| --- | --- | --- |
| `GET /api/clients` | `200` | normal Clients list works |
| `GET /api/clients/3/files` | `200` | Files route wins before Clients |
| `GET /api/clients/3/files/999` | `200` | malformed nested file path still returns client files through broad fallback/overmatch behavior |
| `GET /api/clients/3/unknown` | `200` | invalid client subpath still returns client list through legacy fallback |
| `GET /api/appointments` | `200` | normal Appointments list works |
| `GET /api/appointments/1/unknown` | `200` | invalid appointment subpath still returns appointment list through legacy fallback |
| `POST /api/appointments/1/whatsapp` without login | `401` | route matches WhatsApp before Appointments; tested unauthenticated to avoid message side effects |
| `GET /api/message-logs` | `200` | WhatsApp message logs route works |
| `GET /api/consents` | `200` | normal Consents list works |
| `GET /api/consents/1/unknown` | `200` | invalid consent subpath still returns consent list through legacy fallback |
| `GET /api/crm` | `200` | normal CRM dashboard route works |
| `GET /api/crm-tasks/1/unknown` | `200` | malformed CRM task path is overaccepted as task list |
| `GET /api/categories` | `200` | normal Catalog categories list works |
| `GET /api/categories/1/unknown` | `200` | malformed category path is overaccepted as category list |
| `GET /api/services` | `200` | normal Catalog services list works |
| `GET /api/services/1/unknown` | `200` | malformed service path is overaccepted as service list |
| `GET /api/gifts` | `200` | normal Gifts list works |
| `GET /api/gifts/1/unknown` | `404` | Gifts matcher is narrow enough for this invalid subpath |
| `GET /api/unknown` | `404` | shared API 404 remains active |
| `GET /api/bootstrap` | `200` | Bootstrap still works |
| `GET /api/platform/tenants` as platform owner | `200` | Platform routes unaffected |

No authenticated WhatsApp send, destructive restore, password reset, invoice creation, or data mutation was run during this validation.

## SAFE STEP 74 - CLIENTS / FILES BOUNDARY TIGHTENING

### Scope

This step changed only the Clients route boundary. Files route order and behavior were left unchanged, and Appointments, WhatsApp, Consents, Catalog, Gifts, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/controllers/clients.controller.js` now handles unknown client subpaths directly with the shared API 404 response instead of returning `false` and falling through to `legacyApi`.

Changed behavior:

- `GET /api/clients/:id/unknown` now returns the same 404 body as `/api/unknown`.
- `GET /api/clients/:id/files/:extra` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/clients`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `GET /api/clients/:id/history`
- `GET /api/clients/:id/files`
- `POST /api/clients/:id/files`
- `GET /api/client-files/:id/download`
- `DELETE /api/client-files/:id`

### Route Precedence

`server/app.js` still registers `filesRoutes` before `clientsRoutes`, so valid file routes continue to be handled by Files before Clients.

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Appointments, WhatsApp, Consents, Feedback, Billing, Invitations, CRM, Catalog, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 75 should tighten Appointments / WhatsApp boundaries only:

- Keep WhatsApp before Appointments.
- Preserve `POST /api/appointments/:id/whatsapp`.
- Make unknown appointment subpaths return the shared API 404.
- Leave all other broad business fallbacks unchanged.

## SAFE STEP 75 - APPOINTMENTS / WHATSAPP BOUNDARY TIGHTENING

### Scope

This step changed only the Appointments route boundary. WhatsApp route order and behavior were left unchanged, and Clients, Files, Consents, Catalog, Gifts, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/controllers/appointments.controller.js` now handles unknown appointment subpaths directly with the shared API 404 response instead of returning `false` and falling through to `legacyApi`.

Changed behavior:

- `GET /api/appointments/:id/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/appointments`
- `POST /api/appointments`
- `PUT /api/appointments/:id`
- `DELETE /api/appointments/:id`
- `POST /api/appointments/:id/whatsapp`
- `POST /api/gifts/:id/whatsapp`
- `GET /api/message-logs`

### Route Precedence

`server/app.js` still registers `whatsappRoutes` before `appointmentsRoutes`, so valid WhatsApp appointment reminder routes continue to be handled by WhatsApp before Appointments.

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Consents, Feedback, Billing, Invitations, CRM, Catalog, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 76 should tighten Consents boundaries only:

- Preserve consent list/upload/delete/download/sign behavior.
- Make unknown consent subpaths return the shared API 404.
- Do not touch clients/files/appointments/WhatsApp/catalog/gifts.

## SAFE STEP 76 - CONSENTS BOUNDARY TIGHTENING

### Scope

This step changed only the Consents route boundary. Clients, Files, Appointments, WhatsApp, Catalog, Gifts, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/controllers/consents.controller.js` now handles unknown consent subpaths directly with the shared API 404 response instead of returning `false` and falling through to `legacyApi`.

Changed behavior:

- `GET /api/consents/:id/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/consents`
- `POST /api/consents`
- `DELETE /api/consents/:id`
- `GET /api/consents/:id/download`
- `POST /api/consents/:id/sign`

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Feedback, Billing, Invitations, CRM, Catalog, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 77 should tighten Catalog boundaries only:

- Preserve Categories/Services CRUD behavior.
- Make malformed category/service subpaths return the shared API 404.
- Do not touch clients/files/appointments/WhatsApp/consents/gifts.

## SAFE STEP 77 - CATALOG BOUNDARY TIGHTENING

### Scope

This step changed only the Catalog route boundary. Gifts, Clients, Files, Appointments, WhatsApp, Consents, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/modules/catalog/catalog.controller.js` now handles malformed category/service subpaths directly with the shared API 404 response instead of allowing `GET` list handlers or legacy fallback to respond incorrectly.

Changed behavior:

- `GET /api/categories/:id/unknown` now returns the same 404 body as `/api/unknown`.
- `GET /api/services/:id/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/categories`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `GET /api/services`
- `POST /api/services`
- `PUT /api/services/:id`
- `DELETE /api/services/:id`

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Feedback, Billing, Invitations, CRM, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 78 should tighten CRM task boundaries only:

- Preserve `GET /api/crm` and `GET/POST/PUT /api/crm-tasks`.
- Make malformed CRM task subpaths return the shared API 404.
- Do not touch catalog/gifts/clients/files/appointments/WhatsApp/consents.

## SAFE STEP 78 - CRM TASK BOUNDARY TIGHTENING

### Scope

This step changed only the CRM task route boundary. Clients, Files, Appointments, WhatsApp, Consents, Catalog, Gifts, Billing, Invitations, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/controllers/crm.controller.js` now handles malformed CRM task subpaths directly with the shared API 404 response instead of allowing `GET` task-list behavior or legacy fallback to respond incorrectly.

Changed behavior:

- `GET /api/crm-tasks/:id/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/crm`
- `GET /api/crm-tasks`
- `POST /api/crm-tasks`
- `PUT /api/crm-tasks/:id`

### CRM Events Note

There is no currently extracted standalone CRM events endpoint. CRM events are still returned as part of `GET /api/crm` and `/api/bootstrap`, so no `/api/crm/events/*` route was added or changed.

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Feedback, Billing, Invitations, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 79 should tighten Billing invoice boundaries only:

- Preserve `GET/PUT /api/billing`, `POST /api/billing/invoices`, and `PUT /api/billing/invoices/:id`.
- Make malformed invoice subpaths return the shared API 404.
- Do not touch CRM or other business modules.

## SAFE STEP 79 - BILLING INVOICE BOUNDARY TIGHTENING

### Scope

This step changed only Billing route boundaries. Clients, Appointments, CRM, Consents, Catalog, Gifts, Invitations, WhatsApp, platform billing, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/routes/billing.routes.js` now matches invoice updates with an exact numeric pattern instead of a broad `startsWith` matcher.

Changed matcher:

- `PUT /api/billing/invoices/:id` is now limited to `/api/billing/invoices/<numeric-id>`.

Malformed paths now return the shared API 404:

- `GET /api/billing/unknown`
- `GET /api/billing/1/unknown`
- `PUT /api/billing/invoices/:id/unknown`

Preserved behavior:

- `GET /api/billing`
- `PUT /api/billing`
- `POST /api/billing/invoices`
- `PUT /api/billing/invoices/:id`

### Platform Billing

Platform billing remains in the platform module and was not changed:

- `POST /api/platform/billing/auto-run`

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Feedback, Invitations, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 80 should tighten Invitations token boundaries only:

- Preserve invitation list/create/delete, preview, and accept behavior.
- Make malformed invitation token subpaths return the shared API 404.
- Do not touch Billing or WhatsApp.

## SAFE STEP 80 - INVITATIONS TOKEN BOUNDARY TIGHTENING

### Scope

This step changed only invitation route boundaries. Billing, Clients, Appointments, CRM, Consents, Catalog, Gifts, WhatsApp, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/routes/invitations.routes.js` now uses exact token-shaped matchers instead of broad `startsWith` matchers:

- `GET /api/invitations/:token` is limited to a single path segment after `/api/invitations/`.
- `POST /api/invitations/:token/accept` remains exact.
- `DELETE /api/invitations/:id` is limited to numeric IDs.

`server/controllers/invitations.controller.js` also now guards malformed invitation subpaths with the shared API 404 response.

Changed behavior:

- `GET /api/invitations/:token/unknown` now returns the same 404 body as `/api/unknown`.
- `DELETE /api/invitations/:token/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/invitations`
- `POST /api/invitations`
- `GET /api/invitations/:token`
- `POST /api/invitations/:token/accept`
- `DELETE /api/invitations/:id`

### Preview Token Note

`GET /api/invitations/:token` is a valid public preview route. If the token does not exist, it still returns the invitation-specific `404` body from the invitation service, for example `{ "error": "Invitation not found." }`. This was intentionally preserved because changing it to the generic API 404 would alter valid endpoint behavior.

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Feedback, Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 81 should tighten Feedback public token boundaries only:

- Preserve `GET/POST /api/feedback`.
- Preserve public feedback token preview/submit behavior.
- Make malformed public feedback subpaths return the shared API 404.
- Do not touch Invitations, Billing, or WhatsApp.

## SAFE STEP 81 - FEEDBACK PUBLIC TOKEN BOUNDARY TIGHTENING

### Scope

This step changed only Feedback route boundaries. Invitations, Billing, WhatsApp, Clients, Appointments, CRM, Consents, Catalog, Gifts, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/routes/feedback.routes.js` now matches public feedback token routes with an exact single-token pattern instead of a broad `startsWith` matcher:

- `GET /api/public/feedback/:token`
- `POST /api/public/feedback/:token`

`server/controllers/feedback.controller.js` also now guards malformed public feedback subpaths with the shared API 404 response.

Changed behavior:

- `GET /api/public/feedback/:token/unknown` now returns the same 404 body as `/api/unknown`.
- `POST /api/public/feedback/:token/unknown` now returns the same 404 body as `/api/unknown`.

Preserved behavior:

- `GET /api/feedback`
- `POST /api/feedback`
- `GET /api/public/feedback/:token`
- `POST /api/public/feedback/:token`

### Public Token Note

`GET /api/public/feedback/:token` remains a valid public endpoint. Missing or invalid tokens still return the feedback-specific response from the feedback service; malformed deeper paths return the generic API 404.

### Remaining Untouched Fallbacks

The broad fallback remains unchanged for Gifts, Settings, and Tenant Domains.

### Recommended Next Safe Step

SAFE STEP 82 should do a remaining broad fallback reachability report for Gifts, Settings, and Tenant Domains before changing them.

## SAFE STEP 82 - REMAINING BROAD FALLBACK REACHABILITY REPORT

### Scope

This step inspected Gifts, Settings, and Tenant Domains route boundaries only. No code, routes, matchers, controller behavior, auth/session/cookies, SQL, or fallback calls were changed.

### Current Route Order

Relevant current order in `server/app.js`:

1. `whatsappRoutes`
2. `catalogRoutes`
3. `giftsRoutes`
4. `clientsRoutes`
5. `appointmentsRoutes`
6. `usersRoutes`
7. `invitationsRoutes`
8. `reportsRoutes`
9. `settingsRoutes`

`giftsRoutes` is after `whatsappRoutes`, so `POST /api/gifts/:id/whatsapp` remains owned by the WhatsApp module before Gifts can match anything.

### Gifts Boundary

| Item | Current state |
| --- | --- |
| Matcher | Exact `GET /api/gifts`, exact `POST /api/gifts`, regex `PUT /api/gifts/:id` |
| Controller owner | `server/modules/gifts/gifts.controller.js` |
| Valid endpoints | `GET /api/gifts`, `POST /api/gifts`, `PUT /api/gifts/:id` |
| WhatsApp nested endpoint | `POST /api/gifts/:id/whatsapp` is owned by WhatsApp because WhatsApp is registered earlier |
| Invalid subpath behavior | `/api/gifts/:id/unknown` does not match Gifts and reaches shared API 404 |
| Legacy fallback reachable? | Not for invalid gift subpaths in normal route flow; only if an exact Gifts handler returned `false` |
| Legacy duplicate exists? | Yes, `legacy-runtime.js` still has a `resource === "gifts"` branch |
| Risk level | Low |
| Safest tightening method | Replace Gifts branch fallback with `apiNotFound(res)` after one final validation; no matcher change appears necessary |

### Settings Boundary

| Item | Current state |
| --- | --- |
| Matcher | Exact `GET /api/settings`, exact `PUT /api/settings`, exact `GET /api/tenant`, exact `PUT /api/tenant` |
| Controller owner | `server/controllers/settings.controller.js` |
| Valid endpoints | `GET /api/settings`, `PUT /api/settings`, `GET /api/tenant`, `PUT /api/tenant` |
| Invalid subpath behavior | `/api/settings/unknown` and `/api/tenant/unknown` do not match Settings and reach shared API 404 |
| Legacy fallback reachable? | Not for invalid settings/tenant subpaths in normal route flow; only if an exact Settings handler returned `false` |
| Legacy duplicate exists? | Yes, `legacy-runtime.js` still has exact `/api/settings` and `/api/tenant` branches |
| Risk level | Low |
| Safest tightening method | Replace Settings branch fallback with `apiNotFound(res)` after validation; no matcher change appears necessary |

### Tenant Domains Boundary

| Item | Current state |
| --- | --- |
| Matcher | Exact `GET/POST /api/tenant/domains`, broad `startsWith("/api/tenant/domains/")` for `PUT/DELETE` |
| Controller owner | `server/controllers/tenant-domains.controller.js` |
| Valid endpoints | `GET /api/tenant/domains`, `POST /api/tenant/domains`, `PUT /api/tenant/domains/:id`, `DELETE /api/tenant/domains/:id` |
| Invalid subpath behavior | `PUT/DELETE /api/tenant/domains/:id/unknown` is currently matched by Tenant Domains because of `startsWith`; controller parses the final segment as the ID |
| Legacy fallback reachable? | Yes for matched Tenant Domains routes if the controller returns `false`; malformed `PUT/DELETE` paths can be overmatched before fallback |
| Legacy duplicate exists? | Yes, `legacy-runtime.js` still has exact and `startsWith("/api/tenant/domains/")` branches |
| Risk level | Medium |
| Safest tightening method | In a later step, change Tenant Domains `PUT/DELETE` matchers to exact numeric regexes and return shared API 404 for malformed domain subpaths |

### Overmatch Examples Found

- Gifts: no active overmatch found for `GET /api/gifts/:id/unknown`; current behavior is shared 404.
- Settings: no active overmatch found for `GET /api/settings/unknown` or `GET /api/tenant/unknown`; current behavior is shared 404.
- Tenant Domains: `PUT/DELETE /api/tenant/domains/:id/unknown` remains at risk because the matcher is `startsWith`.

### Risk Table

| Area | Risk | Reason |
| --- | --- | --- |
| Gifts | Low | Matchers are already narrow and WhatsApp gift send route has precedence |
| Settings | Low | Matchers are exact for all current settings/tenant endpoints |
| Tenant Domains | Medium | `startsWith` can overmatch malformed domain subpaths |

### Recommended Next Safe Step

SAFE STEP 83 should tighten Tenant Domains boundaries only:

- Preserve `GET/POST /api/tenant/domains`.
- Preserve `PUT/DELETE /api/tenant/domains/:id`.
- Change only malformed tenant-domain subpaths to the shared API 404.
- Do not touch Gifts or Settings in that step.

## SAFE STEP 83 - TENANT DOMAINS BOUNDARY TIGHTENING

### Scope

This step changed only Tenant Domains route boundaries. Gifts, Settings main endpoints, Tenant main endpoints, Clients, Appointments, CRM, Consents, Catalog, auth/session/cookies, SQL, and global business fallbacks were not touched.

### Boundary Change

`server/routes/settings.routes.js` now matches Tenant Domain updates/deletes with exact numeric patterns instead of broad `startsWith` matchers:

- `PUT /api/tenant/domains/:id`
- `DELETE /api/tenant/domains/:id`

`server/controllers/tenant-domains.controller.js` also now guards malformed Tenant Domains subpaths with the shared API 404 response.

Changed behavior:

- `PUT /api/tenant/domains/:id/unknown` now returns the same 404 body as `/api/unknown`.
- `DELETE /api/tenant/domains/:id/unknown` now returns the same 404 body as `/api/unknown`.
- `GET /api/tenant/domains/:id/unknown` remains the shared API 404.

Preserved behavior:

- `GET /api/tenant/domains`
- `POST /api/tenant/domains`
- `PUT /api/tenant/domains/:id`
- `DELETE /api/tenant/domains/:id`

### Remaining Untouched Areas

The following were intentionally not changed:

- `GET/PUT /api/settings`
- `GET/PUT /api/tenant`
- Gifts routes
- Other business modules and global fallbacks

### Recommended Next Safe Step

SAFE STEP 84 should remove or replace low-risk fallback calls for Gifts, Settings, and Tenant Domains only, after validating that their exact/malformed routes are now fully owned by extracted modules or shared API 404.

## SAFE STEP 84 - REMOVE LOW-RISK FALLBACK CALLS FOR GIFTS / SETTINGS / TENANT DOMAINS

### Scope

This step changed only `server/app.js` fallback behavior for these already-tightened branches:

- `gifts`
- `settings`
- `tenant-domains`

No route order, endpoint logic, response shapes, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Fallback Calls Removed

In `server/app.js`, the following module branches no longer call `legacyApi(req, res, url)` when their extracted handler returns `false`:

- `settings`
- `tenant-domains`
- `gifts`

Those branches now return the shared API 404 via `apiNotFound(res)`.

### Preserved Behavior

Valid endpoints remain owned by extracted modules:

- `GET /api/gifts`
- `POST /api/gifts`
- `PUT /api/gifts/:id`
- `POST /api/gifts/:id/whatsapp` remains owned by WhatsApp due to route order
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/tenant`
- `PUT /api/tenant`
- `GET /api/tenant/domains`
- `POST /api/tenant/domains`
- `PUT /api/tenant/domains/:id`
- `DELETE /api/tenant/domains/:id`

### Untouched Broad Fallbacks

These broad business route branches still keep `legacyApi` fallback:

- `clients`
- `appointments`
- `files`
- `consents`
- `feedback`
- `crm`
- `billing`
- `invitations`
- `whatsapp`
- `catalog`

`legacy-runtime.js` and the `legacyApi` import remain in place.

### Recommended Next Safe Step

SAFE STEP 85 should produce a final broad fallback reachability report after Steps 69-84, listing exactly which `legacyApi` calls remain in `server/app.js` and which can be removed next.

## SAFE STEP 85 - FINAL BROAD FALLBACK REACHABILITY REPORT AFTER ROUTE TIGHTENING

### Scope

This step inspected remaining `legacyApi` fallback calls after route boundary tightening. No code, routes, matchers, endpoint logic, auth/session/cookies, SQL, or fallback calls were changed.

### Remaining `legacyApi` Fallback Branches

`server/app.js` still calls `legacyApi(req, res, url)` from these module branches:

| Branch | Current fallback line area | Fallback reachability after tightening | Notes |
| --- | --- | --- | --- |
| `invitations` | `matchedRoute.module === "invitations"` | Low | Token/list/create/accept/delete routes are now narrow; malformed token subpaths return shared 404 before legacy fallback |
| `clients` | `matchedRoute.module === "clients"` | Low | Unknown client subpaths now return shared 404 from controller; valid clients/history routes are extracted |
| `appointments` | `matchedRoute.module === "appointments"` | Low | Unknown appointment subpaths now return shared 404 from controller; valid appointment CRUD is extracted |
| `files` | `matchedRoute.module === "files"` | Medium | Valid files/download/delete routes are extracted; binary/download behavior makes this a higher-care removal candidate |
| `consents` | `matchedRoute.module === "consents"` | Low/Medium | Unknown consent subpaths now return shared 404; download/sign flows are extracted but binary/signature behavior warrants focused validation |
| `feedback` | `matchedRoute.module === "feedback"` | Low | Public token route is now single-segment; malformed public token paths return shared 404 |
| `crm` | `matchedRoute.module === "crm"` | Low | Malformed CRM task paths now return shared 404; CRM events are represented via `GET /api/crm`/bootstrap rather than a standalone route |
| `billing` | `matchedRoute.module === "billing"` | Low | Invoice matcher is now numeric exact; malformed billing paths return shared 404 |
| `whatsapp` | `matchedRoute.module === "whatsapp"` | Medium | Exact message-log/send routes are extracted, but send routes may have external/log side effects and should be validated carefully |
| `catalog` | `matchedRoute.module === "catalog"` | Low | Malformed categories/services subpaths now return shared 404; valid CRUD is extracted |
| generic matched-route fallback | final `await legacyApi(req, res, url)` inside matched route block | Low | Only reachable if a registered route has a module name without a handler branch |

Branches already switched to `apiNotFound(res)` include status, auth, account, signup, bootstrap, platform modules, system, users, search, reports, audit, settings, tenant-domains, and gifts.

### Invalid Subpath Expectations

After tightening, these invalid paths should all return the shared API 404 body:

- `/api/clients/3/unknown`
- `/api/appointments/1/unknown`
- `/api/consents/1/unknown`
- `/api/categories/1/unknown`
- `/api/services/1/unknown`
- `/api/crm-tasks/1/unknown`
- `/api/billing/invoices/1/unknown`
- `/api/invitations/token/unknown`
- `/api/public/feedback/token/unknown`
- `/api/gifts/1/unknown`
- `/api/tenant/domains/1/unknown`
- `/api/unknown`

### Branches Safe For Fallback Removal Next

Recommended low-risk removal batch:

1. `clients`
2. `appointments`
3. `crm`
4. `billing`
5. `feedback`
6. `invitations`
7. `catalog`

Recommended separate focused batches:

- `consents`, because download/sign flows include binary/signature handling.
- `files`, because file upload/download/delete include multipart and binary responses.
- `whatsapp`, because send endpoints can create message logs or external provider side effects.

### Branches That Still Need Caution

No real endpoint appears to require `legacyApi` as its primary handler after the extraction/tightening work, but these areas should not be removed casually:

- `files`
- `consents`
- `whatsapp`

The caution is due to side effects or binary/multipart behavior, not because a known route is still legacy-only.

### Recommended Final Removal Order

1. Remove fallback calls for low-risk normal CRUD/read branches: `clients`, `appointments`, `crm`, `billing`, `feedback`, `invitations`, `catalog`.
2. Remove `consents` fallback after a focused download/sign validation pass.
3. Remove `files` fallback after upload/download/delete parity tests.
4. Remove `whatsapp` fallback after safe unauthenticated/invalid-id tests and one controlled non-production send-flow validation if allowed.
5. Re-check `server/app.js` for any remaining `await legacyApi(req, res, url)`.
6. If none remain, remove `legacyApi` import from `server/app.js` in a separate safe step.
7. Keep `legacy-runtime.js` untouched until duplicate legacy branches are audited for deletion.

## SAFE STEP 86 - REMOVE LOW-RISK REMAINING FALLBACK CALLS BATCH

### Scope

This step changed only `server/app.js` fallback behavior for the low-risk branches confirmed in SAFE STEP 85.

No route order, endpoint logic, response shapes, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Fallback Calls Removed

The following branches now call `apiNotFound(res)` instead of `legacyApi(req, res, url)` when their extracted module handler returns `false`:

- `clients`
- `appointments`
- `crm`
- `billing`
- `feedback`
- `invitations`
- `catalog`

### Fallback Calls Still Intentionally Kept

`legacyApi` fallback remains in `server/app.js` for:

- `files`
- `consents`
- `whatsapp`
- generic matched-route fallback

`legacy-runtime.js` and the `legacyApi` import remain in place.

### Recommended Next Safe Step

SAFE STEP 87 should inspect and remove the `consents` fallback only after focused validation of list/upload/download/sign flows.

## SAFE STEP 87 - CONSENTS FALLBACK REMOVAL ONLY

### Scope

This step changed only `server/app.js` fallback behavior for the `consents` branch.

No route order, endpoint logic, response shapes, upload/download/sign logic, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Fallback Call Removed

The `consents` branch now calls `apiNotFound(res)` instead of `legacyApi(req, res, url)` when `handleConsentsRoute()` returns `false`.

### Preserved Consents Routes

- `GET /api/consents`
- `POST /api/consents`
- `DELETE /api/consents/:id`
- `GET /api/consents/:id/download`
- `POST /api/consents/:id/sign`

### Fallback Calls Still Intentionally Kept

`legacyApi` fallback remains in `server/app.js` for:

- `files`
- `whatsapp`
- generic matched-route fallback

`legacy-runtime.js` and the `legacyApi` import remain in place.

### Recommended Next Safe Step

SAFE STEP 88 should remove the `files` fallback only after focused upload/download/delete validation.

## SAFE STEP 88 - FILES FALLBACK REMOVAL ONLY

### Scope

This step changed only `server/app.js` fallback behavior for the `files` branch.

No route order, endpoint logic, upload/download/delete behavior, binary headers, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Fallback Call Removed

The `files` branch now calls `apiNotFound(res)` instead of `legacyApi(req, res, url)` when `handleFilesRoute()` returns `false`.

### Preserved Files Routes

- `GET /api/clients/:id/files`
- `POST /api/clients/:id/files`
- `GET /api/client-files/:id/download`
- `DELETE /api/client-files/:id`

### Fallback Calls Still Intentionally Kept

`legacyApi` fallback remains in `server/app.js` for:

- `whatsapp`
- generic matched-route fallback

`legacy-runtime.js` and the `legacyApi` import remain in place.

### Recommended Next Safe Step

SAFE STEP 89 should remove the `whatsapp` fallback only after focused validation of message logs and safe unauthenticated/invalid send routes.

## SAFE STEP 89 - WHATSAPP FALLBACK REMOVAL ONLY

### Scope

This step changed only `server/app.js` fallback behavior for the `whatsapp` branch.

No route order, endpoint logic, message sending behavior, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Fallback Call Removed

The `whatsapp` branch now calls `apiNotFound(res)` instead of `legacyApi(req, res, url)` when `handleWhatsAppRoute()` returns `false`.

### Preserved WhatsApp Routes

- `GET /api/message-logs`
- `POST /api/appointments/:id/whatsapp`
- `POST /api/gifts/:id/whatsapp`

### Fallback Calls Still Intentionally Kept

`legacyApi` fallback remains in `server/app.js` only for:

- generic matched-route fallback

`legacy-runtime.js` and the `legacyApi` import remain in place.

### Send Safety

Validation used unauthenticated send-route checks and authenticated missing-ID checks only. No real WhatsApp send was triggered.

### Recommended Next Safe Step

SAFE STEP 90 should inspect the final generic matched-route fallback and determine whether `legacyApi` can be removed from `server/app.js`.

## SAFE STEP 90 - FINAL GENERIC FALLBACK / LEGACY API IMPORT REPORT

### Scope

This step inspected the final `legacyApi` dependency in `server/app.js`. No code, imports, routes, endpoint logic, fallback behavior, auth/session/cookies, SQL, or `legacy-runtime.js` code was changed.

### Remaining Import

`server/app.js` still imports:

```js
import { api as legacyApi } from "./legacy-runtime.js";
```

### Remaining Call Site

There is one remaining `legacyApi` call site in `server/app.js`:

```js
await legacyApi(req, res, url);
```

It is the final generic matched-route fallback inside `handleApi()`, after every known `matchedRoute.module` branch has been checked.

### Trigger Condition

The generic fallback is triggered only if:

1. `registeredRoutes.find(...)` finds a matching route; and
2. the route has a `module` value that is not handled by any `if (matchedRoute.module === "...")` branch in `handleApi()`.

It is not triggered by normal unknown API paths, because unmatched `/api/*` now goes directly to `apiNotFound(res)`.

### Reachability Conclusion

No current registered route should reach the generic `legacyApi` fallback in normal flow. Every current module in `registeredRoutes` has a matching handler branch in `handleApi()`:

- `status`
- `account`
- `signup`
- `auth`
- `bootstrap`
- `platform`
- `platform-provisioning`
- `platform-invoices`
- `platform-billing`
- `platform-password`
- `system`
- `files`
- `consents`
- `search`
- `audit`
- `feedback`
- `crm`
- `billing`
- `whatsapp`
- `catalog`
- `gifts`
- `clients`
- `appointments`
- `users`
- `invitations`
- `reports`
- `settings`
- `tenant-domains`

Therefore, no real endpoint appears to depend on `legacyApi` from `server/app.js` anymore.

### Branches Now Using `apiNotFound`

All known route branches now call `apiNotFound(res)` if their module handler returns `false`.

This includes previously broad/business branches:

- `clients`
- `appointments`
- `files`
- `consents`
- `feedback`
- `crm`
- `billing`
- `invitations`
- `whatsapp`
- `catalog`
- `gifts`
- `settings`
- `tenant-domains`

### Can `legacyApi` Be Removed From `app.js` Next?

Yes, `legacyApi` appears safe to remove from `server/app.js` in the next safe step, provided that the final generic fallback is replaced with `apiNotFound(res)` and the import is removed in the same small change.

`legacy-runtime.js` itself should not be deleted in that step. It still contains duplicate legacy branches and exports that should be audited separately after `app.js` no longer imports it.

### What Remains Inside `legacy-runtime.js`

After removing the `legacyApi` import from `server/app.js`, `legacy-runtime.js` would remain on disk with:

- duplicate legacy API route branches;
- old helper functions and mappers;
- compatibility exports such as `api`, `json`, `inviteUrl`, `requireUser`, and `serveStatic`;
- duplicate business logic for modules that are now extracted.

Those should be removed only in later, separate cleanup steps after import usage is audited.

### Exports Likely Unused By `app.js`

From the perspective of `server/app.js`, these `legacy-runtime.js` exports are no longer needed after the next step:

- `api`

Other exports must be checked repo-wide before removal, because some module/bootstrap/shared code may still import compatibility helpers.

### Safe Removal Plan

Recommended next sequence:

1. Replace the final generic matched-route fallback in `server/app.js` with `apiNotFound(res)`.
2. Remove `import { api as legacyApi } from "./legacy-runtime.js";` from `server/app.js`.
3. Run full `node --check`.
4. Run parity smoke tests for API 404, bootstrap, auth, static serving, system export/restore, platform, and representative business modules.
5. Do not delete `legacy-runtime.js` yet.
6. In a later report, audit all imports from `legacy-runtime.js` before removing duplicate legacy branches.

### Risk Assessment Before Removal

Risk is low. The remaining fallback is defensive only. The main risk is if a future route is registered with a new `module` name but no handler branch; replacing generic fallback with `apiNotFound(res)` would make that error visible as a 404 instead of silently invoking legacy routes. That is preferable for production clarity, but it should be documented.
## SAFE STEP 91 - REMOVE FINAL GENERIC FALLBACK + LEGACY API IMPORT FROM APP.JS ONLY

### Scope

This step modified only:

- `server/app.js`
- `server/REFACTOR_STATUS.md`

`legacy-runtime.js` was not edited or deleted. Route order, module route logic, endpoint behavior, auth/session/cookies, SQL, static serving, and duplicate legacy code were not changed.

### Import Removed

Removed from `server/app.js`:

```js
import { api as legacyApi } from "./legacy-runtime.js";
```

### Fallback Replacement

The final generic matched-route fallback in `handleApi()` was changed from:

```js
await legacyApi(req, res, url);
```

to:

```js
apiNotFound(res);
```

### Expected Behavior

- All known route modules still use their extracted handlers.
- If a future route matches but has no handler branch, it now returns the shared API 404 instead of falling into legacy runtime.
- Unmatched `/api/*` continues to return the same shared API 404.
- Non-API paths continue to use `serveStatic`.

### Remaining Legacy Runtime State

`legacy-runtime.js` remains on disk and still contains duplicate legacy code. It is no longer imported by `server/app.js` after this step, but repo-wide imports/exports should be audited before deleting or shrinking it.

### Recommended Next Safe Step

SAFE STEP 92 should be a legacy-runtime dependency report only:

- Search the repository for imports from `server/legacy-runtime.js`.
- List remaining exports and consumers.
- Confirm whether `legacy-runtime.js` is still imported anywhere.
- Do not delete or edit legacy-runtime yet.

## SAFE STEP 92 - LEGACY RUNTIME DEPENDENCY REPORT

### Scope

Report-only inspection after `server/app.js` stopped importing `legacyApi`.

No code, imports, routes, endpoint logic, auth/session/cookies, SQL, or `legacy-runtime.js` were changed in this step.

### Search Results

Searches were run across `server/**/*.js` for:

- `legacy-runtime`
- `legacyApi`
- `from ... legacy-runtime`
- `requireUser`
- `requirePermission`
- `requirePlatformOwner`
- `handleBootstrapLegacy`
- legacy `json`, `serveStatic`, and `inviteUrl` helper usage

### Legacy Runtime Imports

No JavaScript file outside `server/legacy-runtime.js` imports `legacy-runtime.js`.

No active JavaScript import was found for:

- `from "./legacy-runtime.js"`
- `from "../legacy-runtime.js"`
- `from "../../legacy-runtime.js"`
- `require(...legacy-runtime...)`

### legacyApi References

No JavaScript file outside `server/legacy-runtime.js` references `legacyApi`.

`server/app.js` no longer imports or calls `legacyApi`.

### Legacy Auth Helper Imports

No JavaScript file outside `server/legacy-runtime.js` imports legacy auth helpers from `legacy-runtime.js`.

Current active modules use:

- `server/services/permissions.service.js` for `requireUser`, `requirePermission`, and `requirePlatformOwner`
- `server/shared/auth/current-user.js` and `server/shared/auth/permissions-compat.js` for compatibility helpers

These are structured/shared helpers, not legacy-runtime imports.

### Legacy json / serveStatic / inviteUrl Exports

No JavaScript file outside `server/legacy-runtime.js` imports `json`, `serveStatic`, or `inviteUrl` from `legacy-runtime.js`.

Current active imports are:

- `json` from `server/shared/http/json-response.js`
- `serveStatic` from `server/shared/http/static-server.js`
- `inviteUrl` from `server/shared/http/url-helpers.js`

`server/legacy-runtime.js` itself imports these shared helpers and re-exports them for old compatibility only.

### Runtime Usage Conclusion

Based on the current server-side JavaScript import graph, `server/legacy-runtime.js` appears to be unused at runtime.

No endpoint in `server/app.js` currently depends on `legacy-runtime.js` for routing, final API 404 behavior, system export/restore, static serving, bootstrap, auth, or shared JSON/url helpers.

### Code Still Inside legacy-runtime.js

The file still contains duplicate/historical implementations, including:

- legacy `api(req, res, url)` dispatcher
- legacy `createClinovaServer`
- legacy `requireUser`, `requirePermission`, and `requirePlatformOwner`
- legacy `handleBootstrapLegacy`
- duplicate handlers for extracted modules
- duplicate system export/restore handlers
- duplicate final `/api/*` 404 fallback
- legacy list/helper functions such as clients, appointments, CRM, audit, platform tenants, billing, tenant domains, consent, feedback, gifts, and message logs
- compatibility exports for old helper names

### Safe Options

Option 1: keep `legacy-runtime.js` temporarily unused.

This is safest for one more release cycle and keeps a rollback reference while production validates the extracted route map.

Option 2: rename/quarantine in a later safe step.

Rename to a clearly unused name after another full validation pass. This exposes hidden imports from scripts or tooling without deleting the code immediately.

Option 3: delete in a later safe step.

Deletion should happen only after a dependency audit includes package scripts, deployment scripts, tests, and any external start command references.

### Deletion Risk

Deleting immediately is medium risk, not because runtime imports were found, but because:

- old deployment scripts or manual tooling may still reference it directly
- it is a useful parity reference while production validates the modular backend
- deleting duplicate fallback code is irreversible without version control recovery
- any missed non-JS or out-of-band reference would fail harder than an unused file

### Recommended Next Safe Step

SAFE STEP 93 should be a legacy-runtime quarantine plan or rename dry-run report:

- inspect package scripts, deployment scripts, docs, and tests for direct references
- decide whether to keep, rename, or delete
- do not delete the file yet
- if renaming later, validate full app startup and endpoint parity immediately after the rename

### Validation Results

`node --check` passed for all 126 JavaScript files under `server`.

`npm start` started successfully on test port `3132`; `GET /api/health` returned 200, and the test job was stopped.

The full smoke suite was then run on test port `3131` using the equivalent startup command from `package.json`, `node server/app.js`.

Smoke tests passed:

- `GET /api/health` -> 200
- `GET /api/version` -> 200
- `GET /api/bootstrap` without login -> 401
- `GET /api/bootstrap` authenticated as clinic admin -> 200
- `GET /api/unknown` -> 404
- `GET /` -> 200
- `GET /non-existing-static-file` -> 200
- clinic admin representative endpoints returned non-500 results: clients, appointments, client files, consents, message logs, gifts, settings, categories, services, invitations, feedback, CRM
- `GET /api/tenant/domains` as clinic admin returned 403, preserving permission behavior
- platform-owner login succeeded
- `GET /api/platform/tenants` as platform-owner -> 200
- `GET /api/billing` as platform-owner -> 200

The test server process was stopped after validation.

## SAFE STEP 93 - LEGACY RUNTIME ISOLATION DRY-RUN REPORT

### Scope

Report-only full-project inspection to determine whether `server/legacy-runtime.js` can be isolated or renamed in a later step.

No code, imports, routes, package scripts, deployment files, endpoint logic, auth/session/cookies, SQL, or `legacy-runtime.js` were changed.

### Full-Project Reference Summary

A full-project search was run outside `node_modules` and `.git` for:

- `legacy-runtime.js`
- `legacy-runtime`
- `legacyApi`
- `handleBootstrapLegacy`
- `requireUser`
- `requirePermission`
- `requirePlatformOwner`
- `serveStatic`
- `inviteUrl`
- direct script/import references to `legacy-runtime`

Exact `legacy-runtime` references were found only in:

- `server/legacy-runtime.js` itself
- historical and current documentation inside `server/REFACTOR_STATUS.md`

No code, script, deployment file, CI file, README, release document, or test file outside those two files directly references `legacy-runtime.js`.

The similarly named `legacy-static/` directory is an independent static asset directory and does not reference `legacy-runtime.js`.

### Reference Classification

| Reference area | Result | Classification |
|---|---|---|
| `server/legacy-runtime.js` | Contains internal legacy helpers, duplicate handlers, dispatcher, and exports | Unused legacy code file |
| `server/REFACTOR_STATUS.md` | Contains historical refactor reports and examples | Documentation only |
| Active server modules | No `legacy-runtime` import/reference | Active modular runtime |
| `release/` snapshots | No `legacy-runtime` reference; older snapshots start their own `server/app.js` | Archived/release copies |
| `legacy-static/` | Static assets only | Unrelated by name |

Helper names such as `requireUser`, `requirePermission`, `requirePlatformOwner`, `serveStatic`, and `inviteUrl` also appear in active code, but active modules import their structured/shared implementations, not `legacy-runtime.js`.

### Startup And Package Commands

No package command depends on `legacy-runtime.js`.

Current startup paths:

- `npm start` -> `node server/app.js`
- `npm run dev` -> `node --watch server/app.js`
- `npm run init-db` -> `node server/app.js --init-db`
- PM2 application entry -> `server/app.js`
- backup scheduler entry -> `server/backup-scheduler.js`

Other package commands use dedicated scripts such as `server/check-db.js`, `server/backup.js`, `server/restore.js`, and the PostgreSQL migration script.

### Deployment And CI

No deployment or CI path references `legacy-runtime.js`.

- `ecosystem.config.cjs` starts `server/app.js`.
- `.github/workflows/deploy.yml` syntax-checks selected active files and deploys through `deploy/update-from-github.sh`.
- `deploy/update-from-github.sh` runs backup, Git update, install, `npm run init-db`, PM2 reload, and health check.
- `deploy/server-first-install.sh` runs install, `npm run init-db`, and PM2.
- deployment documentation consistently identifies `server/app.js` or `npm start` as the application entry point.
- no Docker, Docker Compose, systemd service, or project test runner references `legacy-runtime.js`.

### Tests

No project-owned test/spec files or configured `npm test`, Node test runner, Jest, Mocha, Vitest, or Supertest command were found.

Regression confidence therefore depends on syntax checks and manual/API smoke tests.

### Git And Deployment State

`server/legacy-runtime.js` is currently untracked by Git.

This means Git-based deployment paths do not copy or update this file from the repository unless it is explicitly added later. Its current presence does not participate in the tracked application startup graph.

`server/REFACTOR_STATUS.md` is also currently untracked.

### Rename Dry-Run Conclusion

Renaming `server/legacy-runtime.js` later should not break `npm start`, PM2, CI startup, deployment scripts, active imports, or active routes because none references the file.

Renaming it to another `.js` filename such as `legacy-runtime.retired.js` would still allow a full `node --check` scan of `server/**/*.js` to syntax-check its contents. The current file itself passes syntax validation.

The repository's GitHub Actions syntax-check list does not explicitly include `legacy-runtime.js`, so renaming it would not change that CI command list.

### Files Requiring Updates If Renamed Later

No runtime, startup, package, deployment, CI, or test file requires an update.

Optional documentation cleanup only:

- `server/REFACTOR_STATUS.md` could record the new retired filename while retaining historical references to the old name.

Because the file is untracked, a later rename intended to be preserved in Git would also require an explicit decision to add the renamed retired file or intentionally leave it local-only.

### Isolation Options And Risk

| Option | Description | Risk |
|---|---|---|
| A | Keep `legacy-runtime.js` unused for one release cycle | Low; safest rollback/reference option, but keeps confusing dead code present |
| B | Rename to `legacy-runtime.retired.js` in a dedicated later step | Low to Medium; best way to expose hidden external/manual references without deletion |
| C | Delete after one more full regression test and deployment verification | Medium; runtime graph indicates it is safe, but deletion removes the parity/rollback reference |

### Recommended Isolation Strategy

Use Option A for one production validation cycle, then Option B in a dedicated safe step.

The rename step should:

- rename only the file
- avoid changing active code or imports
- run full server syntax checks
- run `npm start`, PM2/startup parity if available, and the complete representative API smoke suite
- observe deployment and production logs before considering deletion

### Recommended Next Safe Step

SAFE STEP 94 should be a legacy-runtime rename/isolation step only:

- rename `server/legacy-runtime.js` to `server/legacy-runtime.retired.js`
- do not edit its contents
- do not add imports or routes
- run full syntax/startup/API parity validation
- keep the retired file for at least one release before any deletion decision

### Validation Results

`node --check` passed for all 126 JavaScript files under `server`.

`npm start` started successfully on test port `3133`, and the test job was stopped after validation.

Validated successfully:

- `GET /api/health` -> 200
- `GET /api/version` -> 200
- unauthenticated `GET /api/bootstrap` -> 401
- authenticated clinic-admin `GET /api/bootstrap` -> 200
- `GET /api/unknown` -> 404
- `GET /` -> 200
- `GET /non-existing-static-file` -> 200
- clinic-admin representative endpoints returned non-500 results for users, clients, appointments, files, consents, search, reports, audit, feedback, CRM, invitations, message logs, catalog, gifts, and settings
- clinic-admin `GET /api/billing` -> 403, preserving platform-owner restriction
- platform-owner login -> 200
- platform-owner `GET /api/platform/tenants` -> 200
- platform-owner `GET /api/tenant/domains` -> 200
- platform-owner `GET /api/system/export` -> 200

## SAFE STEP 95 - RETIRED LEGACY RUNTIME DELETION READINESS REPORT

### Scope

Report-only inspection of `server/legacy-runtime.retired.js` after the successful isolation rename.

No code, imports, routes, endpoint logic, auth/session/cookies, SQL, package scripts, deployment files, or retired-file content were changed.

### Import And Reference Results

`server/legacy-runtime.retired.js` is not imported or required anywhere in the project.

No runtime, script, deployment, CI, README, test, or package-command reference was found for:

- `legacy-runtime.retired.js`
- `legacy-runtime.js`
- `legacy-runtime`
- `legacyApi`

Historical references to the former filename remain only in `server/REFACTOR_STATUS.md`.

### Startup And Deployment Dependency

No startup or deployment path depends on the retired file.

- `npm start` starts `server/app.js`.
- `npm run dev` and `npm run init-db` use `server/app.js`.
- PM2 starts `server/app.js`.
- GitHub Actions and deployment scripts use the active modular startup path.
- The application successfully started after the original `legacy-runtime.js` filename stopped existing.

### Syntax Check Impact

The current server JavaScript scan contains:

- 126 JavaScript files with `server/legacy-runtime.retired.js` present
- 125 JavaScript files if the retired file is later removed

Deleting the retired file would reduce the full server `node --check` count by exactly one file.

The retired file currently passes `node --check`.

### Retired File Reference Value

The retired file remains useful as a local parity and rollback reference:

- size: 106,223 bytes
- lines: 2,040
- SHA-256: `6DD176CF05462391B67FFCC5BEBB838BAB342D48A530B8785B0E42C1CD95C0CE`
- contains the former API dispatcher, auth/permission helpers, bootstrap aggregation, duplicate endpoint handlers, and `createClinovaServer`

This is useful when investigating subtle response-shape, validation, permission, or SQL parity questions during the first production validation cycle.

### Git Status And Recovery Risk

`server/legacy-runtime.retired.js` is currently untracked by Git.

Therefore, deleting it now would not be recoverable from the repository history unless another external copy or backup exists. This makes immediate deletion riskier than its runtime dependency graph suggests.

### Deletion Readiness Conclusion

From a runtime and deployment perspective, the retired file is ready for deletion:

- no imports
- no active references
- no startup dependency
- no route dependency
- the application already starts and operates without the original filename

From an operational rollback perspective, immediate deletion is not yet recommended because the file is untracked and still valuable as a parity reference.

### Risk Summary

| Action | Risk | Reason |
|---|---|---|
| Keep for one release | Low | Preserves rollback/parity reference with no runtime impact |
| Move to `docs/archive` later | Low | Removes dead JavaScript from the server tree while preserving the reference |
| Delete after final regression and confirmed backup | Low to Medium | Runtime-safe, but removes an untracked reference permanently |
| Delete immediately without backup/archive | Medium | No runtime dependency, but no Git recovery path |

### Safer Options

1. Keep the retired file for one production release and monitor logs/regressions.
2. Move it unchanged to a non-runtime archive location such as `docs/archive/legacy-runtime.retired.js`.
3. After a final full regression pass and confirmation that an archive or source-control copy exists, delete it in a dedicated step.

### Recommended Next Safe Step

SAFE STEP 96 should move the retired file out of the active server tree into a documentation/archive location only:

- move `server/legacy-runtime.retired.js` to `docs/archive/legacy-runtime.retired.js`
- preserve its content and SHA-256 exactly
- do not change active code, routes, imports, or scripts
- confirm the server JavaScript check count decreases from 126 to 125
- run full startup and representative endpoint parity validation

### Validation Results

`node --check` passed for all 126 JavaScript files under `server`, including `legacy-runtime.retired.js`.

`npm start` started successfully on test port `3135`, and the test job was stopped after validation.

Validated successfully:

- `GET /api/health` -> 200
- `GET /api/version` -> 200
- unauthenticated `GET /api/bootstrap` -> 401
- authenticated clinic-admin `GET /api/bootstrap` -> 200
- `GET /api/unknown` -> 404
- `GET /` -> 200
- clinic-admin representative endpoints returned non-500 results for users, clients, appointments, files, consents, search, reports, audit, feedback, CRM, invitations, message logs, catalog, gifts, and settings
- platform-owner login -> 200
- platform-owner `GET /api/platform/tenants` -> 200
- platform-owner `GET /api/tenant/domains` -> 200
- platform-owner `GET /api/system/export` -> 200
- platform-owner `GET /api/billing` -> 200

## SAFE STEP 96 - MOVE RETIRED LEGACY RUNTIME TO DOCS/ARCHIVE ONLY

### Scope

Archive-move only. No retired-file content, imports, routes, endpoint logic, auth/session/cookies, SQL, package scripts, or deployment files were changed.

### File Move

Moved:

- from `server/legacy-runtime.retired.js`
- to `docs/archive/legacy-runtime.retired.js`

The `docs/archive` directory was created because it did not previously exist.

### Content Integrity

SHA-256 before and after the move:

`6DD176CF05462391B67FFCC5BEBB838BAB342D48A530B8785B0E42C1CD95C0CE`

The hashes match exactly. The archived file content was not edited.

### Server Tree Result

The `server/` directory no longer contains:

- `legacy-runtime.js`
- `legacy-runtime.retired.js`

The archived reference remains available at `docs/archive/legacy-runtime.retired.js`.

### Runtime Reference Result

No active runtime, package script, deployment script, CI file, route, import, or endpoint references the archived file.

Historical references to legacy runtime names remain in this status document only.

### Production Risk

Risk is low:

- active runtime previously operated without the original legacy filename
- the file is now outside the active server JavaScript tree
- content remains preserved as a rollback/parity reference
- no runtime imports required changes

### Recommended Next Safe Step

SAFE STEP 97 should be a final modular backend production-readiness report only:

- confirm `server/` has no legacy runtime files or references
- document the active module map and startup path
- inspect remaining dead-code or duplicate-helper risks outside the archived artifact
- run a final broad regression checklist
- do not delete the archived reference yet

### Validation Results

- `server/` legacy runtime file count -> 0
- no runtime or external references to the archived file were found
- archived SHA-256 remains `6DD176CF05462391B67FFCC5BEBB838BAB342D48A530B8785B0E42C1CD95C0CE`
- server JavaScript file count decreased from 126 to 125
- `node --check` passed for all 125 JavaScript files under `server`
- `npm start` started successfully on test port `3136`
- the test server job was stopped after validation

Endpoint validation passed:

- `GET /api/health` -> 200
- `GET /api/version` -> 200
- unauthenticated `GET /api/bootstrap` -> 401
- authenticated clinic-admin `GET /api/bootstrap` -> 200
- `GET /api/unknown` -> 404
- `GET /` -> 200
- clinic-admin representative endpoints -> non-500 for clients, appointments, files, consents, message logs, gifts, settings, catalog, invitations, feedback, and CRM
- platform-owner login -> 200
- platform-owner tenant domains, platform tenants, system export, and billing endpoints -> 200

## SAFE STEP 97 - FINAL MODULAR BACKEND PRODUCTION-READINESS REPORT

### Scope

Final report-only review after removing legacy runtime from the active server tree and archiving it.

No code, routes, imports, endpoint logic, auth/session/cookies, SQL, package scripts, deployment files, or archive content were changed.

### Production Readiness Conclusion

The modular backend is ready for a controlled production deployment, subject to the regression and deployment checklists below.

All active HTTP behavior is owned by extracted route/controller/service/repository modules or shared HTTP/auth helpers. There is no active legacy dispatcher or legacy fallback in the runtime path.

This conclusion does not mean the backend is fully hardened. Destructive restore behavior, external WhatsApp side effects, filesystem-backed uploads, limited observability, and the lack of automated regression tests remain material operational risks.

### Final Architecture Summary

`server/app.js` is the active application bootstrap and routing coordinator:

- creates the Node HTTP server
- registers ordered modular route definitions
- dispatches matched API routes to module controllers
- returns shared `apiNotFound` for unmatched or declined API routes
- delegates non-API requests to shared static serving
- contains no legacy runtime import or fallback

The common module structure is:

- routes: HTTP method/path ownership only
- controllers: request parsing, permission checks, response writing
- services: validation, business rules, side effects, and audit calls
- repositories: database reads/writes and persistence mapping

Modules under `server/modules/` follow the same boundary where appropriate.

### Active Modules

| Module | Primary responsibility |
|---|---|
| Status | Health and version |
| Auth | Login, logout, current user |
| Account | Current-user password change |
| Signup | Disabled signup guard |
| Bootstrap | Authenticated application aggregation |
| Users | Clinic user CRUD |
| Invitations | Invitation list/create/preview/accept/revoke |
| Clients | Client CRUD and visibility |
| Appointments | Appointment CRUD and role visibility |
| Files | Client file list/upload/download/archive |
| Consents | Consent template upload/list/download/sign/archive |
| Search | Tenant-scoped global search |
| Reports | Tenant/role-scoped reporting |
| Audit | Audit log reading |
| Feedback | Public-token feedback and clinic feedback requests |
| CRM | CRM task/event reads and task CRUD |
| Billing | Clinic subscription/invoice administration |
| WhatsApp | Message logs and appointment/gift sending |
| Catalog | Categories and services |
| Gifts | Gift card CRUD |
| Settings | Clinic settings and tenant profile |
| Tenant Domains | Platform-owner tenant-domain management |
| Platform | Tenant read/update/provisioning, invoices, auto billing, admin password reset |
| System | Platform-owner database export and restore scheduling |

### Route Ownership Summary

| Route group | Active owner |
|---|---|
| `/api/health`, `/api/version` | Status module |
| `/api/login`, `/api/logout`, `/api/me` | Auth module |
| `/api/account/password` | Account module |
| `/api/signup` | Signup guard module |
| `/api/bootstrap` | Bootstrap module |
| `/api/users*` | Users module |
| `/api/invitations*` | Invitations module |
| `/api/clients*` | Clients module, with nested client files owned by Files |
| `/api/appointments*` | Appointments module, with WhatsApp send route owned by WhatsApp |
| `/api/client-files*`, `/api/clients/:id/files` | Files module |
| `/api/consents*` | Consents module |
| `/api/search` | Search module |
| `/api/reports*` | Reports module |
| `/api/audit*` | Audit module |
| `/api/public/feedback/*`, `/api/feedback` | Feedback module |
| `/api/crm`, `/api/crm-tasks*` | CRM module |
| `/api/billing*` | Billing module |
| `/api/message-logs`, appointment/gift WhatsApp routes | WhatsApp module |
| `/api/categories*`, `/api/services*` | Catalog module |
| `/api/gifts*` | Gifts module, except gift WhatsApp send |
| `/api/settings`, `/api/tenant` | Settings module |
| `/api/tenant/domains*` | Tenant Domains module |
| `/api/platform/*` | Platform module and platform submodules |
| `/api/system/export`, `/api/system/restore` | System module |
| unmatched `/api/*` | Shared API not-found handler |
| non-API paths | Shared static server |

### Legacy Runtime Status

The active `server/` tree contains no `legacy-runtime.js` or `legacy-runtime.retired.js`.

No runtime code, route, import, package command, deployment script, or CI path references legacy runtime.

The unchanged rollback/reference artifact is archived at:

`docs/archive/legacy-runtime.retired.js`

Archived SHA-256:

`6DD176CF05462391B67FFCC5BEBB838BAB342D48A530B8785B0E42C1CD95C0CE`

### Auth, Session, And Permission Structure

- Login/logout/current-user behavior is owned by Auth controller/service/repository.
- Sessions use signed `clinic_session` cookies and the `sessions` table.
- Cookies remain `HttpOnly`, `SameSite=Lax`, path `/`, and conditionally `Secure`.
- Active users are resolved using session ID, expiry, tenant ID, user ID, and `active = 1`.
- Clinic permissions are defined centrally in `repositories/permissions.repository.js`.
- `services/permissions.service.js` provides structured `requireUser`, `requirePermission`, and `requirePlatformOwner`.
- Shared compatibility auth helpers remain for parity-sensitive system/bootstrap boundaries.
- Platform owners are rejected from normal clinic permission APIs and use platform-specific APIs.
- Tenant filtering remains repository/service-owned and must stay part of every future query review.

### Database, Export, And Restore

- The database adapter supports SQLite and PostgreSQL behavior through the existing DB layer.
- Database initialization/migrations run through `server/app.js --init-db`.
- Backups and scheduled backups remain separate scripts.
- `GET /api/system/export` is platform-owner only, creates a backup, streams it with download headers, and audits the export.
- `POST /api/system/restore` is platform-owner only.
- Restore upload is supported for SQLite only; PostgreSQL returns the existing instruction to use `pg_restore`.
- SQLite restore validates multipart input and `PRAGMA integrity_check`, creates a safety backup, writes pending restore files, audits the action, responds, then schedules `process.exit(0)`.
- Pending restore application remains startup-owned by `server/db.js`.

### Static Serving

- Non-API requests are served by `server/shared/http/static-server.js`.
- `/` and `/index.html` serve the client application.
- Missing non-API paths fall back to `client/index.html` for SPA behavior.
- Known MIME types and `X-Content-Type-Options: nosniff` are preserved.
- Path traversal attempts are rejected.
- `/api/*` never falls through to static serving.

### Remaining Technical Debt

- `server/app.js` uses a long explicit module-dispatch chain; stable, but future modules require route registration and dispatch changes in two places.
- Permission/current-user behavior exists in both structured and compatibility helper forms; future hardening should consolidate only after parity tests exist.
- Plan catalogs and limit definitions are duplicated across several services/repositories.
- Bootstrap remains a large aggregation endpoint and may become a payload/performance bottleneck.
- Several modules use synchronous filesystem operations for uploads, consents, backup/export, and static serving.
- Local filesystem storage requires persistent/shared storage planning before multi-instance deployment.
- Some localized response strings appear encoding-sensitive and should be audited without changing response contracts casually.
- The archived legacy reference and `REFACTOR_STATUS.md` are currently untracked, so rollback/documentation preservation requires an explicit source-control policy.

### Remaining Production Risks

| Risk | Level | Required control |
|---|---|---|
| System restore | Very High | Platform-owner only, disposable-environment restore rehearsal, verified backups, maintenance window, restart supervision |
| WhatsApp sends | High | Use dry-run/fallback during validation, verify provider credentials and templates, monitor message logs and billing limits |
| File/consent upload and download | High | Verify persistent storage, permissions, upload limits, backup coverage, download headers, disk capacity |
| Lack of automated tests | High | Add API integration and permission/tenant-isolation tests before rapid feature development |
| Production monitoring/logging gaps | Medium to High | Add structured logs, error tracking, uptime checks, alerting, disk/DB/backup monitoring |
| Bootstrap payload/query growth | Medium | Measure response size/time and establish performance thresholds before optimization |
| SQLite multi-instance constraints | Medium to High | Keep one application instance for SQLite or move production scaling to PostgreSQL |

### Required Regression Checklist Before Deployment

- Run `node --check` for every JavaScript file under `server`.
- Run `npm run db:check`.
- Start with production-like environment variables on a staging/test port.
- Verify health, version, root static page, SPA fallback, and API 404.
- Verify no-cookie, invalid-cookie, and valid-session behavior.
- Verify login/logout/me for clinic admin, reception, therapist, and platform owner.
- Compare bootstrap keys and role visibility for all roles.
- Verify tenant isolation with at least two tenants.
- Verify users, invitations, clients, appointments, CRM, catalog, gifts, settings, billing, reports, audit, search, feedback, and tenant domains.
- Verify therapist client/appointment visibility.
- Verify files and consents upload/download/sign/archive on disposable records.
- Verify WhatsApp in dry-run/fallback mode only unless a real send is explicitly approved.
- Verify system export download and headers.
- Validate restore errors non-destructively; run a valid restore only on a disposable environment.
- Verify invalid nested API subpaths return the shared 404.
- Verify audit records for representative mutating actions.
- Verify backup creation, retention, disk space, and recovery instructions.

### Deployment Checklist

- Confirm `.env` secrets, `SESSION_SECRET`, `COOKIE_SECURE`, provider credentials, database URL/path, backup directory, upload directory, and upload limit.
- Confirm database and upload/consent storage backups exist.
- Confirm SQLite uses one app instance, or PostgreSQL is configured for multiple instances.
- Run backup before deployment.
- Run `npm ci --omit=dev`.
- Run `npm run init-db`.
- Run syntax and DB checks.
- Reload through PM2 using the existing deployment path.
- Confirm `/api/health`, login, bootstrap, and representative protected endpoints.
- Confirm PM2 app and backup scheduler status.
- Inspect PM2 error/output logs.
- Confirm monitoring and rollback owner/contact.
- Preserve `docs/archive/legacy-runtime.retired.js` until at least one stable production cycle completes.

### Recommended Next Safe Steps For Hardening

1. SAFE STEP 98 - Automated API regression test boundary and test-plan report only.
2. SAFE STEP 99 - Add non-destructive integration tests for auth, permissions, tenant isolation, 404 boundaries, and representative reads.
3. SAFE STEP 100 - Production observability and alerting boundary report covering structured logs, error tracking, uptime, backup failures, disk usage, and WhatsApp failures.
4. Add disposable-environment restore rehearsal automation.
5. Add filesystem persistence/capacity checks for uploads, consents, and backups.
6. Establish bootstrap latency and payload-size baselines before any optimization.

### Final Validation Results

- `node --check` passed for all 125 JavaScript files under `server`.
- `npm run db:check` passed for the active SQLite database.
- `npm start` started successfully on test port `3137`.
- The test server job was stopped after validation.

Core behavior passed:

- health -> 200
- version -> 200
- login -> 200
- `/api/me` -> 200 for clinic admin and platform owner
- unauthenticated bootstrap -> 401
- authenticated bootstrap -> 200 for clinic admin and platform owner
- unknown API -> 404
- root static page -> 200
- disabled signup -> 403
- unauthenticated account password change -> 401
- authenticated invalid account password body -> 400

Representative module reads passed with expected non-error behavior:

- users
- clients
- appointments
- client files
- consents
- message logs
- gifts
- settings
- tenant domains
- platform tenants
- system export
- catalog categories/services
- billing
- invitations
- feedback
- CRM
- reports
- audit
- search

Invalid nested paths returned 404 for representative clients, appointments, consents, catalog, gifts, tenant domains, CRM tasks, billing invoices, invitations, and public feedback paths.

System permission behavior passed:

- unauthenticated system export -> 401
- clinic-admin system export -> 403
- platform-owner system export -> 200
- unauthenticated system restore -> 401
- clinic-admin system restore -> 403
- platform-owner invalid restore body -> 400

Restore validation was non-destructive:

- no valid restore was submitted
- `backups/pending-restore.sqlite` did not exist before or after validation
- `backups/pending-restore.json` did not exist before or after validation

No real WhatsApp send, file mutation, consent mutation, password change, tenant creation, invoice creation, or valid restore was performed.

## SAFE STEP 98 - AUTOMATED API REGRESSION TEST BOUNDARY AND TEST PLAN

### Scope

Report-only planning step before adding automated API regression tests.

No test files, packages, package scripts, code, routes, database records, auth/session/cookies, or application behavior were changed.

### Current Test Tooling

- The project requires Node.js 22 or newer.
- No project-owned automated test files or configured test runner currently exist.
- `package.json` has no `test` script.
- Existing validation relies on `node --check`, `npm run db:check`, test-port startup, and manual/API smoke scripts.
- Node 22 already provides the required minimal test primitives: `node:test`, `node:assert`, `fetch`, `FormData`, `Blob`, child processes, and filesystem utilities.

### Recommended Test Framework

Use the Node built-in test runner as the first framework:

- `node:test` for suites, tests, hooks, and concurrency control
- `node:assert/strict` for assertions
- built-in `fetch`, `FormData`, and `Blob` for HTTP and multipart requests
- `node:child_process` to start `server/app.js` with isolated environment variables
- built-in filesystem APIs for temporary databases, uploads, backups, and fixture cleanup

This approach adds no dependency and matches the current no-framework Node.js architecture.

Do not add Supertest initially because the application currently starts as a concrete HTTP server rather than exporting an app/server factory. Black-box HTTP tests against a child process provide more production-realistic coverage without refactoring startup code.

### Test Environment Strategy

Every automated suite must use an isolated disposable environment:

- unique temporary root created with `mkdtemp`
- `DATABASE_PATH=<temp>/data/clinic.sqlite`
- no `DATABASE_URL`, forcing disposable SQLite
- `UPLOAD_DIR=<temp>/uploads`
- `BACKUP_DIR=<temp>/backups`
- `BACKUP_ENABLED=false`
- `BACKUP_RUN_ON_START=false`
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- `COOKIE_SECURE=false`
- unique strong test-only `SESSION_SECRET`
- dynamically selected test port
- child process running `node server/app.js`

The harness must reject startup if any resolved database/upload/backup path points outside its temporary root.

Never run automated mutation tests against the default `data/clinic.sqlite`, a configured PostgreSQL URL, production uploads, or production backups.

### Seed And Fixture Strategy

Use the existing SQLite initialization/seed behavior for the initial test tenant and users, then create additional test-specific records through APIs or deterministic fixture SQL against the disposable DB.

Required users:

| Fixture | Purpose |
|---|---|
| Platform owner | Platform routes, billing, domains, export, forbidden clinic APIs |
| Clinic admin | Full clinic administration and mutation coverage |
| Reception | Reception visibility and permission coverage |
| Therapist A | Assigned client/appointment visibility |
| Therapist B | Cross-therapist visibility denial |
| Inactive user | Session/user-active rejection |

Required data:

- at least two tenants for tenant-isolation tests
- one sample clinic admin per tenant
- categories and services
- clients assigned to different therapists
- appointments assigned to different therapists and statuses
- CRM task and event data
- one consent template PDF and disposable signature input
- one disposable client file
- one gift card
- one pending invitation and token
- one feedback request and public token
- billing/subscription and invoice fixtures
- message log fixture
- audit rows generated through representative mutations

All IDs and tokens created by tests must be captured by the fixture layer instead of assuming production-like fixed IDs.

### Test Safety Classes

| Class | Meaning | Execution policy |
|---|---|---|
| Safe read | No persistent mutation | Run on every test/CI pass |
| Disposable mutation | Writes only inside isolated SQLite/temp folders | Run on every full regression pass |
| External side effect | May contact WhatsApp/provider or external service | Mock, force fallback/dry-run, or skip |
| Process/destructive | Restore, process exit, direct DB replacement | Separate disposable-process suite only |

### Test Categories And Required Coverage

#### Health, Version, Static, And API Fallback

- `GET /api/health` returns 200 and expected check shape.
- `GET /api/version` returns 200 and package version.
- `GET /` and `/index.html` return the client application.
- existing static assets return expected status/content type.
- missing non-API paths return SPA index.
- traversal attempts preserve current 403 behavior.
- unmatched GET/POST `/api/*` return the shared 404 body exactly.

#### Auth, Session, And Permissions

- successful login for clinic admin, reception, therapist, and platform owner.
- invalid credentials return exact 401 body.
- login throttling behavior is tested in an isolated process.
- `/api/me` with valid sessions returns expected user shape without password hash.
- no cookie, malformed cookie, invalid signed token, missing session, expired session, and inactive user return exact unauthorized behavior.
- logout invalidates the current session and clears the cookie.
- clinic roles cannot use platform-owner endpoints.
- platform owner cannot use clinic permission APIs.
- reception/therapist forbidden operations return exact 403 behavior.

#### Account Password

- unauthenticated password change returns 401.
- invalid/short/wrong-current-password cases preserve validation responses.
- valid change works only on a disposable test user.
- old password stops working, new password works, and sessions are invalidated as currently designed.
- restore the fixture state by recreating/resetting the disposable DB, not by relying on production passwords.

#### Signup Guard

- `POST /api/signup` always returns the exact disabled 403 response.
- verify no tenant/user/subscription rows are created.

#### Bootstrap By Role

- exact response key set and key order for clinic admin, reception, therapist, and platform owner.
- user/tenant/billing/platformTenants behavior by role.
- tenant isolation and therapist filtering for clients, appointments, and CRM.
- counts and representative IDs match direct module endpoints.
- invitations, audits, message logs, feedback, gifts, and consent lists preserve role visibility.
- unauthenticated/invalid-session bootstrap returns exact 401.

#### Users And Invitations

- users CRUD validation, tenant filtering, roles, status, password hashing exclusion, and audit writes.
- billing user limit behavior.
- invitation list/create/preview/accept/revoke.
- public token expiry, used-token, invalid-token, duplicate-user, password validation, session behavior, and invite URL proxy headers.
- verify cross-tenant invitation access is denied.

#### Clients And Appointments

- clients CRUD, duplicate/search behavior, soft archive, tenant isolation, therapist visibility, and audit rows.
- client billing limit behavior.
- appointments CRUD, conflict rules, status/payment fields, date/time preservation, therapist visibility, archive/cancel behavior, and audit rows.
- appointment/client side effects and CRM events where currently expected.
- cross-tenant IDs never expose or mutate records.

#### Files And Consents

- multipart upload validation, allowed and rejected MIME types, maximum size, filename handling, stored path, DB record, and audit row.
- file list visibility, download body/content type/content disposition, missing file, cross-tenant access, therapist visibility, and archive behavior.
- consent template upload/list/download/archive.
- consent signing with disposable PDF/signature fixture, generated file/signature records, relation to client files, and audit row.
- use only isolated upload/temp directories and clean them after the suite.

#### Catalog, Gifts, CRM, Feedback

- categories/services CRUD, duplicate validation, archive/deactivate behavior, and active filtering.
- gift create/update/list calculations and status behavior.
- CRM list/task create/update, assigned-user behavior, role visibility, and events.
- clinic feedback list/create behavior.
- public feedback valid/invalid/used token behavior.
- feedback WhatsApp coupling must run only with fallback/dry-run configuration.

#### Settings, Tenant Domains, Billing, And Platform

- settings/tenant read and update permissions, allowed fields, response shapes, and audit rows.
- tenant domains CRUD, numeric route boundary, duplicate/domain validation, primary/status behavior, and platform-owner restriction.
- clinic billing reads/mutations, invoice validation, limits, and audit rows.
- platform tenant list/read shape.
- platform tenant update with reversible disposable data.
- platform provisioning on disposable DB, verifying all created records.
- platform admin password reset on disposable tenant/admin only.
- manual invoices and auto billing with captured IDs and deterministic cleanup.
- platform-owner and non-platform-owner permission matrix.

#### WhatsApp And Message Logs

- message log reads and permission behavior.
- appointment/gift send endpoints with missing records and invalid auth.
- safe send tests must set `WHATSAPP_ENABLED=false` or `WHATSAPP_DRY_RUN=true`.
- assert fallback/dry-run response, message-log status, billing limit behavior, template rendering, and audit row.
- never contact the real provider in standard regression or CI.

#### Reports, Audit, And Search

- reports permissions, date filters, therapist visibility, aggregations, response shapes, and tenant isolation.
- audit read permission, ordering, parsed details, and tenant isolation.
- search minimum term, client name/phone, appointment/service matching, role visibility, result limits, order, and response shape.

#### System Export

- unauthorized -> exact 401.
- clinic admin -> exact 403.
- platform owner -> 200 with expected content type, disposition, content length, and non-empty valid SQLite backup.
- export operates only on disposable DB and stores generated backups under disposable backup directory.
- verify audit row.

#### System Restore

Standard regression and CI run non-destructive cases only:

- unauthorized -> 401.
- clinic admin -> 403.
- platform owner invalid content type/missing multipart boundary -> current 400.
- multipart without `backup` -> current 400.
- PostgreSQL-mode behavior should be tested separately with a mocked/configured environment, without connecting to production.
- assert no pending restore files and no process exit for rejected requests.

A valid restore requires a separate disposable-process suite:

- create disposable SQLite DB and export
- start a dedicated child process
- submit valid restore
- assert response and process exit
- assert pending files
- restart and verify application of restore
- discard the complete temporary root

Do not run valid restore tests in the default CI job until process lifecycle isolation is reliable.

#### Invalid Subpath 404 Matrix

Automate GET/POST/PUT/DELETE invalid nested path cases for every broad resource:

- clients and nested files
- appointments and WhatsApp precedence
- consents
- categories/services
- gifts
- CRM tasks/events
- billing invoices
- invitations/token paths
- public feedback token paths
- settings/tenant/domains
- platform routes
- message logs

Assert exact 404 status/body and verify no list endpoint or mutation accidentally executes.

### Endpoints To Mock, Force Safe Mode, Or Skip

| Area | Standard suite action |
|---|---|
| Real WhatsApp provider | Never call; force disabled/fallback or dry-run |
| Valid system restore | Skip in standard suite; dedicated disposable-process suite only |
| Production database/uploads/backups | Hard fail if paths resolve outside temporary root |
| Production tenant provisioning/invoices/password reset | Use disposable DB only |
| Destructive delete/archive tests | Use suite-created fixture records only |
| PostgreSQL integration | Separate opt-in job using disposable PostgreSQL container/database |

### Proposed Test File Structure

```text
test/
  api/
    status-static.test.js
    auth-session.test.js
    account-signup.test.js
    bootstrap-roles.test.js
    users-invitations.test.js
    clients-appointments.test.js
    files-consents.test.js
    catalog-gifts.test.js
    crm-feedback.test.js
    settings-domains.test.js
    billing-platform.test.js
    whatsapp-message-logs.test.js
    reports-audit-search.test.js
    system-export.test.js
    api-not-found.test.js
  destructive/
    system-restore.disposable.test.js
  fixtures/
    seed.js
    sample-consent.pdf
    sample-upload.txt
  helpers/
    test-environment.js
    server-process.js
    api-client.js
    auth-sessions.js
    database-assertions.js
```

No files should be created until an explicit implementation step.

### Minimum First Automated Test Batch

The first implementation batch should be read-heavy and non-destructive:

1. Start/stop isolated server with disposable SQLite/uploads/backups.
2. Health, version, root static page, SPA fallback, and API 404.
3. Signup guard exact 403.
4. Auth login/me/logout plus unauthenticated and invalid-cookie behavior.
5. Bootstrap unauthenticated and authenticated clinic-admin/platform-owner key checks.
6. Permission checks for one clinic endpoint and one platform endpoint.
7. Representative read endpoints: clients, appointments, categories, services, settings, reports, audit, search, platform tenants.
8. Invalid subpath 404 matrix for the currently hardened route groups.

This batch proves the harness, isolation, session-cookie handling, route ownership, and safe CI execution before mutation/upload tests are added.

### Full Regression Implementation Order

| Order | Batch | Risk |
|---|---|---|
| 1 | Harness, status/static, auth/session, bootstrap, reads, 404 matrix | Low |
| 2 | Permissions/tenant isolation across roles and two tenants | Medium |
| 3 | Users, invitations, clients, appointments, catalog, gifts, CRM mutations | Medium |
| 4 | Files and consents with isolated filesystem fixtures | Medium to High |
| 5 | Settings, domains, billing, platform provisioning/invoices/password reset | High |
| 6 | WhatsApp fallback/dry-run and feedback coupling | High |
| 7 | System export and non-destructive restore validation | High |
| 8 | Disposable valid restore lifecycle suite | Very High |
| 9 | Optional disposable PostgreSQL parity job | High |

### Full Regression Checklist

- exact statuses and important body shapes
- exact unauthorized/forbidden bodies for auth-sensitive routes
- cookie creation, invalidation, expiry, and session-table behavior
- password hashes never returned
- tenant isolation for reads and writes
- admin/reception/therapist/platform-owner permission matrix
- therapist visibility
- audit rows for representative mutations
- billing limits and plan behavior
- bootstrap keys/order/counts/role filtering
- upload/download headers and filesystem cleanup
- public token behavior for invitations and feedback
- WhatsApp fallback/dry-run with no network send
- system export validity
- restore rejection with no pending files
- invalid route matrix returns exact 404
- no test-created data or files remain after suite cleanup

### CI And Deployment Recommendation

Initial CI job:

1. install with `npm ci`
2. run server `node --check`
3. run the first non-destructive built-in test batch against disposable SQLite/temp folders
4. fail on any external WhatsApp configuration or non-temporary database/upload/backup path
5. upload test logs only; never upload database exports containing sensitive fixture data unless explicitly sanitized

Later CI jobs:

- full disposable SQLite mutation suite
- opt-in disposable restore lifecycle suite
- optional disposable PostgreSQL parity suite

Deployment should require the non-destructive regression job to pass before the existing deploy job runs.

### Risks And Exclusions

- No automated tests exist yet; this plan itself does not reduce regression risk until implemented.
- Starting the concrete server as a child process can leave processes running if teardown is incorrect; the harness must track and terminate only its own PID.
- Test environment isolation is the highest-priority safety control.
- Valid restore tests can terminate the server process and replace the DB; keep them separate.
- WhatsApp credentials must never be available to standard CI tests.
- File/consent tests must guard against paths outside the temporary root.
- Timing-sensitive login throttling, session expiry, and process-exit behavior may require isolated suites.

### Recommended Next Safe Step

SAFE STEP 99 should implement the minimum first automated test batch only using Node's built-in test runner:

- add no third-party packages
- use disposable SQLite/uploads/backups
- cover status/static, auth/session, signup guard, bootstrap basics, representative reads, permissions, and 404 boundaries
- do not add mutation-heavy, upload, WhatsApp-send, or restore-success tests yet

### Step 98 Validation Results

- `node --check` passed for all 125 JavaScript files under `server`.
- `npm run db:check` passed for the current SQLite database.
- `npm start` started successfully on test port `3138`.
- `GET /api/health` -> 200
- `GET /api/version` -> 200
- unauthenticated `GET /api/bootstrap` -> 401
- `GET /api/unknown` -> 404
- the test server job was stopped after validation

## SAFE STEP 108 -- FINAL VALIDATION AND 500-ERROR AUDIT REPORT

### Scope And Method

This step changed no runtime code, routes, tests, validation, authentication, sessions, cookies, or SQL. The audit reviewed active controllers, services, repositories, and the current Node test suite. Targeted bad-input probes were run only against disposable SQLite databases and temporary upload/backup folders. No real WhatsApp send or valid restore was performed.

### Validation Fixes Already Completed

- Invalid JSON bodies are consistently converted to `400 { "error": "Invalid JSON body" }` by the tested mutable controllers.
- Unknown API paths and hardened malformed nested paths return the shared generic API `404`.
- Non-numeric IDs now return the generic `404` for:
  - `/api/clients/:id`
  - `/api/appointments/:id`
  - `/api/categories/:id`
  - `/api/services/:id`
  - `/api/crm-tasks/:id`
- Platform invoice `amount` now rejects non-numeric, non-finite, empty-string, `null`, and invalid-type values with `400 { "error": "Valid invoice amount is required." }`.
- Platform invoice creation still returns `404` for a missing tenant.
- File and consent uploads reject missing multipart boundaries/files, and upload size limits return `413`.
- Restore rejects missing multipart boundaries and multipart requests without a `backup` file.
- Platform, clinic, role, session, and unauthenticated permission boundaries have automated negative coverage.

### Current Negative Test Coverage

The current `npm run test:api` suite contains 24 passing top-level tests and covers:

- invalid password, unknown user, invalid session cookie, logout invalidation, and disabled signup
- clinic role versus platform-owner permission separation
- invalid JSON for clients, appointments, categories, services, gifts, CRM tasks, invitations, feedback, and tenant domains
- invalid platform provisioning, invoice status update, password reset, and invoice amount
- missing and invalid file/consent multipart inputs
- missing and invalid restore body without performing a valid restore
- malformed nested paths and the currently hardened non-numeric ID routes
- isolated CRUD, upload/download, provisioning, invoice, password-reset, and no-op auto-billing regression flows

There are no remaining `TODO`, skipped, or `.skip` markers in `server/tests`.

### Confirmed Remaining 500 Responses On Bad Input

All entries below were reproduced against disposable SQLite only.

| Area / Endpoint | Bad input | Current result | Risk |
|---|---|---:|---|
| `POST /api/system/restore` | multipart `backup` containing a non-SQLite file | `500`, raw `file is not a database`; uploaded file remains under `restore-uploads` | High |
| `POST /api/clients` | missing required client fields | `500`, SQLite binding error | High |
| `POST /api/categories` | missing `name` | `500`, SQLite binding error | High |
| `POST /api/services` | missing required service fields | `500`, SQLite binding error | High |
| `POST /api/users` | valid username/password but missing required name/role fields | `500`, SQLite binding error | High |
| `POST /api/appointments` | missing required fields | `500`, SQLite binding error | High |
| `POST /api/appointments` | non-numeric `paidAmount` | `500`, database constraint error | High |
| `POST /api/appointments` | invalid appointment `status` | `500`, database check-constraint error | High |
| `POST /api/gifts` | non-numeric `sessions` | `500`, database constraint error | Medium |
| `POST /api/crm-tasks` | nonexistent `assignedTo` user | `500`, foreign-key error | Medium |
| `PUT /api/platform/tenants/:id` | non-numeric `billingDay` | `500`, database constraint error | High |
| `POST /api/platform/tenants/:id/invoices` | invalid `periodStart` when derived dates are needed | `500`, `Invalid time value` | High |
| `POST /api/billing/invoices` | non-numeric amount | `500`, database constraint error | High |
| `POST /api/billing/invoices` | invalid `periodStart` when derived dates are needed | possible `500`, `Invalid time value` | High |

The global server error handler currently returns `error.message` in the JSON response. Database binding, foreign-key, and constraint messages can therefore be exposed to authenticated callers when these validation gaps produce `500`.

### Remaining Validation Gaps That Do Not Currently Produce 500

| Area | Current behavior | Risk |
|---|---|---|
| `GET /api/users/not-a-number` | returns the users list with `200` | Medium route-boundary risk |
| `GET /api/consents/not-a-number` | returns the consent list with `200` | Medium route-boundary risk |
| Platform auto-billing `runDate` | regex-valid but impossible calendar dates such as `2030-99-99` return `200` | Medium |
| Appointment `date` and `time` | arbitrary text can be persisted if relational fields are valid | Medium |
| CRM task `dueDate` | arbitrary text can be persisted | Low to Medium |
| Billing `currentPeriodEnd` and supplied invoice dates | arbitrary text can be persisted when no date calculation is triggered | Medium |
| Gift update `status` | arbitrary status text is accepted | Medium |
| CRM invalid status | silently defaults to `open` | Low |
| Tenant-domain invalid status | silently defaults to `pending` | Low |
| Appointment invalid payment status | silently defaults to `unpaid` | Low |
| Client stage/source | arbitrary strings are accepted | Low to Medium |
| Category/service/client/appointment archive or update for some missing IDs | may return success despite no affected record | Low semantic-consistency risk |

### Multipart, File, Consent, And Restore Risks

- Missing multipart boundaries/files and upload limits have appropriate `400/413` behavior.
- File and consent type validation trusts the supplied multipart MIME type; PDF content is not structurally validated.
- File and consent upload services write the physical file before completing the database insert. A later database failure can leave an orphan file.
- Archiving a client file or consent hides the record but does not remove the physical file, which can grow storage usage over time.
- A malformed signature value that starts with `data:image/` is not fully validated before signature persistence/PDF processing. PDF/image processing errors may produce `500`, and partial records are possible because the flow is not transactional.
- Invalid SQLite restore content is written to `backups/restore-uploads` before integrity validation. When SQLite rejects the file, the endpoint currently returns `500` and leaves the uploaded file behind. No pending restore file is created in this failure case.

### Remaining Automated Test Gaps

- Required-field validation matrices for client, category, service, user, appointment, gift, and CRM task creation
- Numeric validation for appointment `paidAmount`, gift `sessions`, platform `billingDay`, and non-platform `/api/billing/invoices` amount
- Calendar-valid date checks for appointments, billing invoices, subscription periods, CRM due dates, and auto-billing run dates
- Non-numeric ID boundaries for users and consents
- Invalid SQLite restore content expecting a controlled `400` plus cleanup of `restore-uploads`
- Structurally invalid PDF and spoofed MIME upload behavior
- Malformed-but-prefixed consent signature data and atomic rollback behavior
- Missing-record update/archive status consistency
- Real auto-billing invoice creation remains intentionally untested; current coverage uses deterministic `not_due`
- Valid restore, real WhatsApp sends, and non-disposable external database behavior remain intentionally excluded

### Suggested Safe Fix Order

1. **SAFE STEP 109 -- Restore invalid-file handling only:** convert invalid SQLite backup errors to controlled `400`, remove failed restore-upload files, and ensure no pending files are created.
2. **SAFE STEP 110 -- Required-field validation for core creates only:** clients, categories, services, users, and appointments.
3. **SAFE STEP 111 -- Numeric validation only:** appointment `paidAmount`, gift `sessions`, platform `billingDay`, and `/api/billing/invoices` amount.
4. **SAFE STEP 112 -- Date validation only:** platform/manual invoices, auto-billing `runDate`, appointments, subscription periods, and CRM due dates.
5. **SAFE STEP 113 -- Remaining ID boundary tightening only:** users and consents.
6. **SAFE STEP 114 -- Enum/status validation consistency only:** appointments, gifts, CRM, tenant domains, and payment statuses.
7. **SAFE STEP 115 -- Upload/signature atomicity and cleanup report, followed by a separate implementation step.**

Each fix should retain current valid-request behavior and add isolated regression tests before moving to the next category.

### Production Deployment Blocking Conclusion

The modular route ownership, authentication boundaries, core valid workflows, isolated CRUD, platform workflows, uploads/downloads, and CI regression suite are healthy. There is no evidence of an unauthenticated privilege bypass or data-isolation failure in the audited paths.

However, the remaining invalid-input `500` responses are production-hardening concerns. The two highest-priority areas are:

1. invalid restore uploads returning `500` and leaving files behind
2. common core-create endpoints returning raw SQLite errors for missing required fields

For a controlled deployment with trusted clinic/platform operators, these issues do not strictly block deployment, but they should be treated as release-gating fixes before broad or public production rollout. A deployment standard requiring all user-controlled invalid input to return controlled `4xx` responses should consider the current High-risk entries blocking.

### Step 108 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`
- confirm no temporary test processes or directories remain
- do not run valid restore or real WhatsApp sends

## SAFE STEP 115 — UPDATE PAYLOAD REQUIRED-FIELD BOUNDARY REPORT

### Scope And Method

This step inspected update-style endpoints only. No code, tests, routes, validation, auth/session/cookie behavior, SQL, or schema were changed.

Reviewed files included:

- `server/services/clients.service.js`
- `server/services/appointments.service.js`
- `server/modules/catalog/catalog.service.js`
- `server/modules/gifts/gifts.service.js`
- `server/services/crm.service.js`
- `server/services/users.service.js`
- `server/services/settings.service.js`
- `server/services/tenant-domains.service.js`
- `server/services/billing.service.js`
- `server/modules/platform/platform.service.js`
- `server/modules/platform/platform-invoices.service.js`

### Update Payload Boundary Matrix

| Endpoint | Create required fields | Update model | Optional update fields | Empty-body behavior today | Existing validation | Remaining missing/malformed risk | Risk | Recommended fix order |
|---|---|---|---|---|---|---|---|---|
| `PUT /api/clients/:id` | `fname`, `lname`, `phone` | Full replace with partial CRM field carry-over only | `email`, `therapistId`, `stage`, `source`, `tags`, `notes` | Existing client can be updated with `fname`, `lname`, `phone` as `undefined`; may hit DB binding/constraint behavior or corrupt required fields depending DB adapter | ID route boundary; client existence; create required fields | Missing `fname`/`lname`/`phone`; malformed `therapistId`; arbitrary `stage` | High | 1 |
| `PUT /api/appointments/:id` | admin/reception: `clientId`, `serviceId`, `therapistId`, `date`, `time`; therapist omits `therapistId` | Full replace | `status`, `paymentStatus`, `paidAmount`, `notes` | Empty body builds appointment with missing client/service/date/time and default `pending`; can reach conflict/SQL with bad state or 500 | Numeric/date/enum validation only when fields are present | Missing required replace fields; missing relation IDs; malformed omitted fields are not caught because omission is treated as default/undefined | High | 2 |
| `PUT /api/categories/:id` | `name` | Full replace for `name` | none | Writes `name = undefined`; likely DB binding/constraint error | Route boundary only | Missing/empty `name`; no missing-record affected-row check | High | 3 |
| `PUT /api/services/:id` | `name`, `categoryId`, `duration`, `price` | Full replace | `active` | Empty body writes `name/categoryId/duration/price = undefined`; likely DB binding/constraint error | Numeric validation for provided `categoryId`, `duration`, `price` | Missing required replace fields; `name` missing/empty; missing-record affected-row consistency | High | 4 |
| `PUT /api/gifts/:id` | create does not require core fields; generated `code` plus optional `sessions` | Status-only update | `status` | Empty body sets status to `active` | Status enum validation for explicit status | Empty body intentionally reactivates/keeps active; no affected-row/missing gift check | Low | Later semantic cleanup |
| `PUT /api/crm-tasks/:id` | `clientId` must reference existing client; defaults title/type/priority/status | Full replace of editable task fields after task existence | `assignedTo`, `type`, `title`, `dueDate`, `status`, `priority`, `notes` | Empty body changes task to `assignedTo=current user`, `type=follow_up`, `title=Follow up`, `status=open`, `priority=normal`, `dueDate=null` | Due date, status, priority; task existence | Potential unintended reset on empty/partial updates; `assignedTo` not validated; `type` remains free-form | Medium | 7 |
| `PUT /api/users/:id` | `username`, `password`, `name`, `role`; optional email/title/workdays/serviceIds/active | Full replace except email fallback to current email | `email`, `title`, `workdays`, `serviceIds`, `active`, `password` | Empty body can write `username/name/role = undefined`; likely DB binding/constraint/check error | User existence; platform-owner guard; role enum if provided | Missing `username`, `name`, `role`; malformed `active`; malformed array fields default to `[]` | High | 5 |
| `PUT /api/settings` | no create endpoint; key/value settings upsert | Partial update by allowed keys | Any allowed setting key | Empty body is no-op plus audit and returns settings | Allowed-key filtering | Malformed values accepted as strings by design; no high-risk missing required fields | Low | No immediate fix |
| `PUT /api/tenant` | no create endpoint here | Full replacement of tenant name/billingEmail with defaults | `name`, `billingEmail` | Empty body renames tenant to `Clinova Clinic` and clears billing email | None | Empty body can unintentionally reset tenant profile; malformed email not validated | Medium | 8 |
| `PUT /api/tenant/domains/:id` | `domain` for create | Status/primary update | `status`, `isPrimary` | Empty body sets status to `pending`, `isPrimary=false` | Domain existence; status enum if explicit | Empty body can demote/reset status to `pending`; `isPrimary` malformed values silently false | Medium | 9 |
| `PUT /api/billing` | no create endpoint here; save creates/updates subscription | Full save | `currentPeriodEnd`, `autoBillingEnabled` not used here | Empty body returns `400` with `Valid plan and status are required.` | Plan/status/date validation | Empty body safe; malformed boolean-like fields not relevant | Low | No immediate fix |
| `PUT /api/billing/invoices/:id` | invoice create allows default amount/dates/status | Status-only update | `status` only | Empty body returns `400` with `Valid invoice and status are required.` | Status enum; invoice existence after status validation | Empty body safe; missing invoice with invalid/missing status returns 400 before 404 by current design | Low | No immediate fix |
| `PUT /api/platform/tenants/:id` | platform provisioning requires clinic/admin fields | Full billing/subscription save | `billingDay`, `autoBillingEnabled` | Empty body returns `400` with `Valid tenant, plan, and status are required.` | Plan/status/billingDay; tenant existence after validation | Empty body safe; `autoBillingEnabled` malformed values silently false by existing behavior | Low | No immediate fix |
| `PUT /api/platform/invoices/:id` | platform invoice create allows default amount/dates/status | Status-only update | `status` only | Empty body returns `400` with `Valid invoice and status are required.` | Status enum; invoice existence after status validation | Empty body safe; missing invoice with invalid/missing status returns 400 before 404 by current design | Low | No immediate fix |

### Required Fields: Create Versus Update

The highest-risk pattern is that several update handlers behave like full replacement but do not repeat create-style required-field validation:

- `clients`: create requires `fname`, `lname`, `phone`; update also writes those columns but does not require them.
- `appointments`: create requires relation IDs plus `date`/`time`; update writes the same fields but only validates values if present.
- `categories`: create requires `name`; update writes `name` but does not require it.
- `services`: create requires `name`, `categoryId`, `duration`, `price`; update writes all four but only validates numeric fields if present.
- `users`: create requires `username`, `password`, `name`, `role`; update writes `username`, `name`, `role` but does not require them.

Endpoints that are intentionally partial or status-only are lower risk:

- `settings` is an allowed-key partial upsert.
- `billing`, `platform tenants`, and invoice status endpoints already return controlled `400` for empty bodies.
- `gifts`, `tenant domains`, and CRM tasks are not likely to throw on empty bodies, but they can reset state unintentionally.

### Empty-Body Behavior Summary

| Empty body result | Endpoints |
|---|---|
| Likely DB error or unsafe required-field write | `PUT /api/clients/:id`, `PUT /api/appointments/:id`, `PUT /api/categories/:id`, `PUT /api/services/:id`, `PUT /api/users/:id` |
| Controlled `400` today | `PUT /api/billing`, `PUT /api/billing/invoices/:id`, `PUT /api/platform/tenants/:id`, `PUT /api/platform/invoices/:id` |
| No-op or benign partial update | `PUT /api/settings` |
| Successful but potentially surprising reset/default | `PUT /api/gifts/:id`, `PUT /api/crm-tasks/:id`, `PUT /api/tenant`, `PUT /api/tenant/domains/:id` |

### Malformed Values Already Covered

- Numeric validation: services numeric fields, appointment relation IDs and paid amount, platform billing day.
- Date/time validation: appointments, CRM due date, billing current period end, invoice dates.
- Enum/status validation: appointment status/payment status, gift status, CRM status/priority, user role, tenant plan/status, invoice status, tenant domain status.
- ID route boundary validation: non-numeric resource paths now return the generic API 404 for audited ID routes.

### Remaining Validation Gaps

| Area | Gap | Risk |
|---|---|---|
| Client update | Missing required fields; malformed `therapistId`; arbitrary `stage` | High |
| Appointment update | Missing required full-replace fields; relation IDs can be omitted and become undefined/defaults | High |
| Category update | Missing `name` can reach repository | High |
| Service update | Missing full-replace fields can reach repository despite numeric checks only covering provided fields | High |
| User update | Missing `username`, `name`, or `role`; `active` remains loose boolean coercion | High |
| CRM task update | Empty/partial payload resets several fields; `assignedTo` not validated | Medium |
| Tenant profile update | Empty body resets tenant name and billing email | Medium |
| Tenant domain update | Empty body resets status to `pending`; malformed `isPrimary` silently false | Medium |
| Gift update | Empty body sets status to `active`; no affected-row/missing gift check | Low |

### Recommended Fix Order

1. **Clients update required fields only:** require `fname`, `lname`, and `phone` for `PUT /api/clients/:id`; add optional numeric validation for `therapistId` if supplied.
2. **Appointments update required fields only:** mirror create required fields for full replacement in `PUT /api/appointments/:id`, preserving therapist role behavior.
3. **Catalog category update:** require `name` on `PUT /api/categories/:id`.
4. **Catalog service update:** require `name`, `categoryId`, `duration`, and `price` for full replacement, keeping existing numeric validation.
5. **Users update required fields:** require `username`, `name`, and `role`; preserve optional password behavior.
6. **Missing-record affected-row report/fix:** separately audit update/archive endpoints that return success when no row was changed.
7. **CRM task update semantics report:** decide whether `PUT /api/crm-tasks/:id` should remain full replacement with required fields or become true partial update.
8. **Tenant profile empty-body guard:** decide whether empty `PUT /api/tenant` should no-op or return `400` instead of resetting defaults.
9. **Tenant domain/gift default-reset cleanup:** decide whether empty status updates should no-op or return `400`.

### Manual Validation Checklist For Future Fix Steps

- Empty body for each fixed `PUT` endpoint returns controlled `400`.
- Valid full update payload still succeeds with the same response shape.
- Existing CRUD regression tests remain green.
- Missing numeric resource IDs retain current 404 behavior.
- Auth/permission responses remain unchanged.
- No destructive tests against development or production data.

### Step 115 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 115 directories remain
- do not run valid restore or real WhatsApp sends

## SAFE STEP 121 — MISSING-RECORD AFFECTED-ROW BOUNDARY REPORT

### Scope And Method

This step inspected update/delete/archive flows for numeric IDs that may affect zero rows but still return success. No code, tests, routes, validation, SQL, auth/session/cookie behavior, or permissions were changed.

Reviewed areas:

- clients, appointments, catalog categories/services
- gifts and CRM tasks
- users and invitations
- tenant domains
- billing and platform invoices
- platform tenant update, reset-password, manual invoice creation
- client files and consent templates

### Endpoint Missing-Record Matrix

| Endpoint | Current missing numeric ID behavior by inspection | Repository exposes affected rows? | Service/controller checks missing record? | Current likely response for `999999` | Desired response | Risk | Safe fix order |
|---|---|---|---|---|---|---|---|
| `PUT /api/clients/:id` | `findClientCrmFields` lookup before update | No | Yes | `404 { error: "Client not found" }` | Already 404 | Low | Already safe |
| `DELETE /api/clients/:id` | Archives client and related appointments without lookup | No | No | `200 { ok: true }` plus audit despite zero client rows | `404` | Medium | 1 |
| `PUT /api/appointments/:id` | No appointment lookup; update returns ignored `changes` | No | No | Usually `200 { ok: true }` after validations/conflict checks, even if zero rows | `404` | High | 2 |
| `DELETE /api/appointments/:id` | Archive update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 3 |
| `PUT /api/categories/:id` | Update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 4 |
| `DELETE /api/categories/:id` | Archive category and archive services by category without lookup | No | No | `200 { ok: true }` despite zero category rows | `404` | Medium | 5 |
| `PUT /api/services/:id` | Update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 6 |
| `DELETE /api/services/:id` | Archive update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 7 |
| `PUT /api/gifts/:id` | Status update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 8 |
| `PUT /api/crm-tasks/:id` | `crmTaskById` lookup before update | No | Yes | `404 { error: "Task not found." }` | Already 404 | Low | Already safe |
| `PUT /api/users/:id` | `findManagedUser` lookup before update | No | Yes | `404 { error: "User not found." }` | Already 404 | Low | Already safe |
| `DELETE /api/users/:id` | `findManagedUser` lookup before deactivate | No | Yes | `404 { error: "User not found." }` | Already 404 | Low | Already safe |
| `DELETE /api/invitations/:id` | Revoke update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows or already accepted invitation | `404` for missing; possibly `409/410` for already accepted later | Medium | 9 |
| `PUT /api/tenant/domains/:id` | `findTenantDomain` lookup before update | No | Yes | `404 { error: "Domain not found" }` | Already 404 | Low | Already safe |
| `DELETE /api/tenant/domains/:id` | `findTenantDomain` lookup before delete | No | Yes | `404 { error: "Domain not found" }` | Already 404 | Low | Already safe |
| `PUT /api/billing/invoices/:id` | `invoiceById` lookup before update | No | Yes | `404 { error: "Invoice not found" }` when status is valid | Already 404 | Low | Already safe |
| `PUT /api/platform/tenants/:id` | `findTenant` lookup before update/create subscription | No | Yes | `404 { error: "Tenant not found" }` when validation passes | Already 404 | Low | Already safe |
| `POST /api/platform/tenants/:id/reset-password` | Tenant lookup and active admin lookup before password update | No | Yes | `404 { error: "Tenant not found" }` or no active admin error | Already 404 | Low | Already safe |
| `POST /api/platform/tenants/:id/invoices` | Tenant lookup through `tenantBillingForInvoice` before insert | N/A insert | Yes | `404 { error: "Tenant not found" }` | Already 404 | Low | Already safe |
| `PUT /api/platform/invoices/:id` | `findPlatformInvoice` lookup before update | No | Yes | `404 { error: "Invoice not found" }` when status is valid | Already 404 | Low | Already safe |
| `DELETE /api/client-files/:id` | Archive update returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 10 |
| `DELETE /api/consents/:id` | Archive consent template returns ignored `changes` | No | No | `200 { ok: true }` despite zero rows | `404` | Medium | 11 |

### Endpoints With Unsafe Missing-Record Success

The following endpoints are likely to return successful responses while affecting zero rows:

- `DELETE /api/clients/:id`
- `PUT /api/appointments/:id`
- `DELETE /api/appointments/:id`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `PUT /api/services/:id`
- `DELETE /api/services/:id`
- `PUT /api/gifts/:id`
- `DELETE /api/invitations/:id`
- `DELETE /api/client-files/:id`
- `DELETE /api/consents/:id`

### Endpoints Already Safe

These endpoints perform a pre-update lookup or equivalent missing-resource check:

- `PUT /api/clients/:id`
- `PUT /api/crm-tasks/:id`
- `PUT /api/users/:id`
- `DELETE /api/users/:id`
- `PUT /api/tenant/domains/:id`
- `DELETE /api/tenant/domains/:id`
- `PUT /api/billing/invoices/:id`
- `PUT /api/platform/tenants/:id`
- `POST /api/platform/tenants/:id/reset-password`
- `POST /api/platform/tenants/:id/invoices`
- `PUT /api/platform/invoices/:id`

### Repository Affected-Row Notes

Most repositories call `.run(...)` but do not return the result object. SQLite returns a result containing `changes`, but the service layer cannot currently inspect it because the repository functions discard it. The safest implementation pattern is:

1. Change one repository function at a time to return the `.run(...)` result or a boolean.
2. In the matching service, return `404` before audit logging when `changes === 0`.
3. Keep successful response bodies unchanged.
4. Add isolated tests for `999999` missing IDs.

### Risk Summary

| Risk | Endpoints |
|---|---|
| High | `PUT /api/appointments/:id` |
| Medium | client/archive, appointment/archive, catalog update/archive, gift status update, invitation revoke, client-file archive, consent archive |
| Low | endpoints with pre-update lookup, or endpoints where validation blocks before lookup by design |

`PUT /api/appointments/:id` is highest risk because it performs conflict/consent logic and then reports success without confirming the target appointment was updated. The other unsafe endpoints are mostly archive/status operations, so the impact is semantic/audit inconsistency rather than data corruption.

### Recommended Fix Order

1. **Appointments update affected-row check:** highest risk; update repository should expose `changes`, service should return appointment `404` before audit.
2. **Appointments delete affected-row check:** same repository area and behavior.
3. **Catalog category/service update affected-row checks:** update paths already validated; add `changes` checks.
4. **Catalog category/service delete affected-row checks:** archive paths should return 404 when no category/service row changed.
5. **Client delete affected-row check:** avoid success/audit for missing client.
6. **Gift update affected-row check:** status update should 404 for missing gift.
7. **Invitation delete affected-row check:** revoke should 404 for missing or already accepted if current product decision wants missing-only behavior first.
8. **File archive/delete affected-row check:** ensure missing client-file delete returns 404.
9. **Consent archive/delete affected-row check:** ensure missing consent delete returns 404.
10. **Final affected-row parity tests:** add a matrix for all fixed `999999` update/delete paths.

### Manual Validation Checklist For Future Fix Steps

- `999999` numeric IDs return controlled `404`.
- Non-numeric IDs still return generic API 404 from route boundary.
- Valid update/delete/archive paths keep their current success bodies.
- Audit rows are not written for missing-record failures.
- No real file deletion, real WhatsApp send, or valid restore is performed.

### Step 121 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 121 directories remain

## SAFE STEP 131 — FINAL REGRESSION COVERAGE REPORT

### Scope And Method

This step documents the automated API regression coverage after modularization, validation hardening, missing-record boundary fixes, CI setup, and isolated test environments. No code, tests, routes, validation, SQL, auth/session/cookie behavior, permissions, or CI files were changed.

### Test Framework And Strategy

The API regression suite uses the Node built-in test runner only:

- `node:test`
- `node:assert/strict`
- native `fetch`, `FormData`, `Blob`, filesystem, and child-process/runtime helpers

No external test framework or new dependency is required. The suite starts the application on isolated temporary ports and uses disposable SQLite databases plus temporary uploads/backups folders. Tests intentionally avoid production/development data and avoid real external side effects.

### Test Command

Current npm command:

```bash
npm run test:api
```

Current script:

```bash
node --test server/tests/api-smoke.test.js server/tests/authenticated-read.test.js server/tests/isolated-crud.test.js server/tests/files-consents.test.js server/tests/platform-workflows.test.js server/tests/security-negative.test.js
```

### Test Files And Responsibilities

| File | Responsibility |
|---|---|
| `server/tests/api-smoke.test.js` | Public smoke coverage, static fallback, final API 404 behavior, unauthenticated protected boundaries, disabled signup response, basic admin login/me/bootstrap/logout, invalid broad-resource subpath 404s. |
| `server/tests/authenticated-read.test.js` | Authenticated read-only role coverage for clinic admin, reception, therapist, and platform owner; bootstrap role visibility; clinic read endpoints; platform tenant permission split; system export/restore non-destructive permission checks. |
| `server/tests/isolated-crud.test.js` | Disposable CRUD coverage for catalog categories/services, clients, appointments, gifts, CRM tasks, invitations, feedback, and tenant domains using isolated SQLite data. |
| `server/tests/files-consents.test.js` | Temporary upload/download/archive coverage for client files and consent PDFs, including invalid consent signing and temporary storage cleanup. |
| `server/tests/platform-workflows.test.js` | Platform-owner workflow coverage for tenant provisioning, tenant update, clinic admin login for created tenant, password reset, manual platform invoices, billing invoices, and no-op auto-billing. |
| `server/tests/security-negative.test.js` | Negative security, permissions, invalid JSON, required fields, update required fields, numeric/date/enum validation, malformed IDs, missing-record 404 matrix, restore invalid-file safety, upload-without-body safety, and role separation. |

### CI Workflow Summary

GitHub Actions workflow:

- `.github/workflows/api-tests.yml`
- Triggered on `push` and `pull_request`.
- Uses Node `22`.
- Runs `npm ci`.
- Runs `npm run db:check`.
- Runs `npm run test:api`.

CI environment safeguards:

- `NODE_ENV=test`
- `DATABASE_URL=""`
- `DATABASE_PATH=${{ runner.temp }}/clinova-api-ci-db.sqlite`
- `UPLOAD_DIR=${{ runner.temp }}/clinova-api-ci-uploads`
- `BACKUP_DIR=${{ runner.temp }}/clinova-api-ci-backups`
- `BACKUP_ENABLED=false`
- `BACKUP_RUN_ON_START=false`
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- `COOKIE_SECURE=false`
- no secrets or external services required

### Current Test Count

Current passing count from `npm run test:api`:

- `41` tests
- `41` passing
- `0` failing
- `0` skipped

### Isolated Environment Strategy

The suite uses helper-managed isolated application instances with:

- temporary SQLite database files
- temporary upload folders
- temporary backup folders
- random/test ports
- disabled startup backups
- disabled real WhatsApp behavior
- dry-run WhatsApp settings
- cleanup on test teardown

File and consent tests create temporary fixtures and validate that uploads/downloads/archive operations remain inside the temporary upload tree.

### Covered Roles

| Role | Coverage |
|---|---|
| Clinic admin | Login, `/api/me`, `/api/bootstrap`, read endpoints, CRUD, files, consents, reports/audit/search, negative platform/system permission checks. |
| Reception | Login, `/api/me`, `/api/bootstrap`, read endpoint access, restricted audit/reports behavior. |
| Therapist | Login, `/api/me`, `/api/bootstrap`, read endpoint access, therapist visibility checks, restricted users/audit behavior. |
| Platform owner | Login, `/api/me`, `/api/bootstrap`, platform tenants, provisioning, billing/invoices, reset-password, system export permission, platform-only negative tests. |

### Covered Modules

Covered modules/endpoints include:

- status: `/api/health`, `/api/version`
- auth: login, logout, `/api/me`, unauthenticated protected boundaries
- signup guard
- account password unauthenticated behavior through smoke/negative coverage
- bootstrap
- users
- clients
- appointments
- client files
- consents and consent signing negative path
- catalog categories/services
- gifts
- WhatsApp message logs and safe no-send boundaries
- settings and tenant profile reads
- tenant domains
- platform tenants
- platform tenant provisioning
- platform password reset
- platform invoices
- platform auto-billing no-op path
- clinic billing and billing invoices
- invitations and token preview behavior
- feedback and public feedback token read
- CRM and CRM tasks
- reports
- audit
- search
- system export
- system restore invalid/non-destructive paths
- static serving and SPA/static fallback
- final API 404 fallback

### Covered Positive Flows

Positive coverage includes:

- public health/version/static responses
- seeded clinic admin login, `/api/me`, `/api/bootstrap`, logout
- role logins for admin/reception/therapist/platform owner
- bootstrap response accessibility by role
- read-only clinic endpoints
- catalog category/service create/update/archive
- client create/update/archive
- appointment create/update/archive
- gift create/update
- CRM task create/update
- invitation create/delete and token preview
- feedback request creation and public token preview
- tenant domain create/update/delete
- client file upload/list/download/archive
- consent PDF upload/list/download/archive
- platform tenant provisioning/update
- platform tenant admin login after provisioning
- platform tenant admin password reset
- platform manual invoice create/update
- clinic billing invoice create/update
- platform auto-billing no-op run

### Covered Negative And Security Flows

Negative/security coverage includes:

- invalid login password
- unknown login identity
- invalid `clinic_session` cookie
- logout invalidates subsequent protected access
- signup remains `403`
- unauthenticated protected routes return unauthorized
- clinic users cannot access platform-owner routes
- platform owner cannot access clinic-only API
- therapist/reception restrictions for admin-only endpoints
- system export/restore permission split
- invalid JSON bodies
- upload without multipart/body
- consent upload without body
- restore invalid body
- restore multipart without backup
- restore invalid SQLite backup file
- no pending restore files after invalid restore
- malformed nested paths return final API 404
- non-numeric route IDs return final API 404

### Covered Validation Classes

Validation coverage includes:

- required create fields
- required update fields for clients, appointments, categories, services, and users
- numeric validation for services, appointments, gifts, billing, platform tenant billing day, and invoices
- date/time validation for appointments, CRM task due date, invoices, billing period fields, auto-billing run date, and billing period end
- enum/status validation for appointments, payment status, gifts, CRM task status/priority, users, invitations, platform tenants, invoices, and tenant domains
- malformed ID route boundaries
- missing numeric record boundaries

### Missing-Record Coverage

Missing-record regression coverage includes:

- `PUT /api/appointments/999999`
- `DELETE /api/appointments/999999`
- `PUT /api/categories/999999`
- `DELETE /api/categories/999999`
- `PUT /api/services/999999`
- `DELETE /api/services/999999`
- `DELETE /api/clients/999999`
- `PUT /api/gifts/999999`
- `PUT /api/crm-tasks/999999`
- `DELETE /api/invitations/999999`
- `DELETE /api/client-files/999999`
- `DELETE /api/consents/999999`
- `PUT /api/users/999999`
- `DELETE /api/users/999999`
- `PUT /api/tenant/domains/999999`
- `DELETE /api/tenant/domains/999999`
- `PUT /api/billing/invoices/999999`
- `PUT /api/platform/tenants/999999`
- `POST /api/platform/tenants/999999/reset-password`
- `POST /api/platform/tenants/999999/invoices`
- `PUT /api/platform/invoices/999999`

### Covered File And Consent Flows

File/consent coverage includes:

- client file list before upload
- invalid file upload without multipart/body
- client file upload using temporary fixture
- file listing after upload
- file download status/content/body checks
- file archive/delete inside temp storage
- missing file delete returns 404 without touching uploads
- consent list before upload
- invalid consent upload without multipart/body
- consent PDF upload using temporary fixture
- consent list after upload
- consent PDF download status/content/body checks
- consent sign invalid body returns 400
- consent archive/delete inside temp storage
- missing consent delete returns 404 without touching uploads

### Covered Platform Flows

Platform coverage includes:

- platform owner login
- unauthenticated platform tenant access returns 401
- clinic user platform tenant access returns 403
- platform tenant list
- invalid provisioning body returns 400
- disposable tenant provisioning
- created tenant admin can login
- created tenant admin bootstrap works
- platform tenant plan/status/billing update
- invalid reset-password body returns 400
- valid reset-password for disposable tenant admin
- invalid platform invoice amount/date/status returns 400
- missing tenant invoice returns 404
- valid platform invoice creation
- platform invoice status update
- clinic billing invoice creation
- no-op auto-billing run with safe run date

### Explicitly Excluded

The suite intentionally does not automate:

- real WhatsApp provider sends
- valid restore execution except as a future disposable-only suite
- production/development database access
- production uploads/backups access
- browser UI/e2e flows
- visual regression tests
- load/performance testing
- long-running backup scheduler behavior
- destructive restore on any non-disposable database

### Remaining Gaps And Recommended Order

| Priority | Gap | Recommended next action |
|---|---|---|
| 1 | Valid restore happy-path on disposable DB only | Build a separate restore regression suite that exports/restores a disposable SQLite DB and verifies pending restore/startup apply behavior. |
| 2 | WhatsApp provider behavior | Add provider mock/dry-run suite that verifies request construction and message log behavior without external sends. |
| 3 | UI/e2e coverage | Add browser-level tests for login, bootstrap dashboard load, core CRUD forms, upload/download UI, and platform screens. |
| 4 | Bootstrap payload growth/performance | Add payload-size/count regression and basic timing checks for bootstrap by role. |
| 5 | Monitoring/logging hardening | Add structured error logging assertions or deployment smoke checks for critical failures. |
| 6 | PostgreSQL parity | If PostgreSQL production is active, add isolated PostgreSQL CI job or periodic parity suite. |

### Production Readiness Conclusion

The modular backend now has meaningful automated API regression coverage across public smoke tests, authenticated role reads, isolated CRUD, upload/download flows, platform-owner workflows, validation hardening, permission boundaries, missing-record 404 behavior, and CI execution. The suite is safe for routine local and CI runs because it uses isolated SQLite/uploads/backups and disables external side effects.

Production deployment is not blocked by the current API test coverage, provided the deployment still runs the full validation checklist and avoids valid restore testing outside a disposable database. The largest remaining risks are not modularization regressions; they are operational hardening areas: valid restore safety, real WhatsApp provider integration, browser/UI regressions, payload/performance growth, logging/monitoring, and PostgreSQL parity if used in production.

### Step 131 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 131 directories remain

## SAFE STEP 132 — VALID RESTORE DISPOSABLE REGRESSION BOUNDARY REPORT

### Scope And Method

This step designs a safe regression plan for valid restore behavior before writing or running any valid restore test. No tests, code, routes, validation, SQL, auth/session/cookie behavior, or CI configuration were changed. No valid restore was executed.

### Current Restore Success Flow

`POST /api/system/restore` is owned by the system module:

- route: `POST /api/system/restore`
- controller: `server/modules/system/system.controller.js`
- service: `server/modules/system/system.service.js`
- apply-on-next-start hook: `server/db.js`

Success flow by inspection:

1. The controller requires platform-owner permission through `requirePlatformOwnerCompat(req, res)`.
2. If the request is unauthenticated, the compatibility helper writes the existing `401` JSON response.
3. If the user is authenticated but not a platform owner, the compatibility helper writes the existing `403` JSON response.
4. The service rejects restore when `DATABASE_URL` is set, returning `400 { error: "Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups." }`.
5. The service reads multipart data and requires file field name `backup`.
6. Missing or empty `backup` returns `400 { error: "Choose a backup file to restore." }`.
7. Uploaded backup bytes are written under `config.backup.dir/restore-uploads/<timestamp>-<safe-file-name>`.
8. The service opens the uploaded file with `DatabaseSync(path, { readOnly: true })`.
9. It runs `PRAGMA integrity_check`.
10. If integrity is not `ok`, it deletes the uploaded file and returns `400 { error: "SQLite backup integrity check failed." }`.
11. For a valid SQLite backup, it creates a safety backup via `createBackup({ reason: "before-restore" })`.
12. It copies the uploaded valid backup to `config.backup.dir/pending-restore.sqlite`.
13. It writes `config.backup.dir/pending-restore.json` with:
    - `uploadedName`
    - `source`
    - `requestedBy`
    - `safetyBackup`
    - `createdAt`
14. It writes an audit event: `restore_scheduled`.
15. It returns `200 { ok: true, safetyBackup, restarting: true }`.
16. The controller calls `scheduleProcessExitAfterRestore()`.
17. `scheduleProcessExitAfterRestore()` calls `process.exit(0)` after 500ms.
18. On the next server startup, `server/db.js` calls `applyPendingSqliteRestore()` before creating the SQLite adapter.
19. `applyPendingSqliteRestore()`:
    - skips when PostgreSQL is active
    - looks for `pending-restore.sqlite`
    - creates DB/backup directories if needed
    - copies the current database to `before-pending-restore-<timestamp>.sqlite` when the current DB exists
    - removes current `databasePath-wal` and `databasePath-shm`
    - copies `pending-restore.sqlite` over `config.databasePath`
    - removes `pending-restore.sqlite`
    - removes `pending-restore.json`

### Exact Test Environment Requirements

A valid restore regression test must use only:

- temporary SQLite database path
- temporary uploads directory
- temporary backups directory
- isolated server process
- isolated port
- `DATABASE_URL=""`
- `BACKUP_ENABLED=false`
- `BACKUP_RUN_ON_START=false`
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- `COOKIE_SECURE=false`
- test-only `SESSION_SECRET`

The test must not use:

- development DB
- production DB
- shared `data/clinic.sqlite`
- shared uploads folder
- shared backups folder
- production restore uploads
- PostgreSQL valid restore path

### Proposed Disposable Valid Restore Test Flow

The safest test should run in a dedicated helper/process flow rather than inside an existing long-lived API test server.

Proposed flow:

1. Create a temporary root directory, for example `clinova-restore-test-*`.
2. Inside it create:
   - `data/clinic.sqlite`
   - `uploads/`
   - `backups/`
3. Create env for isolated SQLite:
   - `DATABASE_URL=""`
   - `DATABASE_PATH=<temp>/data/clinic.sqlite`
   - `UPLOAD_DIR=<temp>/uploads`
   - `BACKUP_DIR=<temp>/backups`
4. Run `initDatabase()` against that env.
5. Start isolated server A using the same env.
6. Wait for `GET /api/health = 200`.
7. Login as platform owner.
8. Call `GET /api/system/export`.
9. Store the exported SQLite backup bytes in test memory or under the same temporary root.
10. Mutate only the isolated DB through a safe API request, for example:
    - provision a disposable tenant, or
    - create a disposable tenant domain, or
    - create a marker category/client in the seeded tenant if clinic login is simpler
11. Verify the marker exists through an API read.
12. Build multipart `FormData` with field name `backup` and the exported backup bytes.
13. POST the multipart body to `/api/system/restore` as platform owner.
14. Assert the response is:
    - status `200`
    - body contains `{ ok: true, restarting: true }`
    - `safetyBackup` is a string path inside the temporary backup directory
15. Expect server A to exit with code `0` because restore intentionally schedules `process.exit(0)`.
16. The test helper must wait for and accept this exit as expected, not as a failure.
17. Before starting server B, inspect the temporary backup directory:
    - `pending-restore.sqlite` should exist
    - `pending-restore.json` should exist
    - the safety backup should exist
18. Start isolated server B using the exact same env.
19. `server/db.js` should apply pending restore during startup.
20. Wait for `GET /api/health = 200`.
21. Login as platform owner or clinic admin as needed.
22. Assert the marker created after export is gone, proving the pre-mutation exported backup was restored.
23. Assert current behavior for pending files:
    - `pending-restore.sqlite` removed
    - `pending-restore.json` removed
    - `before-pending-restore-*.sqlite` exists if the pre-restore DB existed
24. Stop server B normally.
25. Remove the entire temporary root.
26. Assert no `clinova-restore-test-*` temporary directories remain.

### Process Management Risks

The restore endpoint intentionally exits the application process. A test that runs valid restore cannot share a normal test server instance with unrelated tests because:

- the child process exits after the response
- the exit happens asynchronously after 500ms
- pending restore is applied on the next process startup
- the test must keep the same temp env across server A and server B
- ordinary helper teardown must not treat the expected server A exit as a crash

The helper must distinguish:

- expected restore exit: server A exits with code `0` shortly after valid restore
- unexpected failure: server A exits before restore response, exits with non-zero code, or never exits after restore

### What Must Not Be Tested

Do not test valid restore against:

- production DB
- development DB
- shared local DB
- shared uploads/backups
- PostgreSQL valid restore
- any environment where `DATABASE_PATH` is not inside the test temp root
- any environment where `BACKUP_DIR` is not inside the test temp root
- any environment where uploads/backups may contain real files

PostgreSQL restore should remain limited to the existing non-destructive `400` behavior:

```json
{ "error": "Restore upload is available for SQLite. Use pg_restore for PostgreSQL backups." }
```

### Cleanup Requirements

The restore regression helper must:

- keep all files under one temp root
- verify `DATABASE_PATH`, `UPLOAD_DIR`, and `BACKUP_DIR` are inside that root before cleanup
- stop any remaining child process
- remove the temp root recursively
- report leftover temp dirs as failure
- never delete paths computed outside the temp root
- never delete production/development uploads or backups

### CI Suitability

Recommendation:

- Do not add valid restore to the default `npm run test:api` suite initially.
- Add a separate command such as `npm run test:restore` after the helper is implemented.
- Run it locally first.
- Add a separate CI job later only after repeated local stability.

Reasoning:

- valid restore intentionally kills the app process
- process-exit timing can be more brittle than regular API tests
- a separate job gives clearer failure signals and keeps normal regression tests fast/stable
- the restore test is safe only if its temp path guards are perfect

Suggested future command:

```bash
npm run test:restore
```

Suggested future file:

```text
server/tests/system-restore-valid.test.js
```

### Recommended Implementation Order

1. Add a restore-specific test helper that can start a server and accept an expected child-process exit.
2. Add strict temp-root path guards for database, uploads, and backups.
3. Add a helper to export a backup and retain bytes.
4. Add a helper to create a disposable marker after export.
5. Add valid restore request using multipart field `backup`.
6. Assert response and expected process exit.
7. Restart using the same env and assert pending restore applied.
8. Assert pending files were consumed and marker is gone.
9. Add `npm run test:restore`, separate from `test:api`.
10. Run locally multiple times before adding CI.
11. Add optional CI job only after stability is proven.

### Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Accidentally restoring non-test DB | High | Hard fail unless `DATABASE_PATH`, `UPLOAD_DIR`, and `BACKUP_DIR` are inside the test temp root. |
| Expected `process.exit(0)` treated as test failure | Medium | Use a restore-aware child-process helper. |
| Race between response, pending files, and process exit | Medium | Wait for response, then wait for child exit with timeout. |
| Pending restore not applied because env changes between server A and B | Medium | Reuse exact env object for both child processes. |
| Cleanup deletes wrong path | High | Verify resolved temp-root prefix before any recursive delete. |
| CI flakiness | Medium | Keep separate from default suite until stable. |
| PostgreSQL confusion | Low | Assert valid restore suite runs only with `DATABASE_URL=""`; PostgreSQL remains non-destructive 400-only coverage. |

### Production Readiness Conclusion

Valid restore can be tested safely, but only as a fully disposable, process-aware regression suite. It should not be folded into the default API test suite until it proves stable, because successful restore deliberately exits the server and applies data changes on the next startup. The correct next move is to implement a separate restore-only test helper and `test:restore` command with strict temp-path guards.

### Step 132 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not run valid restore
- confirm no temporary Step 132 directories remain

## SAFE STEP 133 — IMPLEMENT RESTORE-SPECIFIC TEST HELPER ONLY

### Scope And Method

This step added a restore-specific test helper only. No valid restore test was written, no valid restore was run, and no application code, routes, validation, SQL, auth/session/cookie behavior, permissions, CI, or npm scripts were changed.

### Helper File Added

Added:

- `server/tests/helpers/restore-test-server.js`

The helper is intentionally not imported by the current default API suite yet. It exists for the future valid restore disposable regression step.

### Helper Functions Added

| Function | Purpose |
|---|---|
| `createRestoreTestEnvironment()` | Creates a temporary root with isolated SQLite DB path, uploads dir, backups dir, random port, and safe test env variables. |
| `assertSafeRestoreEnvironment(environment)` | Verifies `DATABASE_URL` is empty and DB/uploads/backups paths stay inside the restore test temp root. |
| `initializeRestoreDatabase(environment, { runs })` | Runs `initDatabase()` against the isolated restore test environment. |
| `startRestoreServer(environment)` | Starts `server/app.js` with the isolated env, captures stdout/stderr, and waits for `/api/health`. |
| `startInitializedRestoreServer({ initializationRuns })` | Convenience helper that creates env, initializes DB, starts server, and waits for health. |
| `expectRestoreExit(server, { timeoutMs })` | Waits for the intentional restore-triggered process exit and accepts only exit code `0`. Timeout or non-zero exit is failure. |
| `stopRestoreServer(server)` | Stops a still-running child process, escalating to `SIGKILL` after timeout. |
| `cleanupRestoreEnvironment(environment)` | Removes only the guarded temp root after verifying it is a safe restore test temp path. |

### Safety Guards Added

The helper includes guards for:

- temp root must live under the OS temp directory
- temp root basename must start with `clinova-restore-test-`
- `DATABASE_URL` must be empty, forcing SQLite-only behavior
- `DATABASE_PATH` must resolve inside the temp root
- `UPLOAD_DIR` must resolve inside the temp root
- `BACKUP_DIR` must resolve inside the temp root
- cleanup refuses to remove any path outside the guarded temp root

The helper also captures child stdout/stderr so future restore tests can report meaningful diagnostics when startup or expected-exit handling fails.

### Restore Behavior Not Exercised

This step did not:

- call `POST /api/system/restore`
- upload any valid backup
- create `pending-restore.sqlite`
- create `pending-restore.json`
- trigger `process.exit(0)`
- add `npm run test:restore`
- add a CI restore job

### Future Usage Notes

The next valid restore test can use the helper in this sequence:

1. `createRestoreTestEnvironment()`
2. `initializeRestoreDatabase(environment)`
3. `startRestoreServer(environment)` for server A
4. perform export/mutation/valid restore in a future test
5. `expectRestoreExit(serverA)`
6. `startRestoreServer(environment)` for server B using the same env
7. verify pending restore was applied
8. `stopRestoreServer(serverB)`
9. `cleanupRestoreEnvironment(environment)`

### Risk Assessment

Runtime production risk is none because the helper is test-only and currently unused by production code. Test-infrastructure risk is low: the helper is not in the default test command yet, but its path guards and expected-exit handling are now available for the future restore-only suite.

### Step 133 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not run valid restore
- confirm no temporary Step 133 directories remain

## SAFE STEP 134 — ADD RESTORE HELPER SELF-TEST ONLY

### Scope And Method

This step added a helper self-test only. It does not write or run a valid restore test, does not call `POST /api/system/restore`, does not create pending restore files, and does not change application code, routes, validation, SQL, auth/session/cookie behavior, permissions, or CI workflow files.

### Files Added Or Updated

- Added `server/tests/restore-helper.test.js`
- Updated `package.json` so `npm run test:api` includes the restore helper self-test

The npm script update was made so the helper self-test is automated with the existing regression command. No new test command or CI workflow was added.

### Self-Tests Added

`server/tests/restore-helper.test.js` covers:

1. `startInitializedRestoreServer()` creates a guarded temporary restore environment, initializes SQLite, starts an isolated server, and waits for health.
2. `assertSafeRestoreEnvironment(server)` passes for the valid helper environment.
3. `GET /api/health` returns `200`.
4. `pending-restore.sqlite` does not exist.
5. `pending-restore.json` does not exist.
6. `stopRestoreServer(server)` stops the child process normally.
7. `cleanupRestoreEnvironment(server)` removes the helper temp root.
8. `assertSafeRestoreEnvironment(...)` rejects an unsafe project-root environment.
9. `cleanupRestoreEnvironment(...)` rejects the same unsafe project-root environment without deleting anything.

### Restore Endpoint Not Called

The self-test intentionally does not:

- upload a backup
- call `/api/system/restore`
- schedule process exit
- create `pending-restore.sqlite`
- create `pending-restore.json`
- apply a pending restore

It only verifies that the helper can manage an isolated server and enforce cleanup guards.

### Cleanup Guard Result

The cleanup guard refuses an environment rooted at `process.cwd()` and throws `Unsafe restore test temp root`. The valid helper temp root is removed after the server is stopped.

### Risk Assessment

Production risk is none: this is test-only coverage and the helper is still not used by runtime code. Regression risk is low: the self-test starts a normal isolated server and does not execute restore behavior.

### Step 134 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not run valid restore
- confirm no temporary Step 134 or restore helper directories remain

## SAFE STEP 135 — VALID RESTORE DISPOSABLE REGRESSION TEST ONLY

### Scope And Method

This step added the first valid restore regression test using only isolated temporary SQLite, uploads, and backups. The restore test is kept separate from the default API suite. No application restore behavior, routes, validation, SQL schema, auth/session/cookie behavior, permissions, WhatsApp behavior, or CI workflow was changed.

### Files Added Or Updated

- Added `server/tests/restore-valid.test.js`
- Updated `package.json` with a separate `test:restore` script

The default `npm run test:api` command remains separate and does not include `restore-valid.test.js`.

### Test Command Added

```bash
npm run test:restore
```

Script:

```bash
node --test server/tests/restore-valid.test.js
```

### Valid Restore Flow Implemented

`server/tests/restore-valid.test.js` performs this disposable-only flow:

1. Starts a guarded restore test server with `startInitializedRestoreServer({ initializationRuns: 2 })`.
2. Verifies the restore helper environment is safe.
3. Logs in as platform owner.
4. Exports a valid SQLite backup with `GET /api/system/export`.
5. Creates a disposable platform tenant marker after the export.
6. Confirms the marker tenant exists before restore.
7. Uploads the exported backup using multipart field name `backup`.
8. Asserts restore response:
   - status `200`
   - `ok: true`
   - `restarting: true`
   - `safetyBackup` is a string path inside the temp backups directory
   - safety backup file exists
9. Uses `expectRestoreExit(serverA)` to treat intentional `process.exit(0)` as expected.
10. Confirms `pending-restore.sqlite` and `pending-restore.json` exist after server A exits.
11. Starts server B using the same temp env.
12. Confirms restore was applied because the marker tenant is gone.
13. Confirms pending restore files were consumed/removed.
14. Confirms `before-pending-restore-*.sqlite` exists.
15. Stops server B.
16. Cleans the temp root and asserts it no longer exists.

### Temp-Only Proof

The test uses the restore helper guards:

- `DATABASE_URL=""`
- `DATABASE_PATH` inside `clinova-restore-test-*` temp root
- `UPLOAD_DIR` inside the same temp root
- `BACKUP_DIR` inside the same temp root
- `safetyBackup` asserted inside the temp backups directory
- cleanup removes only the guarded temp root

The test does not use project `data/clinic.sqlite`, real uploads, or real backups.

### Expected Process Exit Handling

The test expects the restore endpoint to schedule application exit. It uses `expectRestoreExit(serverA)` to accept only exit code `0`; timeout or non-zero exit fails the test. Server B is then started with the same env so `server/db.js` applies the pending restore on startup.

### Cleanup Requirements Verified

The test verifies:

- pending restore files exist after scheduling restore
- pending restore files are consumed after server B starts
- the disposable marker is gone after restore
- the temp root is removed after cleanup

### Risk Assessment

Production risk is low. The test runs valid restore, but only inside a guarded temporary SQLite environment. It is intentionally separated from `test:api` and CI default flow to avoid surprising process-exit behavior in the regular API regression suite.

### Step 135 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 135 or restore helper directories remain

## SAFE STEP 136 — RESTORE TEST CI BOUNDARY REPORT

### Scope And Method

This step evaluates whether and how to add `npm run test:restore` to CI as a separate safe job. No code, tests, package scripts, CI workflow, routes, validation, SQL, auth/session/cookie behavior, or restore behavior were changed.

### Current `test:api` CI Behavior

Current workflow:

- file: `.github/workflows/api-tests.yml`
- triggers: `push`, `pull_request`
- job: `api-tests`
- runner: `ubuntu-latest`
- timeout: 15 minutes
- Node version: `22`
- install: `npm ci`
- validation:
  - `npm run db:check`
  - `npm run test:api`

Current CI environment:

- `NODE_ENV=test`
- `DATABASE_URL=""`
- `DATABASE_PATH=${{ runner.temp }}/clinova-api-ci-db.sqlite`
- `UPLOAD_DIR=${{ runner.temp }}/clinova-api-ci-uploads`
- `BACKUP_DIR=${{ runner.temp }}/clinova-api-ci-backups`
- `BACKUP_ENABLED=false`
- `BACKUP_RUN_ON_START=false`
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- `COOKIE_SECURE=false`
- test-only `SESSION_SECRET`

`npm run test:api` currently includes the restore helper self-test, but it does not run a valid restore and does not call `POST /api/system/restore`.

### Current `test:restore` Behavior

Current script:

```bash
npm run test:restore
```

Runs:

```bash
node --test server/tests/restore-valid.test.js
```

Behavior:

1. Creates a guarded `clinova-restore-test-*` temp root.
2. Uses temporary SQLite DB/uploads/backups only.
3. Starts server A.
4. Exports a valid SQLite backup.
5. Creates a disposable marker tenant after export.
6. Uploads the exported backup to `POST /api/system/restore`.
7. Expects `200 { ok: true, restarting: true }`.
8. Expects server A to exit with code `0`.
9. Starts server B with the same env.
10. Confirms pending restore was applied and the marker tenant is gone.
11. Confirms pending restore files were consumed.
12. Cleans the temp root.

### Why `test:restore` Is Separate From `test:api`

`test:restore` is intentionally separate because successful restore deliberately exits the application process with `process.exit(0)`. That is safe in a purpose-built child-process helper, but it is unusual for a default API regression suite.

Keeping it separate:

- avoids surprising process exits in the default API suite
- keeps regular API tests faster and simpler
- makes restore failures easier to identify
- allows different CI timeout/retry/reporting policy
- allows restore-specific temp-path guards to remain explicit

### GitHub Actions Temp Directory Safety

GitHub Actions `runner.temp` is suitable for restore testing if the restore job uses only runner temp paths. However, the restore helper already creates its own OS temp root with prefix `clinova-restore-test-*` and asserts:

- `DATABASE_URL` is empty
- `DATABASE_PATH` is inside the helper temp root
- `UPLOAD_DIR` is inside the helper temp root
- `BACKUP_DIR` is inside the helper temp root

Therefore, CI restore safety does not depend only on workflow env values. The helper guards are the primary protection. Workflow env should still remain explicit and safe for consistency.

### Required CI Env Guards

Any future restore CI job must set:

- `NODE_ENV=test`
- `DATABASE_URL=""`
- `DATABASE_PATH` under `${{ runner.temp }}`
- `UPLOAD_DIR` under `${{ runner.temp }}`
- `BACKUP_DIR` under `${{ runner.temp }}`
- `BACKUP_ENABLED=false`
- `BACKUP_RUN_ON_START=false`
- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- `COOKIE_SECURE=false`
- test-only `SESSION_SECRET`

The restore helper should continue to hard-fail if any effective restore-test DB/uploads/backups paths are outside its guarded temp root.

### Expected `process.exit(0)` Behavior In CI

The restore endpoint schedules `process.exit(0)` after a successful valid restore. This is safe in CI because the test starts the app as a child process, not as the test runner itself.

The test runner process remains alive and uses `expectRestoreExit(serverA)` to accept only exit code `0`. Timeout or non-zero exit fails the test.

### Risks Of Adding Restore Test To Default CI

| Risk | Level | Notes |
|---|---|---|
| Process-exit behavior surprises default job | Medium | Restore intentionally kills the app child process; separate job has clearer semantics. |
| Restore test flakiness due to timing | Medium | Requires response, scheduled exit, restart, pending file consumption. |
| Accidental non-temp DB restore | High | Mitigated by helper path guards; still warrants separation. |
| Longer CI duration | Low | Current local restore test is small, but should remain separately visible. |
| Confusing failure logs | Medium | Separate job isolates restore-specific diagnostics. |

### Recommended CI Design

Recommended future design:

- Add a separate job named `restore-tests`.
- Keep `api-tests` unchanged.
- Make `restore-tests` depend on `api-tests` with `needs: api-tests`.
- Use same Node setup and install pattern.
- Run:
  - `npm run db:check`
  - `npm run test:restore`
- Keep explicit safe env values.
- Start as `workflow_dispatch` only or as a non-required job if the deployment process permits.

Suggested future job shape:

```yaml
restore-tests:
  name: Restore Tests
  runs-on: ubuntu-latest
  needs: api-tests
  timeout-minutes: 10
  env:
    NODE_ENV: test
    DATABASE_URL: ""
    DATABASE_PATH: ${{ runner.temp }}/clinova-restore-ci-db.sqlite
    UPLOAD_DIR: ${{ runner.temp }}/clinova-restore-ci-uploads
    BACKUP_DIR: ${{ runner.temp }}/clinova-restore-ci-backups
    BACKUP_ENABLED: "false"
    BACKUP_RUN_ON_START: "false"
    WHATSAPP_ENABLED: "false"
    WHATSAPP_DRY_RUN: "true"
    COOKIE_SECURE: "false"
    SESSION_SECRET: clinova-restore-ci-test-only
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: "22"
        cache: npm
    - run: npm ci
    - run: npm run db:check
    - run: npm run test:restore
```

### When To Run Restore Tests

| Trigger option | Recommendation | Reason |
|---|---|---|
| Every push | Later | Good once stable in CI for several runs; not first introduction. |
| Every pull request | Later | Useful eventually, but restore has process-exit semantics and should be proven first. |
| `workflow_dispatch` manual only | Recommended first | Lets maintainers validate CI behavior without affecting default PR/push signal. |
| Scheduled nightly | Good second phase | Catches environment drift without blocking every PR. |

Recommended rollout:

1. Add manual `workflow_dispatch` restore job first.
2. Run it repeatedly on CI.
3. If stable, add scheduled nightly.
4. If still stable, consider PR/push required restore job.

### Recommendation

Do not add `test:restore` to the current default CI job yet. The safest next step is to add a separate manual restore CI job that depends on the API job. After proving stability, promote it to scheduled and then possibly PR/push.

### Step 136 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 136 or restore helper directories remain

## SAFE STEP 138 — WHATSAPP PROVIDER DRY-RUN BOUNDARY REPORT

### Scope And Method

This step audits WhatsApp send, dry-run, fallback, and logging behavior before adding broader no-real-send automated tests. No code, tests, routes, env behavior, logging behavior, database writes, or CI configuration were changed. No WhatsApp send endpoints were called.

### Current WhatsApp Routes

WhatsApp routes are defined in `server/routes/whatsapp.routes.js` and handled by `server/controllers/whatsapp.controller.js`.

| Route | Handler | Notes |
|---|---|---|
| `GET /api/message-logs` | `getMessageLogs(user)` | Lists recent WhatsApp message logs for the tenant. |
| `POST /api/appointments/:id/whatsapp` | `sendAppointmentReminder(user, id)` | Sends or falls back appointment reminder. |
| `POST /api/gifts/:id/whatsapp` | `sendGiftWhatsApp(user, id)` | Sends or falls back gift message. |

Route matchers use numeric IDs:

- `/api/appointments/\d+/whatsapp`
- `/api/gifts/\d+/whatsapp`

Non-numeric IDs should stay route-boundary 404 behavior.

### Current Permission Behavior

| Route | Permission key |
|---|---|
| `GET /api/message-logs` | `feedback` |
| `POST /api/appointments/:id/whatsapp` | `appointments_write` |
| `POST /api/gifts/:id/whatsapp` | `gifts` |

Current read tests already cover message log visibility by role:

- admin: `200`
- reception: `200`
- therapist: `403`

Send endpoint tests should use authenticated roles with the correct write permission only in isolated/dry-run conditions.

### Current Env Flags And Provider Settings

`server/config.js` maps:

- `WHATSAPP_ENABLED`
- `WHATSAPP_DRY_RUN`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_DEFAULT_COUNTRY_CODE`

`server/whatsapp.js` behavior:

1. Normalizes recipient phone.
2. If phone is invalid, throws a `400` error.
3. If `WHATSAPP_ENABLED` is false, returns:
   - `ok: false`
   - `configured: false`
   - `fallbackUrl`
   - disabled-provider message
4. If enabled but missing phone-number ID or access token, throws `503`.
5. Builds Meta Cloud API payload.
6. If `WHATSAPP_DRY_RUN` is true, returns:
   - `ok: true`
   - `dryRun: true`
   - normalized `to`
   - provider payload
7. If not dry-run, calls Meta Graph API.

### Tenant-Level Fallback Behavior

`sendTenantWhatsApp(...)` checks tenant billing/settings before provider call:

- plan must allow WhatsApp (`growth` or `scale`)
- `clinic_settings.whatsappEnabled` must equal string `"true"`
- `clinic_settings.whatsappMode` must not equal `"fallback"`

If any of these conditions fail, it returns fallback behavior without calling `sendWhatsAppText(...)`:

```json
{
  "ok": false,
  "configured": false,
  "fallbackUrl": "...",
  "message": "WhatsApp is in fallback mode for this tenant."
}
```

The default seeded settings are:

- `whatsappEnabled: "false"`
- `whatsappMode: "fallback"`

Therefore default test environments should hit tenant fallback and never reach the provider.

### Current Dry-Run Behavior

Provider dry-run only occurs if tenant settings and plan allow provider mode. In that case:

- `sendWhatsAppText(...)` returns `ok: true, dryRun: true`
- no Meta Graph request is made
- `sendTenantWhatsApp(...)` logs the message with status `dry_run`
- response includes fallback URL through the service response merge

Dry-run is not the same as tenant fallback:

- tenant fallback: provider is not called because tenant/config says fallback
- provider dry-run: provider payload is built but no network request is made

### Behavior When WhatsApp Is Disabled

There are two disabled paths:

1. Tenant-level disabled/fallback:
   - occurs before provider helper
   - writes message log with `fallback`
   - returns `200` from send endpoint with fallback body
2. Global provider disabled (`WHATSAPP_ENABLED=false`) after tenant allows provider mode:
   - `sendWhatsAppText(...)` returns `ok:false, configured:false`
   - service logs fallback result
   - response remains `200` with fallback URL

The current CI/test env sets `WHATSAPP_ENABLED=false` and `WHATSAPP_DRY_RUN=true`, but default seeded tenant settings already keep sends in tenant fallback mode.

### Message Log Behavior

`logMessage(...)` writes to `message_logs` with:

- `channel: "whatsapp"`
- `entity`
- `entity_id`
- `recipient`
- `message`
- computed `status`
- `provider_message_id`
- `fallback_url`
- `error`

Status mapping:

| Condition | Log status |
|---|---|
| `error` present | `failed` |
| `result.dryRun` true | `dry_run` |
| `result.ok` true | `sent` |
| otherwise | `fallback` |

### Whether Dry-Run Writes Message Logs

Yes. If provider dry-run is reached, `sendTenantWhatsApp(...)` logs the result, and `logMessage(...)` maps `result.dryRun` to `dry_run`.

### Whether Failed Sends Write Logs

Yes, for provider errors thrown inside `sendTenantWhatsApp(...)`:

- catch block writes a `failed` log with fallback URL and error message
- then rethrows the error

Controller-level behavior for thrown service errors should be inspected before intentionally testing provider failure, because the controller currently calls service functions directly and does not show a local try/catch in `whatsapp.controller.js`.

### Missing Appointment/Gift ID Behavior

Missing appointment/gift IDs return before provider call and before message log write:

- `sendAppointmentReminder(...)` lists visible appointment rows and returns `404` if not found.
- `sendGiftWhatsApp(...)` lists gift cards and returns `404 { error: "Gift card not found." }` if not found.

Because `sendTenantWhatsApp(...)` is called only after a row is found, missing IDs should not call provider and should not create message logs.

### Current Test And CI Safeguards

Test helpers set:

- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`

CI workflows set:

- `.github/workflows/api-tests.yml`: `WHATSAPP_ENABLED=false`, `WHATSAPP_DRY_RUN=true`
- `.github/workflows/restore-tests.yml`: `WHATSAPP_ENABLED=false`, `WHATSAPP_DRY_RUN=true`

These safeguards avoid real provider calls. Future no-real-send tests should still explicitly assert safe configuration through the test helper env and, when testing provider dry-run, create tenant settings/plan that allow provider mode while keeping `WHATSAPP_DRY_RUN=true`.

### What Must Be Mocked Or Forced Dry-Run

Future automated tests must never use live Meta Graph API.

Safe options:

1. Tenant fallback tests:
   - keep default `whatsappEnabled=false` and `whatsappMode=fallback`
   - assert `fallback` message log
   - provider helper is not reached
2. Provider dry-run tests:
   - run isolated DB only
   - enable tenant WhatsApp settings
   - ensure tenant plan supports WhatsApp
   - set `WHATSAPP_ENABLED=true`
   - set `WHATSAPP_DRY_RUN=true`
   - provide dummy `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` if needed
   - assert response `dryRun: true`
   - assert message log status `dry_run`
3. Provider disabled tests:
   - enable tenant settings/plan
   - keep `WHATSAPP_ENABLED=false`
   - assert fallback/configured false response and log status `fallback`

### Safe Future Tests

Recommended future no-real-send coverage:

1. **Message log read baseline**
   - login admin
   - `GET /api/message-logs = 200`
   - assert shape `{ messageLogs: [...] }`
2. **Missing appointment ID**
   - authenticated admin
   - `POST /api/appointments/999999/whatsapp`
   - assert `404`
   - assert message log count unchanged
3. **Missing gift ID**
   - authenticated admin
   - `POST /api/gifts/999999/whatsapp`
   - assert `404 { error: "Gift card not found." }`
   - assert message log count unchanged
4. **Tenant fallback appointment send**
   - create disposable appointment in isolated DB
   - default tenant fallback settings
   - POST appointment WhatsApp
   - assert `200`, `ok:false`, `configured:false`, `fallbackUrl`
   - assert message log status `fallback`
5. **Tenant fallback gift send**
   - create disposable gift in isolated DB
   - default tenant fallback settings
   - POST gift WhatsApp
   - assert `200`, fallback response
   - assert message log status `fallback`
6. **Provider dry-run appointment send**
   - isolated env with safe dry-run provider
   - enable tenant WhatsApp setting and supported plan
   - assert `dryRun:true`
   - assert `dry_run` message log
7. **Provider dry-run gift send**
   - same as appointment dry-run but for gift route

### Risks

| Risk | Level | Notes |
|---|---|---|
| Accidentally triggering real provider | High | Must force `WHATSAPP_DRY_RUN=true` or tenant fallback; never use real tokens. |
| Message log side effects | Medium | Expected for successful/fallback/dry-run sends; tests must use isolated DB. |
| Audit log side effects | Medium | Send flows audit fallback/sent actions; tests must use isolated DB. |
| Provider failure uncaught shape | Medium | Controller has no local catch; inspect before intentionally testing provider errors. |
| Tenant plan/settings ambiguity | Medium | Provider dry-run requires both plan and settings to permit WhatsApp. |
| Missing ID false log | Low | Current service returns 404 before logging for missing rows. |

### Recommended Implementation Order

1. Add read-only message log shape test if not already specific enough.
2. Add missing appointment/gift ID no-log tests.
3. Add tenant fallback appointment send test with disposable appointment.
4. Add tenant fallback gift send test with disposable gift.
5. Add provider dry-run boundary report for exact settings mutations if needed.
6. Add provider dry-run appointment/gift tests only after confirming test env uses dummy provider credentials and dry-run.
7. Consider provider failure tests later, after deciding whether controller should normalize thrown provider errors.

### Step 138 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not call WhatsApp send endpoints
- confirm no temporary Step 138 or restore helper directories remain

## SAFE STEP 139 — WHATSAPP NO-REAL-SEND REGRESSION TESTS ONLY

### Scope And Method

This step added safe automated WhatsApp regression tests using isolated SQLite and the existing no-real-send test environment. No application code, WhatsApp send logic, routes, env behavior, database schema, or external dependencies were changed.

### Files Added Or Updated

- Added `server/tests/whatsapp-no-send.test.js`
- Updated `package.json` so `npm run test:api` includes `server/tests/whatsapp-no-send.test.js`

### Tests Added

`server/tests/whatsapp-no-send.test.js` covers:

1. Admin can read `GET /api/message-logs = 200`.
2. Message log response shape is `{ messageLogs: [...] }`.
3. Missing appointment WhatsApp send:
   - `POST /api/appointments/999999/whatsapp = 404`
   - message log count unchanged
4. Missing gift WhatsApp send:
   - `POST /api/gifts/999999/whatsapp = 404`
   - response body `{ error: "Gift card not found." }`
   - message log count unchanged
5. Appointment tenant fallback send:
   - creates disposable category/service/client/appointment
   - `POST /api/appointments/:id/whatsapp = 200`
   - response is fallback-safe: `ok:false`, `configured:false`, `fallbackUrl`
   - message log count increments by 1
   - newest log is `status: "fallback"`, `entity: "appointments"`
   - provider message id is empty
6. Gift tenant fallback send:
   - creates disposable gift
   - `POST /api/gifts/:id/whatsapp = 200`
   - response is fallback-safe: `ok:false`, `configured:false`, `fallbackUrl`
   - message log count increments by 1
   - newest log is `status: "fallback"`, `entity: "gift_cards"`
   - provider message id is empty

### Env Safeguards Confirmed

The tests use `startTestServer()`, which sets:

- `WHATSAPP_ENABLED=false`
- `WHATSAPP_DRY_RUN=true`
- isolated SQLite DB
- isolated uploads directory
- isolated backups directory

The seeded/default tenant settings also keep WhatsApp in fallback mode:

- `whatsappEnabled: "false"`
- `whatsappMode: "fallback"`

### No Real Provider Send Proof

The fallback tests prove no real provider send is required because:

- response is `ok:false`
- response is `configured:false`
- response includes local `fallbackUrl`
- message log status is `fallback`, not `sent`
- provider message id is empty
- env disables WhatsApp provider
- tenant settings remain fallback mode

The tests do not configure real provider credentials and do not test provider dry-run yet.

### Risk Assessment

Production risk is low. The tests create disposable records and message logs only inside isolated SQLite. They do not call Meta Graph API, do not use real WhatsApp credentials, and do not alter runtime send logic.

### Step 139 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 139 or restore helper directories remain

## SAFE STEP 140 - WHATSAPP PROVIDER DRY-RUN REGRESSION BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, routes, env behavior, database writes, WhatsApp send logic, provider configuration, or CI files were changed. No real WhatsApp send was triggered and no real provider credentials were configured.

### Current Provider Path

WhatsApp send endpoints are owned by `server/controllers/whatsapp.controller.js` and `server/services/whatsapp.service.js`:

- `GET /api/message-logs`
- `POST /api/appointments/:id/whatsapp`
- `POST /api/gifts/:id/whatsapp`

Both send endpoints resolve the target record first. Missing appointment or gift IDs return `404` before `sendTenantWhatsApp(...)` is called, so no provider path and no message-log write should occur for missing IDs.

`sendTenantWhatsApp(...)` reaches the provider helper `sendWhatsAppText(...)` only when all tenant-level gates pass:

1. Tenant billing plan supports WhatsApp:
   - `growth` supports WhatsApp
   - `scale` supports WhatsApp
   - `starter` does not support WhatsApp
2. `clinic_settings.whatsappEnabled` is exactly the string `"true"`.
3. `clinic_settings.whatsappMode` is not `"fallback"`.

If any tenant-level gate fails, the service returns tenant fallback behavior and writes a message log with status `fallback`.

### Provider Dry-Run Conditions

Provider dry-run requires passing tenant-level provider gates and then stopping inside `sendWhatsAppText(...)` before `fetch(...)`:

1. Tenant plan/subscription must be `growth` or `scale`.
2. Tenant settings must include:
   - `whatsappEnabled = "true"`
   - `whatsappMode` set to a non-`fallback` provider mode value, such as `"provider"` for tests.
3. Env must include:
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_DRY_RUN=true`
   - dummy non-empty `WHATSAPP_PHONE_NUMBER_ID`
   - dummy non-empty `WHATSAPP_ACCESS_TOKEN`
4. Env must not contain real provider credentials.

The dry-run branch builds the Meta text payload and returns before the network call. The `fetch("https://graph.facebook.com/...")` path is only reached when `WHATSAPP_DRY_RUN=false`.

### Env Variables

Provider and dry-run behavior are read from `server/config.js`:

- `WHATSAPP_ENABLED`: must be `"true"` to leave global disabled fallback.
- `WHATSAPP_DRY_RUN`: must be `"true"` for provider dry-run tests.
- `WHATSAPP_GRAPH_VERSION`: optional, defaults to `v21.0`.
- `WHATSAPP_PHONE_NUMBER_ID`: must be dummy non-empty for provider dry-run.
- `WHATSAPP_ACCESS_TOKEN`: must be dummy non-empty for provider dry-run.
- `WHATSAPP_DEFAULT_COUNTRY_CODE`: optional, defaults to `972`.

If `WHATSAPP_ENABLED=false`, `sendWhatsAppText(...)` returns fallback/configuration-disabled behavior. If `WHATSAPP_ENABLED=true` but phone number id or access token is missing, `sendWhatsAppText(...)` throws a `503` before dry-run.

### Tenant Settings To Change In Isolated DB

Future provider dry-run tests should mutate only the isolated test SQLite DB. The safest setup is direct DB mutation or authenticated settings update inside the temp environment:

- Set tenant 1 plan/subscription to a WhatsApp-enabled plan:
  - `tenants.plan = "growth"` or `"scale"`
  - latest `subscriptions.plan = "growth"` or `"scale"` if a subscription row exists or is created for the test
- Set clinic settings for tenant 1:
  - `whatsappEnabled = "true"`
  - `whatsappMode = "provider"`

The test must restore nothing in production because the entire DB is disposable and removed by the helper.

### Expected Provider Dry-Run Response

For appointment and gift sends, the response should be `200` with the service response body from `sendTenantWhatsApp(...)` plus a fallback URL supplied by the controller/service wrapper:

- `ok: true`
- `dryRun: true`
- `to: "<normalized phone>"`
- `payload: { messaging_product, recipient_type, to, type: "text", text: { preview_url:false, body } }`
- `fallbackUrl: "https://wa.me/..."`

The response should not include `configured:false` in provider dry-run. It should not include a real `messageId` because no provider request is made.

### Expected Message Log

`server/repositories/whatsapp.repository.js` maps `result.dryRun` to message-log status `dry_run`.

Expected newest log for provider dry-run:

- `channel: "whatsapp"`
- `entity: "appointments"` for appointment send
- `entity: "gift_cards"` for gift send
- `entityId` equal to the sent appointment/gift id
- `status: "dry_run"`
- `providerMessageId: ""`
- `fallbackUrl` populated through the service response merge
- `error: ""`

Audit actions should be the successful action path because `result.ok` is true:

- appointment: `whatsapp_sent`
- gift: `gift_whatsapp_sent`

### Proving No External Network Call Occurred

The strongest no-network proof is layered:

1. Start the test server with `WHATSAPP_DRY_RUN=true`.
2. Set only dummy provider values:
   - `WHATSAPP_PHONE_NUMBER_ID=dummy-test-phone-number-id`
   - `WHATSAPP_ACCESS_TOKEN=dummy-test-access-token`
3. Assert the response includes `dryRun:true` and a generated `payload`.
4. Assert the newest message log status is `dry_run`, not `sent`.
5. Assert `providerMessageId` is empty.
6. Optionally harden the helper later with a child-process env flag or preload guard that would fail if global `fetch` reaches `graph.facebook.com`, but that would be a separate tests-only step.

Because `sendWhatsAppText(...)` returns before `fetch(...)` when dry-run is true, dummy credentials are sufficient and no external call should be attempted.

### Safe Appointment Dry-Run Test Plan

1. Use isolated SQLite/uploads/backups through `startTestServer(...)`.
2. Extend or parameterize the test helper in a future tests-only step so it can start with:
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_DRY_RUN=true`
   - dummy phone number id/token
3. Login as clinic admin.
4. Mutate the isolated tenant to WhatsApp provider mode:
   - plan/subscription `growth` or `scale`
   - `whatsappEnabled="true"`
   - `whatsappMode="provider"`
5. Create disposable category, service, client with valid phone, and appointment.
6. Capture message log count.
7. `POST /api/appointments/:id/whatsapp`.
8. Assert `200`, `ok:true`, `dryRun:true`, text payload, and fallback URL.
9. Assert message log count increments by 1 and newest log is `status:"dry_run"`, `entity:"appointments"`.
10. Archive disposable records and let temp DB teardown remove all data.

### Safe Gift Dry-Run Test Plan

1. Use the same isolated provider dry-run server setup.
2. Login as clinic admin.
3. Ensure tenant provider gates are enabled in the isolated DB.
4. Create disposable category, service, client, and gift.
5. Capture message log count.
6. `POST /api/gifts/:id/whatsapp`.
7. Assert `200`, `ok:true`, `dryRun:true`, generated payload, and fallback URL.
8. Assert message log count increments by 1 and newest log is `status:"dry_run"`, `entity:"gift_cards"`.
9. Do not test real provider success and do not set real credentials.

### Failure Behavior To Avoid In Dry-Run Tests

- If tenant plan remains `starter`, the endpoint returns tenant fallback and logs `fallback`.
- If `whatsappEnabled` is not `"true"`, the endpoint returns tenant fallback and logs `fallback`.
- If `whatsappMode` is `"fallback"`, the endpoint returns tenant fallback and logs `fallback`.
- If `WHATSAPP_ENABLED=false`, provider helper returns global disabled fallback.
- If dummy phone number id/token are missing while `WHATSAPP_ENABLED=true`, provider helper throws a `503` and logs `failed` before the controller writes a response path that should be inspected separately before testing.

Future provider dry-run tests should avoid the missing-config failure path until a separate provider-error boundary report is done.

### Risks And Guardrails

| Risk | Level | Guardrail |
| --- | --- | --- |
| Real provider send | High | Force `WHATSAPP_DRY_RUN=true`; use dummy token/id; never use secrets. |
| Accidentally staying in tenant fallback | Medium | Assert response `dryRun:true` and log `dry_run`, not merely `200`. |
| Missing provider dummy config causing `503` | Medium | Provide non-empty dummy `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`. |
| Test DB mutation leaking to dev/prod | High | Use only isolated temp SQLite from test helper; assert `DATABASE_PATH` under temp root. |
| Message/audit log side effects | Low in tests | Side effects are expected inside disposable DB only. |
| CI accidental provider credentials | Medium | Do not use secrets; explicitly override provider env with dummy values in the test helper. |

### Default Suite Recommendation

Provider dry-run tests can be included in default `npm run test:api` once implemented because they should not kill the process, require external services, or use real credentials. They must remain guarded by dummy provider env and isolated SQLite. If a future test adds provider failure/network mocking, keep that as a separate boundary and do not introduce real external calls.

### Recommended Next Step

SAFE STEP 141 should be `WhatsApp Provider Dry-Run Regression Tests Only`: add tests-only support for a provider dry-run test server env, then test appointment and gift provider dry-run responses/logs with dummy credentials and isolated SQLite.

### Step 140 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not call WhatsApp send endpoints
- do not configure real WhatsApp provider credentials
- confirm no temporary Step 140 or restore helper directories remain

## SAFE STEP 141 - WHATSAPP PROVIDER DRY-RUN REGRESSION TESTS ONLY

### Scope And Confirmation

This step added automated tests only. No application WhatsApp logic, routes, database schema, provider behavior, environment semantics, or CI workflow was changed. The tests use isolated SQLite/uploads/backups and dummy provider credentials only.

### Files Added Or Updated

- Added `server/tests/whatsapp-dry-run.test.js`
- Updated `server/tests/helpers/test-server.js` so tests can pass safe env overrides to the isolated child server.
- Updated `package.json` so `npm run test:api` includes `server/tests/whatsapp-dry-run.test.js`.

### Env Safeguards Used

`server/tests/whatsapp-dry-run.test.js` starts its isolated server with:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_DRY_RUN=true`
- `WHATSAPP_PHONE_NUMBER_ID=dummy-test-phone-number-id`
- `WHATSAPP_ACCESS_TOKEN=dummy-test-access-token`

The tests do not use secrets, real provider values, or external services. The dummy provider config only allows the code to pass the missing-config guard before returning from the dry-run branch.

### Tenant Provider Settings Changed In Temp DB

The tests mutate only the isolated SQLite DB created by `startTestServer()`:

- `tenants.plan = "growth"` for tenant `1`
- inserts an active `growth` subscription for tenant `1`
- `clinic_settings.whatsappEnabled = "true"`
- `clinic_settings.whatsappMode = "provider"`

These changes are removed when the helper deletes the temporary test root.

### Tests Added

`server/tests/whatsapp-dry-run.test.js` covers:

1. Appointment provider dry-run:
   - creates disposable category/service/client/appointment
   - enables provider mode in the isolated DB
   - `POST /api/appointments/:id/whatsapp = 200`
   - response includes `ok:true`
   - response includes `dryRun:true`
   - response includes a generated WhatsApp payload
   - response is not tenant fallback (`configured:false` is not present)
   - newest message log is `status:"dry_run"`, `entity:"appointments"`
   - log count increments by 1
2. Gift provider dry-run:
   - creates disposable gift using the same temp client/service
   - `POST /api/gifts/:id/whatsapp = 200`
   - response includes `ok:true`
   - response includes `dryRun:true`
   - response includes a generated WhatsApp payload
   - response is not tenant fallback
   - newest message log is `status:"dry_run"`, `entity:"gift_cards"`
   - log count increments by 1

### No Real WhatsApp Send Proof

The tests prove dry-run and no real send through layered assertions:

- env forces `WHATSAPP_DRY_RUN=true`
- env uses dummy token/id values, not secrets
- response includes `dryRun:true`
- response includes payload but no `messageId`
- response is not fallback/configured-false mode
- message log status is `dry_run`, not `sent` or `fallback`
- provider message id is empty

The application provider helper returns before the Meta Graph `fetch(...)` call when dry-run is true, so no external network call is needed for these tests.

### Risk Assessment

Production risk is low. The changes are tests and test helper behavior only. The only runtime-like side effects are disposable message/audit logs and temporary records inside isolated SQLite. Real provider credentials are not used, and the default CI/API test path remains self-contained.

### Step 141 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 141, API test, or restore helper directories remain

## SAFE STEP 142 - WHATSAPP PROVIDER FAILURE BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, routes, env behavior, database writes, WhatsApp send logic, provider configuration, or CI files were changed. No WhatsApp send endpoint was called, no real provider credentials were configured, and no real WhatsApp send was triggered.

### Conditions That Cause Fallback Before Provider

`sendTenantWhatsApp(...)` in `server/services/whatsapp.service.js` returns fallback before calling `sendWhatsAppText(...)` when any tenant-level provider gate fails:

1. The current tenant plan does not support WhatsApp:
   - `starter` -> no WhatsApp provider access
   - `growth` / `scale` -> WhatsApp provider access allowed
2. `clinic_settings.whatsappEnabled` is not exactly `"true"`.
3. `clinic_settings.whatsappMode` is exactly `"fallback"`.

The global disabled-provider path also returns fallback-like behavior inside `sendWhatsAppText(...)`:

- `WHATSAPP_ENABLED=false` returns `{ ok:false, configured:false, fallbackUrl, message }`
- this path is logged as `fallback`
- no network call is attempted

Missing appointment/gift records return `404` before tenant/provider evaluation and before any message log write.

### Conditions That Cause Dry Run Before Network Call

Dry-run occurs only after tenant provider gates pass and provider config is present:

1. Tenant plan/subscription supports WhatsApp.
2. `whatsappEnabled = "true"`.
3. `whatsappMode` is not `"fallback"`.
4. `WHATSAPP_ENABLED=true`.
5. `WHATSAPP_PHONE_NUMBER_ID` is non-empty.
6. `WHATSAPP_ACCESS_TOKEN` is non-empty.
7. `WHATSAPP_DRY_RUN=true`.

When these conditions hold, `sendWhatsAppText(...)` builds the Meta text payload and returns `{ ok:true, dryRun:true, to, payload }` before reaching `fetch(...)`.

### Conditions That Reach The Real Provider Call

The Meta Graph API `fetch(...)` is reachable only when all provider gates and config checks pass and dry-run is disabled:

- tenant plan/settings allow provider mode
- `WHATSAPP_ENABLED=true`
- `WHATSAPP_PHONE_NUMBER_ID` is non-empty
- `WHATSAPP_ACCESS_TOKEN` is non-empty
- `WHATSAPP_DRY_RUN=false`

The request target is currently hardcoded to:

`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`

There is no provider URL override in current config, so a local dummy unreachable URL is not supported without changing application code.

### Missing Provider Config Behavior

If tenant provider gates pass and `WHATSAPP_ENABLED=true`, missing config is handled in `sendWhatsAppText(...)` before dry-run and before network:

- missing `WHATSAPP_PHONE_NUMBER_ID`
- missing `WHATSAPP_ACCESS_TOKEN`

Current behavior:

1. `sendWhatsAppText(...)` throws `Error("WhatsApp API is missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN")`.
2. The error has `status = 503`.
3. `sendTenantWhatsApp(...)` catches it.
4. `sendTenantWhatsApp(...)` writes a message log with:
   - `status = "failed"`
   - `fallback_url` populated
   - `error` set to the error message
   - empty `provider_message_id`
5. `sendTenantWhatsApp(...)` rethrows the error.
6. The WhatsApp controller does not catch service errors locally.
7. The top-level `server/app.js` catch writes JSON using `error.status || 500`.

Expected endpoint response for missing config is therefore:

- status `503`
- body `{ "error": "WhatsApp API is missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN" }`

This is a controlled top-level error response, but it is not locally shaped by the WhatsApp controller.

### Provider HTTP Failure Behavior

If the real provider call is reached and Meta returns non-2xx:

1. `sendWhatsAppText(...)` reads the JSON response if possible.
2. It throws an error with:
   - message `data.error?.message || "WhatsApp API request failed"`
   - `status = response.status`
   - `details = data`
3. `sendTenantWhatsApp(...)` catches the error.
4. It writes a message log with `status = "failed"` and the fallback URL.
5. It rethrows the error.
6. The top-level app catch returns `error.status || 500` and `{ error: error.message }`.

If the network request itself rejects rather than returning an HTTP response, the thrown error likely has no `status`; the top-level app catch would return:

- status `500`
- body `{ error: error.message }`

Current code has no local provider failure adapter that normalizes provider/network failures into a stable WhatsApp-specific response body.

### Message Log Behavior On Failure

`server/repositories/whatsapp.repository.js` maps logs as:

- `error` present -> `failed`
- `result.dryRun` true -> `dry_run`
- `result.ok` true -> `sent`
- otherwise -> `fallback`

Provider missing-config and provider HTTP failures both pass `error.message` into `logMessage(...)`, so they should create `failed` message logs before the endpoint response is written.

Expected failed log fields:

- `channel: "whatsapp"`
- `entity: "appointments"` or `"gift_cards"`
- `entityId` set to the target id
- `status: "failed"`
- `providerMessageId: ""`
- `fallbackUrl` populated
- `error` populated with the thrown provider error message

### Endpoint Response Behavior On Provider Failure

Appointment and gift send handlers call service functions directly and then write `json(res, result.status, result.body)` only if the service returns normally.

When provider failure throws:

- `handleWhatsAppRoute(...)` does not write a response.
- `handleApi(...)` does not catch locally.
- the top-level `createServer` catch in `server/app.js` writes:
  - status `error.status || 500`
  - body `{ error: error.message || "<server error string>" }`

This means missing config should be a controlled `503`, provider HTTP failure should mirror provider HTTP status, and network exceptions can become `500`.

### Safe Failure-Test Options

1. **Missing config path**
   - safest current failure test
   - configure isolated tenant provider gates to pass
   - set `WHATSAPP_ENABLED=true`
   - set `WHATSAPP_DRY_RUN=true` or `false`; missing config is checked before dry-run
   - leave phone number id or access token empty
   - assert `503`
   - assert newest message log `failed`
   - no network call is possible because missing config throws before payload/fetch

2. **Global provider disabled path**
   - already effectively covered by tenant fallback/no-real-send style
   - set tenant provider gates to pass but `WHATSAPP_ENABLED=false`
   - assert fallback/configured-false response and `fallback` log
   - useful but not a provider failure; it is a configured fallback

3. **Mock fetch**
   - safest way to test provider HTTP failure without network if implemented in test harness only
   - possible approach: start a child server with a Node preload/import hook or explicit test-only global fetch guard if supported
   - must not change application code
   - can assert a fake non-2xx provider response maps to failed log and top-level JSON status
   - should be designed in a separate boundary step before implementation

4. **Dummy local unreachable URL**
   - not currently supported
   - provider URL is hardcoded to Meta Graph API and only graph version/phone id/token are configurable
   - do not use this unless application code later gains a safe provider base URL override

5. **Real provider HTTP failure with dummy token**
   - not safe for default tests
   - would depend on external network and Meta behavior
   - violates no external network dependency

### Risks And Guardrails

| Risk | Level | Guardrail |
| --- | --- | --- |
| Real provider call | High | Never set `WHATSAPP_DRY_RUN=false` with real credentials; do not use secrets. |
| External network dependency | High | Prefer missing-config failure or a test-only fetch mock/guard. |
| Treating disabled provider fallback as failure | Medium | Distinguish `fallback` logs from `failed` logs. |
| Endpoint response instability | Medium | Current failure response is top-level catch behavior, not local controller shaping. |
| Failed message log side effects | Low in tests | Use isolated SQLite only. |
| Network exception returning 500 | Medium | Document before fixing; do not assert provider-network failure without a controlled mock. |

### Recommended Future Failure-Mode Test Plan

1. Add missing-config failure regression tests first:
   - isolated SQLite
   - tenant provider gates enabled
   - `WHATSAPP_ENABLED=true`
   - one required provider env missing
   - appointment send returns `503`
   - gift send returns `503`
   - newest logs are `failed`
   - no network is reachable
2. Add a report-only step for fetch mocking if HTTP failure parity is needed.
3. Add provider HTTP failure tests only with a test-only fetch mock/guard and no external network.
4. Defer real provider integration tests to a manual, secrets-backed environment outside default CI.

### Recommended Next Step

SAFE STEP 143 should be `WhatsApp Missing Provider Config Regression Tests Only`: add tests for missing `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` using isolated SQLite and provider tenant gates, asserting controlled `503` and `failed` logs with no network call.

### Step 142 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not call WhatsApp send endpoints
- do not configure real WhatsApp provider credentials
- confirm no temporary Step 142, API test, or restore helper directories remain

## SAFE STEP 143 - WHATSAPP MISSING PROVIDER CONFIG REGRESSION TESTS ONLY

### Scope And Confirmation

This step added tests only. No application WhatsApp logic, routes, database schema, provider HTTP behavior, CI workflow, or production env behavior was changed. The tests do not use real WhatsApp credentials, do not use secrets, do not trigger real sends, and do not test provider HTTP failure.

### Files Added Or Updated

- Added `server/tests/whatsapp-provider-failure.test.js`
- Updated `package.json` so `npm run test:api` includes `server/tests/whatsapp-provider-failure.test.js`

### Env Safeguards Used

The missing-config test server uses isolated SQLite/uploads/backups and starts with:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_DRY_RUN=false`
- `WHATSAPP_PHONE_NUMBER_ID=""`
- `WHATSAPP_ACCESS_TOKEN=""`

Because phone number id and access token are empty, `sendWhatsAppText(...)` throws before building a provider network request. This keeps the test independent of external network and provider availability.

### Tenant Provider Settings Changed In Temp DB

The tests mutate only the temp SQLite DB:

- `tenants.plan = "growth"` for tenant `1`
- inserts an active `growth` subscription for tenant `1`
- `clinic_settings.whatsappEnabled = "true"`
- `clinic_settings.whatsappMode = "provider"`

These mutations are intentionally needed to pass tenant fallback gates and reach the missing provider config guard.

### Tests Added

`server/tests/whatsapp-provider-failure.test.js` covers:

1. Appointment missing provider config:
   - creates disposable category/service/client/appointment
   - enables tenant provider mode in temp DB
   - `POST /api/appointments/:id/whatsapp = 503`
   - response body is `{ error: "WhatsApp API is missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN" }`
   - message log count increments by 1
   - newest log is `status:"failed"`, `entity:"appointments"`
   - newest log has fallback URL and empty provider message id
2. Gift missing provider config:
   - creates disposable gift with temp client/service
   - enables tenant provider mode in temp DB
   - `POST /api/gifts/:id/whatsapp = 503`
   - response body is the same missing-config error
   - message log count increments by 1
   - newest log is `status:"failed"`, `entity:"gift_cards"`
   - newest log has fallback URL and empty provider message id

### Missing-Config Path Proof

The tests prove the missing-config path was used because:

- tenant provider gates are enabled, so tenant fallback should not run
- `WHATSAPP_ENABLED=true`, so global disabled fallback should not run
- `WHATSAPP_DRY_RUN=false`, so dry-run should not run
- provider id/token are empty, so the explicit missing-config guard throws
- endpoint response is `503` with the missing-config error
- message log status is `failed`, not `fallback`, `dry_run`, or `sent`

### No Real Send Proof

No real WhatsApp send can occur in these tests because missing provider config is checked before the `fetch(...)` call. The tests also use no real token/id values and make no external provider HTTP assertions.

### Risk Assessment

Production risk is low. The changes are test-only and use isolated SQLite. The tests intentionally exercise a controlled failure path before network access. They do not alter application behavior or provider configuration logic.

### Step 143 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 143, API test, or restore helper directories remain

## SAFE STEP 144 - WHATSAPP PROVIDER HTTP FAILURE MOCK BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, routes, env behavior, application provider logic, credentials, or CI files were changed. No WhatsApp send endpoint was called, no real provider credentials were configured, and no external network calls were made.

### Current Real Provider HTTP Call Location

The real provider HTTP call is in `server/whatsapp.js`, inside `sendWhatsAppText({ to, message })`:

- normalizes the target phone
- checks `WHATSAPP_ENABLED`
- checks `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN`
- builds the Meta text message payload
- returns early if `WHATSAPP_DRY_RUN=true`
- otherwise calls global `fetch(...)` against:

`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`

There is no provider base URL env override and no provider adapter abstraction today.

### Conditions Required To Reach Fetch

The app reaches the real provider `fetch(...)` only when all conditions are true:

1. The send endpoint resolves an existing appointment or gift.
2. Tenant billing plan supports WhatsApp (`growth` or `scale`).
3. `clinic_settings.whatsappEnabled = "true"`.
4. `clinic_settings.whatsappMode !== "fallback"`.
5. `WHATSAPP_ENABLED=true`.
6. `WHATSAPP_PHONE_NUMBER_ID` is non-empty.
7. `WHATSAPP_ACCESS_TOKEN` is non-empty.
8. `WHATSAPP_DRY_RUN=false`.

The existing tests cover tenant fallback, provider dry-run, and missing config before this network branch. They do not intentionally reach real provider `fetch(...)`.

### Provider HTTP Non-2xx Behavior

If `fetch(...)` resolves with a non-2xx response:

1. `sendWhatsAppText(...)` tries to parse JSON from the provider response.
2. It throws an error with:
   - `message = data.error?.message || "WhatsApp API request failed"`
   - `status = response.status`
   - `details = data`
3. `sendTenantWhatsApp(...)` catches the error.
4. It writes a message log with:
   - `status = "failed"`
   - `fallback_url` populated
   - `error` populated
   - empty `provider_message_id`
5. It rethrows the error.
6. The top-level catch in `server/app.js` writes:
   - HTTP status `error.status || 500`
   - body `{ error: error.message || "<server error string>" }`

So provider `400` and `500` responses should become controlled JSON responses with the same status and a provider-derived or fallback error message.

### Network Exception Behavior

If `fetch(...)` rejects before an HTTP response exists:

1. the thrown network error usually has no `status`
2. `sendTenantWhatsApp(...)` still catches it and writes a `failed` message log
3. it rethrows
4. the top-level app catch returns:
   - status `500`
   - body `{ error: error.message }`

This is controlled by the global app error handler, but not normalized by WhatsApp-specific service/controller code.

### Failed Log Behavior

`server/repositories/whatsapp.repository.js` sets message log status by priority:

- `error` present -> `failed`
- `result.dryRun` true -> `dry_run`
- `result.ok` true -> `sent`
- otherwise -> `fallback`

Provider HTTP non-2xx and network exceptions both flow through the `catch` block in `sendTenantWhatsApp(...)`, so they should write `failed` logs before the endpoint response is emitted.

Expected failed log assertions for future tests:

- `status: "failed"`
- `entity: "appointments"` or `"gift_cards"`
- matching `entityId`
- empty `providerMessageId`
- non-empty `fallbackUrl`
- `error` equals mocked provider/network error message
- newest log status is not `sent`, `dry_run`, or `fallback`

### Response Status And Body Control

Current response control is top-level rather than WhatsApp-local:

- WhatsApp controller does not catch provider errors.
- `handleApi(...)` does not catch provider errors.
- `server/app.js` catches all thrown errors and serializes `{ error: error.message }`.

Provider HTTP failures with an error status are reasonably controlled. Network exceptions become a generic `500` with the thrown message. A future behavior-hardening step could add a WhatsApp-local error adapter, but that would be application behavior change and is outside this report.

### Safe Mocking Options

| Option | Requires app code change | Safe without network | Notes |
| --- | --- | --- | --- |
| Child process preload file | No | Yes | Use a test-only preload module via `NODE_OPTIONS=--import <file>` in the isolated child server env. The preload patches `globalThis.fetch` before `server/app.js` imports app modules. |
| Node global fetch monkey patch inside test file only | No for same process, but not enough here | No for current child server | Current API tests run the server in a child process, so patching parent test process `globalThis.fetch` will not affect server fetch. |
| Env flag test-only provider mock | Yes if app reads the flag | Yes | Would require app/provider code to branch on a new test env flag. Not allowed for tests-only step. |
| Dependency injection/provider adapter | Yes | Yes | Clean long-term design, but changes app structure and must be a separate app-code safe step. |
| Dummy local unreachable URL | Yes, unless base URL override exists | Potentially | No provider base URL override exists today; hardcoded Graph URL prevents this safely. |
| Real Meta request with dummy credentials | No | No | Forbidden: external network dependency and possible provider side effects/rate limits. |

### Recommended Mock Strategy

Use a **test-only child process preload file** in a future tests-only step.

Recommended design:

1. Add `server/tests/helpers/mock-fetch-preload.js` or similar.
2. The preload reads a test-only env variable such as `WHATSAPP_TEST_FETCH_MODE`.
3. It patches `globalThis.fetch` inside the child server process.
4. It only allows requests to `https://graph.facebook.com/...`.
5. It returns deterministic fake responses:
   - mode `provider-400`: `ok:false`, `status:400`, JSON `{ error: { message: "Mock WhatsApp provider 400" } }`
   - mode `provider-500`: `ok:false`, `status:500`, JSON `{ error: { message: "Mock WhatsApp provider 500" } }`
   - mode `network-error`: throws `Error("Mock WhatsApp network failure")`
6. If any unexpected URL is requested, it throws a hard test failure.
7. The isolated test server sets:
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_DRY_RUN=false`
   - dummy non-empty provider id/token
   - provider-enabled tenant settings in temp SQLite
   - `NODE_OPTIONS=--import <preload file>`

This approach does not require application code changes and keeps the mock inside the child process where `server/whatsapp.js` calls `fetch(...)`.

### Why Parent-Process Monkey Patch Is Not Enough

The current test helper starts the backend with `spawn(process.execPath, ["server/app.js"], ...)`. The server's `globalThis.fetch` lives in that child process. Patching `globalThis.fetch` in the parent `node:test` process would only affect test-side HTTP calls, not provider calls made by the backend. A preload or app-level injection is needed to reach the backend process safely.

### Why Dummy Real Network Requests Are Forbidden

Dummy real network requests would:

- depend on external Meta availability
- require hitting a real external URL
- potentially leak request metadata
- make CI flaky
- risk rate limits or unexpected provider behavior
- violate the no-external-network and no-real-send safety boundary

All provider failure tests should therefore use a mock or pre-network failure path.

### Proposed Future Test Cases

Future provider HTTP failure tests should use isolated SQLite and the preload strategy:

1. Appointment provider returns 400:
   - response status `400`
   - body `{ error: "Mock WhatsApp provider 400" }`
   - newest message log `failed`
2. Gift provider returns 400:
   - same assertions for `gift_cards`
3. Appointment provider returns 500:
   - response status `500`
   - body `{ error: "Mock WhatsApp provider 500" }`
   - newest message log `failed`
4. Gift provider returns 500:
   - same assertions for `gift_cards`
5. Network exception:
   - response status `500`
   - body `{ error: "Mock WhatsApp network failure" }`
   - newest message log `failed`
6. For every case:
   - log count increments by 1
   - newest log is not `sent`, `dry_run`, or `fallback`
   - provider message id is empty
   - no real credentials or network are used

### Risks And Guardrails

| Risk | Level | Guardrail |
| --- | --- | --- |
| Mock not installed in child process | High | Use `NODE_OPTIONS=--import` in the child env and assert the mock was invoked. |
| Mock accidentally intercepts test client fetch | Low | Preload applies only to child server process; parent test client stays normal. |
| Real network fallback if mock misses URL | High | Preload must throw on any unexpected external URL and never call original fetch for Graph URLs. |
| App behavior changes | Medium | Keep preload and env variables under `server/tests`; no runtime code branches. |
| Over-asserting top-level error details | Medium | Assert current top-level `{ error }` behavior, but document it is not WhatsApp-local shaping. |

### Testability Conclusion

Provider HTTP failure is testable safely without application behavior changes by using a child-process preload that patches `globalThis.fetch` before `server/app.js` loads. Parent-process monkey patching is insufficient because the server runs in a separate process. Dependency injection would be cleaner architecturally but requires app code changes and should not be used for the immediate tests-only step.

### Recommended Next Step

SAFE STEP 145 should be `WhatsApp Provider HTTP Failure Mock Helper Only`: add a test-only preload/mock-fetch helper and a tiny self-test or API test harness check, without adding provider failure endpoint tests yet.

### Step 144 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not call WhatsApp send endpoints
- do not configure real WhatsApp provider credentials
- confirm no temporary Step 144, API test, or restore helper directories remain

## SAFE STEP 145 - WHATSAPP PROVIDER HTTP FAILURE MOCK HELPER ONLY

### Scope And Confirmation

This step added a test-only fetch mock preload/helper and a helper self-test only. No application code, WhatsApp runtime logic, routes, database schema, CI workflow, or provider behavior was changed. No provider endpoint failure tests were written, no WhatsApp send endpoint was called by the new helper self-test, no real credentials were used, and no external network call was made.

### Files Added Or Updated

- Added `server/tests/helpers/mock-fetch-preload.js`
- Added `server/tests/mock-fetch-preload.test.js`
- Updated `package.json` so `npm run test:api` includes `server/tests/mock-fetch-preload.test.js`

### Preload Helper Behavior

`server/tests/helpers/mock-fetch-preload.js` is designed to run inside a child server process with:

`NODE_OPTIONS=--import=<absolute file URL to preload>`

It overrides `globalThis.fetch` in that process and:

1. Intercepts only URLs beginning with `https://graph.facebook.com/`.
2. Uses `MOCK_FETCH_MODE` to choose deterministic behavior:
   - `provider_400` returns a mocked `Response` with `ok:false`, `status:400`, and JSON error message `Mock WhatsApp provider 400`
   - `provider_500` returns a mocked `Response` with `ok:false`, `status:500`, and JSON error message `Mock WhatsApp provider 500`
   - `network_error` throws `Error("Mock WhatsApp provider network error")`
3. Throws a hard failure for any unexpected external `http` or `https` URL.
4. Delegates local URLs such as `localhost`, `127.0.0.1`, and `::1` to the original fetch.
5. Never calls the real Meta Graph API for Graph URLs.

### Safety Guards

The helper guards against real network by:

- matching Graph URLs before delegating to original fetch
- never delegating Graph URLs
- throwing for unexpected external URLs
- requiring an explicit `MOCK_FETCH_MODE`
- keeping all behavior under `server/tests`

This keeps future provider HTTP failure tests deterministic and prevents accidental external provider calls.

### Self-Test Added

`server/tests/mock-fetch-preload.test.js` spawns tiny child Node processes with `NODE_OPTIONS=--import=<preload>` and does not start the app.

It verifies:

- `fetch("https://graph.facebook.com/test/messages")` returns mocked `400`
- `fetch("https://graph.facebook.com/test/messages")` returns mocked `500`
- `network_error` mode throws `Mock WhatsApp provider network error`
- an unexpected external URL such as `https://example.com/not-allowed` is blocked

The self-test does not call `/api/appointments/:id/whatsapp`, `/api/gifts/:id/whatsapp`, or any other app endpoint.

### Provider Endpoint Tests Not Added

This step intentionally did not add provider HTTP failure endpoint tests. It only proves that a future child server process can preload a fetch mock safely. Endpoint tests should be added in a later focused step after this helper has passed in the default API suite.

### Risk Assessment

Production risk is low. The new preload is test-only and not imported by runtime code. The package script change only adds a helper self-test to `npm run test:api`. No CI workflow was changed.

### Recommended Next Step

SAFE STEP 146 should be `WhatsApp Provider HTTP Failure Regression Tests Only`: use the preload helper in an isolated child server process, enable provider tenant gates with dummy credentials, and test appointment/gift provider `400`, provider `500`, and network-error responses/logs without external network.

### Step 145 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no WhatsApp endpoint was called by the new helper self-test
- confirm no temporary Step 145, API test, or restore helper directories remain

## SAFE STEP 146 - WHATSAPP PROVIDER HTTP FAILURE REGRESSION TESTS ONLY

### Scope And Confirmation

This step added automated tests only. No application WhatsApp logic, routes, database schema, CI workflow, or production behavior was changed. The tests use the test-only mock fetch preload inside isolated child server processes, dummy provider credentials, and isolated SQLite/uploads/backups.

### Files Added Or Updated

- Added `server/tests/whatsapp-provider-http-failure.test.js`
- Updated `package.json` so `npm run test:api` includes `server/tests/whatsapp-provider-http-failure.test.js`

### Env And Mock Safeguards

Each provider HTTP failure test starts an isolated child server with:

- `NODE_OPTIONS=--import=<absolute file URL to server/tests/helpers/mock-fetch-preload.js>`
- `WHATSAPP_ENABLED=true`
- `WHATSAPP_DRY_RUN=false`
- `WHATSAPP_PHONE_NUMBER_ID=dummy-test-phone-number-id`
- `WHATSAPP_ACCESS_TOKEN=dummy-test-access-token`
- `MOCK_FETCH_MODE=provider_400`, `provider_500`, or `network_error`

The preload intercepts `https://graph.facebook.com/...` inside the child server process and never delegates Graph URLs to real fetch. Unexpected external URLs are blocked.

### Tenant Provider Settings Changed In Temp DB

The tests mutate only each isolated temp SQLite DB:

- `tenants.plan = "growth"` for tenant `1`
- inserts an active `growth` subscription for tenant `1`
- `clinic_settings.whatsappEnabled = "true"`
- `clinic_settings.whatsappMode = "provider"`

These changes are removed when the test helper removes the temp root.

### Tests Added

`server/tests/whatsapp-provider-http-failure.test.js` covers:

1. Appointment provider `400`:
   - mocked provider returns `400`
   - endpoint returns status `400`
   - response body `{ error: "Mock WhatsApp provider 400" }`
   - newest message log status is `failed`
2. Appointment provider `500`:
   - mocked provider returns `500`
   - endpoint returns status `500`
   - response body `{ error: "Mock WhatsApp provider 500" }`
   - newest message log status is `failed`
3. Appointment provider network exception:
   - mock throws `Mock WhatsApp provider network error`
   - endpoint returns current top-level status `500`
   - response body `{ error: "Mock WhatsApp provider network error" }`
   - newest message log status is `failed`
4. Gift provider `400`:
   - mocked provider returns `400`
   - endpoint returns status `400`
   - response body `{ error: "Mock WhatsApp provider 400" }`
   - newest message log status is `failed`

### Message Log Assertions

Each provider failure test asserts:

- log count increments by 1
- newest log has `status = "failed"`
- newest log has matching `entity` and `entityId`
- `providerMessageId` is empty
- `fallbackUrl` is populated
- `error` equals the mocked provider/network error

These assertions prove the result is not `fallback`, not `dry_run`, and not `sent`.

### No Real Send Proof

No real WhatsApp send occurs because:

- provider id/token are dummy values
- the child server process has `mock-fetch-preload.js` installed before app startup
- the preload intercepts all Graph URLs
- the preload blocks unexpected external URLs
- tests assert mocked error messages that can only come from the preload

### Risk Assessment

Production risk is low. The tests are isolated and test-only. The preload is not imported by runtime code outside tests, and no CI workflow was changed. The tests increase safety around provider failure handling without changing provider behavior.

### Recommended Next Step

SAFE STEP 147 should be `WhatsApp Regression Coverage Final Report Only`: document fallback, dry-run, missing-config, provider HTTP failure, and message-log coverage; identify remaining WhatsApp risks such as real provider integration/manual tests, template content, rate limits, and UI coverage.

### Step 146 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 146, API test, or restore helper directories remain

## SAFE STEP 147 - WHATSAPP REGRESSION COVERAGE FINAL REPORT

### Scope And Confirmation

This step is report-only. No code, tests, routes, env behavior, CI workflow, WhatsApp provider logic, or database schema was changed. No real WhatsApp credentials were configured, no real WhatsApp sends were triggered, and no external provider network calls were made.

### WhatsApp Routes Covered

Current automated coverage protects all extracted WhatsApp routes:

- `GET /api/message-logs`
- `POST /api/appointments/:id/whatsapp`
- `POST /api/gifts/:id/whatsapp`

The route boundary regexes still require numeric IDs for send routes, and broader malformed path coverage remains in the general negative/security test suite.

### Test Files And Responsibility

- `server/tests/whatsapp-no-send.test.js`
  - reads message logs
  - verifies missing appointment/gift IDs return `404`
  - verifies missing IDs do not write logs
  - verifies tenant fallback appointment/gift sends return fallback-safe responses
  - verifies fallback sends write `fallback` message logs
- `server/tests/whatsapp-dry-run.test.js`
  - enables provider tenant gates in isolated SQLite
  - starts child server with dummy provider config and `WHATSAPP_DRY_RUN=true`
  - verifies appointment/gift provider dry-run responses
  - verifies `dry_run` message logs
- `server/tests/whatsapp-provider-failure.test.js`
  - enables provider tenant gates in isolated SQLite
  - starts child server with `WHATSAPP_ENABLED=true`, `WHATSAPP_DRY_RUN=false`, and empty provider id/token
  - verifies appointment/gift missing provider config returns controlled `503`
  - verifies `failed` message logs
- `server/tests/helpers/mock-fetch-preload.js`
  - test-only child-process preload that intercepts Graph fetch calls
  - returns deterministic provider `400`, provider `500`, or network error
  - blocks unexpected external URLs
- `server/tests/mock-fetch-preload.test.js`
  - self-tests the preload without starting the app or calling WhatsApp endpoints
  - verifies mocked `400`, `500`, network error, and external URL blocking
- `server/tests/whatsapp-provider-http-failure.test.js`
  - starts isolated child servers with the mock-fetch preload
  - enables provider tenant gates and dummy credentials
  - verifies provider `400`, provider `500`, and network exception behavior
  - verifies `failed` message logs

### Covered Behaviors

1. Missing IDs:
   - `POST /api/appointments/999999/whatsapp = 404`
   - `POST /api/gifts/999999/whatsapp = 404`
   - message log count remains unchanged
2. Tenant fallback:
   - default tenant has `whatsappEnabled=false` and `whatsappMode=fallback`
   - appointment fallback send returns `ok:false`, `configured:false`, and `fallbackUrl`
   - gift fallback send returns the same fallback-safe shape
   - newest message log status is `fallback`
3. Provider dry-run:
   - tenant plan/settings are changed only in isolated SQLite
   - env uses dummy provider config
   - `WHATSAPP_DRY_RUN=true`
   - appointment/gift sends return `ok:true`, `dryRun:true`, and payload
   - newest message log status is `dry_run`
4. Missing provider config:
   - tenant provider gates pass
   - `WHATSAPP_ENABLED=true`
   - `WHATSAPP_DRY_RUN=false`
   - provider id/token are empty
   - appointment/gift sends return `503`
   - response body contains the missing-config error
   - newest message log status is `failed`
5. Provider HTTP failure:
   - Graph fetch is intercepted inside child server process
   - appointment mocked provider `400` returns `400`
   - appointment mocked provider `500` returns `500`
   - appointment mocked network exception returns current top-level `500`
   - gift mocked provider `400` returns `400`
   - newest message log status is `failed`

### Safety Guarantees

Automated WhatsApp tests are guarded by:

- isolated SQLite databases
- isolated uploads/backups directories
- no real WhatsApp credentials
- no secrets
- dummy provider id/token where config is needed
- `WHATSAPP_DRY_RUN=true` for dry-run tests
- empty provider id/token for missing-config tests
- child-process Graph fetch preload for provider HTTP failure tests
- hard external URL blocking in the preload
- no dependency on Meta network availability

The test suite does not need or use a real provider token, real phone number id, or real recipient delivery.

### Message Log Coverage

The automated suite covers these message log statuses:

- `fallback`
  - tenant fallback appointment/gift sends
  - provider message id remains empty
  - fallback URL is present
- `dry_run`
  - provider dry-run appointment/gift sends
  - provider message id remains empty
  - fallback URL is present through service response merge
- `failed`
  - missing provider config appointment/gift sends
  - mocked provider `400`
  - mocked provider `500`
  - mocked network exception
  - provider message id remains empty
  - fallback URL is present
  - error text matches the thrown/mocked failure

The suite intentionally does not assert `sent` logs because real provider success is not safe for automated default tests.

### No-Real-Send Proof

No real WhatsApp send is used in automated tests because:

- fallback tests keep tenant/provider disabled
- dry-run tests return before provider `fetch(...)`
- missing-config tests throw before provider `fetch(...)`
- provider HTTP failure tests intercept Graph fetch inside the child server process
- the preload never delegates Graph URLs to the original fetch
- unexpected external URLs are blocked
- assertions use dummy/mock response messages that cannot come from Meta

### Remaining Manual Integration Gaps

These areas remain intentionally manual or future-specialized:

- real Meta Cloud API credentials and business phone number setup
- WhatsApp template approval and localization behavior
- real phone delivery confirmation
- real provider success response with a real `messageId`
- provider rate limits and throttling behavior
- production-level webhook/status callbacks, if added later
- real provider dashboard/audit reconciliation
- UI end-to-end flow around pressing WhatsApp send buttons
- production monitoring/alerting for provider failure spikes

### Backend Deployment Readiness

Current automated coverage is enough for safer backend deployment of the modular WhatsApp routes with provider disabled, fallback mode, or dry-run mode. It also protects controlled provider failure behavior without external network. Enabling real WhatsApp sends in production still requires a manual operational rollout because automated tests intentionally do not verify actual Meta delivery.

### Production Enablement Checklist

Before enabling real WhatsApp in production:

1. Confirm tenant plan supports WhatsApp (`growth` or `scale`).
2. Confirm tenant settings:
   - `whatsappEnabled=true`
   - `whatsappMode` is not `fallback`
3. Configure real `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` only in production secrets/env.
4. Keep `WHATSAPP_DRY_RUN=true` for a first production smoke if possible.
5. Send one manual test message to an approved internal number only.
6. Verify message log transitions from `dry_run`/`fallback` expectations to `sent` only when intentionally enabled.
7. Confirm provider dashboard shows the expected request.
8. Confirm no unexpected external errors in app logs.
9. Confirm fallback URL remains available to operators if provider config is disabled.
10. Monitor failed message log counts after enablement.
11. Have rollback ready:
    - set `WHATSAPP_ENABLED=false`, or
    - set tenant `whatsappMode=fallback`

### Recommended Next Step

SAFE STEP 148 should be `Final Backend Production Readiness Update Report Only`: update the production-readiness report after the expanded WhatsApp regression suite, including total test count, remaining manual provider risks, restore/manual risks, CI posture, and deployment go/no-go checklist.

### Step 147 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- do not call real WhatsApp provider
- do not configure real credentials
- confirm no temporary Step 147, API test, or restore helper directories remain

## SAFE STEP 148 - FINAL BACKEND PRODUCTION READINESS UPDATE

### Scope And Confirmation

This step is report-only. No code, tests, routes, validation logic, SQL, CI workflow, or env behavior was changed.

### Architecture Status

The backend is now modular and no longer depends on the legacy runtime at application startup:

- active routes are registered through modular route/controller/service/repository boundaries
- `/api/bootstrap` is modular
- auth compatibility boundaries are shared under `server/shared/auth`
- static serving is shared under `server/shared/http`
- final API 404 handling is shared under `server/shared/http`
- system export/restore is extracted into the system module
- `server/legacy-runtime.js` is no longer present in `server/`
- the retired legacy runtime is archived as a rollback/reference artifact under `docs/archive/legacy-runtime.retired.js`
- route ownership is fully modular for auth, account, signup, bootstrap, users, clients, appointments, files, consents, message logs/WhatsApp, gifts, settings, tenant domains, platform, system, catalog, billing, invitations, feedback, CRM, reports, audit, and search

### Validation Status

Validation hardening has covered the major backend input and boundary classes:

- required-field validation for core create endpoints
- update required-field validation for clients, appointments, categories, services, and users
- numeric validation for service, appointment, gift, platform invoice, platform tenant, and related numeric fields
- date/time validation for appointments, CRM tasks, platform invoices, and billing invoice dates where accepted
- enum/status validation for appointment, gift, CRM task, user, platform tenant/invoice, billing, invitation, feedback, and tenant-domain fields where accepted
- non-numeric ID route boundaries for clients, appointments, categories, services, CRM tasks, users, consents, files, gifts, tenant domains, platform tenants, platform invoices, billing invoices, and invitation delete boundaries
- missing-record affected-row checks for appointments, catalog category/service, client delete, gift update, invitation delete, file delete, consent delete, and CRM task update
- invalid restore file handling and cleanup
- malformed nested route paths returning the generic API 404

### Automated Coverage Summary

Current commands:

- `npm run test:api`
  - runs the full default API regression suite
  - current passing count: `54/54`
- `npm run test:restore`
  - runs the valid restore disposable regression suite
  - current passing count: `1/1`

Covered areas in `test:api`:

- public smoke and static fallback
- unmatched API 404 behavior
- auth login/me/logout
- unauthenticated security boundaries
- role login and `/api/me`
- bootstrap by role
- permissions across clinic/platform roles
- signup disabled guard
- account/system protected boundaries
- CRUD for catalog, clients, appointments, gifts, CRM tasks, invitations, feedback, and tenant domains
- file upload/list/download/archive using temp uploads
- consent PDF upload/list/download/sign-negative/archive using temp uploads
- platform provisioning, tenant update, reset password, manual invoices, and no-op auto-billing
- negative security and permission cases
- invalid JSON and required fields
- numeric/date/enum validation
- malformed IDs and nested paths
- missing-record affected-row boundaries
- restore helper self-test and invalid restore safety
- WhatsApp fallback, dry-run, missing-config, provider HTTP failure, and message logs

Covered areas in `test:restore`:

- valid restore on disposable SQLite only
- expected child process exit
- restart/apply-on-next-start behavior
- pending restore file consumption
- no use of dev/prod DB

### CI Status

`.github/workflows/api-tests.yml`:

- triggers on `push` and `pull_request`
- runs on Node `22`
- uses `npm ci`
- runs `npm run db:check`
- runs `npm run test:api`
- uses isolated runner temp SQLite/uploads/backups
- sets `WHATSAPP_ENABLED=false` and `WHATSAPP_DRY_RUN=true`
- does not use secrets or external services

`.github/workflows/restore-tests.yml`:

- trigger is `workflow_dispatch` only
- runs on Node `22`
- uses `npm ci`
- runs `npm run db:check`
- runs `npm run test:restore`
- uses isolated runner temp SQLite/uploads/backups
- is intentionally separate because valid restore exits a child server process

No CI job currently requires real WhatsApp credentials or external provider access.

### WhatsApp Status

Automated WhatsApp coverage now includes:

- `GET /api/message-logs`
- missing appointment/gift IDs returning `404` without log writes
- tenant fallback responses and `fallback` logs
- provider dry-run responses and `dry_run` logs
- missing provider config returning controlled `503` and `failed` logs
- mocked provider `400` returning controlled `400` and `failed` logs
- mocked provider `500` returning controlled `500` and `failed` logs
- mocked provider network error returning current `500` and `failed` logs
- child-process Graph fetch interception with no external network

Not covered by automation:

- real Meta Cloud API integration
- real phone delivery confirmation
- real provider `sent` success logs with a real provider message id
- WhatsApp template approval behavior
- provider webhooks/status callbacks
- provider rate limits and production-side throttling

### Restore Status

Covered:

- unauthenticated restore remains protected
- clinic admin restore remains forbidden
- invalid restore body/multipart paths remain controlled and non-destructive
- invalid restore uploads return controlled errors and cleanup temp files
- valid restore applies only in a disposable SQLite environment
- process exit and restart/apply behavior are tested in `npm run test:restore`

Remaining restore risk is operational rather than code-coverage based:

- production operator misuse
- restoring the wrong backup
- insufficient pre-restore snapshot discipline
- environment/path misconfiguration

### Remaining Gaps

HIGH:

- real production restore remains a destructive operator action and must require strict operational process
- real WhatsApp provider enablement still needs manual credentials, template, and delivery verification
- PostgreSQL parity is not proven by the current SQLite-focused automated suite if production uses PostgreSQL

MEDIUM:

- browser UI/e2e tests are not yet automated
- production monitoring/alerting is not fully verified by tests
- performance/load behavior and bootstrap payload growth are not benchmarked
- provider webhook/status callback coverage is absent if those features are introduced later

LOW:

- docs/runbook freshness should be checked before release
- static asset/UI smoke remains basic from backend tests
- exact production PM2/log rotation behavior should be verified during deployment

### Go / No-Go Decision

Internal production deployment:

- **GO**, assuming deployment env is reviewed and backups are configured.

Limited clinic rollout:

- **GO with operational guardrails**, especially for restore access, WhatsApp mode, backups, and monitoring.

General customer rollout:

- **NO-GO until final operational checks are complete**, including production monitoring, deployment runbook verification, UI/e2e smoke, and PostgreSQL parity if PostgreSQL is the target production database.

### Deployment Checklist

Before production deployment:

1. Confirm fresh database backup exists.
2. Confirm backup scheduler/retention settings.
3. Confirm restore endpoint access is platform-owner only.
4. Confirm `DATABASE_URL` / `DATABASE_PATH` points to intended production DB.
5. Confirm `UPLOAD_DIR` and `BACKUP_DIR` point to intended production paths.
6. Confirm `SESSION_SECRET` is production-grade and stable.
7. Confirm `COOKIE_SECURE` matches HTTPS deployment.
8. Confirm SSL/TLS is active.
9. Confirm PM2 process name and restart behavior.
10. Confirm logs are retained and inspectable.
11. Confirm `/api/health` and `/api/version`.
12. Confirm `/api/bootstrap` works after login.
13. Confirm platform-owner access works.
14. Confirm platform routes are not available to clinic users.
15. Confirm system export works only for platform owner.
16. Confirm restore is not tested destructively on production.
17. Confirm WhatsApp starts in desired safe mode:
    - fallback or dry-run first
    - real provider only after manual approval
18. Confirm no real WhatsApp credentials are present in CI.
19. Confirm domain/SSL/reverse proxy headers.
20. Confirm rollback plan.

### Recommended Next Safe Step Selection

Selected option: **C. Monitoring/observability hardening report.**

Rationale: backend modularization and automated API coverage are strong enough to freeze backend refactor work for now. Before broader rollout, the largest practical gap is not another code refactor; it is production visibility: logs, alerts, backup observability, restore auditability, WhatsApp failure monitoring, and health/version checks.

### Final Readiness Conclusion

The backend is ready for internal production deployment and limited guarded clinic rollout. It is not yet ready for broad general customer rollout without final operational hardening and, if applicable, PostgreSQL parity verification. The automated suite now provides strong protection for modular route ownership, auth/permission boundaries, validation hardening, restore behavior, and WhatsApp provider safety.

### Step 148 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 148, API test, or restore helper directories remain

## SAFE STEP 149 - MONITORING / OBSERVABILITY HARDENING REPORT

### Scope And Confirmation

This step is report-only. No code, tests, routes, validation logic, SQL, CI workflow, env behavior, or PM2 config was changed.

### Current Observability

Current production visibility comes from these surfaces:

- `/api/health`
  - returns application version, current time, database engine, and DB connectivity status
  - performs `SELECT 1 AS ok`
- `/api/version`
  - returns app name, package version, Node version, and environment
- PM2 logs
  - app stdout: `./logs/pm2-out.log`
  - app stderr: `./logs/pm2-error.log`
  - backup stdout: `./logs/pm2-backup-out.log`
  - backup stderr: `./logs/pm2-backup-error.log`
  - timestamped through `log_date_format`
- PM2 runtime controls
  - app process `clinova`
  - backup process `clinova-backup`
  - memory restart limits: `300M` app, `150M` backup scheduler
- Audit logs
  - stored in DB through `audit(...)`
  - cover many sensitive actions such as system export, restore scheduling, settings, platform actions, and WhatsApp send/fallback actions
- Message logs
  - stored in `message_logs`
  - expose `fallback`, `dry_run`, `failed`, and `sent`
  - include provider message id, fallback URL, error text, entity, recipient, and timestamp
- Backup files
  - SQLite backups are written through `VACUUM INTO`
  - PostgreSQL backups use `pg_dump`
  - backup retention removes old `clinova-*.sqlite` / `clinova-*.dump`
  - successful backups print JSON to stdout
- Restore files
  - restore upload staging uses `backups/restore-uploads`
  - valid restore stages `pending-restore.sqlite` and `pending-restore.json`
  - safety backup is created before scheduling restore
  - restore schedule writes audit action `restore_scheduled`

### Current Blind Spots

High-impact blind spots:

- no alert if scheduled backups stop running
- no alert if backup job starts failing repeatedly
- no alert if restore is attempted or scheduled
- no alert if WhatsApp failures spike
- no alert if app restarts repeatedly
- no alert if PM2 memory restarts happen
- no alert if disk space runs low or backup directory fills
- no alert if DB file grows unusually large

Other blind spots:

- no latency metrics for `/api/bootstrap`, login, uploads/downloads, or platform routes
- no request rate/error-rate dashboard
- no structured per-request logging with request id
- no explicit upload/backup directory health check
- no restore pending-file health indicator
- no health check for backup freshness
- no log rotation policy documented for PM2 logs beyond PM2 file destinations
- no uptime monitor documented for `/api/health`
- no customer-visible status page or incident channel documented

### Health Endpoint Assessment

Current `/api/health` coverage:

- confirms the app process responds
- confirms the configured database adapter can execute `SELECT 1`
- reports database engine
- reports package version
- reports current server time

Missing from `/api/health`:

- upload directory existence/writability
- backup directory existence/writability
- free disk space
- latest backup timestamp/freshness
- pending restore marker presence
- PM2 process status
- memory usage
- response latency timing
- dependency status for PostgreSQL backup tools such as `pg_dump`

Recommendation:

- keep `/api/health` lightweight for load balancers
- add a separate protected operational endpoint or CLI report later for deeper checks such as backup freshness, disk space, and pending restore markers

### Backup Observability

What operators can currently see:

- backup scheduler startup line with enabled flag, directory, retention, time/interval
- successful backup JSON in PM2 backup stdout
- backup failure messages in PM2 backup stderr
- files present in configured backup directory

What is missing:

- no persisted backup status table
- no last-success/last-failure endpoint
- no alert if last backup is older than expected
- no alert if backup retention cleanup fails
- no verification that backup file size is plausible
- no automated restore-readiness check for newest backup
- no disk usage warning for backup directory

Current failure detection:

- manual PM2 log inspection
- manual file inspection
- CI tests only prove disposable restore behavior, not production backup schedule health

### Restore Observability

Current restore trail:

- `POST /api/system/restore` requires platform owner
- invalid restore paths are controlled and tested
- valid restore writes `pending-restore.sqlite`
- valid restore writes `pending-restore.json`
- safety backup is created before scheduling
- audit log writes `restore_scheduled`
- process exits intentionally after scheduling
- next startup applies pending restore and removes pending files

Missing operator visibility:

- no proactive alert when restore is attempted
- no restore status dashboard
- no startup log summary surfaced to operators after restore application
- no protected endpoint listing pending restore metadata
- no explicit alert if pending restore files remain unexpectedly
- no forced confirmation phrase or two-person approval workflow

### WhatsApp Observability

Current coverage:

- `message_logs` records sends/fallbacks/failures
- statuses:
  - `fallback`
  - `dry_run`
  - `failed`
  - `sent`
- log fields include entity, entity id, recipient, message, provider message id, fallback URL, error, created time
- automated tests cover fallback, dry-run, missing config, provider 400, provider 500, and network error

Message log usefulness:

- good for tenant-level troubleshooting
- good for confirming no-real-send fallback/dry-run behavior
- good for failed provider diagnostics at record level

Missing metrics:

- no failure-rate alert
- no dashboard for failed vs sent vs fallback counts
- no provider latency timing
- no alert for sudden fallback spike
- no alert for dry-run accidentally left enabled or disabled
- no real delivery receipt/webhook tracking yet

### PM2 / Runtime Observability

Current state:

- PM2 manages app and backup scheduler
- PM2 logs are written to `./logs`
- memory restart thresholds are configured
- process names are stable: `clinova`, `clinova-backup`

Missing:

- restart/crash alerts
- memory threshold alerts before restart
- CPU alerts
- PM2 log rotation confirmation
- watchdog alert if backup scheduler process is down
- uptime monitor for public `/api/health`
- structured incident notification path

### Rollout Recommendations

HIGH priority before broader rollout:

- configure external uptime check for `/api/health`
- configure PM2 process down/restart alerts
- configure disk usage alerts for DB/uploads/backups/logs
- configure backup freshness alert
- define restore operational runbook with approval and rollback steps
- alert on `restore_scheduled`
- alert on WhatsApp `failed` spike if real provider is enabled
- verify production backups are restorable in a disposable environment

MEDIUM priority:

- add protected operational status report for backup freshness, disk usage, pending restore marker, and upload/backup dir writability
- add structured request logging with request id
- add basic latency measurements for `/api/bootstrap`, login, upload/download, and platform routes
- add log rotation policy for PM2 logs
- document incident response and escalation path
- add dashboard for message log status counts

LOW priority:

- add customer-visible status page later
- add deeper performance/load benchmarks
- add provider delivery webhook observability if webhooks are implemented
- add frontend UI/e2e monitoring after UI phase

### Production Monitoring Checklist

Before broader rollout:

1. External uptime monitor checks `/api/health`.
2. `/api/version` is checked after deploy.
3. PM2 app process is running.
4. PM2 backup process is running.
5. PM2 restart count is reviewed after deploy.
6. PM2 logs are retained and rotated.
7. Disk usage alert covers DB, uploads, backups, and logs.
8. Backup directory has recent successful backup.
9. Backup freshness threshold alert is configured.
10. Latest backup can be restored in disposable environment.
11. Restore endpoint access remains platform-owner only.
12. Restore attempts produce an operator notification.
13. WhatsApp starts in fallback/dry-run unless explicitly approved.
14. WhatsApp failed log count is monitored.
15. Audit log is reviewable by platform owner.
16. Deployment rollback process is documented.
17. SSL certificate expiration monitoring is configured.
18. Database size trend is reviewed.
19. Upload directory size trend is reviewed.
20. Production env values are reviewed without exposing secrets.

### Readiness Re-Evaluation

Internal deployment:

- **GO**, with current test coverage and basic manual PM2/log checks.

Limited rollout:

- **GO WITH GUARDRAILS**, after backup freshness, disk space, PM2 restart, and restore/WhatsApp alerts are configured.

General rollout:

- **NO-GO** until monitoring/alerting is implemented and exercised, PostgreSQL parity is verified if applicable, and UI/e2e readiness is addressed.

### Recommended Next Step Selection

Selected option: **A. Monitoring Implementation Plan Only.**

Rationale:

- This report identifies concrete blind spots.
- The next safest step is not implementation yet, but a scoped implementation plan that chooses exactly which alerts/endpoints/runbook changes to add first without changing runtime behavior.
- PostgreSQL parity and frontend/e2e remain important, but observability is the blocker for safe broader rollout.

### Step 149 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 149, API test, or restore helper directories remain

## SAFE STEP 150 - MONITORING IMPLEMENTATION PLAN

### Scope And Confirmation

This step is planning/report-only. No code, tests, routes, validation logic, SQL, CI workflow, PM2 configuration, cron jobs, or runtime behavior was changed.

### Phase 1 - HIGH PRIORITY - Backup Freshness Monitoring

What will be checked:

- latest backup file in `BACKUP_DIR`
- latest backup timestamp
- backup file extension matches current DB mode:
  - SQLite: `.sqlite`
  - PostgreSQL: `.dump`
- backup file size is greater than zero
- backup directory exists and is readable

Freshness threshold:

- default threshold: latest successful backup must be less than `26 hours` old for daily backup mode
- interval backup mode: threshold should be `BACKUP_INTERVAL_HOURS + 2 hours`
- manual override threshold can be documented per deployment

Failure condition:

- no backup file exists
- newest backup is older than threshold
- newest backup is zero bytes
- backup directory cannot be read
- backup scheduler PM2 process is down

Alert destination:

- primary: Email
- secondary: dashboard/admin operational page if later added
- emergency: PM2/log inspection is not enough and should not be the only alert

Suggested implementation approach:

- first implementation should be a read-only operational checker script or shared helper that scans `BACKUP_DIR`
- output should be structured JSON:
  - `ok`
  - `latestBackup`
  - `ageHours`
  - `thresholdHours`
  - `database`
  - `backupDir`
  - `error`
- do not add cron initially
- later wire the checker into an alert channel or protected operational endpoint

### Phase 1 - HIGH PRIORITY - Restore Attempt Monitoring

Events to distinguish:

- restore requested:
  - request reached restore endpoint
  - user identity should be known after auth
- restore accepted:
  - valid SQLite backup passed integrity check
  - safety backup created
  - `pending-restore.sqlite` and `pending-restore.json` written
- restore failed:
  - invalid multipart
  - missing backup file
  - invalid SQLite integrity check
  - PostgreSQL restore upload rejected
  - upload too large
- pending restore detected:
  - `pending-restore.sqlite` exists
  - `pending-restore.json` exists
  - pending marker remains unexpectedly after startup

Recommended audit visibility:

- current successful restore schedule already writes `restore_scheduled`
- future hardening should add visibility for failed restore attempts without changing response shape
- platform-owner operational view should show recent restore events and pending restore state

Suggested implementation approach:

- start with a report/checker that detects pending restore marker files
- add alerting around `restore_scheduled` audit entries later
- avoid destructive restore checks in production

### Phase 1 - HIGH PRIORITY - PM2 Runtime Monitoring

Unexpected restart detection:

- monitor PM2 restart count for `clinova`
- alert if restart count increases unexpectedly after deployment window

Crash detection:

- monitor app process state
- alert if `clinova` is not online
- alert if `clinova-backup` is not online when backups are enabled

Memory restart detection:

- PM2 has `max_memory_restart`
- alert if PM2 restart reason or restart count suggests memory restarts
- correlate with memory usage before restart if PM2 metrics are available

Process uptime visibility:

- capture current uptime for app and backup process
- alert if uptime is unexpectedly low outside deploy windows

Suggested implementation approach:

- first plan a PM2 status checker script using `pm2 jlist` or documented PM2 command output
- output structured JSON for process names, status, restart count, memory, uptime
- do not change PM2 config in the first implementation step

### Phase 1 - HIGH PRIORITY - WhatsApp Failure Monitoring

What will be checked:

- `message_logs.status = "failed"`
- count over recent time window
- consecutive failures by tenant
- failed ratio compared to sent/dry_run/fallback where applicable
- provider error text grouping

Suggested thresholds:

- immediate alert if `failed >= 5` in 15 minutes for one tenant
- immediate alert if `failed >= 10` globally in 15 minutes
- warning if 3 consecutive provider failures occur for the same tenant/entity type
- warning if real provider mode is enabled but only failures occur during first smoke window

Suggested alert behavior:

- alert should include tenant id, entity type, latest error, count, and first/last failure timestamps
- do not send alert through WhatsApp itself until provider stability is proven
- prefer email or dashboard for WhatsApp provider alerts

Suggested implementation approach:

- read-only checker query against `message_logs`
- no schema change initially
- no real provider call

### Phase 2 - MEDIUM PRIORITY - Disk Usage Monitoring

Database file size:

- check `DATABASE_PATH` size for SQLite
- for PostgreSQL, use DB-level metrics later
- alert on sudden growth or deployment-specific thresholds

Uploads directory size:

- total directory size
- file count
- largest files
- growth trend if historical snapshots are later persisted

Backups directory size:

- total size
- file count
- newest backup age
- oldest retained backup

Log growth:

- `logs/pm2-out.log`
- `logs/pm2-error.log`
- `logs/pm2-backup-out.log`
- `logs/pm2-backup-error.log`
- alert if logs grow rapidly or rotation is absent

Suggested implementation approach:

- add read-only disk report script later
- do not enforce deletion policy in initial monitoring implementation

### Phase 2 - MEDIUM PRIORITY - Health Endpoint Expansion

Future checks:

- uploads dir exists
- uploads dir writable
- backups dir exists
- backups dir writable
- backup freshness summary
- disk availability
- pending restore marker presence

Recommended shape:

- keep `/api/health` lightweight for load balancers
- add deeper protected operational endpoint or CLI command instead of making public health heavy
- avoid exposing filesystem paths publicly

Suggested implementation approach:

- first implement CLI/checker scripts
- only later decide whether to expose protected platform-owner operational status

### Phase 3 - LOW PRIORITY - Performance Observability

Areas to measure:

- `/api/bootstrap` latency
- login latency
- file upload/download latency
- system export latency
- platform tenants latency
- slow DB queries
- request timing by route family

Suggested implementation approach:

- add request timing middleware or structured logs later
- keep initial rollout focused on reliability alerts rather than performance dashboards

### Recommended Alert Channels

Ranked:

1. Email
   - best first alert channel
   - independent of WhatsApp provider health
   - suitable for backup/restore/PM2/disk alerts
2. Dashboard / protected operational page
   - useful for status and investigation
   - should not be the only alert
3. WhatsApp
   - useful only after provider is stable
   - should not alert on WhatsApp provider failures through the same provider
4. PM2 logs only
   - acceptable for manual diagnosis
   - not acceptable as the only alert channel

### Rollout Strategy

Before internal deployment:

- manual PM2/log checks
- `/api/health` and `/api/version` smoke
- confirm backups can be created manually
- confirm restore is restricted

Before limited rollout:

- backup freshness monitoring
- PM2 process/restart monitoring
- disk usage monitoring for DB/uploads/backups/logs
- restore attempt/pending marker monitoring
- WhatsApp failure monitoring if WhatsApp is enabled beyond fallback

Before general rollout:

- alert channels active and tested
- operational dashboard or status report available
- documented incident response
- UI/e2e readiness addressed
- PostgreSQL parity verified if production database is PostgreSQL
- performance smoke/baseline captured

### Implementation Order For SAFE STEP 151+

1. SAFE STEP 151 - Backup Freshness Monitoring Implementation Only
   - add read-only backup freshness checker/helper
   - add tests for temp backup directories
   - no cron and no alert sending yet
2. SAFE STEP 152 - Restore Pending Marker / Attempt Visibility Report Or Implementation
   - decide whether to implement checker only or audit visibility first
3. SAFE STEP 153 - PM2 Runtime Monitoring Plan/Implementation
   - define checker around PM2 process status without changing PM2 config
4. SAFE STEP 154 - WhatsApp Failure Monitoring Checker
   - read-only message log failure summary
5. SAFE STEP 155 - Disk Usage Monitoring Checker
   - DB/uploads/backups/logs size report
6. SAFE STEP 156 - Protected Operational Status Boundary Report
   - decide whether any checker should be exposed to platform owner or stay CLI-only

### Final Recommendation

Selected first implementation feature: **A. Backup Freshness Monitoring**.

Reason:

- backups are the highest-value safety net before rollout
- current backup success is visible only through files and PM2 logs
- implementation can be read-only and low risk
- it does not require changing routes, PM2 config, cron, or CI
- it can be tested with temporary backup directories

### Step 150 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 150, API test, or restore helper directories remain

## SAFE STEP 151 - BACKUP FRESHNESS MONITORING IMPLEMENTATION ONLY

### Scope And Confirmation

This step added a read-only backup freshness checker/helper and automated tests using temporary backup directories only. No application runtime behavior, routes, validation logic, SQL, auth/session/cookies, CI workflow, PM2 configuration, cron jobs, alert delivery, backup creation logic, or restore logic was changed.

### Files Added Or Updated

- Added `server/shared/monitoring/backup-freshness.js`
- Added `server/tests/backup-freshness.test.js`
- Updated `package.json` so `npm run test:api` includes `server/tests/backup-freshness.test.js`

### Checker API Added

`checkBackupFreshness(options)` is exported from `server/shared/monitoring/backup-freshness.js`.

Supported options:

- `backupDir`
- `now`
- `maxAgeHours`
- `includeExtensions`

Default behavior:

- `maxAgeHours = 24`
- included extensions:
  - `.sqlite`
  - `.db`
  - `.backup`
  - `.dump`

Return shape:

```json
{
  "ok": true,
  "status": "fresh",
  "latestBackupPath": "...",
  "latestBackupAgeHours": 1.5,
  "backupDir": "...",
  "checkedAt": "...",
  "maxAgeHours": 24,
  "message": "Latest backup is fresh."
}
```

The helper returns structured status results for normal monitoring states and does not delete, modify, create, or validate backup contents.

### Statuses Supported

- `fresh`
  - newest matching backup is within `maxAgeHours`
  - `ok = true`
- `stale`
  - newest matching backup is older than `maxAgeHours`
  - `ok = false`
- `missing`
  - backup directory is missing, or it exists but contains no matching backup files
  - `ok = false`
- `unreadable`
  - backup directory cannot be read for reasons other than missing path
  - `ok = false`

### Tests Added

`server/tests/backup-freshness.test.js` covers:

1. missing backup directory -> `missing`, `ok:false`
2. empty backup directory -> `missing`, `ok:false`
3. fresh backup file -> `fresh`, `ok:true`
4. stale backup file -> `stale`, `ok:false`
5. multiple backup files choose newest
6. non-backup files are ignored
7. deterministic `now` option works
8. custom extension filtering works

All tests create and remove temporary directories under the OS temp directory and do not inspect production backup paths.

### Production Risk Assessment

Production risk is low. The helper is read-only and not wired into runtime routes, cron jobs, alerts, PM2, or backup creation. It only inspects file metadata when explicitly called.

### Recommended Next Step

SAFE STEP 152 should be `Backup Freshness CLI/Report Boundary Only`: decide whether the checker should be exposed as a CLI command, protected operational endpoint, or alert input before wiring it into any runtime or operational flow.

### Step 151 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 151, API test, backup freshness test, or restore helper directories remain

## SAFE STEP 152 - BACKUP FRESHNESS CLI / REPORT BOUNDARY

### Scope And Confirmation

This step is report-only. No code, tests, routes, CLI command, endpoint, cron job, alerts, CI workflow, PM2 configuration, validation logic, SQL, or runtime behavior was changed.

### Current Checker Status

File path:

- `server/shared/monitoring/backup-freshness.js`

API:

- `checkBackupFreshness(options)`

Supported options:

- `backupDir`
- `now`
- `maxAgeHours`
- `includeExtensions`

Statuses:

- `fresh`
- `stale`
- `missing`
- `unreadable`

Test coverage:

- `server/tests/backup-freshness.test.js`
- covers missing directory, empty directory, fresh backup, stale backup, newest-file selection, ignored non-backup files, deterministic `now`, and custom extension filtering

Runtime wiring:

- not wired into `server/app.js`
- not exposed as route/endpoint
- not exposed as CLI command
- not used by backup scheduler
- not used by CI
- not used for alerting

### Exposure Options

| Option | Security Risk | Complexity | Operational Usefulness | Testability | Path Leakage Risk | False Alarm Risk |
| --- | --- | --- | --- | --- | --- | --- |
| A. CLI command | Low | Low | High for operators and automation | High | Low if run locally; output can include paths | Medium if threshold/env wrong |
| B. Protected operational endpoint | Medium | Medium | High for dashboard/platform owner | Medium | Medium unless paths are redacted | Medium |
| C. Scheduled checker / cron | Medium | Medium | High once alerts exist | Medium | Low if logs are controlled | Medium/high without tuning |
| D. Log-only checker | Low | Low | Medium | High | Medium if absolute paths logged | Medium |
| E. Future dashboard widget | Medium | High | High | Medium | Medium | Medium |

### Recommended First Exposure

Recommended first exposure: **A. CLI command**.

Reasons:

- smallest runtime surface
- no HTTP exposure
- no auth/session considerations
- no route or controller changes
- easy to run manually after deployment
- easy to run from future cron/systemd/PM2 wrapper
- easy to test with temporary backup directories
- can return exit codes for automation without sending alerts yet

The CLI should be implemented before any protected endpoint or scheduled checker.

### CLI Design If Selected

Suggested command name:

- npm script: `monitor:backup`
- direct script: `node server/monitoring/check-backup-freshness.js`

Suggested source file:

- `server/monitoring/check-backup-freshness.js`

Inputs:

- `BACKUP_DIR`
- `DATABASE_URL`
- `DATABASE_PATH`
- `BACKUP_INTERVAL_HOURS`
- optional `BACKUP_FRESHNESS_MAX_AGE_HOURS`
- optional CLI flag `--max-age-hours`
- optional CLI flag `--json`
- optional CLI flag `--redact-paths`

Output:

- JSON to stdout by default for machine parsing
- must not print secrets
- should include:
  - `ok`
  - `status`
  - `checkedAt`
  - `maxAgeHours`
  - `database`
  - `backupDir` or redacted backup directory
  - `latestBackupPath` or basename/redacted path
  - `latestBackupAgeHours`
  - `message`

Exit codes:

- `0`: backup is fresh
- `1`: backup is stale, missing, or unreadable
- `2`: configuration error such as invalid threshold or missing `BACKUP_DIR`

Path leakage:

- acceptable when run locally by server admin
- future endpoint/dashboard should redact absolute paths by default

Alerting:

- no direct alerting in the CLI step
- future cron/PM2/systemd wrapper can use exit code and JSON output

### Protected Endpoint Design If Selected Later

If exposed later as an HTTP endpoint:

- platform-owner only
- not public `/api/health`
- route should be under a clearly operational path, such as `/api/ops/backup-freshness`
- response should be summary-only by default
- no absolute paths by default
- include:
  - `ok`
  - `status`
  - `checkedAt`
  - `maxAgeHours`
  - `latestBackupAgeHours`
  - `message`
- optionally allow path details only in local/admin CLI, not browser/API

Reason not to choose endpoint first:

- adds HTTP surface
- requires permission decisions
- can accidentally expose filesystem information
- less useful than CLI for initial deployment operations

### Scheduled Checker / Cron Design Later

If scheduled later:

- use CLI output as input
- run under server user
- alert only on non-zero exit or stale/missing/unreadable status
- avoid repeated noisy alerts with debounce/cooldown
- include latest status and age in alert
- do not create cron/PM2 timers until alert channel is selected

### Log-Only Checker Design Later

If log-only is selected later:

- run checker at app start or backup scheduler start only
- emit structured JSON
- avoid absolute path leakage if logs are shared
- useful as supplemental visibility, not enough for alerting

### Future Dashboard Widget

Potential future dashboard:

- platform-owner operational dashboard
- summary status only
- should combine backup freshness, pending restore marker, PM2/runtime status, disk usage, and WhatsApp failure count
- should not be first because it needs more design and frontend/e2e coverage

### Alerting Design Later

Later alerting should:

- consume CLI JSON and exit code
- send email first
- avoid WhatsApp as the alert channel for WhatsApp provider failures
- include alert cooldown
- include deployment/runbook link
- avoid exposing full filesystem paths outside trusted admin channels

### Recommended SAFE STEP 153

Selected next step: **A. Add Backup Freshness CLI Only**.

Reason:

- lowest security risk
- direct operational value
- keeps checker read-only
- does not require routes, cron, PM2 config, CI changes, or alert delivery
- can be tested with temp directories and explicit env overrides

### Step 152 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 152, API test, backup freshness test, or restore helper directories remain

### Step 152 Validation Results

- `node --check`: passed on 145 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 60/60 tests
- `npm run test:restore`: passed, 1/1 test
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 152, 0 API test, 0 backup freshness test, 0 restore helper

## SAFE STEP 153 - ADD BACKUP FRESHNESS CLI ONLY

### Scope And Confirmation

This step adds a local-only CLI wrapper around the existing read-only backup freshness checker. No application runtime behavior, routes, endpoints, cron jobs, alerts, CI workflows, PM2 configuration, backup creation logic, restore logic, SQL, auth/session/cookies, or database access was changed.

### Files Added Or Modified

- Added `server/scripts/check-backup-freshness.js`
- Added `server/tests/backup-freshness-cli.test.js`
- Updated `package.json`
- Updated `server/REFACTOR_STATUS.md`

### CLI Command

Added npm script:

- `npm run monitor:backup`

Direct command:

- `node server/scripts/check-backup-freshness.js`

The CLI calls:

- `checkBackupFreshness(options)` from `server/shared/monitoring/backup-freshness.js`

### Environment Variables Supported

- `BACKUP_DIR`
  - optional in the same way existing backup configuration works
  - defaults through `config.backup.dir`
  - if explicitly provided as an empty string, the CLI returns configuration error
- `BACKUP_FRESHNESS_MAX_AGE_HOURS`
  - optional
  - default: `24`
  - must be a positive finite number
- `BACKUP_FRESHNESS_EXTENSIONS`
  - optional comma-separated extension list
  - values may include or omit the leading `.`
- `BACKUP_FRESHNESS_SHOW_PATHS`
  - optional
  - default: hidden paths
  - `true` includes `backupDir` and `latestBackupPath`

### Output Contract

The CLI writes JSON only to stdout.

Default output includes:

- `ok`
- `status`
- `checkedAt`
- `maxAgeHours`
- `message`
- `latestBackupAgeHours` when available
- `latestBackupName` when available

Default output does not include absolute paths.

When `BACKUP_FRESHNESS_SHOW_PATHS=true`, output additionally includes:

- `backupDir`
- `latestBackupPath` when available

### Exit Codes

- `0`: latest backup is fresh
- `1`: backup is stale, missing, or unreadable
- `2`: configuration error or unexpected exception

### Safety Properties

- read-only
- no file writes
- no deletes
- no DB access
- no network access
- no secrets
- no route or runtime wiring
- absolute paths hidden unless explicitly requested by local operator env

### Tests Added

Added `server/tests/backup-freshness-cli.test.js`.

Coverage:

- fresh backup returns exit `0` and JSON `ok: true`
- stale backup returns exit `1`
- missing backup directory returns exit `1`
- invalid max age returns exit `2`
- default output hides absolute paths
- `BACKUP_FRESHNESS_SHOW_PATHS=true` includes absolute paths

The CLI tests use temporary backup directories only.

### Step 153 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 153, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 153 Validation Results

- `node --check`: passed on 147 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/backup-freshness-cli.test.js`: passed, 6/6 tests
- `npm run test:api`: passed, 66/66 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, JSON `ok: true`, path hidden by default
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 153, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

### Recommended SAFE STEP 154

Recommended next step: **SAFE STEP 154 - Backup Freshness Alerting Boundary Report Only**.

Reason:

- CLI now exists and is test-covered
- next decision should be whether alerting should consume CLI output via cron/systemd/PM2/manual operation
- no alert adapter, route, or scheduler should be added before defining false-alarm thresholds and operator notification policy

## SAFE STEP 154 - BACKUP FRESHNESS ALERTING BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, `package.json`, cron jobs, alerts, PM2 configuration, routes/endpoints, CI workflow, backup creation logic, restore logic, SQL, auth/session/cookies, or runtime behavior was changed.

### Current State

CLI command:

- `npm run monitor:backup`
- direct script: `node server/scripts/check-backup-freshness.js`

Checker:

- `server/shared/monitoring/backup-freshness.js`
- exported API: `checkBackupFreshness(options)`
- statuses: `fresh`, `stale`, `missing`, `unreadable`

CLI environment variables:

- `BACKUP_DIR`
- `BACKUP_FRESHNESS_MAX_AGE_HOURS`
- `BACKUP_FRESHNESS_EXTENSIONS`
- `BACKUP_FRESHNESS_SHOW_PATHS`

CLI exit codes:

- `0`: latest backup is fresh
- `1`: stale, missing, or unreadable backup state
- `2`: configuration error or unexpected exception

CLI JSON output:

- `ok`
- `status`
- `checkedAt`
- `maxAgeHours`
- `message`
- `latestBackupAgeHours` when available
- `latestBackupName` when available
- absolute `backupDir` / `latestBackupPath` only when `BACKUP_FRESHNESS_SHOW_PATHS=true`

Test coverage:

- `server/tests/backup-freshness.test.js`
- `server/tests/backup-freshness-cli.test.js`
- current `npm run test:api` includes backup freshness helper and CLI coverage

Runtime status:

- not wired into `server/app.js`
- not exposed through HTTP
- not scheduled through cron/systemd/PM2
- not connected to alert delivery

### Alerting Options

| Option | Security | Reliability | Simplicity | Deployment Complexity | False Positive Risk | Alert Fatigue Risk | Windows/Linux Compatibility |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. cron + email/script | Good if local-only and no path leakage | Good on Linux when cron/mail is configured | Medium | Medium | Medium if threshold is too tight | Medium without cooldown | Linux-first; Windows needs Task Scheduler equivalent |
| B. PM2 cron/restart hook | Good if local-only | Medium; PM2 restart hooks are not ideal for monitoring cadence | Medium | Medium | Medium | Medium/high if tied to restarts | Works where PM2 runs, but timing semantics need care |
| C. systemd timer | Good if service user is locked down | High on Linux servers | Medium | Medium/high | Medium | Medium with no cooldown | Linux/systemd only |
| D. external uptime/monitoring service | Depends on endpoint/API exposure | High once integrated | Medium | High if no endpoint exists | Medium | Medium | Cross-platform, but likely requires HTTP surface or agent |
| E. future platform-owner dashboard | Good if protected and summary-only | Medium; depends on app health | Low for operators, high to build | High | Medium | Low/medium with UI status instead of push alerts | Cross-platform after app support |
| F. protected operational endpoint later | Medium; must be platform-owner only | Medium; depends on app and DB/session health | Medium | Medium | Medium | Medium | Cross-platform, but adds HTTP surface |

### Recommended First Alerting Path

Recommended first alerting path:

- local server scheduler runs `npm run monitor:backup`
- prefer Linux `systemd` timer on production Linux hosts
- use cron as acceptable fallback where systemd timers are not managed
- send output to a later alert adapter
- do not expose backup freshness through HTTP initially

Reason:

- the existing CLI already provides machine-readable JSON and exit codes
- local scheduling avoids public route/endpoint exposure
- no filesystem paths need to leave the server by default
- works even if the web app is unhealthy, as long as Node and the filesystem are available
- keeps alerting independent from WhatsApp and the app's own runtime

### Alert Rules

Suggested rules:

- exit `0`: no alert
- exit `1`: alert for `stale`, `missing`, or `unreadable`
- exit `2`: alert as configuration/monitoring failure
- repeated failures should collapse into one alert per configured window
- recovery alert should be sent when status returns to `fresh` after a previous failing status
- include severity:
  - `missing`: high
  - `unreadable`: high
  - `stale`: medium/high depending on age
  - `configuration_error`: high because monitoring is not trustworthy

Suggested debounce/cooldown:

- first failure alerts immediately
- repeated failures alert at most once every 6-12 hours
- recovery alert sends once
- avoid paging repeatedly overnight for the same stale backup unless age crosses a higher threshold

### Message Format

Alert payload should include:

- service name: `clinova`
- check name: `backup_freshness`
- status
- exit code
- `checkedAt`
- `maxAgeHours`
- `latestBackupAgeHours` when available
- safe `message`
- environment label if configured, such as production/staging
- host label if configured

Do not include by default:

- absolute backup paths
- database path
- secrets
- access tokens
- raw environment dump

Absolute paths should be included only for local admin logs or explicitly trusted channels.

### Implementation Order For SAFE STEP 155+

Recommended sequence:

1. Add backup monitor alert adapter interface.
2. Add log-only adapter first.
3. Add tests for alert decisions using simulated CLI/checker results.
4. Add email or webhook adapter later.
5. Add cron/systemd deployment guide.
6. Add final operational smoke test that runs CLI, parses JSON, and confirms alert decision without sending external alerts.

### What Not To Do Yet

Do not:

- expose backup freshness through public `/api/health`
- add a protected endpoint before operational status boundary review
- send WhatsApp alerts from the same WhatsApp module initially
- create cron/systemd/PM2 timers before alert adapter behavior is defined
- send real email/webhook alerts before dry-run/log-only validation
- include absolute paths in remote alert messages by default
- add dashboard UI before protected operational status design

### Selected Next SAFE STEP

Selected next step: **A. Add Backup Monitor Log-Only Alert Adapter**.

Reason:

- it keeps alerting behavior local and non-delivering
- it defines alert payloads and dedup/recovery decisions before external notification channels
- it can be fully tested with simulated checker results
- it avoids cron, PM2, endpoint, CI, and production alert side effects

### Step 154 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 154, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 154 Validation Results

- `node --check`: passed on 147 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 66/66 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, JSON `ok: true`
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 154, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

## SAFE STEP 155 - ADD BACKUP MONITOR LOG-ONLY ALERT ADAPTER

### Scope And Confirmation

This step adds a local helper/adapter only. No routes/endpoints, cron jobs, PM2 configuration, email, WhatsApp, webhook calls, CI workflow, backup creation logic, restore logic, SQL, auth/session/cookies, or application runtime behavior was changed.

### Files Added Or Modified

- Added `server/shared/monitoring/backup-alerts.js`
- Added `server/tests/backup-alerts.test.js`
- Updated `package.json`
- Updated `server/REFACTOR_STATUS.md`

### Adapter Functions Added

`server/shared/monitoring/backup-alerts.js` exports:

- `buildBackupFreshnessAlert(currentResult, options)`
- `createLogOnlyBackupAlertPayload(alert)`

The adapter accepts structured output compatible with:

- `checkBackupFreshness(options)`
- `server/scripts/check-backup-freshness.js` JSON status semantics

### Options Supported

`buildBackupFreshnessAlert` supports:

- `previousStatus`
- `previousAlertAt`
- `now`
- `dedupeWindowMinutes`
- `showPaths`

Default dedupe window:

- 720 minutes

### Alert Types Supported

Structured alert output:

- `shouldAlert`
- `alertType`
- `severity`
- `status`
- `message`
- `safeDetails`
- `createdAt`

Supported `alertType` values:

- `none`
- `backup_failure`
- `monitor_failure`
- `recovery`

Supported `severity` values:

- `info`
- `warning`
- `critical`

Status mapping:

- `fresh`: no alert by default
- `stale`: `backup_failure`, `warning`
- `missing`: `backup_failure`, `critical`
- `unreadable`: `backup_failure`, `critical`
- `configuration_error`: `monitor_failure`, `critical`

### Dedupe And Recovery Behavior

Dedupe:

- repeated same bad status inside `dedupeWindowMinutes` is suppressed
- repeated same bad status outside `dedupeWindowMinutes` alerts again
- dedupe does not suppress recovery alerts

Recovery:

- previous bad status plus current `fresh` emits `recovery`
- recovery severity is `info`

### Path And Secret Safety

Default behavior:

- includes `latestBackupName` only
- excludes `latestBackupPath`
- excludes `backupDir`

When `showPaths=true`:

- includes `backupDir`
- includes `latestBackupPath`

The adapter:

- sends no network calls
- writes no files
- sends no email
- sends no WhatsApp
- sends no webhook
- reads no secrets

### Log-Only Payload

`createLogOnlyBackupAlertPayload(alert)` returns a structured payload:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "backup_freshness"`
- alert fields copied from the decision result

The function does not write to console by itself; callers can log the returned payload later.

### Tests Added

Added `server/tests/backup-alerts.test.js`.

Coverage:

- fresh => no alert
- stale => `backup_failure`
- missing => `backup_failure`
- unreadable => `backup_failure`
- synthetic configuration error => `monitor_failure`
- repeated stale inside dedupe window suppressed
- repeated stale outside dedupe window alerts
- stale to fresh triggers `recovery`
- paths hidden by default
- paths included only when `showPaths=true`
- log-only payload uses `delivery: "none"`

### Step 155 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 155, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 155 Validation Results

- `node --check`: passed on 149 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/backup-alerts.test.js`: passed, 11/11 tests
- `npm run test:api`: passed, 77/77 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, JSON `ok: true`
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 155, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

## SAFE STEP 156 - BACKUP ALERT ADAPTER CLI INTEGRATION BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, `package.json`, CLI behavior, routes/endpoints, cron jobs, PM2 configuration, alert delivery, CI workflow, backup creation logic, restore logic, SQL, auth/session/cookies, or runtime behavior was changed.

### Current CLI Behavior

Command:

- `npm run monitor:backup`
- direct script: `node server/scripts/check-backup-freshness.js`

Environment variables:

- `BACKUP_DIR`
- `BACKUP_FRESHNESS_MAX_AGE_HOURS`
- `BACKUP_FRESHNESS_EXTENSIONS`
- `BACKUP_FRESHNESS_SHOW_PATHS`

Current output:

- JSON only
- freshness-only shape
- includes `ok`, `status`, `checkedAt`, `maxAgeHours`, `message`
- includes `latestBackupAgeHours` and `latestBackupName` when available
- hides absolute paths unless `BACKUP_FRESHNESS_SHOW_PATHS=true`

Current exit codes:

- `0`: fresh
- `1`: stale/missing/unreadable
- `2`: configuration error or unexpected exception

Current alert behavior:

- no alert payload
- no log-only alert payload
- no delivery
- no network
- no runtime wiring

### Current Alert Adapter Behavior

File:

- `server/shared/monitoring/backup-alerts.js`

Exports:

- `buildBackupFreshnessAlert(currentResult, options)`
- `createLogOnlyBackupAlertPayload(alert)`

Supported alert types:

- `none`
- `backup_failure`
- `monitor_failure`
- `recovery`

Supported severity values:

- `info`
- `warning`
- `critical`

Dedupe/recovery:

- repeated same bad status inside `dedupeWindowMinutes` is suppressed
- repeated same bad status outside the window alerts again
- previous bad status plus current `fresh` emits `recovery`

Log-only behavior:

- returns structured payload with `channel: "log_only"` and `delivery: "none"`
- does not write files
- does not write console output by itself
- sends no email, WhatsApp, webhook, or network request

### Integration Options

| Option | Backward Compatibility | Script Simplicity | Monitoring Usefulness | JSON Contract Stability | Operational Clarity |
| --- | --- | --- | --- | --- | --- |
| A. Keep CLI freshness-only | Highest | Highest | Medium | Highest | Clear but no alert decision in CLI |
| B. Optional `BACKUP_MONITOR_ALERT_MODE=log` | High if default unchanged | Medium | High | Stable default; new explicit shape only in alert mode | Clear if documented |
| C. Separate CLI command later, such as `monitor:backup-alert` | High | Medium/high | High | Very stable; separate contract | Clear but adds another command |
| D. Keep adapter for future cron wrapper only | High | Medium | Medium/high | CLI untouched | Less direct for operators |

### Recommended Integration

Recommended approach: **B. Add optional alert payload mode later**.

Design:

- default CLI output remains unchanged
- default CLI exit codes remain unchanged
- `BACKUP_MONITOR_ALERT_MODE=log` enables alert payload
- no delivery
- no network
- no routes
- no cron/PM2 wiring
- exit codes continue to reflect backup freshness/config status, not whether an alert was suppressed

Reason:

- preserves existing `monitor:backup` behavior for scripts
- lets operators opt into richer structured data
- allows cron/systemd wrappers to consume both freshness and alert decision in one command
- avoids adding a second command before operational need is proven
- keeps the existing alert adapter pure and testable

### Proposed Environment Variables For Later Implementation

- `BACKUP_MONITOR_ALERT_MODE=off|log`
  - default: `off`
  - `log` returns alert decision payload alongside backup result
- `BACKUP_MONITOR_PREVIOUS_STATUS`
  - optional previous status for recovery/dedupe decisions
- `BACKUP_MONITOR_PREVIOUS_ALERT_AT`
  - optional ISO timestamp for dedupe decisions
- `BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES`
  - optional positive number
  - default should match adapter default unless overridden
- `BACKUP_MONITOR_SHOW_PATHS`
  - optional
  - default: `false`
  - controls alert `safeDetails` path exposure separately from freshness output if needed

Existing path env should remain:

- `BACKUP_FRESHNESS_SHOW_PATHS`

### Proposed Output Shape In Alert Mode

When `BACKUP_MONITOR_ALERT_MODE=log`, output should be:

```json
{
  "backup": {
    "ok": true,
    "status": "fresh",
    "checkedAt": "ISO timestamp",
    "maxAgeHours": 24,
    "message": "Latest backup is fresh.",
    "latestBackupAgeHours": 1,
    "latestBackupName": "backup.sqlite"
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "backup_freshness",
    "shouldAlert": false,
    "alertType": "none",
    "severity": "info",
    "status": "fresh",
    "message": "Latest backup is fresh.",
    "safeDetails": {},
    "createdAt": "ISO timestamp"
  }
}
```

Default mode should remain the existing freshness-only JSON object.

### Testing Plan For Next Implementation Step

Required tests if optional alert mode is implemented:

- default output unchanged
- default exit codes unchanged
- `BACKUP_MONITOR_ALERT_MODE=log` includes `backup` and `alert`
- fresh backup in alert mode produces `alertType: "none"` and `shouldAlert: false`
- stale backup produces `backup_failure`
- missing directory produces `backup_failure`
- invalid max age produces `monitor_failure` in alert mode and exit `2`
- repeated stale inside dedupe window suppresses alert
- repeated stale outside dedupe window emits alert
- stale to fresh emits `recovery`
- paths hidden by default in both `backup` and `alert`
- paths included only when explicitly enabled

### What Not To Do Yet

Do not:

- change default CLI output
- change exit code semantics
- send real alerts
- add cron/systemd/PM2 wiring
- add routes/endpoints
- expose alert status through public health
- use WhatsApp for backup alerts
- add CI workflow changes

### Selected Next SAFE STEP

Selected next step: **A. Add Optional Backup Alert CLI Mode Only**.

Reason:

- adapter is already implemented and test-covered
- optional mode can be added without breaking current CLI consumers
- it prepares the command for cron/systemd wrappers while still sending no alerts
- it remains local-only and testable with temporary backup directories

### Step 156 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 156, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 156 Validation Results

- `node --check`: passed on 149 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 77/77 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, JSON `ok: true`
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 156, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

## SAFE STEP 157 - ADD OPTIONAL BACKUP ALERT CLI MODE ONLY

### Scope And Confirmation

This step adds a non-breaking optional log-alert mode to the backup freshness CLI. Default `npm run monitor:backup` behavior, default JSON output, exit codes, routes/endpoints, cron jobs, PM2 configuration, alert delivery, CI workflow, backup creation logic, restore logic, SQL, auth/session/cookies, and application runtime behavior were not changed.

### Files Modified

- Modified `server/scripts/check-backup-freshness.js`
- Modified `server/tests/backup-freshness-cli.test.js`
- Updated `server/REFACTOR_STATUS.md`

### Alert CLI Mode Behavior

Default mode:

- remains freshness-only JSON
- remains the same top-level shape as before
- does not include `backup`
- does not include `alert`
- preserves existing exit codes:
  - `0`: fresh
  - `1`: stale/missing/unreadable
  - `2`: configuration error or unexpected exception

Alert log mode:

- enabled by `BACKUP_MONITOR_ALERT_MODE=log`
- output shape becomes:

```json
{
  "backup": {
    "ok": true,
    "status": "fresh",
    "checkedAt": "ISO timestamp",
    "maxAgeHours": 24,
    "message": "Latest backup is fresh.",
    "latestBackupAgeHours": 1,
    "latestBackupName": "backup.sqlite"
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "backup_freshness",
    "shouldAlert": false,
    "alertType": "none",
    "severity": "info",
    "status": "fresh",
    "message": "Latest backup is fresh.",
    "safeDetails": {},
    "createdAt": "ISO timestamp"
  }
}
```

Alert log mode still:

- sends no real alert
- writes no files
- makes no network calls
- does not call email, WhatsApp, or webhooks
- preserves exit codes based on backup freshness/config result

Invalid alert mode:

- returns exit `2`
- returns JSON configuration error
- does not run alert delivery

### Environment Variables Supported

Existing freshness env vars remain:

- `BACKUP_DIR`
- `BACKUP_FRESHNESS_MAX_AGE_HOURS`
- `BACKUP_FRESHNESS_EXTENSIONS`
- `BACKUP_FRESHNESS_SHOW_PATHS`

New optional monitor env vars:

- `BACKUP_MONITOR_ALERT_MODE=off|log`
  - default: `off`
- `BACKUP_MONITOR_PREVIOUS_STATUS`
- `BACKUP_MONITOR_PREVIOUS_ALERT_AT`
- `BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES`
- `BACKUP_MONITOR_SHOW_PATHS`

### Dedupe And Recovery Behavior In CLI Mode

When `BACKUP_MONITOR_ALERT_MODE=log`:

- fresh backup with no previous bad status produces `alertType: "none"` and `shouldAlert: false`
- stale/missing/unreadable produces `backup_failure`
- configuration error produces `monitor_failure`
- repeated same bad status inside the dedupe window is suppressed
- previous bad status followed by current fresh produces `recovery`

### Path Safety

Default behavior:

- backup payload includes only `latestBackupName`
- alert payload includes only safe details such as `latestBackupName`
- no absolute paths are emitted

Path details are emitted only when explicitly enabled:

- `BACKUP_FRESHNESS_SHOW_PATHS=true` for backup payload paths
- `BACKUP_MONITOR_SHOW_PATHS=true` for alert `safeDetails` paths

### Tests Updated

Updated `server/tests/backup-freshness-cli.test.js`.

Coverage now includes:

- default output unchanged
- default output does not include `backup` or `alert`
- alert mode fresh includes log-only alert payload with `none`
- alert mode stale includes `backup_failure`
- repeated stale inside dedupe window suppresses alert
- stale to fresh produces `recovery`
- invalid alert mode exits `2`
- paths remain hidden by default in both backup and alert payloads
- paths are included only with explicit show-path env vars

### Step 157 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `node --test server/tests/backup-freshness-cli.test.js`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory in default mode
- run `npm run monitor:backup` against a temporary fresh backup directory with `BACKUP_MONITOR_ALERT_MODE=log`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 157, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 157 Validation Results

- `node --check`: passed on 149 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/backup-freshness-cli.test.js`: passed, 13/13 tests
- `npm run test:api`: passed, 84/84 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory in default mode: passed, exit `0`, freshness-only JSON
- `npm run monitor:backup` against a temporary fresh backup directory with `BACKUP_MONITOR_ALERT_MODE=log`: passed, exit `0`, `{ backup, alert }` JSON with `delivery: "none"`
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 157, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

### Recommended SAFE STEP 158

Recommended next step: **SAFE STEP 158 - Cron/Systemd Backup Monitor Deployment Guide Report Only**.

Reason:

- CLI now supports optional log-only alert decisions without changing default behavior
- next safest step is deployment documentation for running the CLI locally
- no cron/systemd/PM2 configuration should be created before the operator guide and rollback expectations are documented

## SAFE STEP 158 - CRON/SYSTEMD BACKUP MONITOR DEPLOYMENT GUIDE REPORT

### Scope And Confirmation

This step is report-only. No code, tests, `package.json`, systemd files, cron jobs, PM2 configuration, routes/endpoints, alert delivery, CI workflow, backup creation logic, restore logic, SQL, auth/session/cookies, or runtime behavior was changed.

### Current Monitor Command

Command:

- `npm run monitor:backup`

Direct command:

- `node server/scripts/check-backup-freshness.js`

Default output:

- freshness-only JSON
- no `backup` wrapper
- no `alert` object
- absolute paths hidden by default

Default example shape:

```json
{
  "ok": true,
  "status": "fresh",
  "checkedAt": "ISO timestamp",
  "maxAgeHours": 24,
  "message": "Latest backup is fresh.",
  "latestBackupAgeHours": 1,
  "latestBackupName": "backup.sqlite"
}
```

Alert log mode:

- enabled with `BACKUP_MONITOR_ALERT_MODE=log`
- sends no real alert
- writes no files
- makes no network calls
- emits `{ backup, alert }`
- `alert.delivery` remains `none`

Alert mode example shape:

```json
{
  "backup": {
    "ok": true,
    "status": "fresh",
    "checkedAt": "ISO timestamp",
    "maxAgeHours": 24,
    "message": "Latest backup is fresh.",
    "latestBackupAgeHours": 1,
    "latestBackupName": "backup.sqlite"
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "backup_freshness",
    "shouldAlert": false,
    "alertType": "none",
    "severity": "info",
    "status": "fresh",
    "message": "Latest backup is fresh.",
    "safeDetails": {},
    "createdAt": "ISO timestamp"
  }
}
```

Exit codes:

- `0`: fresh
- `1`: stale, missing, or unreadable
- `2`: configuration error or unexpected exception

### Recommended Production Method

Preferred method on Linux:

- systemd timer running a one-shot service

Fallback method:

- cron entry running the same command

Not preferred initially:

- PM2 for periodic one-shot checks

Reason systemd timer is preferred:

- reliable Linux-native scheduling
- journald captures stdout/stderr and exit codes
- clear service user and working directory controls
- easier operational inspection with `systemctl status` and `journalctl`
- separates monitor execution from the long-running PM2 web/backup processes

Reason cron is acceptable fallback:

- simpler and broadly available
- sufficient for small deployments
- easy to add later without changing application code

Reason PM2 is not preferred for this specific monitor:

- existing PM2 apps are long-running server and backup scheduler processes
- freshness monitor is a periodic one-shot check
- PM2 restart semantics are not as clear as systemd timer semantics for one-shot monitoring

### Required Environment Variables

Recommended production monitor env:

- `BACKUP_DIR=/absolute/path/to/backups`
- `BACKUP_FRESHNESS_MAX_AGE_HOURS=24` or `48`
- `BACKUP_MONITOR_ALERT_MODE=log`
- `BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES=720`
- `BACKUP_MONITOR_SHOW_PATHS=false`
- `BACKUP_FRESHNESS_SHOW_PATHS=false`

Optional:

- `BACKUP_FRESHNESS_EXTENSIONS=.sqlite,.db,.backup,.dump`
- `BACKUP_MONITOR_PREVIOUS_STATUS`
- `BACKUP_MONITOR_PREVIOUS_ALERT_AT`

Operational note:

- current CLI is stateless; dedupe/recovery fields must be supplied by a future wrapper or alert adapter state file if true cross-run dedupe/recovery is desired
- until state persistence exists, systemd/cron can still alert based on non-zero exit code or log-only JSON, but repeated failure collapse requires an external wrapper

### Recommended Schedule

If backups run daily:

- run monitor every 1 hour or every 6 hours
- set `BACKUP_FRESHNESS_MAX_AGE_HOURS=24` for strict daily backup freshness
- set `BACKUP_FRESHNESS_MAX_AGE_HOURS=48` for lower-noise small deployments

Recommended initial setting:

- run every 6 hours
- threshold 48 hours during first rollout

Stricter production setting after confidence:

- run every 1 hour
- threshold 24 hours

### systemd Design

Service unit concept:

- type: one-shot
- working directory: deployed Clinova project root
- command: `npm run monitor:backup`
- user: dedicated deploy/app user, not root if possible
- environment file: `/etc/clinova/backup-monitor.env`
- stdout/stderr: journald

Timer unit concept:

- schedule: every 1 hour or every 6 hours
- persistent timer: enabled if missed runs should execute after boot
- random delay: optional small delay to avoid simultaneous checks on multi-server fleets

Working directory:

- project root that contains `package.json`

Environment file location:

- recommended: `/etc/clinova/backup-monitor.env`
- permissions: readable by service user/root only
- should contain no secrets

User permissions:

- read access to the backup directory
- read access to project files
- no write access required for the monitor itself
- no database access required
- no network access required

Log destination:

- journald captures JSON stdout
- operators inspect with `journalctl -u <service-name>`

### cron Design

Cron concept:

- run from project root
- source or define monitor env variables
- execute `npm run monitor:backup`
- redirect stdout/stderr to a local admin log or syslog

Example command concept, not an installed cron entry:

```sh
cd /opt/clinova && BACKUP_DIR=/opt/clinova/backups BACKUP_FRESHNESS_MAX_AGE_HOURS=48 BACKUP_MONITOR_ALERT_MODE=log BACKUP_MONITOR_SHOW_PATHS=false npm run monitor:backup
```

Exit code handling:

- exit `0`: no operator action
- exit `1`: stale/missing/unreadable backup; wrapper may alert
- exit `2`: monitor configuration error; wrapper should alert with higher priority

Limitations vs systemd:

- less structured status inspection
- logs need explicit redirection
- missed runs after downtime are not automatically handled unless configured separately
- dedupe/recovery requires wrapper state

### Operational Runbook

Manual run:

```sh
cd /opt/clinova
BACKUP_DIR=/opt/clinova/backups BACKUP_FRESHNESS_MAX_AGE_HOURS=48 npm run monitor:backup
```

Manual run with log-only alert decision:

```sh
cd /opt/clinova
BACKUP_DIR=/opt/clinova/backups BACKUP_FRESHNESS_MAX_AGE_HOURS=48 BACKUP_MONITOR_ALERT_MODE=log npm run monitor:backup
```

Read JSON output:

- `status: "fresh"` means latest backup is within threshold
- `status: "stale"` means a backup exists but is older than allowed
- `status: "missing"` means directory is missing or no matching backup file exists
- `status: "unreadable"` means the backup directory cannot be read
- `status: "configuration_error"` means monitor configuration is invalid

Interpret exit codes:

- `0`: healthy
- `1`: backup freshness problem
- `2`: monitor/configuration problem

What to do on `stale`:

- verify backup scheduler process is running
- check backup scheduler logs
- run `npm run backup` manually only if safe and authorized
- verify disk space
- verify backup directory permissions

What to do on `missing`:

- verify `BACKUP_DIR`
- verify deployment path
- verify backup creation is configured
- verify backups were not moved/deleted

What to do on `unreadable`:

- check directory permissions
- check service user
- check filesystem mount status
- check disk or OS errors

What to do on `configuration_error`:

- check env file syntax
- verify numeric `BACKUP_FRESHNESS_MAX_AGE_HOURS`
- verify `BACKUP_MONITOR_ALERT_MODE` is `off` or `log`
- verify `BACKUP_MONITOR_DEDUPE_WINDOW_MINUTES` if set

### Security Notes

- no secrets are required for the monitor
- backup directory should be readable by the monitor user
- write access is not required
- do not expose backup freshness through public HTTP
- do not include absolute paths in remote alerts
- keep `BACKUP_FRESHNESS_SHOW_PATHS=false`
- keep `BACKUP_MONITOR_SHOW_PATHS=false`
- if absolute paths are needed, limit them to local admin-only logs
- do not use WhatsApp as the first alert channel for backup monitoring

### Selected Next SAFE STEP

Selected next step: **B. Restore Pending Marker / Attempt Visibility**.

Reason:

- backup freshness monitoring now has a CLI and deployment guide
- actual scheduling files should wait until operator deployment conventions are finalized
- restore is the next high-risk operational area and should expose pending marker / attempt visibility before broader rollout

### Step 158 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory in default mode
- run `npm run monitor:backup` against a temporary fresh backup directory with `BACKUP_MONITOR_ALERT_MODE=log`
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 158, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain

### Step 158 Validation Results

- `node --check`: passed on 149 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 84/84 tests
- `npm run test:restore`: passed, 1/1 test
- `npm run monitor:backup` against a temporary fresh backup directory in default mode: passed, exit `0`, freshness-only JSON
- `npm run monitor:backup` against a temporary fresh backup directory with `BACKUP_MONITOR_ALERT_MODE=log`: passed, exit `0`, `{ backup, alert }` JSON with `delivery: "none"`
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 158, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper

## SAFE STEP 159 - RESTORE PENDING MARKER / ATTEMPT VISIBILITY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, `package.json`, restore behavior, backup behavior, routes/endpoints, CLI commands, cron/systemd files, PM2 configuration, CI workflow, SQL, auth/session/cookies, or runtime behavior was changed. No valid restore was run during this report step.

### Current Restore Flow

Route:

- `POST /api/system/restore`
- registered by `server/modules/system/system.routes.js`
- handled by `server/modules/system/system.controller.js`

Permission requirement:

- `requirePlatformOwnerCompat(req, res)`
- unauthenticated users receive the existing auth error
- authenticated non-platform users receive `403` with `Platform owner access is required.`

SQLite/PostgreSQL behavior:

- PostgreSQL restore upload is rejected with `400`
- SQLite restore upload continues through multipart validation

Upload validation:

- request must be multipart with field name `backup`
- missing backup file returns `400` with `Choose a backup file to restore.`
- uploaded file is staged under `BACKUP_DIR/restore-uploads`
- SQLite `PRAGMA integrity_check` validates the staged file
- invalid SQLite backup returns `400` with `SQLite backup integrity check failed.`
- invalid staged upload is removed

Safety backup:

- before scheduling restore, `createBackup({ reason: "before-restore" })` creates a safety backup
- response body includes `safetyBackup`

Pending markers:

- valid restore copies uploaded SQLite backup to `BACKUP_DIR/pending-restore.sqlite`
- valid restore writes `BACKUP_DIR/pending-restore.json`
- JSON marker currently includes:
  - `uploadedName`
  - `source`
  - `requestedBy`
  - `safetyBackup`
  - `createdAt`

Audit:

- successful schedule writes audit action `restore_scheduled`
- entity: `system`
- details include `tenantId`, source filename, and `safetyBackup`

Response body:

```json
{
  "ok": true,
  "safetyBackup": "...",
  "restarting": true
}
```

Process exit behavior:

- controller sends response first
- then `scheduleProcessExitAfterRestore()` schedules `process.exit(0)` after 500ms

Apply-on-next-start behavior:

- `server/db.js` runs `applyPendingSqliteRestore()` during module load before DB adapter creation
- if `pending-restore.sqlite` exists:
  - creates database parent/backup directory as needed
  - creates `before-pending-restore-<timestamp>.sqlite` if current DB exists
  - removes SQLite WAL/SHM sidecar files
  - copies pending restore file over active database
  - removes `pending-restore.sqlite`
  - removes `pending-restore.json`
- PostgreSQL skips pending SQLite restore

### Current Visibility

Response visibility:

- caller sees `ok: true`, `safetyBackup`, and `restarting: true`
- invalid restore caller sees controlled `400`
- unauthorized/forbidden callers see existing auth/permission responses

Filesystem visibility:

- pending restore is visible as `pending-restore.sqlite`
- restore metadata is visible as `pending-restore.json`
- staged upload remains under `restore-uploads` after valid schedule
- safety backup path is visible in response and marker JSON
- before-apply safety copy appears as `before-pending-restore-*.sqlite` after startup applies pending restore

Log visibility:

- current restore schedule path does not emit a dedicated structured operator log
- process exit is observable through PM2/system logs as a restart/exit
- startup pending restore application currently has no dedicated structured success/failure log line

Audit visibility:

- successful accepted restore schedule writes `restore_scheduled`
- failed validation attempts do not currently write dedicated audit entries
- apply-on-next-start does not write an audit entry because it runs before the DB adapter is initialized for normal app use

After restart:

- successful pending apply removes `pending-restore.sqlite`
- successful pending apply removes `pending-restore.json`
- backup directory contains `before-pending-restore-*.sqlite`
- valid restore test confirms disposable restore applies and pending markers are consumed

### Blind Spots

- operator may not know a restore was requested if they are not watching API/audit activity
- operator may not know a restore was accepted unless they inspect audit logs or backup directory
- operator may not know pending restore files exist before restart
- operator may not know restore applied successfully after restart except by absence of pending files and presence of `before-pending-restore-*`
- operator may not know restore failed during startup if the process crashes or logs are not reviewed
- no alert exists if `pending-restore.sqlite` or `pending-restore.json` remains too long
- no checker currently validates marker consistency:
  - sqlite only
  - json only
  - both present
  - invalid JSON
  - stale marker
- no protected operational status summarizes restore state
- valid restore intentionally exits process; operators need a clear way to distinguish planned restart from crash

### Recommended Visibility Model

Recommended events/states:

- restore attempt event:
  - request reached restore endpoint
  - include actor and safe outcome
- restore rejected event:
  - permission denied
  - invalid body/multipart
  - invalid SQLite backup
  - PostgreSQL restore upload rejected
- restore accepted event:
  - safety backup created
  - pending markers written
  - process restart scheduled
- pending marker detected:
  - checker sees `pending-restore.sqlite` and/or `pending-restore.json`
- restore applied event:
  - startup consumed pending restore markers
  - before-pending safety copy created
- restore failed event:
  - startup failed to apply pending restore
  - marker remains or app fails to start
- stale pending marker alert:
  - pending marker age exceeds operational threshold

### Possible Implementation Options

| Option | Description | Risk | Usefulness | Notes |
| --- | --- | --- | --- | --- |
| A. CLI/helper for pending restore marker | Read `BACKUP_DIR` and report marker state | Low | High | Best first step; read-only and testable with temp dirs |
| B. Log-only restore visibility helper | Build structured log payloads from checker results | Low | Medium/high | Useful after checker exists |
| C. Protected operational endpoint later | Platform-owner summary of restore state | Medium | High | Should wait until checker contract is proven |
| D. Audit log entry expansion | Record rejected attempts and/or accepted scheduling | Medium | High | Changes endpoint behavior/audit surface; should be separate |
| E. PM2/journald log conventions | Document planned restore restart and startup apply messages | Low/medium | Medium | Good later, but actual log additions are code changes |

### Recommended First Implementation

Selected first implementation: **read-only pending restore checker/helper**.

Requirements:

- no endpoint
- no alert delivery
- no CLI command initially
- no automatic restore/retry
- no automatic deletion of pending files
- tests use temp backup directories only
- never touches production paths in tests

Reason:

- restore is destructive, so first visibility layer must be read-only
- marker detection is the narrowest operational gap
- checker can be reused later by CLI, log-only adapter, protected endpoint, or systemd/cron monitor

### Proposed Checker Contract

Suggested file for later step:

- `server/shared/monitoring/restore-pending.js`

Suggested API:

- `checkRestorePendingMarker(options)`

Suggested options:

- `backupDir`
- `now`
- `staleAfterMinutes`
- `showPaths`

Suggested output:

```json
{
  "ok": true,
  "status": "none",
  "pendingAgeMinutes": null,
  "checkedAt": "ISO timestamp",
  "message": "No pending restore marker found."
}
```

Supported statuses:

- `none`
- `pending`
- `stale`
- `invalid`
- `unreadable`

Status meanings:

- `none`: no pending files exist
- `pending`: both pending files exist and are within age threshold
- `stale`: pending marker exists but exceeds threshold
- `invalid`: inconsistent or unreadable marker content, such as sqlite only, json only, invalid JSON, or missing createdAt
- `unreadable`: backup directory or marker files cannot be read

Path behavior:

- no absolute paths by default
- optional path details only with `showPaths=true`

### Testing Plan

Future tests should use temp backup dirs only and cover:

- no pending files
- `pending-restore.sqlite` only
- `pending-restore.json` only
- both pending files present
- stale pending marker
- invalid JSON marker
- JSON without `createdAt`
- unreadable directory or unreadable marker if safely testable on the OS
- paths hidden by default
- paths included only with explicit show-path option
- no production paths
- no valid restore
- no file deletion or mutation by checker

### Risk Assessment

- restore is destructive and platform-owner only
- visibility must be read-only first
- checker must not apply, retry, modify, or delete pending files
- checker must not infer success solely from process restart
- endpoint exposure should wait until read-only helper and CLI/log contract are stable
- audit expansion should be separate because it changes persisted operational records
- startup apply visibility is important but must be designed carefully because it runs before normal DB usage

### Selected Next SAFE STEP

Selected next step: **A. Add Restore Pending Marker Checker Only**.

Reason:

- lowest-risk first implementation
- directly addresses pending marker blind spot
- fully testable with temporary backup directories
- reusable later by CLI/report/endpoint/log-only alerting

### Step 159 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 159, API test, backup freshness test, backup freshness CLI test, or restore helper directories remain
- do not run valid restore during this report step

### Step 159 Validation Results

- `node --check`: passed on 149 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 84/84 tests
- `npm run test:restore`: passed, 1/1 test in the disposable restore test environment required by validation
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, freshness-only JSON
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 159, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore helper
- no manual or production valid restore was run during this report step

## SAFE STEP 160 - ADD RESTORE PENDING MARKER CHECKER ONLY

### Scope And Confirmation

This step adds a read-only helper/checker for restore pending marker visibility. Restore behavior, backup behavior, routes/endpoints, CLI commands, cron/systemd files, PM2 configuration, CI workflow, SQL, auth/session/cookies, and application runtime behavior were not changed. The checker does not delete, modify, move, validate SQLite contents, or apply restore.

### Files Added Or Modified

- Added `server/shared/monitoring/restore-pending.js`
- Added `server/tests/restore-pending.test.js`
- Updated `package.json`
- Updated `server/REFACTOR_STATUS.md`

### Checker API Added

`server/shared/monitoring/restore-pending.js` exports:

- `checkRestorePendingMarker(options)`

Supported options:

- `backupDir`
- `now`
- `staleAfterMinutes`
- `showPaths`

Default behavior:

- `staleAfterMinutes`: `30`
- `showPaths`: `false`

### Return Shape

The checker returns:

- `ok`
- `status`
- `backupDir`
- `checkedAt`
- `staleAfterMinutes`
- `pendingAgeMinutes`
- `hasPendingSqlite`
- `hasPendingJson`
- `metadata` when valid metadata is available
- `paths` only when `showPaths=true`
- `message`

### Statuses Supported

- `none`
- `pending`
- `stale`
- `partial`
- `invalid`
- `unreadable`

Status meanings:

- `none`: no `pending-restore.sqlite` and no `pending-restore.json`
- `pending`: both marker files exist, metadata is valid, and age is within threshold
- `stale`: both marker files exist, metadata is valid, and age exceeds threshold
- `partial`: only one marker file exists
- `invalid`: both files exist but metadata JSON is invalid or lacks valid `createdAt`
- `unreadable`: backup directory or marker files cannot be read safely

### Read-Only Safety

The checker:

- uses read-only filesystem operations
- does not delete pending files
- does not modify pending files
- does not move files
- does not validate SQLite contents
- does not open the SQLite backup as a database
- does not run restore
- does not call backup creation
- does not use network
- does not inspect production paths in tests

### Path Safety

Default behavior:

- no `paths` object
- metadata path-like fields are reduced to basenames:
  - `source`
  - `safetyBackup`

When `showPaths=true`:

- includes `paths.pendingSqlitePath`
- includes `paths.pendingJsonPath`
- preserves full metadata `source`
- preserves full metadata `safetyBackup`

### Tests Added

Added `server/tests/restore-pending.test.js`.

Coverage:

- no pending files => `none`
- both pending files fresh => `pending`
- both pending files stale => `stale`
- sqlite only => `partial`
- json only => `partial`
- invalid JSON => `invalid`
- missing `createdAt` => `invalid`
- missing backup directory => `unreadable`
- deterministic `now`
- paths hidden by default
- paths shown only with `showPaths=true`

All tests use temporary backup directories only.

### Step 160 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `node --test server/tests/restore-pending.test.js`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 160, API test, backup freshness test, backup freshness CLI test, restore pending test, or restore helper directories remain
- confirm no manual or production valid restore was run in this step

### Step 160 Validation Results

- `node --check`: passed on 151 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/restore-pending.test.js`: passed, 11/11 tests
- `npm run test:api`: passed, 95/95 tests
- `npm run test:restore`: passed, 1/1 test in the disposable restore test environment required by validation
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, freshness-only JSON
- `npm start` smoke on temporary SQLite/uploads/backups: passed for `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- temporary directories remaining after validation: 0 Step 160, 0 API test, 0 backup freshness test, 0 backup freshness CLI test, 0 restore pending test, 0 restore helper
- no manual or production valid restore was run in this step

## SAFE STEP 161 - RESTORE PENDING CHECKER CLI / ALERT BOUNDARY REPORT

### Scope And Confirmation

This step is report-only. No code, tests, `package.json`, CLI command, routes/endpoints, cron/systemd files, PM2 configuration, alert delivery, CI workflow, restore behavior, backup behavior, SQL, auth/session/cookies, or runtime behavior was changed. No manual or production valid restore was run.

### Current Checker Status

File path:

- `server/shared/monitoring/restore-pending.js`

API:

- `checkRestorePendingMarker(options)`

Options:

- `backupDir`
- `now`
- `staleAfterMinutes`
- `showPaths`

Statuses:

- `none`
- `pending`
- `stale`
- `partial`
- `invalid`
- `unreadable`

Test coverage:

- `server/tests/restore-pending.test.js`
- 11 tests cover no markers, fresh markers, stale markers, sqlite-only, json-only, invalid JSON, missing `createdAt`, missing backup dir, deterministic `now`, path redaction, and explicit path output

Runtime wiring:

- not wired into `server/app.js`
- not exposed through HTTP
- not exposed as CLI
- not used by cron/systemd/PM2
- not connected to alert delivery
- does not change restore scheduling or apply-on-next-start behavior

### Exposure Options

| Option | Security | Simplicity | Operator Usefulness | Path Leak Risk | False Positive Risk | Panic Risk During Legitimate Restore |
| --- | --- | --- | --- | --- | --- | --- |
| A. CLI command | High; local-only | High | High for operators | Low if paths hidden by default | Medium if threshold too short | Medium; needs runbook language |
| B. Merge into backup monitor CLI later | Medium/high | Medium | High combined operational view | Medium if output grows too broad | Medium | Medium/high; mixed backup/restore statuses may confuse |
| C. Protected operational endpoint later | Medium; auth required | Medium | High for dashboard | Medium unless redacted | Medium | Medium; visible pending state may alarm users/admins |
| D. Cron/systemd checker | High if local-only | Medium | High once alerting exists | Low if logs are controlled | Medium/high without dedupe | High without clear recovery/runbook |
| E. Log-only alert adapter later | High; no delivery by itself | Medium | Medium/high | Low if safe details only | Medium | Medium; alert wording must avoid unsafe deletion guidance |

### Recommended First Exposure

Recommended first exposure: **CLI-only command later**.

Required properties:

- local-only
- read-only
- no HTTP endpoint
- no automatic deletion
- no automatic retry
- no automatic restore
- no marker mutation
- paths hidden by default
- operator-focused output and exit codes

Reason:

- restore is destructive, so visibility should start with the smallest local surface
- CLI fits the existing backup monitor pattern
- CLI can be tested with temporary backup dirs only
- HTTP/dashboard exposure should wait until the CLI contract is stable
- alerting should wait until wording, dedupe, and recovery behavior are defined

### CLI Design If Selected

Suggested npm script:

- `npm run monitor:restore-pending`

Suggested direct script:

- `node server/scripts/check-restore-pending.js`

Suggested environment variables:

- `BACKUP_DIR`
- `RESTORE_PENDING_STALE_AFTER_MINUTES`
- `RESTORE_PENDING_SHOW_PATHS=false`

Output:

- JSON only
- default output should not include absolute paths
- default output should include:
  - `ok`
  - `status`
  - `checkedAt`
  - `staleAfterMinutes`
  - `pendingAgeMinutes`
  - `hasPendingSqlite`
  - `hasPendingJson`
  - safe `metadata` when available
  - `message`

Exit codes:

- `0`: `none`
- `1`: `pending`, `stale`, `partial`, `invalid`, or `unreadable`
- `2`: configuration error or unexpected exception

Operational meaning:

- exit `0`: no pending restore marker
- exit `1`: operator should inspect restore state before doing anything destructive
- exit `2`: monitor configuration or execution failed

### Alerting Design Later

Suggested alert mapping:

- `none`: no alert by default
- recovery from previous `pending`/`stale`/`partial`/`invalid`/`unreadable` to `none`: info
- `pending`: warning
- `stale`: critical
- `partial`: critical
- `invalid`: critical
- `unreadable`: critical
- configuration error: critical monitor failure

Dedupe/collapse:

- repeated same non-none status should be collapsed inside a configured window
- stale status may re-alert at a longer interval because it indicates a potentially stuck restore
- recovery alert should send once when state returns to `none`

Safety:

- alert text must never instruct operators to delete pending markers blindly
- alert text must say to inspect DB, backup directory, PM2/system logs, and restore context first
- no WhatsApp alert initially
- no automatic remediation

### Operational Runbook

For `pending`:

- confirm whether a restore was intentionally scheduled
- check recent `restore_scheduled` audit entries
- inspect PM2/system logs for planned restart
- wait for restart/apply if the restore was just accepted
- do not delete markers manually unless the restore is confirmed abandoned and a DB snapshot exists

For `stale`:

- treat as urgent
- verify whether the app restarted after restore acceptance
- check process manager logs for startup failures
- check active DB timestamp/state
- check `pending-restore.json` metadata
- confirm safety backup exists
- involve an operator before deleting or moving markers

For `partial`:

- treat as critical/inconsistent marker state
- do not run restore automatically
- check whether file copy/write was interrupted
- inspect backup directory, filesystem health, and recent restore logs
- preserve files for investigation

For `invalid`:

- treat as critical marker metadata problem
- inspect `pending-restore.json`
- verify `pending-restore.sqlite` exists
- preserve both files until DB/restore context is understood

For `unreadable`:

- check `BACKUP_DIR`
- check service user permissions
- check mount/disk state
- check OS filesystem errors

General rule:

- never delete `pending-restore.sqlite` or `pending-restore.json` blindly without DB/restore context and a current safety backup

### Selected Next SAFE STEP

Selected next step: **A. Add Restore Pending CLI Only**.

Reason:

- checker is already read-only and tested
- CLI-only exposure is the smallest safe operational surface
- output and exit-code contract can be protected with temp-dir tests
- alerting, endpoint, cron/systemd, and PM2 wiring should wait until CLI behavior is proven

### Step 161 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 161, API test, backup freshness test, backup freshness CLI test, restore pending test, or restore helper directories remain
- do not run manual or production valid restore

### Step 161 Validation Results

- `node --check`: passed on 151 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 95/95 tests
- `npm run test:restore`: passed, 1/1 test in the disposable restore test environment required by validation
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, freshness-only JSON
- `npm start` smoke on temporary SQLite/uploads/backups: passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- temporary directories remaining after validation:
  - `clinova-step161-*`: 0
  - `clinova-restore-test-*`: 0
  - `clinova-api-test-*`: 0
  - `clinova-backup-freshness-test-*`: 0
  - `clinova-backup-freshness-cli-test-*`: 0
  - `clinova-restore-pending-test-*`: 0
- no manual or production valid restore was run in this step

## SAFE STEP 162 - ADD RESTORE PENDING CLI ONLY

### Scope And Safety Confirmation

This step added a local-only CLI around the existing read-only restore pending marker checker.

No application routes, restore behavior, backup behavior, SQL, auth/session/cookies, PM2 configuration, CI workflow, cron/systemd configuration, or alert delivery changed.

The CLI is read-only: it does not access the database or network, does not write/delete/move marker files, and does not execute restore.

### Files Added Or Modified

- added `server/scripts/check-restore-pending.js`
- added `server/tests/restore-pending-cli.test.js`
- updated `package.json`
- updated `server/REFACTOR_STATUS.md`

### CLI Command

- `npm run monitor:restore-pending`
- runs `node server/scripts/check-restore-pending.js`
- calls `checkRestorePendingMarker(options)`

### Supported Environment Variables

- `BACKUP_DIR`
  - defaults to the existing configured backup directory when omitted
  - an explicitly empty value is a configuration error
- `RESTORE_PENDING_STALE_AFTER_MINUTES`
  - optional, default `30`
  - must be a positive finite number
- `RESTORE_PENDING_SHOW_PATHS`
  - optional, default `false`

### Output And Path Safety

JSON output includes `ok`, `status`, `checkedAt`, `staleAfterMinutes`, `pendingAgeMinutes`, `hasPendingSqlite`, `hasPendingJson`, `message`, and safe metadata when available.

By default, `backupDir` and marker paths are omitted, while metadata `source` and `safetyBackup` are reduced to basenames.

With `RESTORE_PENDING_SHOW_PATHS=true`, the backup directory, marker paths, and full metadata paths are included.

### Exit Codes

- `0`: status `none`
- `1`: status `pending`, `stale`, `partial`, `invalid`, or `unreadable`
- `2`: configuration error or unexpected exception

Configuration errors return JSON with `ok: false`, `status: "configuration_error"`, `checkedAt`, and a safe message.

### Automated Tests

`server/tests/restore-pending-cli.test.js` adds nine temp-directory tests:

- no pending files returns exit `0`
- fresh pending markers return exit `1`
- stale markers return exit `1`
- partial marker returns exit `1`
- invalid JSON returns exit `1`
- missing backup directory returns `unreadable` with exit `1`
- invalid stale threshold returns exit `2`
- paths hidden by default
- paths shown only when explicitly enabled

The CLI test file is included in `npm run test:api`.

### Validation Results

- `node --check`: passed on 153 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/restore-pending-cli.test.js`: passed, 9/9
- `npm run test:api`: passed, 104/104
- `npm run test:restore`: passed, 1/1 in the disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- all checked Step 162, restore, API, backup freshness, and restore pending temporary directory counts were `0`
- no manual or production valid restore was run

### Production Risk Assessment

Risk level: **Low**.

The command is local-only, read-only, has no runtime wiring, does not access the DB or network, hides paths by default, and is covered with deterministic temp-directory tests.

Residual operational risk:

- exit `1` requires operator interpretation and must never trigger automatic marker deletion or automatic restore
- enabling path output can expose local paths in administrator-controlled logs

### Recommended Next SAFE STEP

Recommended next step: **SAFE STEP 163 - Restore Pending Alert Adapter Boundary Report Only**.

Document severity, dedupe, recovery, and panic-avoidance behavior before adding any alert adapter or delivery.

## SAFE STEP 163 - RESTORE PENDING ALERT ADAPTER BOUNDARY REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, restore or backup behavior, CLI behavior, routes/endpoints, cron/systemd configuration, PM2 configuration, alert delivery, CI workflow, SQL, auth/session/cookies, or runtime behavior changed. No manual or production valid restore was run.

### Current Restore Pending Monitor State

Checker:

- file: `server/shared/monitoring/restore-pending.js`
- API: `checkRestorePendingMarker(options)`
- options: `backupDir`, deterministic `now`, `staleAfterMinutes`, and `showPaths`
- read-only filesystem inspection only
- no database access
- no network access
- no marker modification, deletion, movement, retry, or restore execution

Statuses:

- `none`
- `pending`
- `stale`
- `partial`
- `invalid`
- `unreadable`

CLI:

- command: `npm run monitor:restore-pending`
- script: `server/scripts/check-restore-pending.js`
- JSON-only output
- absolute paths hidden by default

Exit codes:

- `0`: `none`
- `1`: `pending`, `stale`, `partial`, `invalid`, or `unreadable`
- `2`: configuration error or unexpected exception

Current test coverage:

- `server/tests/restore-pending.test.js`: 11 checker tests
- `server/tests/restore-pending-cli.test.js`: 9 CLI tests
- both use temporary backup directories only
- the CLI tests are included in `npm run test:api`

The checker and CLI are not wired into application startup, HTTP routes, schedulers, PM2, cron/systemd, or alert delivery.

### Alert Decision Requirements

Recommended mapping:

| Status | Alert type | Severity | Default action |
| --- | --- | --- | --- |
| `none` | `none` | `info` | no alert |
| `pending` | `restore_pending` | `warning` | alert unless deduped |
| `stale` | `restore_stale` | `critical` | alert unless deduped |
| `partial` | `restore_invalid` | `critical` | alert unless deduped |
| `invalid` | `restore_invalid` | `critical` | alert unless deduped |
| `unreadable` | `restore_invalid` | `critical` | alert unless deduped |
| bad status to `none` | `restore_recovery` | `info` | alert once |

Rationale:

- `pending` can be legitimate immediately after an accepted restore, so it is a warning rather than a critical incident
- `stale` indicates that the expected restart/application cycle may not have completed
- `partial`, `invalid`, and `unreadable` indicate inconsistent metadata or missing operational visibility and should be critical
- `none` is healthy and silent unless it represents recovery

Configuration or adapter input errors should use a separate future `monitor_failure` alert type with `critical` severity rather than pretending they are restore state.

### Dedupe And Collapse Rules

Recommended rules:

- repeated identical bad status inside the configured dedupe window is suppressed
- repeated identical bad status outside the window alerts again
- status changes are not suppressed, even inside the window
- `pending` to `stale` must emit a new critical alert
- `pending` to `partial`, `invalid`, or `unreadable` must emit a new critical alert
- `partial`, `invalid`, or `unreadable` changing to another bad status should alert because the diagnosis changed
- any bad status changing to `none` emits one `restore_recovery` info alert
- repeated `none` does not alert

Suggested default dedupe window:

- `pending`: 30 minutes
- critical statuses: 60 minutes

A first implementation may use one configurable default window, but the design should allow status-specific windows later.

The adapter should receive prior state explicitly:

- `previousStatus`
- `previousAlertAt`
- `now`
- `dedupeWindowMinutes`

It should not persist state or write files itself.

### Safe Details

Recommended `safeDetails` fields:

- `checkedAt`
- `staleAfterMinutes`
- `pendingAgeMinutes`
- `hasPendingSqlite`
- `hasPendingJson`
- safe metadata summary when present:
  - `uploadedName`
  - `requestedBy`
  - `createdAt`
  - basename-only `source`
  - basename-only `safetyBackup`

Path rules:

- no absolute paths by default
- include `backupDir` and marker paths only when `showPaths=true`
- preserve the checker's basename redaction for metadata paths

Safety rules:

- never delete, move, rewrite, or repair restore files
- never trigger restore or retry restore
- never tell operators to delete markers automatically
- never treat an alert decision as authorization for remediation
- messages should direct operators to inspect DB state, safety backup, pending metadata, and PM2/system logs

### Integration Options

| Option | Security | Simplicity | Usefulness | Recommendation |
| --- | --- | --- | --- | --- |
| A. Helper-only alert adapter | Highest; no delivery or exposure | High | Establishes deterministic decision contract | First |
| B. Optional CLI alert mode later | Local-only if paths remain hidden | Medium | Useful for scheduler wrappers | After adapter tests |
| C. Shared generic monitor adapter | Safe but risks premature abstraction | Medium/Low | Could unify backup and restore alerts | Revisit after both contracts stabilize |
| D. Protected operational endpoint | Larger auth/path-leak surface | Low | Useful for future dashboard | Later |
| E. Cron/systemd wrapper | Safe after CLI/alert contract stabilizes | Medium | Operational automation | Later |

The backup alert adapter is a useful implementation pattern, but restore alert semantics should remain a separate helper initially. Restore has different severity, recovery, and panic-avoidance requirements.

### Recommended First Implementation

Add a helper-only, log-only alert adapter first:

- pure decision logic
- deterministic tests
- no CLI integration
- no delivery
- no network
- no file writes
- no state persistence
- no runtime wiring

Suggested file:

- `server/shared/monitoring/restore-pending-alerts.js`

Suggested test file:

- `server/tests/restore-pending-alerts.test.js`

### Proposed Functions

- `buildRestorePendingAlert(currentResult, options)`
- `createLogOnlyRestorePendingAlertPayload(alert)`

Suggested options:

- `previousStatus`
- `previousAlertAt`
- `now`
- `dedupeWindowMinutes`
- `showPaths`

### Proposed Alert Shape

```json
{
  "shouldAlert": true,
  "alertType": "restore_pending",
  "severity": "warning",
  "status": "pending",
  "message": "Pending restore marker found.",
  "safeDetails": {
    "pendingAgeMinutes": 5,
    "hasPendingSqlite": true,
    "hasPendingJson": true
  },
  "createdAt": "2035-01-02T12:00:00.000Z"
}
```

Allowed alert types:

- `none`
- `restore_pending`
- `restore_stale`
- `restore_invalid`
- `restore_recovery`
- optionally `monitor_failure` for invalid adapter/config input

The log-only payload should add:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "restore_pending"`

### Testing Plan

Required decision tests:

- `none` produces no alert
- `pending` produces warning `restore_pending`
- `stale` produces critical `restore_stale`
- `partial` produces critical `restore_invalid`
- `invalid` produces critical `restore_invalid`
- `unreadable` produces critical `restore_invalid`
- repeated `pending` inside dedupe window is suppressed
- repeated `pending` outside dedupe window alerts again
- `pending` to `stale` emits a critical alert even inside the dedupe window
- `pending` to `none` emits info `restore_recovery`
- repeated `none` remains silent
- paths are hidden by default
- paths are included only with `showPaths=true`
- log-only payload has `delivery: "none"` and performs no delivery

Tests should use synthetic checker result objects and require no filesystem, DB, network, restore execution, or marker mutation.

### Operational Risk Assessment

Risk of the proposed helper-only adapter: **Low**.

Main future risks:

- alert fatigue from legitimate short-lived `pending` state
- panic-driven manual deletion of marker files
- hiding a status transition through overly broad dedupe
- filesystem path leakage
- treating monitor failure as proof of restore failure

Guardrails:

- warning severity for fresh `pending`
- critical severity for stale/inconsistent states
- status changes bypass dedupe
- recovery alert when state returns to `none`
- paths hidden by default
- explicit no-remediation wording

### Selected Next SAFE STEP

Selected next step: **A. Add Restore Pending Log-Only Alert Adapter**.

Recommended next step: **SAFE STEP 164 - Add Restore Pending Log-Only Alert Adapter Only**.

The next step should add pure helper functions and deterministic tests only, with no CLI integration, delivery, scheduler, route, PM2, CI, or restore behavior changes.

### Step 163 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 163, API test, restore test, backup freshness, or restore pending directories remain
- do not run manual or production valid restore

### Step 163 Validation Results

- `node --check`: passed on 153 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 104/104 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 163, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no manual or production valid restore was run

## SAFE STEP 164 - ADD RESTORE PENDING LOG-ONLY ALERT ADAPTER ONLY

### Scope And Safety Confirmation

This step added pure helper functions for restore pending alert decisions and log-only payload construction.

No restore behavior, backup behavior, CLI behavior, routes/endpoints, cron/systemd configuration, PM2 configuration, CI workflow, SQL, auth/session/cookies, runtime wiring, or real alert delivery changed.

The adapter:

- does not access the filesystem
- does not access the database
- does not use the network
- does not write logs by itself
- does not send email, WhatsApp, or webhooks
- does not delete or modify pending restore files
- does not execute or retry restore

### Files Added Or Modified

- added `server/shared/monitoring/restore-pending-alerts.js`
- added `server/tests/restore-pending-alerts.test.js`
- updated `package.json` only to include the new test in `npm run test:api`
- updated `server/REFACTOR_STATUS.md`

### Adapter Functions

Added:

- `buildRestorePendingAlert(currentResult, options)`
- `createLogOnlyRestorePendingAlertPayload(alert)`

Supported options:

- `previousStatus`
- `previousAlertAt`
- deterministic `now`
- `dedupeWindowMinutes`
- `showPaths`

The default dedupe window is 60 minutes.

### Alert Types And Severity

| Current status | Alert type | Severity |
| --- | --- | --- |
| `none` | `none` | `info` |
| `pending` | `restore_pending` | `warning` |
| `stale` | `restore_stale` | `critical` |
| `partial` | `restore_invalid` | `critical` |
| `invalid` | `restore_invalid` | `critical` |
| `unreadable` | `restore_invalid` | `critical` |
| bad status to `none` | `restore_recovery` | `info` |

The structured alert object contains:

- `shouldAlert`
- `alertType`
- `severity`
- `status`
- `message`
- `safeDetails`
- `createdAt`

### Dedupe And Recovery Behavior

- repeated identical bad status inside the dedupe window is suppressed
- repeated identical bad status outside the window alerts again
- status changes bypass dedupe
- `pending` to `stale` emits a new critical alert even inside the dedupe window
- any known bad status changing to `none` emits a recovery alert
- `none` without a previous bad status remains silent

The adapter receives previous state from its caller and does not persist state.

### Safe Details

Included:

- `checkedAt`
- `staleAfterMinutes`
- `pendingAgeMinutes`
- `hasPendingSqlite`
- `hasPendingJson`
- whitelisted metadata summary:
  - `uploadedName`
  - `requestedBy`
  - `createdAt`
  - `source`
  - `safetyBackup`

By default:

- `backupDir` is omitted
- marker paths are omitted
- metadata `source` and `safetyBackup` are reduced to basenames
- unrecognized metadata fields are omitted

With `showPaths=true`:

- `backupDir` is included when provided
- checker-provided marker paths are included
- full metadata paths are preserved

### Log-Only Payload

`createLogOnlyRestorePendingAlertPayload(alert)` returns:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "restore_pending"`
- the structured alert decision fields

It returns an object only and has no console, file, network, or delivery side effects.

### Automated Tests

`server/tests/restore-pending-alerts.test.js` adds 13 synthetic, filesystem-free tests:

- `none` produces no alert
- `pending` produces warning `restore_pending`
- `stale` produces critical `restore_stale`
- `partial` produces critical `restore_invalid`
- `invalid` produces critical `restore_invalid`
- `unreadable` produces critical `restore_invalid`
- repeated `pending` inside the dedupe window is suppressed
- repeated `pending` outside the dedupe window alerts again
- `pending` to `stale` alerts inside the dedupe window
- `pending` to `none` produces recovery
- paths and unknown metadata are hidden by default
- paths are included only with `showPaths=true`
- log-only payload reports `delivery: "none"`

### Production Risk Assessment

Risk level: **Low**.

Reasons:

- pure helper-only implementation
- no runtime or CLI integration
- no delivery mechanism
- no filesystem, DB, or network access
- no restore mutation or execution
- deterministic decision tests
- status changes bypass dedupe
- paths hidden by default

Residual risk exists only when a future caller supplies previous state or delivery behavior. That integration must preserve the no-remediation rule and must not interpret an alert as permission to delete markers or retry restore.

### Recommended Next SAFE STEP

Recommended next step: **SAFE STEP 165 - Restore Pending Alert Adapter CLI Integration Boundary Report Only**.

Before changing the CLI, decide whether alert output should be an optional non-breaking mode, define its environment variables and JSON contract, and preserve existing exit codes.

### Step 164 Validation Results

- `node --check`: passed on 155 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/restore-pending-alerts.test.js`: passed, 13/13 tests
- `npm run test:api`: passed, 117/117 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 164, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no manual or production valid restore was run

## SAFE STEP 165 - RESTORE PENDING ALERT ADAPTER CLI INTEGRATION BOUNDARY REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, CLI behavior, restore or backup behavior, routes/endpoints, cron/systemd configuration, PM2 configuration, alert delivery, CI workflow, SQL, auth/session/cookies, or runtime behavior changed. No manual or production restore was run.

### Current Restore Pending CLI Behavior

Command:

- `npm run monitor:restore-pending`
- runs `node server/scripts/check-restore-pending.js`

Current environment variables:

- `BACKUP_DIR`
- `RESTORE_PENDING_STALE_AFTER_MINUTES`
- `RESTORE_PENDING_SHOW_PATHS`

Current default JSON output is a restore-status object containing:

- `ok`
- `status`
- `checkedAt`
- `staleAfterMinutes`
- `pendingAgeMinutes`
- `hasPendingSqlite`
- `hasPendingJson`
- `message`
- safe metadata when available
- paths only when explicitly enabled

Current exit codes:

- `0`: status `none`
- `1`: status `pending`, `stale`, `partial`, `invalid`, or `unreadable`
- `2`: configuration error or unexpected exception

The CLI currently emits no alert payload and does not import or call the restore pending alert adapter.

### Current Restore Pending Alert Adapter Behavior

File:

- `server/shared/monitoring/restore-pending-alerts.js`

Functions:

- `buildRestorePendingAlert(currentResult, options)`
- `createLogOnlyRestorePendingAlertPayload(alert)`

Alert mapping:

| Status | Alert type | Severity |
| --- | --- | --- |
| `none` | `none` | `info` |
| `pending` | `restore_pending` | `warning` |
| `stale` | `restore_stale` | `critical` |
| `partial` | `restore_invalid` | `critical` |
| `invalid` | `restore_invalid` | `critical` |
| `unreadable` | `restore_invalid` | `critical` |
| bad status to `none` | `restore_recovery` | `info` |

Dedupe and recovery:

- repeated identical bad status inside the configured window is suppressed
- repeated identical bad status outside the window alerts again
- status changes bypass dedupe
- bad status changing to `none` emits recovery
- default adapter dedupe window is 60 minutes

Log-only payload:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "restore_pending"`
- structured alert fields
- no console, file, network, or delivery side effects

### Integration Options

| Option | Backward compatibility | Simplicity | Monitoring usefulness | JSON stability | Operator clarity | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| A. Keep status-only CLI | Maximum | Highest | Limited | Maximum | Clear but no alert decision | Safe but leaves adapter unused |
| B. Optional `RESTORE_PENDING_ALERT_MODE=log` | High; default unchanged | High | High | Default contract stable; opt-in wrapper documented | Clear if mode is explicit | Preferred |
| C. Separate `monitor:restore-alert` command | High | Medium/Low; duplicates checker/config parsing | High | Separate contract | Two commands may confuse operators | Not first |
| D. Adapter only for future scheduler wrapper | Maximum | High now | Deferred | Stable | Operational value delayed | Later possibility |

### Recommended Integration

Use a non-breaking optional mode in the existing CLI:

- default mode remains status-only and byte-for-byte contract-compatible where deterministic fields permit
- `RESTORE_PENDING_ALERT_MODE=log` enables alert decision output
- no alert delivery
- no file writes
- no network
- no state persistence
- exit codes remain based only on restore checker/configuration status

Exit codes must remain:

- `0`: restore status `none`, including recovery alert output
- `1`: restore status `pending`, `stale`, `partial`, `invalid`, or `unreadable`, even when dedupe suppresses the alert
- `2`: invalid CLI configuration or unexpected exception

Alert suppression must never convert an unhealthy restore state to exit `0`.

### Proposed Environment Contract

- `RESTORE_PENDING_ALERT_MODE=off|log`
  - default `off`
  - any other value is a configuration error with exit `2`
- `RESTORE_PENDING_PREVIOUS_STATUS`
  - optional previous checker status supplied by the caller/scheduler
- `RESTORE_PENDING_PREVIOUS_ALERT_AT`
  - optional ISO timestamp for dedupe
- `RESTORE_PENDING_DEDUPE_WINDOW_MINUTES`
  - optional positive number
  - defaults to the adapter default of 60 minutes when omitted
- `RESTORE_PENDING_SHOW_PATHS`
  - continues to control path exposure for both restore and alert payloads

The CLI must not persist previous state. A future cron/systemd wrapper or operator-managed state source must supply it explicitly.

### Proposed Output Contract

Default/off mode remains unchanged:

```json
{
  "ok": true,
  "status": "none",
  "checkedAt": "...",
  "staleAfterMinutes": 30,
  "pendingAgeMinutes": null,
  "hasPendingSqlite": false,
  "hasPendingJson": false,
  "message": "No pending restore marker found."
}
```

Alert log mode:

```json
{
  "restore": {
    "ok": false,
    "status": "pending",
    "checkedAt": "...",
    "staleAfterMinutes": 30,
    "pendingAgeMinutes": 5,
    "hasPendingSqlite": true,
    "hasPendingJson": true,
    "message": "Pending restore marker found."
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "restore_pending",
    "shouldAlert": true,
    "alertType": "restore_pending",
    "severity": "warning",
    "status": "pending",
    "message": "Pending restore marker found.",
    "safeDetails": {},
    "createdAt": "..."
  }
}
```

Path behavior:

- paths remain hidden by default in both `restore` and `alert`
- `RESTORE_PENDING_SHOW_PATHS=true` may include paths in both payload sections
- no new path-specific environment variable is needed

Configuration error behavior in alert mode should return one JSON error object with exit `2`; it should not fabricate a restore state or delivery attempt.

### Testing Plan For The Next Implementation

Required CLI tests:

- default output remains unchanged and has no `restore`/`alert` wrapper
- alert log mode with `none` includes a no-alert payload
- `pending` produces `restore_pending` warning
- `stale` produces `restore_stale` critical
- `partial`, `invalid`, and `unreadable` produce `restore_invalid` critical
- repeated identical status inside dedupe window suppresses `shouldAlert` but preserves exit `1`
- repeated identical status outside dedupe window alerts again
- `pending` to `stale` alerts despite being inside the dedupe window
- `pending` to `none` produces recovery and preserves exit `0`
- invalid alert mode exits `2`
- invalid dedupe window exits `2`
- paths remain hidden by default in both payload sections
- paths appear only when `RESTORE_PENDING_SHOW_PATHS=true`
- no delivery, network, file writes, marker mutation, or restore execution occurs

All tests should continue to use temporary backup directories only.

### Operational Clarity And Guardrails

- alert mode must be explicitly enabled
- status and alert decision remain separate objects
- exit code communicates restore health; `shouldAlert` communicates dedupe/delivery decision
- operators must not interpret `shouldAlert: false` as a healthy restore state
- alert text must not recommend deleting markers or retrying restore automatically
- future schedulers must document how previous status and alert timestamp are stored

### Selected Next SAFE STEP

Selected next step: **A. Add Optional Restore Pending Alert CLI Mode Only**.

Recommended next step: **SAFE STEP 166 - Add Optional Restore Pending Alert CLI Mode Only**.

The next step should modify only the restore pending CLI and its tests, preserve default output and exit codes, and add no delivery, routes, scheduler, PM2, CI, or restore behavior changes.

### Step 165 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 165, API test, restore test, backup freshness, or restore pending directories remain
- do not run manual or production restore

### Step 165 Validation Results

- `node --check`: passed on 155 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 117/117 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`, with the existing status-only JSON contract unchanged
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 165, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no manual or production restore was run

## SAFE STEP 166 - ADD OPTIONAL RESTORE PENDING ALERT CLI MODE ONLY

### Scope And Safety Confirmation

This step added an optional log-alert output mode to the existing restore pending CLI.

No restore behavior, backup behavior, routes/endpoints, cron/systemd configuration, PM2 configuration, CI workflow, SQL, auth/session/cookies, runtime wiring, or real alert delivery changed.

The CLI remains read-only and performs no database access, network requests, file writes, marker modification, restore execution, or alert delivery.

### Files Modified

- updated `server/scripts/check-restore-pending.js`
- updated `server/tests/restore-pending-cli.test.js`
- updated `server/REFACTOR_STATUS.md`

`package.json` and the existing `monitor:restore-pending` command were not changed.

### Optional Alert Mode

New environment variables:

- `RESTORE_PENDING_ALERT_MODE=off|log`
  - default `off`
- `RESTORE_PENDING_PREVIOUS_STATUS`
- `RESTORE_PENDING_PREVIOUS_ALERT_AT`
- `RESTORE_PENDING_DEDUPE_WINDOW_MINUTES`
- existing `RESTORE_PENDING_SHOW_PATHS` controls both restore and alert path visibility

Invalid alert mode or invalid non-positive dedupe window returns a JSON configuration error with exit `2`.

### Default Behavior Preservation

When alert mode is omitted or `off`:

- output remains the existing restore-status JSON object
- no `restore` wrapper is added
- no `alert` property is added
- existing status fields and path redaction remain unchanged
- exit codes remain unchanged

Default exit codes:

- `0`: `none`
- `1`: `pending`, `stale`, `partial`, `invalid`, or `unreadable`
- `2`: configuration or unexpected error

### Alert Log Mode Behavior

When `RESTORE_PENDING_ALERT_MODE=log`, output becomes:

```json
{
  "restore": {
    "status": "pending"
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "restore_pending",
    "alertType": "restore_pending",
    "severity": "warning"
  }
}
```

The alert section is produced by:

- `buildRestorePendingAlert(...)`
- `createLogOnlyRestorePendingAlertPayload(...)`

No delivery occurs.

Exit codes remain based on the restore result:

- dedupe suppression does not convert an unhealthy restore status to exit `0`
- recovery from a previous bad status to current `none` remains exit `0`

### Alert Decisions

- `none`: no alert
- `pending`: `restore_pending`, warning
- `stale`: `restore_stale`, critical
- `partial`, `invalid`, or `unreadable`: `restore_invalid`, critical
- previous bad status to current `none`: `restore_recovery`, info
- repeated identical bad status inside the dedupe window: suppressed alert decision while restore exit code remains `1`

### Path Safety

By default:

- paths are hidden in both `restore` and `alert`
- metadata paths are reduced to basenames

With `RESTORE_PENDING_SHOW_PATHS=true`:

- restore backup/marker paths are included
- alert safe details include the same checker-provided paths

### Automated Tests

`server/tests/restore-pending-cli.test.js` now contains 19 tests.

New coverage verifies:

- default output remains unwrapped and unchanged
- alert mode `none` produces a no-alert payload
- `pending` produces warning `restore_pending`
- `stale` produces critical `restore_stale`
- `partial` and `invalid` produce critical `restore_invalid`
- repeated pending inside dedupe is suppressed while exit remains `1`
- pending to none produces recovery while exit remains `0`
- invalid alert mode exits `2`
- restore and alert paths are hidden by default
- paths appear in both payload sections only when explicitly enabled

### Production Risk Assessment

Risk level: **Low**.

Reasons:

- optional mode only
- default contract preserved
- no runtime or scheduler integration
- no delivery, network, DB, or file writes
- exit codes remain tied to restore state
- path redaction remains enabled by default
- isolated temp-directory tests cover both modes

Residual risk:

- future schedulers must distinguish restore health from `shouldAlert`
- previous state values are caller-provided and are not persisted or verified by the CLI
- enabling path output may expose local paths in administrator-controlled logs

### Recommended Next SAFE STEP

Recommended next step: **SAFE STEP 167 - Final Monitoring Coverage Review Report Only**.

Review backup freshness monitoring, restore pending monitoring, CLI alert modes, remaining PM2/runtime gaps, and the safest stopping point before scheduler or alert delivery work.

### Step 166 Validation Results

- `node --check`: passed on 155 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/restore-pending-cli.test.js`: passed, 19/19 tests
- `npm run test:api`: passed, 127/127 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- default `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, and returned the existing status-only JSON
- `RESTORE_PENDING_ALERT_MODE=log npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, and returned `restore` plus a log-only `alert` with `delivery: "none"`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 166, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no manual or production restore was run

## SAFE STEP 167 - FINAL MONITORING COVERAGE REVIEW REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, CLI behavior, routes/endpoints, cron/systemd files, PM2 configuration, CI workflow, alert delivery, backup behavior, restore behavior, SQL, auth/session/cookies, or runtime behavior changed. No manual or production restore was run.

### Monitoring Components Now Available

Backup freshness:

- helper: `server/shared/monitoring/backup-freshness.js`
- read-only inspection of backup files
- statuses: `fresh`, `stale`, `missing`, and `unreadable`
- newest qualifying backup selection
- deterministic time and extension filtering
- paths hidden by default

Backup alert decisions:

- adapter: `server/shared/monitoring/backup-alerts.js`
- backup failure, monitor failure, recovery, and no-alert decisions
- dedupe support
- log-only payload with `delivery: "none"`
- no delivery, network, or file writes

Backup CLI:

- script: `server/scripts/check-backup-freshness.js`
- command: `npm run monitor:backup`
- default freshness-only JSON
- optional `BACKUP_MONITOR_ALERT_MODE=log`
- exit codes tied to backup/configuration health

Restore pending:

- helper: `server/shared/monitoring/restore-pending.js`
- read-only inspection of `pending-restore.sqlite` and `pending-restore.json`
- statuses: `none`, `pending`, `stale`, `partial`, `invalid`, and `unreadable`
- no marker modification, restore execution, retry, or deletion
- paths hidden by default

Restore pending alert decisions:

- adapter: `server/shared/monitoring/restore-pending-alerts.js`
- alert types: `restore_pending`, `restore_stale`, `restore_invalid`, `restore_recovery`, and `none`
- warning for fresh pending state
- critical for stale/inconsistent states
- dedupe and recovery support
- status changes bypass dedupe
- log-only payload with `delivery: "none"`

Restore pending CLI:

- script: `server/scripts/check-restore-pending.js`
- command: `npm run monitor:restore-pending`
- default restore-status-only JSON
- optional `RESTORE_PENDING_ALERT_MODE=log`
- exit codes remain tied to restore marker/configuration health

### Commands Available

#### Backup Monitor

Default:

```text
npm run monitor:backup
```

Default output:

- freshness JSON only
- paths hidden unless explicitly enabled

Log-alert mode:

```text
BACKUP_MONITOR_ALERT_MODE=log npm run monitor:backup
```

Output:

- `backup`
- `alert`
- alert delivery remains `none`

Exit codes:

- `0`: fresh
- `1`: stale, missing, or unreadable
- `2`: configuration or unexpected error

#### Restore Pending Monitor

Default:

```text
npm run monitor:restore-pending
```

Default output:

- restore marker status JSON only
- paths hidden unless explicitly enabled

Log-alert mode:

```text
RESTORE_PENDING_ALERT_MODE=log npm run monitor:restore-pending
```

Output:

- `restore`
- `alert`
- alert delivery remains `none`

Exit codes:

- `0`: no pending marker
- `1`: pending, stale, partial, invalid, or unreadable
- `2`: configuration or unexpected error

Important:

- dedupe suppression never changes an unhealthy exit code to success
- alert decisions and monitor health are intentionally separate

### Current Test Coverage

Monitoring-focused test files:

- `server/tests/backup-freshness.test.js`
- `server/tests/backup-freshness-cli.test.js`
- `server/tests/backup-alerts.test.js`
- `server/tests/restore-pending.test.js`
- `server/tests/restore-pending-cli.test.js`
- `server/tests/restore-pending-alerts.test.js`

Current monitoring-focused test count:

- backup freshness helper: 6
- backup CLI: 13
- backup alert adapter: 11
- restore pending helper: 11
- restore pending CLI: 19
- restore pending alert adapter: 13
- monitoring subtotal: 73 tests

Current full suites:

- `npm run test:api`: 127 tests
- `npm run test:restore`: 1 disposable valid-restore test

Coverage includes:

- normal and failure statuses
- configuration errors
- exit codes
- path redaction
- optional alert modes
- dedupe
- recovery
- status changes
- no-delivery payloads
- disposable valid restore and pending marker consumption

### Existing Broader Observability

HTTP status:

- `GET /api/health`
- `GET /api/version`

Current health/status endpoints provide process availability and version visibility, but they are not an operational monitoring dashboard and do not expose backup or restore marker details.

PM2:

- application process `clinova`
- backup scheduler process `clinova-backup`
- file-based stdout/stderr logs
- configured memory restart thresholds
- no restart/crash notification delivery
- no monitoring command integration

Business logs:

- audit logs provide application action history
- WhatsApp message logs record fallback, dry-run, failed, and provider outcomes
- these are useful records, but no rate/threshold alerting currently consumes them

CI:

- API test workflow covers `npm run test:api`
- manual restore workflow covers `npm run test:restore`
- CI validates behavior but does not monitor a deployed production instance

### What Is Still Not Wired

- no installed cron jobs
- no systemd service/timer files
- no PM2 monitoring process for the new CLI commands
- no scheduled execution of backup freshness or restore pending monitors
- no persistent storage for previous status or previous alert timestamp
- no email alert delivery
- no webhook alert delivery
- no WhatsApp alert delivery
- no protected operational HTTP endpoint
- no platform-owner monitoring dashboard
- no automatic recovery or remediation

The lack of automatic remediation is intentional and should remain so for restore monitoring.

### Operational Readiness

#### Internal Deployment

Decision: **GO**.

Conditions:

- operators can run both monitoring commands manually
- PM2 and backup logs are reviewed
- backup and restore paths are configured correctly
- automated test suites pass before deployment

#### Limited Clinic Rollout

Decision: **CONDITIONAL GO**.

Required conditions:

- backup scheduler is confirmed active
- backup freshness CLI is run on an operator-defined schedule
- restore pending CLI is run after restore activity and during routine checks
- an operator owns PM2 log review and incident response
- backup directory permissions and disk capacity are checked
- WhatsApp production mode is explicitly reviewed

The current tools materially improve operational safety, but scheduled execution and human ownership remain external deployment responsibilities.

#### General Rollout

Decision: **NO-GO for broad unattended rollout**.

Blocking monitoring gaps:

- no PM2 crash/restart alerts
- no scheduled invocation of the monitor CLIs
- no real alert delivery or escalation path
- no disk-capacity monitoring
- no performance/latency monitoring

The backend can operate, but general rollout should not rely on manual log inspection alone.

### Remaining Monitoring Gaps

High priority:

- PM2 restart, crash, and memory-restart visibility
- documented ownership and escalation for runtime incidents
- scheduled execution of backup and restore pending monitors

Medium priority:

- disk usage monitoring for DB, uploads, backups, and logs
- WhatsApp failure count/rate and consecutive-failure monitoring
- backup scheduler heartbeat or last-success visibility
- restore accepted/applied/failed event visibility in operator logs

Environment-dependent:

- PostgreSQL connectivity, backup, restore, and operational parity if production uses PostgreSQL

Later hardening:

- UI/E2E monitoring
- bootstrap latency
- slow endpoint/request timing
- DB timing
- memory/CPU trends
- log rotation and retention verification
- dashboard and protected operational endpoint

### Recommended Production Runbook Before Pilot

Before deployment:

1. Run `node --check` on server JavaScript.
2. Run `npm run db:check`.
3. Run `npm run test:api`.
4. Run `npm run test:restore` only in its disposable environment.
5. Run `npm run monitor:backup`.
6. Run `npm run monitor:restore-pending`.
7. Verify both alert log modes return `delivery: "none"`.
8. Confirm the PM2 `clinova` and `clinova-backup` processes are online.
9. Review PM2 application and backup scheduler logs.
10. Verify backup scheduler configuration and recent successful backup output.
11. Verify `BACKUP_DIR` exists and is readable by monitor commands.
12. Verify the application service account has the intended backup/upload permissions.
13. Verify available disk space for DB, uploads, backups, and logs.
14. Verify WhatsApp mode, dry-run flag, and provider credentials policy.
15. Verify restore remains platform-owner-only.
16. Confirm no pending restore markers exist before normal rollout.
17. Confirm a named operator owns backup, restore, PM2, and WhatsApp incident response.

On monitor failure:

- do not delete restore markers automatically
- do not retry restore automatically
- inspect PM2/system logs, DB state, pending metadata, and safety backups
- preserve evidence before any manual recovery action

### Final Recommendation

Selected option: **B. Add PM2 Runtime Monitoring Report first**.

Reason:

- backup and restore monitor logic, CLI contracts, alert decisions, and tests are now mature
- the largest remaining operational blind spot is process restart/crash visibility
- a report should define PM2 event sources, restart counters, memory restarts, log rotation, and alert boundaries before any configuration change
- scheduler installation and real alert delivery should follow a clear runtime-monitoring design

Recommended next step: **SAFE STEP 168 - PM2 Runtime Monitoring Boundary Report Only**.

### Step 167 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run restore pending alert log mode against a temporary no-pending backup directory
- run backup alert log mode against a temporary fresh backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 167, API test, restore test, backup freshness, or restore pending directories remain
- do not run manual or production restore

### Step 167 Validation Results

- `node --check`: passed on 155 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 127/127 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- default `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `BACKUP_MONITOR_ALERT_MODE=log npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, and returned `backup` plus a log-only `alert` with `delivery: "none"`
- default `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `RESTORE_PENDING_ALERT_MODE=log npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, and returned `restore` plus a log-only `alert` with `delivery: "none"`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 167, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no manual or production restore was run

## SAFE STEP 168 - PM2 RUNTIME MONITORING BOUNDARY REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, PM2 ecosystem configuration, PM2 modules, monitoring scripts, cron/systemd files, routes/endpoints, CI workflow, backup/restore behavior, WhatsApp behavior, SQL, auth/session/cookies, or runtime behavior changed. No PM2 process was started, stopped, reloaded, or restarted during this step.

### Current PM2 Runtime State

Deployment model:

- production is managed through `ecosystem.config.cjs`
- SQLite deployments use one application instance in `fork` mode
- deployments with `DATABASE_URL` use `cluster` mode with `WEB_CONCURRENCY` or a default of two instances
- `watch` is disabled
- PM2 process state is saved after installation and deployment

Configured processes:

1. `clinova`
   - script: `server/app.js`
   - working directory: repository root
   - maximum memory restart threshold: `300M`
   - kill timeout: 5 seconds
   - listen timeout: 8 seconds
2. `clinova-backup`
   - script: `server/backup-scheduler.js`
   - one forked instance
   - `autorestart: true`
   - maximum memory restart threshold: `150M`

Startup and deployment:

- first installation runs `pm2 start ecosystem.config.cjs`
- deployments run `pm2 startOrReload ecosystem.config.cjs --update-env`
- deployments run `pm2 save`
- the deploy script performs up to five `/api/health` attempts after reload
- the deploy workflow fails when the health check remains unavailable

Available package commands:

- `npm run pm2:start`
- `npm run pm2:reload`
- `npm run pm2:restart`
- `npm run pm2:logs`
- `npm run pm2:save`

Log locations:

- application stderr: `logs/pm2-error.log`
- application stdout: `logs/pm2-out.log`
- backup scheduler stderr: `logs/pm2-backup-error.log`
- backup scheduler stdout: `logs/pm2-backup-out.log`
- log timestamps use `YYYY-MM-DD HH:mm:ss`

Current visibility level:

- process availability can be checked manually through PM2
- deployment health is checked through `/api/health`
- version can be checked through `/api/version`
- stdout/stderr are retained in configured files
- memory thresholds can cause PM2 restarts
- no automated runtime status collection, restart analysis, or alert decision currently consumes PM2 state

### Current Blind Spots

Unexpected restart visibility:

- restart counters are not collected or compared with a previous observation
- an application can restart and return healthy before an operator notices

Crash visibility:

- crashes may appear in PM2/error logs
- no alert or structured monitor reports a crash immediately
- deployment health checks do not cover crashes occurring after deployment

Memory-based restart visibility:

- memory restart thresholds exist
- no monitor distinguishes a memory-triggered restart from a deploy reload or crash restart
- no trend exists for memory approaching the configured threshold

Repeated restart loops:

- no threshold checks restart count growth within a time window
- a process may oscillate between starting and failing while requiring manual PM2 inspection

Uptime tracking:

- PM2 exposes process start time/uptime
- no checker identifies unexpectedly low uptime outside a deployment window

Offline state:

- no local monitor currently verifies that both `clinova` and `clinova-backup` are online
- `/api/health` can be healthy while the backup scheduler process is offline

Deployment-time restart verification:

- the deploy script confirms the HTTP application becomes healthy
- it does not verify both PM2 processes are online
- it does not record restart counts before and after deployment
- it does not verify the backup scheduler's uptime or recent output

Log operations:

- log file paths are configured
- no log rotation/retention policy is visible in the current PM2 configuration
- no error-rate or repeated-signature analysis is present

### PM2 Monitoring Sources

Recommended read-only sources:

- `pm2 status`
  - quick operator table for process state, uptime, restart count, CPU, and memory
- `pm2 list`
  - equivalent fleet overview suitable for routine review
- `pm2 show clinova`
  - detailed application metadata, status, restart count, uptime/start time, paths, and runtime details
- `pm2 show clinova-backup`
  - detailed backup scheduler state
- `pm2 jlist`
  - machine-readable JSON source preferred for a future checker
- `pm2 logs clinova`
  - application output and errors
- `pm2 logs clinova-backup`
  - backup scheduler output and errors
- `pm2 monit`
  - interactive CPU and memory observation

Host-level sources:

- PM2 daemon logs
- system startup/service logs for PM2 resurrection
- journald or system logs when PM2 startup is registered with the operating system
- deployment workflow logs
- `logs/pm2-*.log` files configured in the ecosystem

`pm2 jlist` is the preferred future parser input because it is structured and avoids scraping human-formatted tables.

### Recommended Minimal Monitoring Model

Without adding tools or configuration:

Daily review:

1. Run `pm2 status`.
2. Confirm `clinova` is online.
3. Confirm `clinova-backup` is online.
4. Review restart counts for unexpected increases.
5. Review uptime for unexpected resets.
6. Review CPU and memory for abnormal levels.
7. Inspect application and backup error logs.
8. Run backup freshness and restore pending monitors.

Post-deploy verification:

1. Confirm deployment health check passed.
2. Run `pm2 status`.
3. Verify both configured processes are online.
4. Verify application uptime corresponds to the deployment.
5. Verify the backup scheduler did not enter a restart loop.
6. Review restart count changes.
7. Review the latest application and backup scheduler errors.
8. Verify `/api/version` matches the deployed release.

Incident review:

- capture `pm2 jlist` before manual intervention where possible
- preserve relevant log excerpts
- identify whether the event was deployment reload, crash, memory restart, or host restart
- do not reset counters or logs before recording evidence

### Recommended Future Alert Events

Process stopped:

- either expected process is absent, stopped, errored, or offline
- severity: critical

Process crashed:

- process status indicates failure or restart count increases unexpectedly with error evidence
- severity: critical

Restart count threshold exceeded:

- restart count grows by a configurable amount inside a time window
- suggested initial threshold: three unexpected restarts within 15 minutes
- severity: critical

Memory restart occurred:

- restart coincides with memory threshold behavior or memory repeatedly approaches the configured limit
- severity: warning for one event, critical when repeated

Unexpectedly low uptime:

- process uptime is below a configured threshold outside an active deployment/restart window
- severity: warning

Repeated exits:

- successive observations show increasing restarts and low uptime
- severity: critical

Recovery:

- previously offline/errored process returns online with stable uptime
- severity: info

Deployment reloads must be distinguishable from unexpected restarts to avoid false alarms.

### PM2 Metrics Worth Tracking Later

Per process:

- process name
- PM2 process ID
- runtime PID
- status
- restart count
- unstable restart count if exposed
- process start timestamp
- uptime minutes
- memory bytes/MB
- CPU percent
- execution mode
- instance count
- last observation time

Derived metrics:

- restart count delta since previous observation
- uptime reset without a declared deployment
- memory percentage relative to configured restart threshold
- consecutive offline observations
- time since last healthy observation

Fleet-level checks:

- expected processes present
- expected instance count
- all application instances online
- backup scheduler online independently of application health

### Recommended Safe First Implementation

Selected option: **A. PM2 Status Checker Helper**.

Recommended characteristics:

- read-only helper/parser
- consumes supplied `pm2 jlist` JSON or already parsed objects
- no direct process control
- no PM2 dependency in unit tests
- no shell execution in the core parser
- no alert delivery
- no PM2 configuration changes

Suggested separation:

1. Pure parser/evaluator helper first.
2. Tests with fixture objects.
3. CLI boundary report later.
4. Read-only CLI wrapper only after the parser contract is stable.

### Proposed Checker Contract

Suggested aggregate shape:

```json
{
  "ok": true,
  "status": "online",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "message": "All expected PM2 processes are online.",
  "processes": [
    {
      "name": "clinova",
      "status": "online",
      "uptimeMinutes": 1234,
      "restartCount": 0,
      "memoryMb": 120.5,
      "cpuPercent": 1.2,
      "message": "Process is online."
    }
  ]
}
```

Suggested aggregate statuses:

- `online`
- `degraded`
- `offline`
- `missing`
- `invalid`

Suggested process status rules:

- online and expected instance count present: healthy
- one or more application instances offline: degraded/offline
- backup scheduler missing/offline: degraded even when HTTP health passes
- malformed PM2 input: invalid

The first helper should report current state only. Restart deltas and recovery require previous observations and should be designed in a later alert-boundary step.

### Testing Strategy

Use fixture-only tests:

- both expected processes online
- application process missing
- backup scheduler missing
- process stopped
- process errored
- clustered application with one offline instance
- restart count populated
- uptime calculation from PM2 start timestamp
- memory byte-to-MB conversion
- CPU value parsing
- malformed or empty PM2 output
- extra unrelated PM2 process ignored
- deterministic `now`

Safety requirements:

- no real PM2 daemon required in CI
- no `pm2 start`, `stop`, `restart`, `reload`, or `delete`
- no production process control
- core helper receives fixture data directly

### Operational Readiness Impact

Internal deployment:

- **GO**
- current manual PM2 review, health endpoint, logs, and monitor CLIs are sufficient when an operator is actively available

Pilot clinic rollout:

- **CONDITIONAL GO**
- require daily PM2 status/log review, post-deploy checks, backup freshness checks, and named incident ownership
- PM2 checker would reduce reliance on manual interpretation

Unattended production rollout:

- **NO-GO**
- current blind spots allow crashes, restart loops, backup scheduler outages, and memory restarts to remain unnoticed
- a read-only checker plus scheduled execution and an escalation channel are needed before broad unattended operation

### Selected Next SAFE STEP

Selected option: **A. Add PM2 Status Checker Helper Only**.

Recommended next step: **SAFE STEP 169 - Add PM2 Status Checker Helper Only**.

The next step should add a pure parser/evaluator and fixture-based tests only. It should not execute PM2 commands, modify PM2 configuration, control processes, add routes, add schedulers, or send alerts.

### Step 168 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore` in its disposable environment
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 168, API test, restore test, backup freshness, or restore pending directories remain
- do not run PM2 control commands
- do not run manual or production restore

### Step 168 Validation Results

- `node --check`: passed on 155 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 127/127 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 168, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no PM2 start, stop, restart, reload, delete, or configuration command was run
- no manual or production restore was run

## SAFE STEP 169 - ADD PM2 STATUS CHECKER HELPER ONLY

### Scope And Safety Confirmation

This step added a pure read-only PM2 JSON parser/evaluator and fixture-based tests.

No application runtime behavior, PM2 configuration, PM2 process state, routes/endpoints, cron/systemd configuration, alert delivery, CI workflow, backup/restore/WhatsApp behavior, SQL, or auth/session/cookies changed.

The helper:

- does not import or execute `child_process`
- does not require PM2
- does not run `pm2 jlist` or any PM2 command
- does not start, stop, restart, reload, or delete processes
- does not access the filesystem, database, or network
- accepts supplied fixture/JSON objects only

### Files Added Or Modified

- added `server/shared/monitoring/pm2-status.js`
- added `server/tests/pm2-status.test.js`
- updated `package.json` only to include the new test in `npm run test:api`
- updated `server/REFACTOR_STATUS.md`

### Helper Functions

Added:

- `analyzePm2Process(process, options)`
- `analyzePm2ProcessList(processes, options)`

Supported options:

- `expectedProcessNames`
- `minUptimeMinutes`
- `maxRestartCount`
- `maxMemoryMb`
- deterministic `now`

Default expected processes:

- `clinova`
- `clinova-backup`

### Supported Input Shape

The parser supports common `pm2 jlist` fields:

- process name from `name` or `pm2_env.name`
- process status from `pm2_env.status`
- restart count from `pm2_env.restart_time`
- start time from `pm2_env.pm_uptime`
- memory bytes from `monit.memory`
- CPU percent from `monit.cpu`

It also accepts limited direct fallback fields for fixture compatibility.

### Supported Statuses

Aggregate and process evaluation supports:

- `healthy`
- `degraded`
- `missing`
- `offline`
- `restarting`
- `unhealthy`

Rules:

- missing expected process produces aggregate `missing`
- non-online process produces `offline`
- restart count above threshold produces `degraded`
- low uptime with one or more restarts produces `restarting`
- memory above threshold produces `degraded`
- malformed process data produces `unhealthy`
- all expected processes online and inside thresholds produces `healthy`

Aggregate precedence:

1. `missing`
2. `unhealthy`
3. `offline`
4. `restarting`
5. `degraded`
6. `healthy`

### Result Contract

Aggregate results include:

- `ok`
- `status`
- `checkedAt`
- `processes`
- `missingProcesses`
- `message`

Each analyzed process includes:

- `name`
- `status`
- `ok`
- `restartCount`
- `uptimeMinutes`
- `memoryMb`
- `cpuPercent`
- `issues`

Unrelated PM2 processes are ignored when they are not listed in `expectedProcessNames`.

### Automated Tests

`server/tests/pm2-status.test.js` adds nine fixture-only tests:

- healthy single process
- healthy multiple expected processes
- missing expected process
- offline process
- restart count threshold exceeded
- low uptime with restart count
- high memory usage
- malformed and empty PM2 output
- deterministic `now` and unrelated-process filtering

No real PM2 daemon or process is required.

### Production Risk Assessment

Risk level: **Low**.

Reasons:

- pure parser/evaluator only
- no shell or PM2 command execution
- no runtime wiring
- no process control
- no filesystem, database, or network access
- deterministic fixture tests

Residual design limitations:

- restart count is cumulative; restart deltas require a previous observation
- current state alone cannot distinguish deployment reload from unexpected restart
- memory threshold is caller-supplied and is not automatically read from the ecosystem config
- future CLI integration must safely handle missing PM2, invalid JSON, and command timeouts

### Recommended Next SAFE STEP

Recommended next step: **SAFE STEP 170 - PM2 Status Checker CLI Boundary Report Only**.

Before executing `pm2 jlist` from a CLI, define command invocation safety, timeout/error handling, expected process configuration, exit codes, output redaction, and test strategy without a real PM2 dependency.

### Step 169 Validation Results

- `node --check`: passed on 157 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/pm2-status.test.js`: passed, 9/9 fixture-only tests
- `npm run test:api`: passed, 136/136 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 169, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no PM2 command was executed and `ecosystem.config.cjs` was not changed
- no manual or production restore was run

## SAFE STEP 170 - PM2 STATUS CHECKER CLI BOUNDARY REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, CLI command, routes/endpoints, cron/systemd configuration, PM2 configuration, alert delivery, CI workflow, backup/restore/WhatsApp behavior, SQL, auth/session/cookies, or runtime behavior changed. No PM2 command was executed.

### Current PM2 Checker Status

File:

- `server/shared/monitoring/pm2-status.js`

APIs:

- `analyzePm2Process(process, options)`
- `analyzePm2ProcessList(processes, options)`

Supported options:

- `expectedProcessNames`
- `minUptimeMinutes`
- `maxRestartCount`
- `maxMemoryMb`
- deterministic `now`

Supported statuses:

- `healthy`
- `degraded`
- `missing`
- `offline`
- `restarting`
- `unhealthy`

Current default expected processes:

- `clinova`
- `clinova-backup`

Current test coverage:

- `server/tests/pm2-status.test.js`
- nine fixture-only tests
- healthy single and multiple processes
- missing and offline processes
- restart threshold
- low uptime after restart
- high memory
- malformed/empty input
- deterministic time and unrelated-process filtering

Current boundaries:

- not wired into application runtime
- not exposed through HTTP
- no CLI command
- no scheduler
- no alert adapter
- no PM2 command execution
- no `child_process` dependency in the helper

### Exposure Options

#### A. Local CLI Running `pm2 jlist`

Security:

- local administrative surface only
- read-only PM2 command
- no HTTP exposure
- no process control

Advantages:

- directly useful on production hosts
- structured JSON source
- evaluates actual PM2 state
- fits existing `monitor:*` command pattern

Risks:

- PM2 binary may be unavailable or not on `PATH`
- wrong PM2 home/user can produce an empty or different process list
- command can fail, hang, or emit invalid/non-JSON output
- tests must not require a real PM2 daemon

#### B. CLI Accepting Fixture/JSON File Input

Advantages:

- strongest CI testability
- no PM2 binary dependency
- useful for offline diagnostics

Disadvantages:

- weaker direct operational usefulness
- file path validation and file access add another surface
- operators must create or redirect PM2 JSON manually
- stale fixture files can be mistaken for current state

Recommended use:

- optional test/debug input only, not the primary production mode

#### C. Protected Operational Endpoint Later

Advantages:

- dashboard and remote status visibility

Risks:

- larger authentication and information-disclosure surface
- server process would need permission/access to PM2 daemon state
- couples HTTP runtime to process-manager tooling

Recommendation:

- defer

#### D. Cron/Systemd Wrapper Later

Advantages:

- scheduled monitoring
- can consume exit codes and JSON output

Risks:

- requires stable CLI contract first
- requires correct service user and PM2 home
- needs state persistence for restart deltas and alert dedupe

Recommendation:

- later, after CLI validation

#### E. Manual Runbook Only

Advantages:

- no implementation risk

Disadvantages:

- relies on human consistency
- does not reduce unattended runtime blind spots

Recommendation:

- retain as fallback, not the final exposure

### Option Comparison

| Option | Security | Simplicity | PM2 dependency | Production usefulness | CI testability | Command-failure risk | Platform behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. `pm2 jlist` CLI | High when local-only | Medium | Yes | High | High with injected executor | Medium | Linux primary; Windows supported with executable resolution differences |
| B. JSON file input | High | Medium | No | Medium/Low | Highest | Low | Portable |
| C. Protected endpoint | Medium | Low | Yes | Medium/High | Medium | Medium | Deployment-specific |
| D. Scheduler wrapper | High when local | Medium | Yes | High | Medium | Medium | systemd/cron differs by OS |
| E. Manual runbook | High | Highest | Operator-only | Low | Not applicable | Human error | Portable |

### Recommended First Exposure

Add a local-only CLI command that executes read-only `pm2 jlist`.

Required guardrails:

- no PM2 control commands
- no endpoint
- no scheduler initially
- no alert delivery
- fixed command and arguments; no shell-built command string
- command timeout
- bounded stdout/stderr capture
- JSON-only CLI output
- explicit configuration errors
- fixture/injected command execution in tests
- no real PM2 dependency in CI

Recommended execution design:

1. Keep `pm2-status.js` pure.
2. Add a small command runner abstraction.
3. Execute the project-local PM2 binary through Node/npm-compatible resolution.
4. Pass only the fixed `jlist` argument.
5. Parse stdout as JSON.
6. Pass parsed data to `analyzePm2ProcessList`.
7. Return structured JSON and exit code.

Do not invoke through a shell where avoidable.

### Proposed CLI Design

Suggested command:

- `npm run monitor:pm2`

Suggested script:

- `server/scripts/check-pm2-status.js`

Suggested environment variables:

- `PM2_MONITOR_EXPECTED_PROCESSES=clinova,clinova-backup`
- `PM2_MONITOR_MIN_UPTIME_MINUTES=5`
- `PM2_MONITOR_MAX_RESTART_COUNT=5`
- `PM2_MONITOR_MAX_MEMORY_MB=512`
- `PM2_MONITOR_TIMEOUT_MS=5000`

Optional future test/debug variable:

- a fixture-input mechanism only when explicitly test-scoped
- production default must query `pm2 jlist`

Configuration validation:

- expected process list must contain at least one non-empty name
- numeric limits must be finite and non-negative
- timeout must be a positive finite integer
- duplicate process names should be collapsed

### Proposed Exit Codes

- `0`: checker status `healthy`
- `1`: `degraded`, `missing`, `offline`, `restarting`, or `unhealthy`
- `2`: configuration error, PM2 unavailable, timeout, invalid PM2 JSON, command failure, or unexpected exception

Important distinction:

- PM2 command/execution failures use exit `2`
- valid PM2 output showing unhealthy processes uses exit `1`
- an empty valid PM2 list with expected processes produces `missing` and exit `1`

### Proposed Output

Successful evaluation:

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "processes": [
    {
      "name": "clinova",
      "status": "healthy",
      "ok": true,
      "restartCount": 0,
      "uptimeMinutes": 1234,
      "memoryMb": 120,
      "cpuPercent": 1.2,
      "issues": []
    }
  ],
  "missingProcesses": [],
  "message": "All expected PM2 processes are healthy."
}
```

Execution/configuration error:

```json
{
  "ok": false,
  "status": "configuration_error",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "message": "PM2 status check could not run."
}
```

Safety:

- do not include environment variables, PM2 paths, full command lines, or raw stderr by default
- process names and operational metrics are acceptable local output
- error messages should be safe and concise

### Command Invocation And Platform Notes

Linux production:

- expected primary environment
- PM2 may be project-local through npm or globally installed
- the CLI must run under the same user/`PM2_HOME` as the managed processes

Windows development:

- executable resolution differs (`pm2.cmd`/npm shims)
- tests should inject a mock runner and not depend on platform-specific PM2 installation

Cross-platform recommendation:

- isolate executable resolution and command execution from parsing
- avoid shell command strings
- use fixed argument arrays
- test timeout, nonzero exit, missing executable, and invalid JSON through mocks

### Testing Plan For Future CLI

Pure CLI/runner tests:

- healthy PM2 JSON returns exit `0`
- missing expected process returns exit `1`
- offline process returns exit `1`
- restart threshold exceeded returns exit `1`
- low uptime after restart returns exit `1`
- high memory returns exit `1`
- PM2 executable unavailable returns exit `2`
- command timeout returns exit `2`
- nonzero PM2 command exit returns exit `2`
- invalid JSON returns exit `2`
- invalid expected-process configuration returns exit `2`
- invalid numeric thresholds return exit `2`
- JSON output only
- raw PM2 environment/secrets are not echoed

Testing architecture:

- inject/mock the PM2 command runner
- use fixture stdout strings
- do not start a PM2 daemon
- do not invoke a real PM2 binary in CI
- keep current parser fixture tests

### What Not To Do

- do not use `pm2 start`
- do not use `pm2 stop`
- do not use `pm2 restart`
- do not use `pm2 reload`
- do not use `pm2 delete`
- do not automatically restart unhealthy processes
- do not expose PM2 details through public health
- do not add PM2 as a CI runtime service
- do not require a real PM2 daemon for unit tests
- do not persist or reset restart counters

### Operational Risk Assessment

Risk of the proposed local read-only CLI: **Low to Medium**.

Low-risk aspects:

- read-only `jlist`
- local-only output
- no process control
- existing pure parser

Main risks:

- querying the wrong PM2 user/home
- command timeout or unavailable executable
- platform-specific executable resolution
- mistaking deployment reload restart counts for crashes
- operational thresholds that do not match environment capacity

These risks should be handled through explicit exit `2`, safe messages, injected-runner tests, and deployment documentation.

### Selected Next SAFE STEP

Selected option: **A. Add PM2 Status CLI Only**.

Recommended next step: **SAFE STEP 171 - Add PM2 Status CLI Only**.

The implementation should remain local-only and read-only, use a fixed `pm2 jlist` invocation, support injected fixture/mock execution in tests, and make no PM2 configuration or process-control changes.

### Step 170 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore` in its disposable environment
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 170, API test, restore test, backup freshness, or restore pending directories remain
- do not run any PM2 command
- do not run manual or production restore

### Step 170 Validation Results

- `node --check`: passed on 157 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 136/136 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 170, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- no PM2 command was executed and no PM2 configuration changed
- no manual or production restore was run

## SAFE STEP 171 - ADD PM2 STATUS CLI ONLY

### Scope And Safety Confirmation

This step added a local-only, read-only PM2 status CLI.

No application runtime behavior, PM2 ecosystem configuration, PM2 process state, routes/endpoints, cron/systemd configuration, alert delivery, CI workflow, backup/restore/WhatsApp behavior, SQL, or auth/session/cookies changed.

The CLI:

- executes only the project-local PM2 script with the fixed argument `jlist`
- does not use a shell command string
- does not expose PM2 control operations
- does not start, stop, restart, reload, or delete processes
- does not write files
- does not use the network
- emits JSON only

### Files Added Or Modified

- added `server/scripts/check-pm2-status.js`
- added `server/tests/pm2-status-cli.test.js`
- updated `package.json`
- updated `server/REFACTOR_STATUS.md`

`ecosystem.config.cjs` was not changed.

### CLI Command

Added:

- `npm run monitor:pm2`

The npm command runs:

- `node server/scripts/check-pm2-status.js`

The production runner executes:

- Node executable
- project-local `node_modules/pm2/bin/pm2`
- fixed argument `jlist`

No caller-controlled PM2 argument is accepted.

### Supported Environment Variables

- `PM2_MONITOR_EXPECTED_PROCESSES`
  - comma-separated
  - defaults to `clinova,clinova-backup`
  - duplicates are collapsed
- `PM2_MONITOR_MIN_UPTIME_MINUTES`
  - default `5`
  - non-negative finite number
- `PM2_MONITOR_MAX_RESTART_COUNT`
  - default `5`
  - non-negative finite number
- `PM2_MONITOR_MAX_MEMORY_MB`
  - default `512`
  - non-negative finite number
- `PM2_MONITOR_TIMEOUT_MS`
  - default `5000`
  - positive integer

Invalid configuration returns exit `2` with JSON status `configuration_error`.

### Exit Codes

- `0`: PM2 checker status `healthy`
- `1`: `degraded`, `missing`, `offline`, `restarting`, or `unhealthy`
- `2`: configuration error, PM2 unavailable, timeout, command failure, oversized command output, invalid JSON, or unexpected exception

Valid empty PM2 output represented by `[]` is evaluated by the checker as missing expected processes and returns exit `1`.

### Command Safety

The command runner:

- uses `spawn` without shell interpolation
- passes only the fixed `jlist` argument
- defaults to a 5-second timeout
- limits captured stdout and stderr to 2 MB each
- terminates the child command on timeout or excessive output
- does not include raw stderr, environment variables, or command paths in JSON errors

The child command is the PM2 read-only query process, not a managed application process.

### Testability

Exported functions:

- `runPm2Jlist(options)`
- `runPm2StatusCli(options)`

`runPm2StatusCli` accepts an injected `runCommand` function, allowing CI tests to supply PM2 JSON fixtures without a PM2 daemon or real PM2 command.

### Automated Tests

`server/tests/pm2-status-cli.test.js` adds ten injected-runner tests:

- healthy fixture returns exit `0`
- missing expected process returns exit `1`
- offline process returns exit `1`
- restart threshold exceeded returns exit `1`
- high memory returns exit `1`
- PM2 unavailable returns exit `2`
- timeout returns exit `2`
- invalid JSON returns exit `2`
- invalid environment values return exit `2`
- configured timeout is passed to the runner and output remains JSON-compatible

The test file is included in `npm run test:api`.

No test invokes a real PM2 binary or daemon.

### Production Risk Assessment

Risk level: **Low to Medium**.

Low-risk properties:

- read-only fixed PM2 command
- no shell interpolation
- no process control
- no runtime wiring
- bounded output and timeout
- injected-runner tests

Residual production risks:

- the command must run under the same user and `PM2_HOME` as the managed processes
- a missing local PM2 installation returns exit `2`
- a first-time PM2 invocation can behave differently when no PM2 daemon exists
- cumulative restart counts may include expected deployment reloads
- thresholds must be chosen for the deployment environment

### Recommended Next SAFE STEP

Recommended next step: **SAFE STEP 172 - PM2 Status CLI Alert Boundary Report Only**.

Before adding alerts or scheduling, define PM2 alert severity, restart-delta requirements, deployment-window suppression, recovery behavior, and whether current-state-only alerts are sufficiently reliable.

### Step 171 Validation Results

- `node --check`: passed on 159 JavaScript files under `server`
- `npm run db:check`: passed
- `node --test server/tests/pm2-status-cli.test.js`: passed, 10/10 injected-runner tests
- `npm run test:api`: passed, 146/146 tests
- `npm run test:restore`: passed, 1/1 test in the required disposable restore environment
- `npm run monitor:backup` against a temporary fresh backup directory: passed, exit `0`, status `fresh`
- `npm run monitor:restore-pending` against a temporary no-pending backup directory: passed, exit `0`, status `none`
- `npm start` smoke on temporary SQLite/uploads/backups passed:
  - `GET /api/health = 200`
  - `GET /api/version = 200`
  - `GET /api/bootstrap = 401`
  - `GET /api/unknown = 404`
  - `GET / = 200`
- remaining temporary directory counts were `0` for Step 171, restore tests, API tests, backup freshness tests, backup freshness CLI tests, restore pending tests, and restore pending CLI tests
- real `npm run monitor:pm2` was not executed locally; all command success/failure/timeout/JSON cases were validated with an injected runner and fixtures
- no PM2 control command was executed and `ecosystem.config.cjs` was not changed
- no manual or production restore was run

## SAFE STEP 172 - PM2 STATUS CLI ALERT BOUNDARY REPORT

### Scope And Confirmation

This step is report-only.

No code, tests, `package.json`, PM2 CLI behavior, PM2 ecosystem configuration, PM2 process state, routes/endpoints, cron/systemd configuration, alert delivery, CI workflow, backup/restore/WhatsApp behavior, SQL, auth/session/cookies, or runtime behavior changed. No PM2 command was executed.

### Current PM2 Monitor State

Helper:

- file: `server/shared/monitoring/pm2-status.js`
- APIs:
  - `analyzePm2Process(process, options)`
  - `analyzePm2ProcessList(processes, options)`
- analyzes supplied PM2 JSON objects only
- no shell, PM2, filesystem, database, or network access

CLI:

- file: `server/scripts/check-pm2-status.js`
- command: `npm run monitor:pm2`
- executes only the project-local PM2 script with fixed argument `jlist`
- no shell interpolation
- no process-control commands
- timeout and output-size limits
- JSON-only output

Environment variables:

- `PM2_MONITOR_EXPECTED_PROCESSES`
- `PM2_MONITOR_MIN_UPTIME_MINUTES`
- `PM2_MONITOR_MAX_RESTART_COUNT`
- `PM2_MONITOR_MAX_MEMORY_MB`
- `PM2_MONITOR_TIMEOUT_MS`

Checker statuses:

- `healthy`
- `degraded`
- `missing`
- `offline`
- `restarting`
- `unhealthy`

CLI-only failure statuses:

- `configuration_error`
- `monitor_error`

Exit codes:

- `0`: healthy
- `1`: degraded, missing, offline, restarting, or unhealthy
- `2`: configuration error, PM2 unavailable, timeout, command failure, invalid JSON, or unexpected exception

Current tests:

- nine pure checker tests
- ten injected-runner CLI tests
- no real PM2 dependency in tests

No alert adapter, alert mode, scheduler, endpoint, or alert delivery currently exists for PM2 monitoring.

### Alert Decision Requirements

Recommended mapping:

| Status | Alert type | Severity | Meaning |
| --- | --- | --- | --- |
| `healthy` | `none` | `info` | expected processes healthy |
| `degraded` | `pm2_degraded` | `warning` | thresholds exceeded but processes still online |
| `restarting` | `pm2_degraded` | `warning` by default | low uptime after one or more restarts |
| `missing` | `pm2_down` | `critical` | expected process absent |
| `offline` | `pm2_down` | `critical` | expected process not online |
| `unhealthy` | `pm2_down` | `critical` | PM2 output evaluated but state is not trustworthy/healthy |
| `configuration_error` | `pm2_monitor_failure` | `critical` | monitor configuration invalid |
| `monitor_error` | `pm2_monitor_failure` | `critical` | PM2 query unavailable, timed out, failed, or returned invalid JSON |
| bad status to `healthy` | `pm2_recovery` | `info` | runtime or monitor state recovered |

Restarting severity:

- warning for a single current-state observation
- critical later when repeated observations show continued low uptime or increasing restart count
- current checker output alone does not contain restart deltas or observation history, so the first adapter should not infer a restart loop

Important distinction:

- `pm2_down` means valid PM2 data indicates a process problem
- `pm2_monitor_failure` means monitoring could not obtain/evaluate PM2 state
- monitor failure must not claim that application processes are down

### Dedupe And Collapse Rules

Recommended rules:

- repeated identical bad status inside the dedupe window is suppressed
- repeated identical bad status outside the window alerts again
- status changes bypass dedupe
- `degraded` to `offline`, `missing`, or `unhealthy` alerts immediately
- `restarting` to `offline` alerts immediately
- `monitor_error` to `offline` alerts immediately because the diagnosis changed
- any bad status to `healthy` produces one recovery alert
- repeated `healthy` is silent

Suggested default dedupe window:

- 30 minutes for `degraded`/`restarting`
- 15 minutes for `missing`/`offline`/`unhealthy`
- 30 minutes for monitor failures

The first implementation may use one configurable default, but the contract should permit status-specific windows later.

Deployment-window handling:

- deployment reloads can reset uptime and increment restart counters
- a future scheduler/caller should be able to suppress or downgrade expected `restarting` during a declared deployment window
- the helper-only first implementation should not guess deployment state
- proposed future option: `deploymentInProgress` or `suppressRestartingUntil`

### Safe Details

Allowed summary details:

- `checkedAt`
- aggregate status
- `missingProcesses`
- per expected process:
  - `name`
  - `status`
  - `ok`
  - `restartCount`
  - `uptimeMinutes`
  - `memoryMb`
  - `cpuPercent`
  - sanitized `issues`

Excluded:

- PM2 environment variables
- secrets
- raw `pm2_env`
- raw command output
- raw stderr
- application logs
- absolute script paths
- working directories
- full command lines
- tokens or database URLs

No absolute system paths should be included by default or required for the first alert adapter.

### Integration Options

| Option | Security | Complexity | Usefulness | Recommendation |
| --- | --- | --- | --- | --- |
| A. Helper-only alert adapter | Highest; no command or delivery | Low | Establishes deterministic alert contract | First |
| B. Optional PM2 CLI alert mode later | Local-only, no delivery | Medium | Useful for scheduler/log wrappers | After adapter tests |
| C. Shared generic monitor adapter | Safe but premature abstraction risk | Medium | Could unify backup/restore/PM2 | Revisit later |
| D. Protected operational endpoint | Larger auth/information surface | High | Dashboard use | Defer |
| E. Cron/systemd wrapper | Local and useful | Medium | Scheduled operations | After CLI alert mode and state strategy |

The PM2 adapter should remain separate initially because it must distinguish runtime failure from monitor failure and later account for deployment windows/restart deltas.

### Recommended First Implementation

Add a pure helper-only log alert adapter:

- decision logic only
- synthetic fixture tests
- no CLI integration
- no PM2 command execution
- no delivery
- no state persistence
- no routes or scheduler

Suggested files:

- `server/shared/monitoring/pm2-alerts.js`
- `server/tests/pm2-alerts.test.js`

### Proposed Functions

- `buildPm2StatusAlert(currentResult, options)`
- `createLogOnlyPm2StatusAlertPayload(alert)`

Suggested options:

- `previousStatus`
- `previousAlertAt`
- `now`
- `dedupeWindowMinutes`
- future `deploymentInProgress` or `suppressRestartingUntil`

### Proposed Alert Shape

```json
{
  "shouldAlert": true,
  "alertType": "pm2_down",
  "severity": "critical",
  "status": "offline",
  "message": "One or more PM2 processes are offline.",
  "safeDetails": {
    "missingProcesses": [],
    "processes": [
      {
        "name": "clinova",
        "status": "offline",
        "restartCount": 3,
        "uptimeMinutes": 0,
        "memoryMb": 0,
        "cpuPercent": 0,
        "issues": ["Process status is stopped."]
      }
    ]
  },
  "createdAt": "2035-01-02T12:00:00.000Z"
}
```

Allowed alert types:

- `none`
- `pm2_degraded`
- `pm2_down`
- `pm2_monitor_failure`
- `pm2_recovery`

Log-only payload should add:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "pm2_status"`

### Testing Plan

Required tests:

- healthy produces no alert
- degraded produces warning `pm2_degraded`
- restarting produces warning `pm2_degraded`
- missing produces critical `pm2_down`
- offline produces critical `pm2_down`
- unhealthy produces critical `pm2_down`
- configuration error produces critical `pm2_monitor_failure`
- monitor error produces critical `pm2_monitor_failure`
- repeated degraded inside dedupe window is suppressed
- repeated degraded outside dedupe window alerts again
- degraded to offline alerts immediately inside dedupe window
- offline to healthy produces info recovery
- safe details contain only process summaries
- PM2 env, raw output, logs, and paths are omitted
- log-only payload has `delivery: "none"`

Tests should use synthetic checker/CLI result objects only and must not run PM2.

### Operational Risks And Guardrails

Risks:

- cumulative restart counts may include expected deployments
- current-state `restarting` can be transient and legitimate
- aggressive alerts can create noise after deploys
- monitor failure can be mistaken for process outage
- raw PM2 data may contain sensitive environment values

Guardrails:

- separate down alerts from monitor failures
- warning severity for current-state degraded/restarting
- critical only for missing/offline/unhealthy or monitor failure
- status changes bypass dedupe
- safe details whitelist only
- no raw PM2 objects
- no automatic restart or remediation
- deployment-window logic deferred until previous-state semantics are designed

### Selected Next SAFE STEP

Selected option: **A. Add PM2 Log-Only Alert Adapter**.

Recommended next step: **SAFE STEP 173 - Add PM2 Log-Only Alert Adapter Only**.

The next step should add pure decision and log-only payload helpers with synthetic tests only. It should not change the PM2 CLI, execute PM2, add scheduling, send alerts, or modify PM2 configuration.

### Step 172 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore` in its disposable environment
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- do not run real `npm run monitor:pm2`; fixture CLI tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups and verify `/api/health`, `/api/version`, unauthenticated `/api/bootstrap`, `/api/unknown`, and `/`
- confirm no temporary Step 172, API test, restore test, backup freshness, or restore pending directories remain
- do not run PM2 control commands
- do not run manual or production restore

### Step 172 Validation Results

- `node --check`: passed on all 159 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 146/146 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 172 monitor and smoke directories were removed
- the real `npm run monitor:pm2` command was not executed; fixture-based helper and CLI tests remain sufficient for this report step
- no PM2 control command, PM2 configuration change, manual restore, or production restore was performed

## SAFE STEP 174 - PM2 ALERT ADAPTER CLI INTEGRATION BOUNDARY REPORT

This step is report-only. No application code, tests, package scripts, PM2 configuration, CLI behavior, routes, CI, scheduling, or alert delivery changed.

### Current PM2 CLI Behavior

The local command remains:

- `npm run monitor:pm2`
- script: `server/scripts/check-pm2-status.js`

The CLI performs one read-only operation:

- executes the project-local PM2 binary with the fixed argument `jlist`
- parses the returned JSON
- passes the process list to `analyzePm2ProcessList`
- prints one JSON result to stdout
- does not start, stop, restart, reload, or mutate PM2 processes

Current environment variables:

- `PM2_MONITOR_EXPECTED_PROCESSES`
  - comma-separated expected names
  - current default: `clinova,clinova-backup`
- `PM2_MONITOR_MIN_UPTIME_MINUTES`
  - current default: `5`
- `PM2_MONITOR_MAX_RESTART_COUNT`
  - current default: `5`
- `PM2_MONITOR_MAX_MEMORY_MB`
  - current default: `512`
- `PM2_MONITOR_TIMEOUT_MS`
  - current default: `5000`

Current output is the PM2 status result only:

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "processes": [],
  "missingProcesses": [],
  "message": "All expected PM2 processes are healthy."
}
```

Current exit codes:

- `0`: status is `healthy`
- `1`: status is `degraded`, `missing`, `offline`, `restarting`, or `unhealthy`
- `2`: configuration error, PM2 unavailable, timeout, command failure, oversized output, invalid JSON, or unexpected monitor error

There is currently no alert payload, no delivery, no persistent previous state, and no CLI alert-mode environment variable.

### Current PM2 Alert Adapter Behavior

The helper-only adapter is:

- `server/shared/monitoring/pm2-alerts.js`

Exported functions:

- `buildPm2StatusAlert(currentResult, options)`
- `createLogOnlyPm2StatusAlertPayload(alert)`

Alert mapping:

| Current status | Alert type | Severity | Default decision |
| --- | --- | --- | --- |
| `healthy` | `none` | `info` | no alert |
| `degraded` | `pm2_degraded` | `warning` | alert |
| `restarting` | `pm2_degraded` | `warning` | alert |
| `missing` | `pm2_down` | `critical` | alert |
| `offline` | `pm2_down` | `critical` | alert |
| `unhealthy` | `pm2_down` | `critical` | alert |
| `configuration_error` | `pm2_monitor_failure` | `critical` | alert |
| `monitor_error` | `pm2_monitor_failure` | `critical` | alert |

Recovery behavior:

- previous bad PM2 or monitor status followed by `healthy` produces `pm2_recovery`
- recovery severity is `info`
- recovery is not suppressed by the normal bad-status dedupe rule

Dedupe behavior:

- repeated identical bad status inside the configured window is suppressed
- repeated identical bad status outside the window alerts again
- a status change, such as `degraded` to `offline`, alerts immediately
- the current helper default dedupe window is 60 minutes

The log-only payload adds:

- `channel: "log_only"`
- `delivery: "none"`
- `check: "pm2_status"`

It returns data only. It performs no console output, file write, network request, or alert delivery.

Safe details are whitelist-based and contain only:

- `checkedAt`
- `missingProcesses`
- process `name`
- process `status`
- `restartCount`
- `uptimeMinutes`
- `memoryMb`
- `cpuPercent`
- sanitized string `issues`

Raw PM2 environment data, logs, command output, paths, database URLs, tokens, and secrets are excluded.

### Integration Options

| Option | Backward compatibility | Simplicity | Monitoring usefulness | JSON stability | Operator clarity | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| A. Keep status-only output | Highest | Highest | Does not expose adapter decisions | Fully stable | Simple but limited | Safe, but leaves adapter unused operationally |
| B. Optional `PM2_MONITOR_ALERT_MODE=log` | High; default remains unchanged | Medium | High for local schedulers and logs | Stable by mode | Clear with documented wrapper shape | Recommended |
| C. Separate `monitor:pm2-alert` command | High | Lower; duplicates command surface | High | Separate contract | May confuse operators choosing commands | Not preferred initially |
| D. Future wrapper only | High | Delays CLI changes | Useful after scheduler work | Current CLI stable | Requires another operational layer | Defer |

### Recommended Integration

Use a non-breaking optional mode in the existing CLI:

- default mode remains status-only
- default JSON output remains exactly unchanged
- default exit codes remain exactly unchanged
- `PM2_MONITOR_ALERT_MODE=log` enables the alert wrapper
- no alert delivery is added
- no state persistence is added
- no PM2 command behavior changes

This keeps one operational command while making alert decisions available to future log, cron, or systemd wrappers.

### Proposed Environment Contract

Future optional variables:

- `PM2_MONITOR_ALERT_MODE=off|log`
  - default: `off`
- `PM2_MONITOR_PREVIOUS_STATUS`
  - optional prior aggregate status
- `PM2_MONITOR_PREVIOUS_ALERT_AT`
  - optional ISO timestamp for dedupe
- `PM2_MONITOR_DEDUPE_WINDOW_MINUTES`
  - optional non-negative number
  - proposed default: adapter default of 60 minutes

Rules:

- omitted or `off` keeps current behavior
- `log` creates a log-only alert payload
- any unsupported mode should return exit code 2 with the existing safe JSON error style
- previous-state inputs are advisory only; the CLI must not create or update state files
- invalid previous timestamps should follow the adapter's current safe fallback behavior or be explicitly rejected if the later implementation chooses stricter CLI validation

### Proposed Output Contract

Default mode remains unchanged:

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "processes": [],
  "missingProcesses": [],
  "message": "All expected PM2 processes are healthy."
}
```

Alert log mode:

```json
{
  "pm2": {
    "ok": false,
    "status": "offline",
    "checkedAt": "2035-01-02T12:00:00.000Z",
    "processes": [],
    "missingProcesses": [],
    "message": "One or more PM2 processes are offline."
  },
  "alert": {
    "channel": "log_only",
    "delivery": "none",
    "check": "pm2_status",
    "shouldAlert": true,
    "alertType": "pm2_down",
    "severity": "critical",
    "status": "offline",
    "message": "One or more PM2 processes are offline.",
    "safeDetails": {},
    "createdAt": "2035-01-02T12:00:00.000Z"
  }
}
```

Exit codes in alert mode must remain based on the PM2 check result:

- healthy plus no alert or recovery alert: exit `0`
- degraded/down state, including a dedupe-suppressed alert: exit `1`
- monitor/configuration failure, including its alert payload: exit `2`

Dedupe must suppress delivery intent only. It must never turn an unhealthy PM2 result into exit code 0.

### Testing Plan For The Next Implementation Step

Tests should extend the injected-runner CLI tests and must not execute PM2:

- default output remains byte-shape compatible with the current status-only payload
- omitted alert mode behaves as `off`
- explicit `off` keeps current output
- `log` with healthy status includes `alertType: "none"` and `shouldAlert: false`
- `log` with degraded status produces `pm2_degraded` warning
- `log` with restarting status produces `pm2_degraded` warning
- `log` with missing, offline, or unhealthy status produces `pm2_down` critical
- PM2 command/configuration failure produces `pm2_monitor_failure` critical while preserving exit code 2
- repeated identical bad status inside the dedupe window suppresses `shouldAlert` without changing exit code 1
- repeated identical bad status outside the dedupe window alerts again
- degraded to offline alerts immediately inside the dedupe window
- offline to healthy produces `pm2_recovery` while preserving healthy exit code 0
- invalid alert mode returns exit code 2 and safe JSON
- invalid dedupe input returns exit code 2 if strict CLI validation is selected
- alert safe details contain no PM2 environment data, logs, paths, raw command output, or secrets

All tests should use `runPm2StatusCli({ runCommand })` with fixture JSON. No real PM2 binary or process is required.

### Risks And Guardrails

Risks:

- operators may mistake `shouldAlert: false` after dedupe for a healthy PM2 state
- recovery requires externally supplied previous status because the CLI remains stateless
- deployment restarts may produce short-lived `restarting` warnings
- changing the default JSON shape would break existing consumers
- monitor failure must remain distinct from application process failure

Guardrails:

- keep default mode and output unchanged
- keep exit codes tied to PM2 health, not alert suppression
- use explicit wrapper keys `pm2` and `alert` only in log mode
- preserve `pm2_monitor_failure` separately from `pm2_down`
- do not persist state or write files
- do not add delivery, process control, routes, or scheduling
- retain fixture-only tests

### Selected Next SAFE STEP

Selected option: **A. Add Optional PM2 Alert CLI Mode Only**.

Recommended next step: **SAFE STEP 175 - Add Optional PM2 Alert CLI Mode Only**.

The implementation should integrate the existing pure adapter behind `PM2_MONITOR_ALERT_MODE=log`, preserve default output and all exit codes, and extend injected-runner tests without executing PM2.

### Step 174 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- do not run real `npm run monitor:pm2`; fixture CLI tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups
- confirm temporary test and monitor directories are removed
- do not run PM2 control commands or change PM2 configuration

### Step 174 Validation Results

- `node --check`: passed on all 161 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 146/146 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 174 monitor and smoke directories were removed
- the real `npm run monitor:pm2` command was not executed; injected-runner fixture tests remain sufficient
- no PM2 process command, PM2 configuration change, application runtime change, or alert delivery was performed

## SAFE STEP 176 - PM2 MONITOR SCHEDULING / DEPLOYMENT BOUNDARY REPORT

This step is report-only. No code, tests, package scripts, PM2 configuration, PM2 process state, cron/systemd files, routes, CI, or alert delivery changed. No PM2 command was executed.

### Current PM2 Monitor Command

Command:

- `npm run monitor:pm2`
- direct script: `node server/scripts/check-pm2-status.js`

The command performs one read-only PM2 query:

- invokes the project-local PM2 binary with the fixed argument `jlist`
- parses PM2 JSON
- evaluates expected processes, uptime, restart count, memory, and CPU
- prints JSON only
- performs no PM2 start, stop, restart, reload, delete, or save operation

Default output remains PM2-status-only:

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "processes": [],
  "missingProcesses": [],
  "message": "All expected PM2 processes are healthy."
}
```

Optional log-alert mode:

- enabled with `PM2_MONITOR_ALERT_MODE=log`
- output becomes `{ "pm2": { ... }, "alert": { ... } }`
- `alert.channel` is `log_only`
- `alert.delivery` is `none`
- no email, WhatsApp, webhook, or network delivery occurs
- no files or monitor state are written

Exit codes remain:

- `0`: all expected processes are healthy
- `1`: degraded, missing, offline, restarting, or unhealthy
- `2`: invalid configuration, PM2 unavailable, timeout, command failure, oversized output, invalid JSON, or unexpected monitor error

Alert suppression never changes the health exit code. A dedupe-suppressed offline result still exits `1`.

### Required Environment Variables

Recommended base production configuration:

- `PM2_MONITOR_EXPECTED_PROCESSES=clinova,clinova-backup`
- `PM2_MONITOR_MIN_UPTIME_MINUTES=5`
- `PM2_MONITOR_MAX_RESTART_COUNT=5`
- `PM2_MONITOR_MAX_MEMORY_MB=512`
- `PM2_MONITOR_TIMEOUT_MS=5000`
- `PM2_MONITOR_ALERT_MODE=log`
- `PM2_MONITOR_DEDUPE_WINDOW_MINUTES=60`

Optional previous-state inputs:

- `PM2_MONITOR_PREVIOUS_STATUS`
- `PM2_MONITOR_PREVIOUS_ALERT_AT`

Important state boundary:

- the CLI is intentionally stateless
- static environment files cannot update previous status or alert time after each run
- dedupe and recovery across scheduled executions require a future wrapper or external monitoring system that supplies the prior observation
- without such state, log mode still reports correct current decisions, but repeated unhealthy checks are not collapsed across separate process invocations
- no scheduler should pretend persistent dedupe exists until that state boundary is implemented

PM2 identity boundary:

- the scheduled service must run as the same operating-system user that owns the PM2 daemon, or with the correct `PM2_HOME`
- running under another user may produce an empty process list and false `missing` alerts
- the working directory must be the repository root so the project-local PM2 binary resolves correctly

### Recommended Schedule

| Interval | Detection speed | Load/noise | Operational fit |
| --- | --- | --- | --- |
| Every 1 minute | Fastest | Highest command/log frequency; transient deploy states more visible | Too aggressive initially |
| Every 5 minutes | Good | Low local cost; practical outage detection | Recommended initial interval |
| Every 15 minutes | Slow | Lowest noise | Acceptable only for low-criticality/manual operations |

Recommended initial schedule:

- every 5 minutes
- use systemd `OnUnitActiveSec=5min` or equivalent timer semantics
- add a randomized delay of up to 30 seconds if multiple hosts are monitored later
- avoid scheduling directly during a known deploy reload when possible

Recommended initial thresholds:

- minimum uptime: 5 minutes
- restart count: 5 as the current compatibility threshold
- command timeout: 5 seconds
- alert dedupe intent: 60 minutes once external state is available

Restart-count limitation:

- PM2 restart count is cumulative, not a time-window delta
- once a process exceeds the threshold it remains degraded until PM2 state is reset or a future monitor compares observations
- the current threshold is useful for initial visibility but is not a substitute for detecting restart growth
- a later stateful wrapper should compare current and previous restart counts

Memory-threshold limitation:

- `ecosystem.config.cjs` restarts `clinova` at `300M`
- it restarts `clinova-backup` at `150M`
- the CLI currently applies one memory threshold to all expected processes in a single invocation
- using `512` avoids false alerts but does not provide early warning before configured PM2 memory restarts

Recommended future deployment profile:

- one check for `clinova` with a threshold below `300M`, for example `270`
- one check for `clinova-backup` with a threshold below `150M`, for example `135`
- keep this split in scheduler environment profiles, not application code
- until profile templates are added and reviewed, retain the current compatible default and treat memory inspection as informational

### Deployment Options

| Option | Reliability | Log visibility | Failure isolation | Complexity | PM2 dependency | Noise risk |
| --- | --- | --- | --- | --- | --- | --- |
| A. systemd timer | High | Strong through journald and unit status | Strong; scheduler is outside PM2 | Medium | CLI still reads PM2 | Low with five-minute interval |
| B. cron | Medium | Depends on explicit redirection/mail configuration | Good | Low | CLI still reads PM2 | Medium if output handling is weak |
| C. PM2-managed monitor process | Medium | PM2 logs available | Poor; PM2 monitors itself | Medium | Circular | Higher during PM2 faults/reloads |
| D. manual runbook | Low for unattended use | Operator-dependent | Good | Lowest | Manual PM2 access | Missed incidents |
| E. external monitoring later | Potentially highest | Centralized | Strong | High | Requires integration | Depends on alert design |

### Recommended Deployment Method

Preferred:

- Linux systemd timer invoking a one-shot service every 5 minutes

Reasons:

- scheduler remains operationally separate from PM2
- a PM2 outage cannot stop the scheduler that detects it
- journald records JSON output, stderr, exit status, and execution time
- `systemctl status` and `journalctl` provide a familiar operational trail
- service user, working directory, environment file, timeout, and resource limits can be explicit
- failed executions are visible independently of application logs

Fallback:

- cron every 5 minutes
- command must set the correct working directory and PM2 user environment
- stdout/stderr must be redirected to a controlled log destination
- cron alone does not provide the same unit-state visibility or structured failure history as systemd

Not recommended initially:

- a PM2-managed monitoring process

Reason:

- it creates a circular dependency where PM2 is responsible for running the process intended to detect PM2 failure
- daemon failure, wrong PM2 home, or broad PM2 restart can disable both the workload and its monitor

No service, timer, or cron template is created in this step.

### Operational Runbook

Manual check:

1. log in as the operating-system user that owns the Clinova PM2 processes
2. change to the repository root
3. load the production monitor environment
4. run `npm run monitor:pm2`
5. for decision-only output, use `PM2_MONITOR_ALERT_MODE=log`
6. inspect the JSON status, process summaries, missing process names, and exit code

Exit `0`:

- all expected processes are online and within configured thresholds
- no immediate action is required
- if the alert payload reports recovery, verify uptime remains stable on the next run

Exit `1` with `missing` or `offline`:

- verify the command is running as the correct PM2 owner and using the correct `PM2_HOME`
- inspect read-only `pm2 status` or `pm2 show <process>`
- review the relevant PM2 error log
- confirm whether a deployment is currently in progress
- follow the approved incident/restart runbook; the monitor itself must not restart anything

Exit `1` with high restart count:

- compare the process uptime and deployment time
- inspect PM2/application error logs for a crash loop
- determine whether the count came from planned reloads or unexpected exits
- do not reset counters merely to clear monitoring without recording the incident

Exit `1` with low uptime or `restarting`:

- check whether a deployment just completed
- run the monitor again after the five-minute minimum uptime window
- escalate if uptime repeatedly resets or the process becomes offline

Exit `1` with high memory:

- inspect current and repeated memory readings
- compare against PM2 `max_memory_restart`
- inspect request load, bootstrap growth, file operations, and database activity
- treat repeated growth toward the PM2 restart threshold as an incident

Exit `2`:

- verify the project-local PM2 dependency exists
- verify the PM2 daemon/user/`PM2_HOME`
- verify environment values and timeout
- inspect the safe monitor error message
- treat repeated exit `2` as monitor failure, not proof that the application itself is down

### Alerting Later

Current boundary:

- log-only decisions
- no delivery
- no persisted monitor state

Recommended future sequence:

1. add scheduler templates with log-only output
2. observe noise and thresholds during an internal deployment
3. design a small state wrapper for previous status, alert timestamp, and restart-count delta
4. add email or authenticated webhook delivery
5. retain dedupe, status-change escalation, and recovery behavior
6. add external monitoring only after local behavior is stable

Do not use the application WhatsApp module for initial PM2 alerts:

- PM2/application failure may also impair WhatsApp delivery
- it would couple infrastructure alerts to the service being monitored
- provider failures could hide or multiply operational incidents

### Risks And Guardrails

Primary risks:

- scheduler runs under the wrong PM2 user and reports false missing processes
- cumulative restart counts create permanent degraded status
- one shared memory threshold does not fit both configured processes
- deployment reloads create transient restarting warnings
- log mode is stateless across invocations, so dedupe/recovery need external prior state
- unrotated scheduler logs can consume disk space

Guardrails:

- systemd timer outside PM2
- five-minute initial interval
- same PM2 owner and explicit working directory
- no automatic restart or remediation
- separate process profiles before enforcing memory warnings
- journald retention or explicit cron log rotation
- treat exit `2` separately from process-down exit `1`
- pilot in log-only mode before delivery

### Selected Next SAFE STEP

Selected option: **A. Disk Usage Monitoring Boundary Report Only**.

Recommended next step: **SAFE STEP 177 - Disk Usage Monitoring Boundary Report Only**.

Disk monitoring should be designed before creating scheduler templates because PM2 logs, application logs, SQLite, uploads, backups, and monitor output all share host storage risk. The report should define safe read-only size/free-space checks and thresholds before runtime wiring.

### Step 176 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- do not run real `npm run monitor:pm2`; fixture tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups
- confirm temporary test and monitor directories are removed
- do not run PM2 control commands or modify PM2 configuration

### Step 176 Validation Results

- `node --check`: passed on all 161 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 155/155 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 176 monitor and smoke directories were removed
- the real `npm run monitor:pm2` command was not executed; fixture-based tests remain sufficient
- no PM2 control command, process change, PM2 configuration change, scheduler file, or alert delivery was performed

## SAFE STEP 177 - DISK USAGE MONITORING BOUNDARY REPORT

This step is report-only. No code, tests, package scripts, files, routes, scheduler configuration, PM2 configuration, CI workflow, or alert delivery changed. No monitored file or directory was created, modified, deleted, compressed, moved, or cleaned.

### Storage Areas To Monitor

#### Database

SQLite:

- configured by `DATABASE_PATH`
- default path: `./data/clinic.sqlite`
- associated SQLite files may temporarily or persistently include:
  - `clinic.sqlite-wal`
  - `clinic.sqlite-shm`
- the database directory and its containing filesystem both matter

PostgreSQL:

- configured through `DATABASE_URL`
- there is no application-local database file to measure
- monitoring must target the PostgreSQL server volume, managed database metrics, or provider storage quota
- a local Clinova disk helper must not report PostgreSQL database size as zero or healthy merely because no SQLite file exists

#### Uploads

- configured by `UPLOAD_DIR`
- default path: `./uploads`
- stores client files and consent uploads
- individual upload size is bounded by `UPLOAD_MAX_MB`, but aggregate directory growth is currently unbounded by application monitoring
- archived database records may not imply immediate physical-file removal in every flow, so filesystem growth must be observed independently

#### Backups

- configured by `BACKUP_DIR`
- default path: `./backups`
- stores SQLite `.sqlite` backups and PostgreSQL `.dump` backups
- `BACKUP_RETENTION` defaults to 14 matching Clinova backup files
- retention cleanup applies to recognized `clinova-*.sqlite` and `clinova-*.dump` files, not every file that may exist under the directory

#### Restore Staging And Pending Files

Restore-related storage is inside the backup area:

- `backups/restore-uploads`
- `backups/pending-restore.sqlite`
- `backups/pending-restore.json`
- `backups/before-pending-restore-*.sqlite`
- safety backups created before restore

These files require separate visibility because:

- a large uploaded restore file can temporarily duplicate database storage
- accepted restore creates pending and safety copies
- failed or interrupted restore handling can leave staging evidence
- pending files must never be automatically deleted by a disk monitor

#### Logs

PM2 configuration writes:

- `./logs/pm2-error.log`
- `./logs/pm2-out.log`
- `./logs/pm2-backup-error.log`
- `./logs/pm2-backup-out.log`

Current operational documentation does not establish a confirmed rotation/retention policy. Monitor output sent to journald or cron logs later also consumes host storage and should be covered by operating-system retention.

#### Temporary Directories

Relevant temporary storage includes:

- multipart parser temporary uploads before final placement or cleanup
- Node/test disposable directories under the OS temp directory
- operating-system or deployment temporary files

The first application helper should not recursively scan the entire OS temp directory. Production temp capacity belongs to host-level filesystem monitoring. Tests must use guarded temporary directories only.

### Disk And Storage Risks

Database growth:

- SQLite growth can consume the application filesystem
- WAL growth can temporarily exceed the main database size
- disk exhaustion during a SQLite transaction can cause write failures and operational recovery work
- PostgreSQL storage exhaustion may occur remotely and is invisible to local path size checks

Upload growth:

- valid repeated uploads can steadily consume disk
- large client/consent file collections can outgrow the database itself
- uploads can fail midway when free space is low
- download behavior may remain healthy until the next write exposes the shortage

Backup growth:

- retention limits recognized backup count, not total bytes
- database growth makes every retained backup larger
- safety and restore-related backups can add copies outside the normal retention pattern
- failed cleanup or naming differences can leave unbounded files

Log growth:

- PM2 stdout/stderr files can grow indefinitely without rotation
- crash loops and repeated monitor output accelerate growth
- logs and application data currently may share the same filesystem

Restore storage:

- restore staging, pending copy, safety backup, active SQLite DB, and WAL can coexist
- a valid restore may require several times the database size in free space
- low space during restore preparation can fail after upload but before safe completion

Disk-full consequences:

- database writes and migrations can fail
- uploads and consent files can fail or become incomplete
- backups can fail, removing the operational safety net
- restore staging and safety backup creation can fail
- PM2/application logs can stop recording useful evidence
- monitor output itself can fail to persist

### Monitoring Metrics Needed

Host/filesystem capacity metrics:

- total bytes
- free bytes
- available bytes for the service user when available
- used bytes
- used percent
- filesystem/device identifier if safely available
- mount/path association without public path exposure

Application storage metrics:

- SQLite main DB file size
- SQLite WAL and SHM file sizes when present
- uploads directory recursive size
- backups directory recursive size
- restore staging directory size
- pending restore SQLite size
- logs directory recursive size
- optional file count per monitored area
- optional newest/largest file summaries for local-admin diagnosis

Largest-file reporting:

- should be optional and disabled by default
- should return basename, label, and size only by default
- should cap results, for example top 5
- must not expose absolute paths unless explicitly enabled for local administration
- must not read file contents

### Safe Checker Design

The checker must be:

- read-only
- asynchronous where practical
- bounded against symlink cycles
- explicit about whether symbolic links are ignored or counted without traversal
- tolerant of files disappearing during a scan
- deterministic in tests
- independent of HTTP runtime
- independent of PM2
- free of database queries and network access

The checker must not:

- delete files
- rotate logs
- enforce retention
- compress files
- truncate files
- modify permissions
- create directories
- repair restore markers
- trigger backup or restore
- follow arbitrary symlinks outside the configured root
- expose absolute paths by default

Recommended symlink rule:

- record a symbolic link as skipped
- do not follow it in the first implementation
- include a skipped-entry count so operators know the scan was incomplete

Recommended unreadable behavior:

- a missing optional path is represented as `missing`
- an expected path with permission or traversal failure is `unreadable`
- partial scan errors should not silently produce a healthy result
- overall status should be the highest severity among monitored paths

### Thresholds

Future filesystem-capacity thresholds:

- warning when used space is at least 80%
- critical when used space is at least 90%
- warning when available space is below 5 GiB
- critical when available space is below 1 GiB

Severity rule:

- use the worse result from percentage and absolute-free thresholds
- for small volumes, absolute thresholds must be configurable because 5 GiB may be impossible even when the volume is healthy
- use GiB/MiB binary units internally and label them clearly

Restore headroom:

- before a production restore, available space should exceed the uploaded backup plus expected safety backup and working-copy overhead
- a practical operator rule is at least three times the active SQLite DB size, subject to testing with the actual filesystem
- this is a runbook check, not a new automatic restore rule in the first helper

Directory-specific thresholds:

- should be optional and configurable per label
- no universal default size is safe for DB, uploads, backups, or logs
- the first helper can support warning/critical byte thresholds supplied by tests/callers
- production values should be selected after observing real clinic data growth

Initial recommended examples for later deployment review, not hard-coded policy:

- logs warning at 1 GiB and critical at 5 GiB
- restore staging warning when any file remains unexpectedly after the restore window
- backups threshold based on expected database size multiplied by retention and restore safety overhead
- uploads threshold based on provisioned volume capacity and clinic retention policy

### Implementation Options

| Option | Portability | Capacity metrics | Directory sizes | Testability | Risk |
| --- | --- | --- | --- | --- | --- |
| A. Node helper using `fs/stat` | High | No portable filesystem total/free result from basic `fs/stat` alone | Strong | Highest with temp fixtures | Lowest |
| B. CLI using `df`/`du` | Linux-focused | Strong | Strong | Requires command mocking; quoting/platform risks | Medium |
| C. Hybrid helper plus OS adapter | Good | Strong through isolated adapter | Strong | Good if adapters are injected | Best final architecture |
| D. External monitoring service | Depends on agent/provider | Strongest host trends | Often limited app labels | External dependency | Future |

Important boundary:

- directory/file size and filesystem free capacity are different measurements
- Node recursive `fs/stat` can implement safe application-area sizing
- `df`/`du` should not be introduced into the first helper
- a later CLI/OS adapter can add filesystem capacity without contaminating the pure directory analyzer

### Recommended First Implementation

Selected first implementation:

- helper-only directory/file size analyzer
- fixture tests using guarded OS temporary directories
- no CLI
- no OS command
- no routes
- no alert adapter
- no scheduler

Suggested file:

- `server/shared/monitoring/disk-usage.js`

Suggested APIs:

- `analyzeStoragePaths(pathDefinitions, options)`
- optional internal/exported `measureStoragePath(pathDefinition, options)`

Suggested path definition:

```json
{
  "label": "uploads",
  "path": "/configured/path",
  "required": true,
  "warningBytes": 1073741824,
  "criticalBytes": 5368709120
}
```

The initial helper should measure application-controlled file/directory sizes only. Filesystem total/free/used-percent should be added later behind a separate injected capacity provider or OS-specific CLI boundary.

### Proposed Helper Contract

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "paths": [
    {
      "label": "uploads",
      "exists": true,
      "type": "directory",
      "sizeBytes": 128974848,
      "sizeMb": 123,
      "fileCount": 42,
      "skippedSymlinkCount": 0,
      "status": "healthy",
      "message": "Storage path is within configured thresholds."
    }
  ],
  "message": "All monitored storage paths are within configured thresholds."
}
```

Supported aggregate statuses:

- `healthy`
- `warning`
- `critical`
- `missing`
- `unreadable`

Recommended overall behavior:

- `ok: true` only when every required path is `healthy`
- optional missing paths may remain informational if explicitly marked optional
- required missing path produces `missing`
- any unreadable path produces `unreadable`
- critical outranks warning
- status precedence should be explicit and tested

Path privacy:

- return labels by default
- do not include absolute paths by default
- optional `showPaths=true` can be considered later for local-only callers
- file names in largest-file output should be basenames only by default

### Relationship To Existing Monitors

Backup freshness:

- answers whether a recent backup exists
- does not measure backup directory size or filesystem capacity

Restore pending:

- answers whether restore markers are absent, pending, stale, partial, or invalid
- does not measure pending SQLite size or staging directory growth

PM2 status:

- answers whether expected processes are healthy and within process thresholds
- does not measure PM2 log files or host free space

Disk usage monitoring complements these helpers and must not replace their semantic checks.

### Testing Plan

Use temporary directories only:

- empty directory reports zero bytes and healthy
- single file reports exact byte size
- nested files are counted recursively
- monitored file path reports its own size
- multiple monitored paths preserve labels and aggregate status
- missing required path reports `missing`
- missing optional path follows the documented optional behavior
- unreadable path reports `unreadable` where permissions can be tested reliably
- unreadable test may be platform-skipped on Windows when permission semantics are not deterministic
- warning threshold boundary is deterministic
- critical threshold boundary is deterministic
- critical outranks warning in aggregate status
- symlinks are not followed
- skipped symlink count is reported
- file disappearing during traversal is handled without mutation
- deterministic `now` produces stable `checkedAt`
- absolute paths are hidden by default
- optional path display is tested only if implemented
- no test scans project, development, or production storage

No test should:

- invoke `df`, `du`, PowerShell disk commands, or PM2
- create large sparse files merely to cross GiB thresholds
- change real permissions outside its temp root
- delete or alter application data

Small fixture sizes and low injected thresholds are sufficient.

### Production Deployment Boundary

The helper alone will not satisfy host disk monitoring because it cannot report total/free capacity.

Before general rollout, the complete design should eventually include:

1. application-path sizing helper
2. Linux filesystem capacity adapter or external host monitor
3. local CLI combining both results
4. log-only alert decisions
5. systemd scheduling outside PM2
6. log rotation/retention
7. operator runbook for low-space incidents

No automatic cleanup should be coupled to monitoring. Cleanup/retention changes require separate reports and safeguards.

### Selected Next SAFE STEP

Selected option: **A. Add Disk Usage Helper Only**.

Recommended next step: **SAFE STEP 178 - Add Disk Usage Helper Only**.

The next step should implement only the pure read-only file/directory sizing helper and temporary-fixture tests. It should not add filesystem capacity commands, CLI exposure, alerting, scheduling, routes, cleanup, or mutation.

### Step 177 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- do not run real `npm run monitor:pm2`; fixture tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups
- confirm temporary test and monitor directories are removed
- do not create, modify, delete, compress, or clean monitored production files

### Step 177 Validation Results

- `node --check`: passed on all 161 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 155/155 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 177 monitor and smoke directories were removed
- the real `npm run monitor:pm2` command was not executed; fixture tests remain sufficient
- no production storage path was scanned, created, modified, deleted, compressed, or cleaned
- no checker, CLI, route, scheduler, PM2 configuration, CI workflow, or alert delivery was added

## SAFE STEP 179 - DISK USAGE CLI BOUNDARY REPORT

This step is report-only. No code, tests, package scripts, CLI commands, routes, scheduler files, PM2 configuration, CI workflow, or alert delivery changed. No production, development, or project storage path was scanned.

### Current Disk Usage Helper State

Helper:

- `server/shared/monitoring/disk-usage.js`

Exported APIs:

- `getDirectorySizeBytes(path)`
- `analyzeDiskUsagePaths(paths, options)`

Supported aggregate and per-path statuses:

- `healthy`
- `warning`
- `critical`
- `missing`
- `unreadable`

Current behavior:

- measures a file directly
- recursively measures files under directories
- includes nested directories
- does not follow symbolic links
- supports global warning/critical thresholds
- supports per-path threshold overrides
- classifies thresholds inclusively with `>=`
- hides absolute paths by default
- optionally includes resolved paths with `showPaths=true`
- returns deterministic `checkedAt` when `now` is supplied
- performs no writes, deletes, compression, cleanup, network access, shell commands, or database access

Current test file:

- `server/tests/disk-usage.test.js`

Current focused coverage:

- 12 test cases
- empty directory
- nested file totals
- multiple nested directories
- single-file measurement
- warning threshold
- critical threshold
- missing path
- deterministic timestamp
- hidden/shown paths
- worst aggregate status
- per-path thresholds
- symbolic-link non-traversal

Windows may skip the symlink fixture when link creation is denied with `EPERM`; cleanup remains verified.

Current integration boundary:

- no CLI
- no package script
- no runtime import
- no route
- no alert adapter
- no scheduler
- no filesystem-capacity measurement
- focused disk tests are currently run directly and are not yet part of the existing `npm run test:api` command

### Storage Areas To Monitor First

#### SQLite Database

- use the explicit configured `DATABASE_PATH`
- label it `database`
- measure the database file itself
- later consider explicit additional definitions for `-wal` and `-shm` files if production SQLite uses them persistently
- do not assume `DATABASE_PATH` represents PostgreSQL storage when `DATABASE_URL` is set

For PostgreSQL:

- omit the local database path definition
- use provider/host database storage metrics later
- the CLI must not report remote PostgreSQL storage as healthy based on a missing or tiny local file

#### Uploads

- use explicit `UPLOAD_DIR`
- label it `uploads`
- recursively measure client and consent file storage
- this is expected to be the potentially largest recursive scan

#### Backups

- use explicit `BACKUP_DIR`
- label it `backups`
- includes normal backups, safety backups, pending restore files, and restore staging unless separate subpaths are also configured

#### Restore Staging And Pending Area

Recommended optional explicit definitions:

- `restore-uploads` for `<BACKUP_DIR>/restore-uploads`
- `pending-restore` for `<BACKUP_DIR>/pending-restore.sqlite`

Avoid double-count interpretation:

- if `backups` recursively includes restore staging, adding `restore-uploads` gives a useful sub-area measurement but the sizes must not be summed as independent total storage
- each path is an observation, not an additive accounting ledger

#### Logs

- logs should be added only with an explicit configured path
- current documented default is `./logs`
- do not assume every deployment uses the repository-local logs directory
- do not silently scan journald, `/var/log`, PM2 home, or the project root

### CLI Exposure Options

| Option | Configuration clarity | Threshold flexibility | Operational simplicity | Coupling | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A. Single local CLI | High with explicit JSON definitions | Per-path thresholds | One command and one JSON result | Low | Recommended |
| B. Separate DB/uploads/backups commands | Repetitive | Good | Multiple commands and schedules | Low | Unnecessary initially |
| C. Add to existing monitor commands | Mixed concerns | Awkward | Fewer commands | High; duplicates scans and contracts | Avoid |
| D. Protected operational endpoint | Remote visibility | Good | Larger auth/information surface | Runtime coupling | Defer |
| E. Manual runbook | Simple | Operator-dependent | No unattended visibility | None | Insufficient for rollout |

### Recommended First Exposure

Add one local-only CLI later:

- explicit path definitions are required
- no default production path is scanned
- no automatic import of `DATABASE_PATH`, `UPLOAD_DIR`, `BACKUP_DIR`, or `./logs`
- JSON output only
- no cleanup
- no alert delivery
- no operating-system capacity command
- no route or runtime wiring

Reason explicit configuration is required:

- prevents an accidental scan of a development/project path
- makes PostgreSQL deployments avoid a misleading SQLite definition
- allows different thresholds for database, uploads, backups, restore staging, and logs
- keeps scheduled service configuration reviewable

### Proposed CLI Command

- `npm run monitor:disk`
- direct script: `node server/scripts/check-disk-usage.js`

The future script should call `analyzeDiskUsagePaths` only. It should not use `df`, `du`, PowerShell disk commands, PM2, database queries, or network APIs.

### Proposed Environment Contract

Primary required variable:

- `DISK_MONITOR_PATHS_JSON`

Example:

```json
[
  {
    "label": "database",
    "path": "/var/lib/clinova/data/clinic.sqlite",
    "warningBytes": 1073741824,
    "criticalBytes": 2147483648
  },
  {
    "label": "uploads",
    "path": "/var/lib/clinova/uploads",
    "warningBytes": 10737418240,
    "criticalBytes": 16106127360
  },
  {
    "label": "backups",
    "path": "/var/lib/clinova/backups",
    "warningBytes": 21474836480,
    "criticalBytes": 26843545600
  }
]
```

Optional:

- `DISK_MONITOR_SHOW_PATHS=false`

Recommended JSON validation:

- must parse as an array
- must contain at least one definition
- each definition must have a non-empty unique `label`
- each definition must have a non-empty explicit `path`
- thresholds must be finite non-negative integers
- `criticalBytes` must be greater than or equal to `warningBytes` when both are supplied
- duplicate resolved paths may be allowed only when labels intentionally represent sub-area views; duplicate label/path pairs should be rejected
- cap the number of definitions, for example 20, to prevent accidental broad scan configuration

Simpler environment variables such as:

- `DISK_MONITOR_DATABASE_PATH`
- `DISK_MONITOR_UPLOAD_DIR`
- `DISK_MONITOR_BACKUP_DIR`
- `DISK_MONITOR_WARNING_MB`
- `DISK_MONITOR_CRITICAL_MB`

are not recommended as the primary contract because:

- one shared threshold does not fit all storage areas
- adding restore/log paths expands the variable surface
- PostgreSQL requires conditional omission of the DB file
- JSON maps directly to the helper's path-definition contract

They may be reconsidered later only as explicit convenience input that compiles into the same validated definitions. The first implementation should support one clear configuration method.

### Proposed Exit Codes

- `0`: aggregate status `healthy`
- `1`: aggregate status `warning`, `critical`, `missing`, or `unreadable`
- `2`: missing/empty/invalid configuration, invalid JSON, invalid thresholds, empty path list, or unexpected exception before a controlled helper result

Important distinctions:

- an explicitly configured path that does not exist is an operational result and exits `1`
- a missing `DISK_MONITOR_PATHS_JSON` value is a configuration failure and exits `2`
- a threshold breach exits `1`; it is not a CLI execution failure

### Proposed Output Shape

```json
{
  "ok": true,
  "status": "healthy",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "paths": [
    {
      "label": "uploads",
      "exists": true,
      "status": "healthy",
      "sizeBytes": 12345,
      "sizeMb": 0.01,
      "message": "Storage path is within configured thresholds."
    }
  ],
  "message": "All monitored storage paths are within configured thresholds."
}
```

Configuration error shape:

```json
{
  "ok": false,
  "status": "configuration_error",
  "checkedAt": "2035-01-02T12:00:00.000Z",
  "message": "DISK_MONITOR_PATHS_JSON is required."
}
```

Privacy:

- labels are always visible
- absolute paths are hidden by default
- `DISK_MONITOR_SHOW_PATHS=true` may expose paths only for local administrative output
- no filenames or file contents are returned by the current helper

### Performance Guardrails

Initial scope:

- database file
- uploads directory
- backups directory
- optional restore staging
- explicitly configured logs directory

Never scan by default:

- repository root
- filesystem root
- home directory
- all of `/var`
- all of OS temp
- PM2 home
- remote/network mounts without explicit operator review

Recursive scan risks:

- cost is proportional to entry count, not only total bytes
- large uploads with many small files can take longer than a large single database file
- the current helper walks entries sequentially, which avoids an unbounded file-descriptor burst but may be slow on very large trees
- files can change during a scan, so results are an operational snapshot
- overlapping definitions can scan the same files more than once

Recommended execution guardrails for the future CLI:

- local one-shot command only
- one execution at a time through scheduler configuration
- initial schedule no more frequent than every 15 minutes until scan duration is observed
- measure and log command duration later
- do not schedule concurrently with backup/restore where avoidable
- set an external systemd execution timeout rather than adding destructive cancellation behavior to the helper
- retain the current no-symlink-following policy
- consider `maxEntries`, `maxDepth`, or scan timeout only after real data shows a need

The initial CLI should not claim filesystem free-space coverage. It reports configured path sizes only.

### Testing Plan For The Future CLI

Use guarded OS temporary directories only:

- healthy path returns exit `0`
- warning path returns exit `1`
- critical path returns exit `1`
- missing configured path returns exit `1`
- invalid/missing JSON configuration returns exit `2`
- empty definitions array returns exit `2`
- missing label or path returns exit `2`
- duplicate labels return exit `2`
- invalid threshold returns exit `2`
- critical threshold lower than warning returns exit `2`
- multiple paths produce one aggregate result
- default output hides paths
- `DISK_MONITOR_SHOW_PATHS=true` includes resolved paths
- stdout contains JSON only
- no shell command or production path is used
- temporary fixtures are removed even when validation fails

The future CLI test file should be:

- `server/tests/disk-usage-cli.test.js`

The focused helper test should continue to run directly. Whether disk tests join `npm run test:api` should be an explicit later choice; they are monitoring unit tests rather than API regression tests.

### Risks And Guardrails

Risks:

- malformed JSON or shell quoting errors in environment files
- broad or wrong paths cause expensive scans
- overlapping paths double-scan data
- path-size thresholds can be mistaken for filesystem-free-space thresholds
- recursive scans may contend with uploads, backups, or restore staging
- showing paths can disclose host layout in copied logs

Guardrails:

- required explicit JSON configuration
- strict CLI validation
- no defaults to production paths
- no project-root scan
- path hiding by default
- JSON-only output
- stable exit codes
- no cleanup, mutation, alerts, scheduling, or endpoint exposure
- document that path size is not free disk capacity

### Selected Next SAFE STEP

Selected option: **A. Add Disk Usage CLI Only**.

Recommended next step: **SAFE STEP 180 - Add Disk Usage CLI Only**.

The next step should add the local CLI and focused temporary-directory tests using `DISK_MONITOR_PATHS_JSON`, without alert mode, OS disk-capacity commands, scheduling, routes, cleanup, or runtime wiring.

### Step 179 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- do not run production disk scans
- do not run real PM2 command; fixture tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups
- confirm temporary test and monitor directories are removed

### Step 179 Validation Results

- `node --check`: passed on all 163 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 155/155 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 179 monitor and smoke directories were removed
- no production, development, or project disk-usage scan was performed
- no real PM2 command was executed
- no CLI, test, package script, runtime, route, scheduler, PM2 configuration, CI workflow, or alert delivery changed

## SAFE STEP 181 - FINAL MONITORING COVERAGE REPORT

This step is report-only. No code, tests, package scripts, routes, schedulers, PM2 configuration, CI workflow, environment behavior, or alert delivery changed.

### Monitoring Commands Available

The backend now provides four local JSON monitoring commands:

- `npm run monitor:backup`
- `npm run monitor:restore-pending`
- `npm run monitor:pm2`
- `npm run monitor:disk`

All commands are local operational tools. None is exposed through HTTP or imported into the application request runtime.

### Command Coverage

#### Backup Freshness

Command:

- `npm run monitor:backup`

Coverage:

- configured backup directory existence/readability
- newest recognized backup file
- backup age
- fresh/stale/missing/unreadable states
- configurable freshness threshold and extensions
- hidden absolute paths by default

It does not:

- create backups
- test backup contents
- prove restore validity
- measure backup directory size
- measure filesystem free space

#### Restore Pending Markers

Command:

- `npm run monitor:restore-pending`

Coverage:

- `pending-restore.sqlite`
- `pending-restore.json`
- no pending marker
- fresh pending marker
- stale marker
- partial marker pair
- invalid metadata
- unreadable backup area
- pending age and safe metadata summary

It does not:

- apply restore
- retry restore
- delete or repair markers
- inspect SQLite contents

#### PM2 Runtime Status

Command:

- `npm run monitor:pm2`

Coverage:

- expected process presence
- online/offline status
- restart count
- low uptime after restart
- memory threshold
- CPU observation
- PM2 command/configuration failure
- safe process summaries without raw PM2 environment data

Current expected process defaults:

- `clinova`
- `clinova-backup`

It performs only project-local `pm2 jlist`. It does not start, stop, restart, reload, save, or modify PM2 processes.

#### Disk Path Usage

Command:

- `npm run monitor:disk`

Coverage:

- explicitly configured files and directories
- recursive file size totals
- nested directory sizes
- warning/critical byte thresholds
- missing and unreadable paths
- aggregate worst status
- hidden absolute paths by default
- strict explicit JSON configuration

Required input:

- `DISK_MONITOR_PATHS_JSON`

It does not:

- use default production paths
- measure total/free filesystem capacity
- invoke `df`, `du`, PowerShell disk commands, or network services
- clean, compress, move, truncate, or delete files

### Exit Code Contract

| Command | Exit 0 | Exit 1 | Exit 2 |
| --- | --- | --- | --- |
| `monitor:backup` | fresh backup | stale, missing, unreadable | configuration/unexpected failure |
| `monitor:restore-pending` | no pending marker | pending, stale, partial, invalid, unreadable | configuration/unexpected failure |
| `monitor:pm2` | all expected processes healthy | degraded, missing, offline, restarting, unhealthy | configuration, PM2 command, timeout, JSON, or monitor failure |
| `monitor:disk` | all configured paths healthy | warning, critical, missing, unreadable | missing/invalid configuration or unexpected failure |

Operational rule:

- exit `1` means the monitor ran and found an unhealthy operational condition
- exit `2` means the monitor itself could not complete correctly
- alert dedupe never converts an unhealthy exit `1` into exit `0`

### Alert And Log Modes

#### Backup

- `BACKUP_MONITOR_ALERT_MODE=log`
- output becomes `{ backup, alert }`
- supports warning/critical decisions, dedupe inputs, and recovery
- `delivery: "none"`

#### Restore Pending

- `RESTORE_PENDING_ALERT_MODE=log`
- output becomes `{ restore, alert }`
- pending warning, stale/invalid critical, dedupe, and recovery
- `delivery: "none"`

#### PM2

- `PM2_MONITOR_ALERT_MODE=log`
- output becomes `{ pm2, alert }`
- degraded warning, down/monitor failure critical, dedupe, and recovery
- `delivery: "none"`

#### Disk

- no alert mode
- this is an accepted v1.3 shortcut
- the CLI status and exit code are sufficient for manual/pilot use
- a future disk alert adapter may follow the same pure log-only pattern

Current alert boundary:

- structured decision payloads only
- no email
- no webhook
- no WhatsApp
- no persistent previous-state store
- no delivery retry or escalation

### Automated Test Coverage

Current main suites:

- `npm run test:api`: 155/155 passing
- `npm run test:restore`: 1/1 passing in a disposable restore environment

Focused monitoring suite:

- 136 tests total
- 135 passing
- 1 skipped

The skipped case is symbolic-link creation on Windows where the operating system returned `EPERM`. The helper still has an explicit no-symlink-following implementation, and the test runs on environments where symlink creation is permitted.

Monitoring test files:

- `backup-freshness.test.js`
- `backup-freshness-cli.test.js`
- `backup-alerts.test.js`
- `restore-pending.test.js`
- `restore-pending-cli.test.js`
- `restore-pending-alerts.test.js`
- `pm2-status.test.js`
- `pm2-status-cli.test.js`
- `pm2-alerts.test.js`
- `disk-usage.test.js`
- `disk-usage-cli.test.js`

Covered monitoring test classes:

- helper status classification
- deterministic timestamps
- missing/unreadable states
- warning/critical thresholds
- recursive sizing
- path privacy
- CLI JSON-only output
- exit codes 0/1/2
- invalid configuration
- alert severity/type mapping
- dedupe and recovery
- safe-detail redaction
- PM2 injected-runner behavior without a real PM2 daemon
- temporary-directory cleanup

Current `test:api` includes many backup, restore-pending, and PM2 monitoring tests. PM2 alert and disk-focused tests are also validated directly as monitoring unit tests and are not currently added to the API command.

### Operational Readiness

#### Internal Deployment

Decision:

- **GO**

Conditions:

- environment variables are reviewed
- commands are run manually after deployment
- backup and restore access controls remain verified
- operators review PM2/application logs

The current tools provide enough structured visibility for an actively supervised internal deployment.

#### Pilot Clinic Rollout

Decision:

- **GO WITH OPERATIONAL GUARDRAILS**

Required guardrails:

- documented operator ownership
- all four monitoring commands run with production configuration before launch
- backup scheduler verified
- restore pending status confirmed `none`
- PM2 processes verified under the correct PM2 owner/`PM2_HOME`
- disk path definitions reviewed and limited to intended paths
- manual daily monitoring until scheduling is deployed
- incident contact and rollback process available

The pilot should remain limited and supervised because monitors are not yet scheduled and do not deliver real alerts.

#### General Unattended Rollout

Decision:

- **NO-GO for fully unattended operation**

Blocking operational gaps:

- no committed cron/systemd execution
- no real alert delivery
- no centralized dashboard/status collection
- no persistent monitor-state/dedupe history
- no filesystem free-space monitoring
- no confirmed PostgreSQL parity when PostgreSQL is the production engine

The backend can operate, but an unattended broad rollout would rely too heavily on operators remembering to run checks manually.

### Remaining Gaps Accepted For v1.3 Freeze

Accepted for the backend code freeze:

- no real email/webhook alert delivery
- no committed cron/systemd files
- no disk alert adapter
- no protected operational dashboard
- no persistent previous monitor state
- no total/free filesystem capacity adapter
- no automatic cleanup or remediation
- no UI/E2E browser automation
- no load/performance testing
- no production Meta delivery/webhook verification

Conditional acceptance:

- PostgreSQL parity is not completed
- this is acceptable only when v1.3 deployment uses the validated SQLite path
- if production uses PostgreSQL, parity verification must occur before rollout

These gaps do not require reopening modular backend endpoint logic. They belong to deployment, operations, database parity, and frontend/E2E hardening phases.

### Pilot Runbook

Before pilot deployment:

1. run `node --check` on all server JavaScript files
2. run `npm run db:check`
3. run `npm run test:api`
4. run `npm run test:restore`
5. verify production environment variables and secrets
6. verify backup scheduler process and schedule
7. run `npm run monitor:backup`
8. require backup status `fresh`
9. run `npm run monitor:restore-pending`
10. require restore status `none`
11. run `npm run monitor:pm2` as the PM2 owner
12. require both `clinova` and `clinova-backup` healthy
13. run `npm run monitor:disk` with reviewed `DISK_MONITOR_PATHS_JSON`
14. verify DB/uploads/backups/log path sizes are within chosen thresholds
15. separately verify host filesystem free space because `monitor:disk` does not provide it
16. verify `/api/health` and `/api/version`
17. verify login and role access
18. verify WhatsApp mode:
    - fallback, disabled, dry-run, or provider
    - no accidental real-send configuration
19. verify restore remains platform-owner-only
20. verify PM2 and monitor log retention
21. record operator name, deployment time, backup name, and rollback point

During pilot:

- run backup/restore/PM2 checks at least daily until scheduling exists
- run disk check at least daily and before restore/import operations
- review PM2 restart count and uptime after deploy
- review WhatsApp failed message logs if provider mode is enabled
- escalate any exit `2` as monitor failure
- do not automatically delete files or restart processes based solely on monitor output

### Final Recommendation

Selected option: **A. Proceed to SAFE STEP 182 - Backend Freeze & Go/No-Go Final Report**.

Reason:

- modular backend and regression coverage are mature
- valid and invalid restore paths are covered
- WhatsApp no-send/dry-run/failure paths are covered
- four operational monitoring CLIs now exist
- remaining work is operational wiring and rollout governance, not another endpoint refactor

Recommended next step:

- **SAFE STEP 182 - Backend Freeze & Go/No-Go Final Report**

That report should freeze backend scope, identify deployment preconditions, state explicit internal/pilot/general rollout decisions, and hand off remaining work to operations, PostgreSQL parity if required, and frontend/E2E.

### Step 181 Validation Checklist

- run `node --check` on every JavaScript file under `server`
- run `npm run db:check`
- run `npm run test:api`
- run `npm run test:restore`
- run the focused monitoring test suite
- run `npm run monitor:backup` against a temporary fresh backup directory
- run `npm run monitor:restore-pending` against a temporary no-pending backup directory
- run `npm run monitor:disk` against a temporary healthy directory
- do not run real `npm run monitor:pm2`; fixture tests are sufficient
- run `npm start` against temporary SQLite/uploads/backups
- confirm temporary test and monitor directories are removed

### Step 181 Validation Results

- `node --check`: passed on all 165 JavaScript files under `server`
- `npm run db:check`: passed
- `npm run test:api`: passed, 155/155 tests
- `npm run test:restore`: passed, 1/1 test in its disposable environment
- focused monitoring suite: 136 tests total, 135 passed, 1 skipped
  - skipped: Windows denied symbolic-link fixture creation with `EPERM`
- `npm run monitor:backup`: passed against a temporary fresh backup directory with exit code 0 and status `fresh`
- `npm run monitor:restore-pending`: passed against a temporary no-pending backup directory with exit code 0 and status `none`
- `npm run monitor:disk`: passed against a temporary healthy directory with exit code 0 and status `healthy`
- the real `npm run monitor:pm2` command was not executed; fixture/injected-runner tests remain sufficient
- `npm start` smoke passed against temporary SQLite/uploads/backups:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- temporary Step 181, disk, API, restore, backup freshness, and restore pending directories were removed
- no application code, tests, package scripts, routes, scheduler files, PM2 configuration, CI workflow, or alert delivery changed in this report step

## SAFE STEP 182 — BACKEND FREEZE & GO/NO-GO FINAL REPORT

This step is report-only. No application code, tests, package scripts, routes, runtime behavior, PM2 configuration, monitoring implementation, alert delivery, or CI workflow changed.

### 1. Final Test Status

- `node --check`: passed on all 165 JavaScript files under `server`
- `npm run db:check`: passed against the configured SQLite database
- `npm run test:api`: passed, 155/155 tests
- `npm run test:restore`: passed, 1/1 disposable valid-restore test
- focused monitoring suite: 136 tests total
  - 135 passed
  - 1 skipped because Windows denied symbolic-link fixture creation with `EPERM`
  - 0 failed
- `npm start` smoke passed against temporary SQLite, uploads, and backups paths:
  - `GET /api/health` = 200
  - `GET /api/version` = 200
  - `GET /api/bootstrap` = 401
  - `GET /api/unknown` = 404
  - `GET /` = 200
- all Step 182 temporary monitor and smoke directories were removed

### 2. Backend Coverage Summary

The frozen backend baseline covers:

- authentication, login, logout, sessions, account behavior, and role boundaries
- users and role validation
- clients and client missing-record behavior
- appointments, scheduling fields, statuses, and missing-record behavior
- CRM tasks and CRM read/write boundaries
- catalog categories and services
- gifts without real WhatsApp delivery in tests
- client file upload, list, download, and archive
- consent upload, list, download, sign validation, and archive
- invitations and token-preview boundary behavior
- clinic billing and platform invoice workflows
- platform tenant provisioning, update, password reset, invoices, and auto-billing boundary
- role-specific bootstrap payloads
- system export and invalid/valid restore coverage
- WhatsApp fallback, provider dry-run, missing configuration, provider HTTP 400/500, and network-error behavior
- backup freshness, restore pending markers, PM2 status, and configured path-size monitoring

### 3. Security & Stability Summary

- required-field validation covers the hardened create and update boundaries
- numeric, date/time, enum, and status validation return controlled client errors
- malformed numeric route IDs return the generic API 404 instead of list responses or SQL errors
- affected-row checks prevent false success for missing numeric records
- auth, clinic-role, platform-owner, export, and restore permission boundaries have negative regression coverage
- restore tests use guarded temporary SQLite, uploads, and backups paths
- valid restore is exercised only in a disposable child process and its intentional exit is handled explicitly
- WhatsApp tests use fallback, dry-run, missing-config, or intercepted provider calls; no real credentials or provider delivery are used
- monitoring helpers and CLIs are read-only and do not delete, repair, restart, restore, or mutate application data
- the modular backend has no runtime dependency on the archived legacy runtime

### 4. Monitoring Summary

Available local operational commands:

- `npm run monitor:backup`
  - checks backup freshness
  - optional log payload mode: `BACKUP_MONITOR_ALERT_MODE=log`
- `npm run monitor:restore-pending`
  - checks `pending-restore.sqlite` and `pending-restore.json`
  - optional log payload mode: `RESTORE_PENDING_ALERT_MODE=log`
- `npm run monitor:pm2`
  - runs read-only `pm2 jlist` and analyzes expected processes
  - optional log payload mode: `PM2_MONITOR_ALERT_MODE=log`
- `npm run monitor:disk`
  - measures explicitly configured file/directory sizes
  - no alert mode in the v1.3 baseline

The log modes build structured alert decisions only. They do not deliver email, WhatsApp, webhook, dashboard, or external alerts.

### 5. Accepted Gaps for the v1.3 Freeze

- no real alert delivery
- no committed cron or systemd scheduling files
- no protected operational dashboard
- no browser UI/E2E automation
- PostgreSQL parity is not proven; production must use the validated SQLite path unless parity is completed separately
- no production load, latency, or capacity benchmark
- no real Meta delivery, webhook, template-approval, rate-limit, or phone-delivery verification
- disk monitoring measures configured path sizes but not host filesystem free capacity
- unattended monitoring still depends on external operational scheduling and escalation

Release identity guardrail:

- `VERSION` and `package.json` currently report `1.6.2`
- the requested release label is `clinova-v1.3-stable`
- do not create or push the v1.3 tag until maintainers either reconcile the version metadata or explicitly approve the tag as an alias for this frozen baseline

### 6. Go / No-Go Decision

| Rollout scope | Decision | Conditions |
| --- | --- | --- |
| Internal deployment | **GO** | Use SQLite, run the full test and monitor checklist, verify backups and rollback access |
| Pilot clinic rollout | **GO WITH GUARDRAILS** | Named operator, verified backup schedule, daily monitoring, limited users, documented rollback, controlled WhatsApp mode |
| Multi-clinic rollout | **NO-GO** | Requires successful pilot evidence, scheduled monitoring, alert delivery/escalation, capacity checks, and PostgreSQL parity if PostgreSQL will be used |
| Unattended production rollout | **NO-GO** | Requires automated scheduling, real alert delivery, operational ownership, host disk monitoring, and incident/restore runbooks exercised by operators |

The two NO-GO decisions constrain rollout scope. They do not require reopening the frozen v1.3 backend endpoint refactor.

### 7. Freeze Recommendation

Freeze the validated backend source baseline as **Clinova v1.3 Stable**, subject to the release identity guardrail above.

- no further non-critical backend hardening changes should enter this baseline
- only a release-blocking security defect, data-loss defect, or failed baseline validation should reopen v1.3
- new backend features and additional hardening belong on the v1.4 line
- deployment and monitoring wiring may proceed as operational work without changing the frozen endpoint baseline

### 8. Release Baseline Recommendation

After the version identity is reconciled or explicitly approved:

```text
git tag clinova-v1.3-stable
git push origin clinova-v1.3-stable
```

Suggested next development branch:

```text
release/1.4
```

These commands are documented recommendations only. No tag, push, or branch command was run in this step.

### 9. Final Recommendation

Selected decision: **A. Freeze accepted — start v1.4 planning**.

The backend code and automated safety baseline are suitable for freeze. Internal deployment is approved, and a limited clinic pilot is approved with explicit operational guardrails. Multi-clinic and unattended rollout remain blocked by operational automation, alert delivery, production capacity evidence, and database parity requirements rather than by the modular backend refactor itself.

### Step 182 Validation Results

- `node --check`: passed on 165/165 server JavaScript files
- `npm run db:check`: passed
- `npm run test:api`: passed, 155/155
- `npm run test:restore`: passed, 1/1
- focused monitoring suite: 135 passed, 1 skipped, 0 failed
- `npm run monitor:backup`: exit 0, status `fresh`, temporary directory removed
- `npm run monitor:restore-pending`: exit 0, status `none`, temporary directory removed
- `npm run monitor:disk`: exit 0, status `healthy`, temporary directory removed
- real `npm run monitor:pm2` was not run because it can connect to or initialize a local PM2 daemon; PM2 helper/CLI behavior is covered by fixture and injected-runner tests
- `npm start` smoke passed with temporary SQLite/uploads/backups
- remaining Step 182 temporary directories: 0
- no manual or production restore was run outside the existing disposable `npm run test:restore` suite

## BACKEND FREEZE ACCEPTED

- Stable Release: 1.6.2
- Internal Deployment: GO
- Pilot Clinic Rollout: GO WITH GUARDRAILS
- Multi-Clinic Rollout: NO-GO
- Unattended Production Rollout: NO-GO
- Future development moves to `release/1.4`
