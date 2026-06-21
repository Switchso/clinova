# Clinova SaaS Roadmap

Clinova is being upgraded from a single-clinic CRM into a commercial multi-tenant SaaS.

## Current Foundation

- `tenants`: one record per clinic/business account.
- `subscriptions`: billing status and provider identifiers per tenant.
- `tenant_id` columns on CRM entities: users, categories, services, clients, appointments, files, consents, feedback, gifts, sessions, and audit log.
- Auth sessions now store `tenant_id`.
- Bootstrap API returns the active tenant.
- Core CRM reads and writes are scoped by the authenticated user's tenant.
- PostgreSQL schema supports external database deployment.

## Next Implementation Phases

1. **Auth v2**
   - Email login instead of global username.
   - Tenant lookup by domain/subdomain.
   - Invite users by email.
   - Password reset and email verification.

2. **Tenant Provisioning**
   - Public signup creates tenant, owner user, subscription trial.
   - Tenant slug and custom domain mapping.
   - Tenant status enforcement: trial, active, past_due, suspended.

3. **API Layer**
   - Versioned API prefix: `/api/v1`.
   - Validation layer for all writes.
   - Standard API error format.
   - Tenant-aware pagination/search.

4. **Billing**
   - Plans table and entitlements.
   - Stripe or manual provider adapter.
   - Webhook endpoint for subscription events.
   - Usage limits: users, clients, appointments, storage, WhatsApp messages.

5. **WhatsApp**
   - Tenant-level WhatsApp credentials.
   - Message templates per tenant.
   - Message log and delivery status.
   - Billing usage meter.

6. **Frontend Integration**
   - Connect the ready Next.js UI to the live API.
   - Replace demo data with authenticated fetches.
   - SaaS onboarding screens.
   - Billing and plan settings pages.

7. **Production Readiness**
   - External PostgreSQL only in production.
   - Object storage for uploads.
   - Background workers for reminders/backups/webhooks.
   - Monitoring and structured logs.
