import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.are.na',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
