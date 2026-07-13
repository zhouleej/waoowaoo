# Debug Session: minio-resource-not-found

- 状态：OPEN
- 症状：MaaS Seedance 上游拒绝 `content[1].image_url`，错误为 `resource not found`；Python 适配层返回 502，Next Worker 显示未返回 task id。
- 目标：确认预签名 URL 的路径、签名、可访问性及对象是否存在，不修改业务逻辑直到取得运行时证据。

## 可证伪假设

1. 预签名 URL 指向的 bucket/key 不存在，或数据库中的旧 `panel.imageUrl` 来自 local provider。
2. `oss.pfree.top` 反向代理未把 `/wakuwaku/<key>` 正确转发到 MinIO S3 API，导致公网 GET 返回 404。
3. `MINIO_FORCE_PATH_STYLE=true` 生成的路径风格与公网网关要求不一致。
4. URL 在 Node 到 Python/上游传递过程中被截断、转义或查询参数丢失，导致签名 URL 无效。
5. 对象存在且 URL 完整，但云端 Seedance 抓取环境无法访问该资源，或签名有效期/时间偏差导致抓取失败。

## 当前证据

- 私有 hostname 错误已经消失，说明公网 hostname 配置已生效。
- 当前上游错误发生在资源抓取阶段：`content[1].image_url ... resource not found`。
- Next 的 `did not return task id` 是 Python 返回 502 后的二次包装，不是根因。

## 运行时证据

- 失败 panel：`c392f0f5-93c3-4458-963e-514ed61cc0bc`。
- 数据库 `imageUrl` key：`images/panel-candidate-c392f0f5-93c3-4458-963e-514ed61cc0bc-0-1783932874462-ujmw6q.jpg`。
- 使用当前 MinIO provider 直接 `GetObject`：失败，`The specified key does not exist.`。
- 使用当前配置生成公网预签名 URL：host=`oss.pfree.top`，path=`/wakuwaku/images/...jpg`，签名参数完整。
- 本机请求该预签名 URL：HTTP 404，`content-type=application/xml`。
- 同一个 key 在旧 local provider 目录中存在：`data/uploads/images/...jpg`，大小 3,349,591 bytes。

## 假设判定

1. **确认**：数据库中的图片 key 是此前 `STORAGE_TYPE=local` 时产生的旧数据，文件只在本地磁盘，不在 MinIO。
2. 暂无证据支持反向代理路径错误；当前 404 与 MinIO 直接 `GetObject` 的 NoSuchKey 一致。
3. 暂无证据支持 path style 不匹配。
4. 查询参数完整，且在到达 Python 前 hostname 问题已修复；不是当前首要根因。
5. 已排除为首要根因：本机和 MinIO SDK 均确认对象不存在，无需依赖云端抓取环境解释。

## 根因

运行时从 local provider 切换到 MinIO 后，数据库仍保存 provider 无关的对象 key，但旧文件没有迁移到 MinIO。视频 Worker 使用当前 MinIO provider 为这个旧 key 生成了格式正确但指向不存在对象的预签名 URL，上游因此返回 `resource not found`。

## 最小处理方式

- 对当前 panel 重新生成图片，使新图片直接上传 MinIO；再生成视频。
- 若需保留历史图片，则把 `data/uploads` 中数据库仍引用的文件按相同 key 批量迁移到 MinIO bucket `wakuwaku`。
