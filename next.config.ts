import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.103', '172.20.10.4', '*.ngrok-free.dev', '*.ngrok-free.app'],
};

export default nextConfig;
