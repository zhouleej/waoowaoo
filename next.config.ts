import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

const nextConfig: NextConfig = {
  devIndicators: false,
  // 已删除 ignoreBuildErrors / ignoreDuringBuilds，构建保持严格门禁
  // Next 15 的 allowedDevOrigins 是顶层配置，不属于 experimental
  allowedDevOrigins: [
    'http://192.168.31.218:3000',
    'http://192.168.31.*:3000',
  ],
  // 生产构建内存优化：185+ API routes + 重型依赖(@remotion/@aws-sdk/prisma)
  // 导致 webpack 编译峰值超 8GB，通过以下配置降低内存占用
  experimental: {
    // 优化大型依赖的包导入，减少 webpack 模块图规模
    optimizePackageImports: [
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      '@remotion/player',
      'lucide-react',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
    ],
  },
  // 将重型原生依赖标记为外部包，避免 webpack 打包分析其内部模块
  serverExternalPackages: [
    '@remotion/cli',
    '@remotion/renderer',
    '@remotion/compositor-win32-x64-msvc',
    'sharp',
    'archiver',
    'mammoth',
    'jszip',
    'mysql2',
    'bullmq',
    'ioredis',
    'cos-nodejs-sdk-v5',
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
      };
    }
    // 服务端构建：关闭持久化缓存以降低内存峰值
    if (isServer) {
      config.cache = false;
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
