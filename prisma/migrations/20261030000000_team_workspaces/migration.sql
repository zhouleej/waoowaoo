-- AlterTable
ALTER TABLE `character_appearances` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `location_images` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_characters` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_locations` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_episodes` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `video_editor_projects` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_clips` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_panels` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_projects` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_shots` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `novel_promotion_storyboards` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `billingSource` VARCHAR(191) NOT NULL DEFAULT 'platform_balance',
    ADD COLUMN `currentModelConfigId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `organization_invitations` ADD COLUMN `activeInviteKey` VARCHAR(191) NULL,
    ADD COLUMN `inviteeUserId` VARCHAR(191) NULL,
    ADD COLUMN `rejectedAt` DATETIME(3) NULL,
    MODIFY `email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `novel_promotion_voice_lines` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `tasks` ADD COLUMN `modelConfigVersionId` VARCHAR(191) NULL,
    ADD COLUMN `targetRevision` INTEGER NULL;

-- AlterTable
ALTER TABLE `global_asset_folders` ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `custom_art_styles` ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `global_characters` ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `global_character_appearances` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `global_locations` ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `global_location_images` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `global_voices` ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `organization_model_config_versions` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `providers` LONGTEXT NOT NULL,
    `models` LONGTEXT NOT NULL,
    `defaults` JSON NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `organization_model_config_versions_organizationId_version_key`(`organizationId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_budget_periods` (
    `id` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `spent` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `reserved` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organization_budget_periods_organizationId_userId_period_key`(`organizationId`, `userId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_budget_reservations` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `periodId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `committed` DECIMAL(18, 6) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'reserved',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organization_budget_reservations_taskId_key`(`taskId`),
    INDEX `organization_budget_reservations_organizationId_userId_idx`(`organizationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_usage_records` (
    `id` VARCHAR(191) NOT NULL,
    `callKey` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `period` VARCHAR(7) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `modelConfigVersionId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(18, 6) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `organization_usage_records_callKey_key`(`callKey`),
    INDEX `organization_usage_records_organizationId_period_userId_idx`(`organizationId`, `period`, `userId`),
    INDEX `organization_usage_records_taskId_idx`(`taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_scope_grants` (
    `id` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `media_scope_grants_scopeKey_idx`(`scopeKey`),
    UNIQUE INDEX `media_scope_grants_mediaId_scopeKey_key`(`mediaId`, `scopeKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `organization_invitations_activeInviteKey_key` ON `organization_invitations`(`activeInviteKey`);

-- CreateIndex
CREATE INDEX `global_asset_folders_organizationId_idx` ON `global_asset_folders`(`organizationId`);

-- CreateIndex
CREATE INDEX `custom_art_styles_organizationId_idx` ON `custom_art_styles`(`organizationId`);

-- CreateIndex
CREATE INDEX `global_characters_organizationId_idx` ON `global_characters`(`organizationId`);

-- CreateIndex
CREATE INDEX `global_locations_organizationId_idx` ON `global_locations`(`organizationId`);

-- CreateIndex
CREATE INDEX `global_voices_organizationId_idx` ON `global_voices`(`organizationId`);
