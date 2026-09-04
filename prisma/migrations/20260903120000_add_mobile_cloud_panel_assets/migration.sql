ALTER TABLE `novel_promotion_panels`
  ADD COLUMN `mobileCloudAssetId` VARCHAR(191) NULL,
  ADD COLUMN `mobileCloudAssetSourceUrl` TEXT NULL,
  ADD COLUMN `mobileCloudAssetGroupId` VARCHAR(191) NULL,
  ADD COLUMN `mobileCloudAssetStatus` VARCHAR(191) NULL,
  ADD COLUMN `mobileCloudAssetSyncedAt` DATETIME(3) NULL;

CREATE INDEX `novel_promotion_panels_mobileCloudAssetId_idx`
  ON `novel_promotion_panels`(`mobileCloudAssetId`);
