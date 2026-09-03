import 'server-only';

import type {
  AttendanceScanAction,
  LabMembershipRole,
  RateLimitAction,
} from '@/app/generated/prisma/client';

type AuditOutcome = 'FAILED' | 'REJECTED' | 'SUCCEEDED';

interface AuthenticationAuditEvent {
  actorUserId?: string;
  event: 'AUTHENTICATION';
  labId: string;
  outcome: AuditOutcome;
  reason:
    | 'ATTENDANCE_CREDENTIAL_INVALID'
    | 'CREDENTIALS_INVALID'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'RATE_LIMITED'
    | 'SURFACE_DENIED'
    | 'VERIFIED';
  surface: 'ATTENDANCE' | 'STAFF';
}

interface InvitationAuditEvent {
  actorUserId?: string;
  event: 'INVITATION';
  invitationId?: string;
  labId: string;
  operation: 'ACCEPT' | 'CREATE' | 'REVOKE';
  outcome: AuditOutcome;
  reason:
    | 'ACCEPTED'
    | 'CREATED'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'DOMAIN_REJECTED'
    | 'INVALID_INPUT'
    | 'RATE_LIMITED'
    | 'REVOKED'
    | 'STATE_CHANGED';
  role?: LabMembershipRole;
}

interface MembershipAuditEvent {
  actorUserId: string;
  event: 'MEMBERSHIP';
  labId: string;
  operation: 'ACTIVATE' | 'DEACTIVATE';
  outcome: AuditOutcome;
  reason: 'STATE_CHANGED' | 'UPDATED';
  role: LabMembershipRole;
  targetUserId: string;
}

interface DisplayAuditEvent {
  activationId?: string;
  actorUserId?: string;
  event: 'DISPLAY_CAPABILITY';
  labId: string;
  operation: 'CREATE' | 'REDEEM' | 'REVOKE';
  outcome: AuditOutcome;
  reason:
    | 'CREATED'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'DOMAIN_REJECTED'
    | 'RATE_LIMITED'
    | 'REDEEMED'
    | 'REVOKED'
    | 'STATE_CHANGED';
}

interface AttendanceManagementAuditEvent {
  action?: AttendanceScanAction;
  actorUserId: string;
  event: 'ATTENDANCE_MANAGEMENT';
  labId: string;
  operation: 'RECORD' | 'UPDATE_SCHEDULE';
  outcome: AuditOutcome;
  reason:
    | 'CHECK_IN_CLOSED'
    | 'INVALID_INPUT'
    | 'NOT_AUTHORIZED'
    | 'RECORDED'
    | 'SCHEDULE_UPDATED'
    | 'STATE_CHANGED';
  targetUserId?: string;
  visitId?: string;
}

interface PasswordAuditEvent {
  actorUserId: string;
  event: 'ADMINISTRATOR_PASSWORD';
  labId: string;
  outcome: AuditOutcome;
  reason:
    | 'ACCOUNT_UNAVAILABLE'
    | 'CHANGED'
    | 'CONFLICT'
    | 'CURRENT_PASSWORD_INVALID'
    | 'INVALID_INPUT';
}

interface AttendanceCronAuditEvent {
  event: 'ATTENDANCE_CRON';
  labId?: string;
  operation: 'CLEANUP' | 'CLOSE';
  outcome: AuditOutcome;
  reason:
    | 'CLEANUP_FAILED'
    | 'COMPLETED'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'HEARTBEAT_FAILED';
}

interface RateLimitAuditEvent {
  action: RateLimitAction;
  event: 'RATE_LIMIT';
  labId: string;
  outcome: 'FAILED' | 'REJECTED';
  reason: 'DEPENDENCY_UNAVAILABLE' | 'LIMIT_REACHED';
}

interface AuthLibraryAuditEvent {
  event: 'AUTH_LIBRARY';
  outcome: 'FAILED' | 'REJECTED';
  reason: 'ERROR' | 'WARNING';
}

export type SecurityAuditEvent =
  | AttendanceCronAuditEvent
  | AttendanceManagementAuditEvent
  | AuthenticationAuditEvent
  | AuthLibraryAuditEvent
  | DisplayAuditEvent
  | InvitationAuditEvent
  | MembershipAuditEvent
  | PasswordAuditEvent
  | RateLimitAuditEvent;

export function logSecurityAudit(event: SecurityAuditEvent): void {
  process.stdout.write(
    `${JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
      version: 1,
    })}\n`,
  );
}
