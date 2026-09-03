export const e2eLabId = '10000000-0000-4000-8000-000000000001';
export const e2eInvitationToken = 'A'.repeat(43);

export const e2eAccounts = {
  administrator: {
    email: 'administrator.e2e@test.local',
    name: 'Administración global E2E',
    password: 'administrator-e2e-password',
  },
  attendee: {
    email: 'attendee.e2e@test.local',
    name: 'Persona asistente E2E',
    password: 'attendee-e2e-password',
  },
  invitedAttendee: {
    email: 'invited-attendee.e2e@test.local',
    name: 'Persona invitada E2E',
    password: 'invited-attendee-password',
  },
  manager: {
    email: 'manager.e2e@test.local',
    name: 'Administración local E2E',
    password: 'manager-e2e-password',
  },
} as const;
