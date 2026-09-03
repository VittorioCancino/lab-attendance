DELETE FROM "LabMembership" AS membership
USING "User" AS account
WHERE membership."userId" = account.id
  AND account."isGlobalAdmin" = true;
