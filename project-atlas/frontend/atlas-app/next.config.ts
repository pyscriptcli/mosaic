import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  async headers() {
    const parents = (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || 'https://project-echo-next.vercel.app,http://localhost:3100,http://localhost:3101')
      .split(',').map((origin) => origin.trim()).filter((origin) => /^https?:\/\//.test(origin));
    return [{
      source: '/embed/gis',
      headers: [
        { key: 'Content-Security-Policy', value: `frame-ancestors 'self' ${parents.join(' ')}` },
        { key: 'Referrer-Policy', value: 'strict-origin' },
      ],
    }];
  },
  webpack: (config) => {
    // Enable WebAssembly or binary handling if needed
    return config;
  },
};

export default nextConfig;
