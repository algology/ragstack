import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // Required for react-pdf to work properly
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    
    // Handle PDF.js worker files
    config.module.rules.push({
      test: /\.pdf$/,
      use: "file-loader",
    });
    
    // PDF.js worker is now served from public directory
    
    return config;
  },
  // No external CDN needed for PDF.js worker anymore
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
