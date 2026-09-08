import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this project so the dev file-watcher never walks
  // up toward the drive root.
  outputFileTracingRoot: __dirname,
  webpack: (config, { dev }) => {
    if (dev) {
      // Windows: the on-disk webpack pack cache can deserialize as a broken
      // module map (`__webpack_modules__[moduleId] is not a function`) after
      // the server is killed mid-compile. Keep the cache in memory instead.
      config.cache = { type: "memory" };
      // Windows: the dev file-watcher (Watchpack) can wander to C:\ and fail to
      // lstat locked system files (pagefile.sys, swapfile.sys, hiberfil.sys,
      // DumpStack.log.tmp), flooding the console with EINVAL errors. Tell it to
      // ignore those + the usual heavy directories.
      config.watchOptions = {
        ...config.watchOptions,
        ignored:
          /(?:^|[\\/])(?:node_modules|\.next|\.git)(?:[\\/]|$)|(?:pagefile|swapfile|hiberfil)\.sys|DumpStack\.log\.tmp/i,
      };
    }
    return config;
  },
};

export default nextConfig;
