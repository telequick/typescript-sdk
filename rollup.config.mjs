import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/client.ts',
  output: [
    {
      file: 'dist/client.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    }
  ],
  external: [
    'jsonwebtoken',
    'ws',
    'fs',
    '@fails-components/webtransport',
    '@fails-components/webtransport-transport-http3-quiche'
  ],
  plugins: [
    resolve(),
    commonjs(),
    typescript({ 
      tsconfig: './tsconfig.json', 
      compilerOptions: { outDir: null, declarationDir: "dist" } 
    }),
  ]
};
