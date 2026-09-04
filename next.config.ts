import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloud Run runs the app from a slim runtime image; standalone output ships
  // only the server and the files it actually needs.
  output: "standalone",
  reactStrictMode: true,
  devIndicators: false,
  logging: {
    fetches: { fullUrl: false },
  },
};

export default nextConfig;
