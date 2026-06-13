import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本地开发：前端用相对地址 /api/v1，开发服务器把 /api 代理到后端，
// 与生产环境（nginx / Render rewrite）保持一致，避免跨域与 404。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
