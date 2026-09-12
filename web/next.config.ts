import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "display-filename-rapids-alberta.trycloudflare.com",
    "*.trycloudflare.com",
    "localhost:8080",
    "localhost:3000",
    "127.0.0.1:8080",
    "127.0.0.1:3000",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
