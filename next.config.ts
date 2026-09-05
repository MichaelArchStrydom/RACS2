import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.1.103',
    '192.168.1.136',
    '172.20.10.4',
    '172.20.10.10',
    '*.ngrok-free.dev',
    '*.ngrok-free.app',
    '100.85.152.114',
    '100.86.73.75',
    '172.20.10.2'
  ],
};

export default nextConfig;
