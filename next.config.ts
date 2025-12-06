import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.are.na',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'd2w9rnfcy7mm78.cloudfront.net',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
