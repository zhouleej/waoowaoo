CREATE TABLE `inspiration_video_workspaces` (
  `id` VARCHAR(191) NOT NULL,
  `scopeKey` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `inspiration_video_workspaces_scopeKey_key` (`scopeKey`),
  UNIQUE INDEX `inspiration_video_workspaces_projectId_key` (`projectId`),
  CONSTRAINT `inspiration_video_workspaces_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspiration_video_creations` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `prompt` TEXT NOT NULL,
  `modelKey` VARCHAR(191) NOT NULL,
  `aspectRatio` VARCHAR(191) NOT NULL DEFAULT '16:9',
  `resolution` VARCHAR(191) NOT NULL DEFAULT '720p',
  `duration` INTEGER NOT NULL DEFAULT 5,
  `generateAudio` BOOLEAN NOT NULL DEFAULT true,
  `taskId` VARCHAR(191) NULL,
  `outputVideoKey` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `inspiration_video_creations_taskId_key` (`taskId`),
  INDEX `inspiration_video_creations_workspaceId_createdAt_idx` (`workspaceId`, `createdAt`),
  CONSTRAINT `inspiration_video_creations_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `inspiration_video_workspaces`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspiration_video_assets` (
  `id` VARCHAR(191) NOT NULL,
  `creationId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `storageKey` TEXT NOT NULL,
  `originalName` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `inspiration_video_assets_creationId_kind_sortOrder_idx` (`creationId`, `kind`, `sortOrder`),
  CONSTRAINT `inspiration_video_assets_creationId_fkey`
    FOREIGN KEY (`creationId`) REFERENCES `inspiration_video_creations`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
