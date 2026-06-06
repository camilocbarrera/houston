import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The @upstash/box SDK is a Node package used only in server route handlers;
  // keep it external so Next doesn't try to bundle it into the client.
  serverExternalPackages: ["@upstash/box"],
};

export default nextConfig;
