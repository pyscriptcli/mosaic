import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  async rewrites() {
    return [{ source: "/projects/:path*", destination: "/" }];
  },
  async redirects() {
    return [
      { source: "/business-analysis", destination: "/it-projects", permanent: true },
      { source: "/business-analysis/:path*", destination: "/it-projects/:path*", permanent: true },
      { source: "/ba", destination: "/it-projects", permanent: true },
      { source: "/ba/:path*", destination: "/it-projects/:path*", permanent: true },
    ];
  },
};
export default nextConfig;
