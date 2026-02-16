/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Desativar o image optimizer para permitir exportação estática
  images: {
    unoptimized: true
  },
  // Configurar output file tracing para incluir arquivos WASM do tiktoken
  experimental: {
    outputFileTracingIncludes: {
      '/api': ['./node_modules/tiktoken/**/*'],
    },
  },
  webpack(config, { isServer }) {
    config.experiments = {
      asyncWebAssembly: true,
      layers: true,
    };

    // Configuração para incluir arquivos WASM no bundle do servidor
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'tiktoken': require.resolve('tiktoken'),
      };
    }

    return config;
  },
};

module.exports = nextConfig;
