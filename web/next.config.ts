import type { NextConfig } from "next";

const API = process.env.CANCERLIKE_API ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/api/:path*`}];
  },
};

export default nextConfig;
