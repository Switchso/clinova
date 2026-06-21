# Route Extraction Changelog

Safe step 1 only: route definitions were moved out of `server/app.js` into route modules.

Moved route groups:

- `auth.routes.js`: signup, login, logout, account password, current user, invitation accept/read.
- `clients.routes.js`: client list/create/update/delete plus existing nested client history/file URLs through the same legacy handler.
- `appointments.routes.js`: appointment list/create/update/delete plus appointment sub-actions through the same legacy handler.
- `users.routes.js`: users and team invitation management.
- `reports.routes.js`: health, version, bootstrap, search, reports, audit.
- `whatsapp.routes.js`: message logs and existing WhatsApp sub-actions.
- `settings.routes.js`: clinic settings, tenant profile, tenant domains.
- `files.routes.js`: client files, consent files, system export/restore.

Business logic, database queries, tenant isolation, permissions, audit logging, uploads, PDF generation, backup, WhatsApp, and all endpoint URLs remain on the existing legacy handler for this step.
