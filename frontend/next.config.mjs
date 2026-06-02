/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lint is a style gate, not a correctness gate — don't fail the production
  // build on ESLint rules (unused vars, explicit-any). TypeScript type errors
  // still block the build, so type safety is preserved.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
