import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    {
      "*": "./src/*.ts",
      "codecs/*": "./src/codecs/*.ts",
      "adapters/*": "./src/adapters/*.ts",
      "utils/*": "./src/utils/*.ts",
    }
  ],
  dts: true,
  clean: true,
  outDir: "dist",
  target: "es2025",
  sourcemap: true,
  minify: false,
  format: ['esm']
});
