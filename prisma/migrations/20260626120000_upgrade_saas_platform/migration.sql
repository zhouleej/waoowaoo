-- Upgrade SaaS platform: additive migration, keeps existing business data.

ALTER TABLE `projects` ADD COLUMN `organizationId` VARCHAR(191) NULL;
ALTER TABLE `projects` ADD INDEX `projects_organizationId_idx` (`organizationId`);
ALTER TABLE `projects` ADD CONSTRAINT `projects_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `usage_costs` ADD COLUMN `organizationId` VARCHAR(191) NULL;
ALTER TABLE `usage_costs` ADD INDEX `usage_costs_organizationId_idx` (`organizationId`);
ALTER TABLE `usage_costs` ADD CONSTRAINT `usage_costs_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `organizations` ADD COLUMN `businessStatus` VARCHAR(191) NOT NULL DEFAULT 'trial';
ALTER TABLE `organizations` ADD COLUMN `settings` JSON NULL;
ALTER TABLE `organizations` ADD COLUMN `currentPlanId` VARCHAR(191) NULL;
ALTER TABLE `organizations` ADD COLUMN `currentSubscriptionId` VARCHAR(191) NULL;
ALTER TABLE `organizations` ADD INDEX `organizations_status_idx` (`status`);
ALTER TABLE `organizations` ADD INDEX `organizations_businessStatus_idx` (`businessStatus`);
ALTER TABLE `organizations` ADD INDEX `organizations_currentPlanId_idx` (`currentPlanId`);

ALTER TABLE `organization_members` ADD COLUMN `quotaUsed` DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE `organization_members` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

ALTER TABLE `organization_usages` ADD COLUMN `planCreditAmount` DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE `organization_usages` ADD COLUMN `balanceAmount` DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE `organization_usages` ADD COLUMN `taskId` VARCHAR(191) NULL;
ALTER TABLE `organization_usages` ADD COLUMN `orderId` VARCHAR(191) NULL;
ALTER TABLE `organization_usages` ADD COLUMN `metadata` JSON NULL;
ALTER TABLE `organization_usages` ADD INDEX `organization_usages_taskId_idx` (`taskId`);
ALTER TABLE `organization_usages` ADD INDEX `organization_usages_orderId_idx` (`orderId`);

ALTER TABLE `tasks` ADD COLUMN `organizationId` VARCHAR(191) NULL;
ALTER TABLE `tasks` ADD INDEX `tasks_organizationId_idx` (`organizationId`);
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `pricing_plans` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `billingCycle` VARCHAR(191) NOT NULL DEFAULT 'monthly',
  `price` DECIMAL(18,6) NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isPublic` BOOLEAN NOT NULL DEFAULT true,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `pricing_plans_code_key` (`code`),
  INDEX `pricing_plans_status_idx` (`status`),
  INDEX `pricing_plans_sortOrder_idx` (`sortOrder`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `plan_entitlements` (
  `id` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `description` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `plan_entitlements_planId_key_key` (`planId`, `key`),
  INDEX `plan_entitlements_key_idx` (`key`),
  CONSTRAINT `plan_entitlements_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `pricing_plans`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_subscriptions` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `currentPeriodStart` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `currentPeriodEnd` DATETIME(3) NULL,
  `cancelAt` DATETIME(3) NULL,
  `canceledAt` DATETIME(3) NULL,
  `autoRenew` BOOLEAN NOT NULL DEFAULT false,
  `seats` INTEGER NOT NULL DEFAULT 1,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `organization_subscriptions_organizationId_idx` (`organizationId`),
  INDEX `organization_subscriptions_planId_idx` (`planId`),
  INDEX `organization_subscriptions_status_idx` (`status`),
  CONSTRAINT `organization_subscriptions_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `pricing_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_orders` (
  `id` VARCHAR(191) NOT NULL,
  `orderNo` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `subscriptionId` VARCHAR(191) NULL,
  `planId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'subscription',
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `amount` DECIMAL(18,6) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
  `paidAt` DATETIME(3) NULL,
  `externalOrderId` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `billing_orders_orderNo_key` (`orderNo`),
  INDEX `billing_orders_organizationId_idx` (`organizationId`),
  INDEX `billing_orders_subscriptionId_idx` (`subscriptionId`),
  INDEX `billing_orders_planId_idx` (`planId`),
  INDEX `billing_orders_status_idx` (`status`),
  INDEX `billing_orders_createdAt_idx` (`createdAt`),
  CONSTRAINT `billing_orders_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `billing_orders_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `organization_subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `billing_orders_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `pricing_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_invoices` (
  `id` VARCHAR(191) NOT NULL,
  `invoiceNo` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `taxNo` VARCHAR(191) NULL,
  `amount` DECIMAL(18,6) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `issuedAt` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `billing_invoices_invoiceNo_key` (`invoiceNo`),
  UNIQUE INDEX `billing_invoices_orderId_key` (`orderId`),
  INDEX `billing_invoices_organizationId_idx` (`organizationId`),
  INDEX `billing_invoices_status_idx` (`status`),
  CONSTRAINT `billing_invoices_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `billing_invoices_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `billing_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `organization_invitations` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL DEFAULT 'member',
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `invitedById` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `organization_invitations_organizationId_idx` (`organizationId`),
  INDEX `organization_invitations_email_idx` (`email`),
  INDEX `organization_invitations_status_idx` (`status`),
  CONSTRAINT `organization_invitations_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_invitations_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `enterprise_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NULL,
  `summary` TEXT NULL,
  `details` JSON NULL,
  `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `enterprise_audit_logs_organizationId_idx` (`organizationId`),
  INDEX `enterprise_audit_logs_actorId_idx` (`actorId`),
  INDEX `enterprise_audit_logs_action_idx` (`action`),
  INDEX `enterprise_audit_logs_targetType_targetId_idx` (`targetType`, `targetId`),
  INDEX `enterprise_audit_logs_createdAt_idx` (`createdAt`),
  CONSTRAINT `enterprise_audit_logs_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `enterprise_audit_logs_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `organizations` ADD CONSTRAINT `organizations_currentPlanId_fkey` FOREIGN KEY (`currentPlanId`) REFERENCES `pricing_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `pricing_plans` (`id`, `code`, `name`, `description`, `status`, `billingCycle`, `price`, `currency`, `sortOrder`, `isPublic`, `createdAt`, `updatedAt`)
VALUES ('plan_free_default', 'free', 'Free', 'Default compatibility plan', 'active', 'monthly', 0, 'CNY', 0, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `plan_entitlements` (`id`, `planId`, `key`, `value`, `description`, `createdAt`, `updatedAt`) VALUES
('ent_free_member_limit', 'plan_free_default', 'memberLimit', CAST('3' AS JSON), 'Free member limit', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('ent_free_monthly_credits', 'plan_free_default', 'monthlyCredits', CAST('0' AS JSON), 'Free monthly credits', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
('ent_free_allow_overage', 'plan_free_default', 'allowOverage', CAST('true' AS JSON), 'Allow balance overage', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

UPDATE `organizations` SET `currentPlanId` = 'plan_free_default' WHERE `currentPlanId` IS NULL;
