-- The field originally shipped with an ad-hoc idempotent upgrade script.
-- Keep this migration idempotent so databases that already ran that script
-- can enter the normal Prisma migration path without a duplicate-column error.
SET @video_model_column_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'novel_promotion_panels'
    AND `COLUMN_NAME` = 'videoModel'
);

SET @add_video_model_sql = IF(
  @video_model_column_exists = 0,
  'ALTER TABLE `novel_promotion_panels` ADD COLUMN `videoModel` VARCHAR(191) NULL',
  'SELECT 1'
);

PREPARE add_video_model_statement FROM @add_video_model_sql;
EXECUTE add_video_model_statement;
DEALLOCATE PREPARE add_video_model_statement;
