const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages from source for hot reloading
  transpilePackages: ['@hhopkins/agent-client'],

  webpack: (config) => {
    // Resolve workspace packages to their source for hot reloading
    config.resolve.alias['@hhopkins/agent-client'] = path.resolve(
      __dirname,
      '../../runtime/client/src'
    );
    return config;
  },
};

module.exports = nextConfig;
