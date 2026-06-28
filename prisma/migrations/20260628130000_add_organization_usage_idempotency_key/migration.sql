ALTER TABLE `organization_usages`
  ADD COLUMN `idempotencyKey` VARCHAR(128) NULL;

CREATE UNIQUE INDEX `organization_usages_org_idempotency_key`
  ON `organization_usages`(`organizationId`, `idempotencyKey`);
