-- Preconditions checked before deployment: existing projects.userId values reference user.id;
-- projects.organizationId values reference organizations.id; no destructive reset is required.
-- MySQL cannot drop and recreate a foreign key under the same name in one ALTER statement.
ALTER TABLE `projects`
  DROP FOREIGN KEY `projects_userId_fkey`,
  DROP FOREIGN KEY `projects_organizationId_fkey`;

ALTER TABLE `projects`
  MODIFY `userId` VARCHAR(191) NULL;

ALTER TABLE `projects`
  ADD CONSTRAINT `projects_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `user`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `projects_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
