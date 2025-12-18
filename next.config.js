/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Desativar o image optimizer para permitir exportação estática
  images: {
    unoptimized: true
  },
  webpack(config) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
};

module.exports = nextConfig;
