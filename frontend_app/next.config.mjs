/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Allows production builds to successfully complete even if your project has ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Optionally ignore type errors to prevent build interruptions
    ignoreBuildErrors: true,
  },
};

export default nextConfig;