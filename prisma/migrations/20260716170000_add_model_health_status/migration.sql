CREATE TABLE `model_health_statuses` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `modelKey` VARCHAR(512) NOT NULL,
    `modelKeyHash` CHAR(64) NOT NULL,
    `modelId` VARCHAR(255) NOT NULL,
    `modelType` VARCHAR(32) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `checkLevel` VARCHAR(32) NOT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    `latencyMs` INTEGER NULL,
    `errorCode` VARCHAR(64) NULL,
    `message` VARCHAR(500) NULL,
    `protocol` VARCHAR(32) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `model_health_statuses_userId_providerId_idx`(`userId`, `providerId`),
    UNIQUE INDEX `model_health_status_user_provider_model_hash`(`userId`, `providerId`, `modelKeyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `model_health_statuses`
    ADD CONSTRAINT `model_health_statuses_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
