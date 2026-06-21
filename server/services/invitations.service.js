import { randomUUID } from "node:crypto";
import { createSessionToken, hashPassword } from "../security.js";
import { sessionCookie } from "./auth.service.js";
import { inviteUrl } from "../shared/http/url-helpers.js";
import {
  auditInvitation,
  createInvitationRecord,
  createInvitedUser,
  createSession,
  findExistingUserByEmail,
  findInvitationByToken,
  findInvitationPreview,
  findUserByIdAndTenant,
  listTenantInvitations,
  markInvitationAccepted,
  markPendingInvitationsAccepted,
  revokeInvitation,
  tenantBillingSnapshot,
  toUser,
} from "../repositories/invitations.repository.js";

const planCatalog = {
  starter: { name: "Starter", monthlyPrice: 49, maxUsers: 5, maxClients: 200, whatsapp: false, billing: false },
  growth: { name: "Growth", monthlyPrice: 99, maxUsers: 10, maxClients: 2000, whatsapp: true, billing: false },
  scale: { name: "Scale", monthlyPrice: 199, maxUsers: null, maxClients: null, whatsapp: true, billing: true },
};

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function limitReached(current, max) {
  return max !== null && max !== undefined && Number(current || 0) >= Number(max);
}

async function assertTenantCanWrite(tenantId, feature = "write") {
  const billing = await tenantBillingSnapshot(tenantId);
  if (["suspended", "cancelled", "past_due"].includes(billing.status)) {
    const error = new Error(`Subscription status blocks ${feature}.`);
    error.status = 402;
    throw error;
  }
  return {
    ...billing,
    limits: planCatalog[billing.plan] || planCatalog.starter,
  };
}

export async function listInvitations(user, req) {
  const rows = await listTenantInvitations(user.tenantId);
  return {
    status: 200,
    body: { invitations: rows.map((row) => ({ ...row, inviteUrl: inviteUrl(req, row.token) })) },
  };
}

export async function previewInvitation(token) {
  const invitation = await findInvitationPreview(token);
  if (!invitation) return { status: 404, body: { error: "Invitation not found." } };
  if (invitation.acceptedAt) return { status: 410, body: { error: "Invitation was already accepted." } };
  if (Number(invitation.expiresAt) < Date.now()) return { status: 410, body: { error: "Invitation expired." } };
  return { status: 200, body: { invitation } };
}

export async function createInvitation(user, body, req) {
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const role = ["admin", "reception", "therapist"].includes(body.role) ? body.role : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: "Valid email is required." } };
  if (name.length < 2) return { status: 400, body: { error: "Name is required." } };
  if (!role) return { status: 400, body: { error: "Valid role is required." } };

  const billing = await assertTenantCanWrite(user.tenantId, "team invitations");
  if (limitReached(billing.usage.users, billing.limits.maxUsers)) {
    return { status: 402, body: { error: `Plan user limit reached (${billing.limits.maxUsers}).` } };
  }

  const existing = await findExistingUserByEmail(user.tenantId, email);
  if (existing) return { status: 409, body: { error: "A user with this email already exists." } };

  await markPendingInvitationsAccepted(user.tenantId, email);
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const id = await createInvitationRecord({
    tenantId: user.tenantId,
    email,
    name,
    role,
    token,
    invitedBy: user.id,
    expiresAt,
  });
  await auditInvitation(user.id, "invite_user", "user_invitations", id, { tenantId: user.tenantId, email, role });
  return { status: 201, body: { id, inviteUrl: inviteUrl(req, token), token, expiresAt } };
}

export async function acceptInvitation(token, body) {
  if (!body.password || String(body.password).length < 8) {
    return { status: 400, body: { error: "Password must be at least 8 characters." } };
  }
  const invitation = await findInvitationByToken(token);
  if (!invitation) return { status: 404, body: { error: "Invitation not found." } };
  if (invitation.accepted_at) return { status: 410, body: { error: "Invitation was already accepted." } };
  if (Number(invitation.expires_at) < Date.now()) return { status: 410, body: { error: "Invitation expired." } };

  const email = normalizeEmail(invitation.email);
  const existing = await findExistingUserByEmail(invitation.tenant_id, email);
  if (existing) return { status: 409, body: { error: "A user with this email already exists." } };

  const userId = await createInvitedUser(invitation, hashPassword(body.password), email);
  await markInvitationAccepted(invitation.id);
  const row = await findUserByIdAndTenant(userId, invitation.tenant_id);
  const tokenValue = createSessionToken(config.sessionSecret);
  const sessionId = tokenValue.split(".")[0];
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  await createSession(sessionId, invitation.tenant_id, row.id, expiresAt);
  await auditInvitation(row.id, "accept_invitation", "users", row.id, { tenantId: invitation.tenant_id, invitationId: invitation.id });
  return {
    status: 201,
    body: { user: toUser(row) },
    cookie: sessionCookie(tokenValue, expiresAt),
  };
}

export async function deleteInvitation(user, id) {
  const changes = await revokeInvitation(id, user.tenantId);
  if (!changes) return { status: 404, body: { error: "Invitation not found." } };
  await auditInvitation(user.id, "revoke_invitation", "user_invitations", id, { tenantId: user.tenantId });
  return { status: 200, body: { ok: true } };
}
