import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The @upstash/box SDK is a Node package used only in server route handlers;
  // keep it external so Next doesn't try to bundle it into the client.
  serverExternalPackages: ["@upstash/box"],
  // Workspace UI packages ship raw TS/TSX (no build step), so Next must
  // transpile them — same components the desktop app uses.
  transpilePackages: ["@houston-ai/chat", "@houston-ai/core"],
};

export default nextConfig;
