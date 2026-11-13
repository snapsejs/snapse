import { dirname, relative, resolve } from 'path'
import { defineConfig } from 'vitest/config'
import dts from 'vite-plugin-dts'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const ccBuild = process.env.CC_BUILD === 'true'
  const ccPrebuild = process.env.CC_PREBUILD === 'true'
  const root = resolve(import.meta.dirname, '..')

  return {
    root,
    plugins: [
      !isDev && !ccPrebuild && dts({
        include: ['src'],
        entryRoot: 'src',
        compilerOptions: { rootDir: 'src' },
        exclude: [
          'src/**/*.test.ts',
          'src/**/functionalTests/**',
          'src/**/internalTests/**',
          'src/common/test/**',
          'src/undo/benchmarks/**',
          'src/snapseAll.ts',
        ],
        // For a `@/*`-aliased import, the plugin emits a path relative to the *source*
        // file's location under src/ (e.g. `../../../../src/state/types/types.js`)
        // instead of relative to the *declaration* file's location under dist/ - the
        // shipped .d.ts then points at a directory that doesn't exist once installed
        // as a package (only dist/ ships, not src/). The broken segment always has the
        // form `(../)+src/<path>`, where `<path>` already matches the correct location
        // relative to dist/'s own root, so rewrite the prefix to match instead.
        beforeWriteFile: (filePath, content) => {
          const toDistRoot = relative(dirname(filePath), resolve(root, 'dist'))
          const prefix = toDistRoot ? `${toDistRoot.replace(/\\/g, '/')}/` : './'
          const fixed = content.replace(/(?:\.\.\/)+src\//g, prefix)
          return fixed === content ? undefined : { content: fixed }
        },
      }),
      !isDev && {
        name: 'strip-region-comments',
        enforce: 'post' as const,
        renderChunk(code: string) {
          return code.replace(/\/\/#(end)?region[^\n]*\n?/g, '')
        },
      },
      !isDev && {
        name: 'strip-symbol-descriptions',
        enforce: 'post' as const,
        renderChunk(code: string) {
          return code.replace(/Symbol\(["'][^"']*["']\)/g, 'Symbol()')
        },
      },
    ],
    resolve: {
      tsconfigPaths: true,
      alias: ccBuild
        ? [
            ...Object.entries({
              '@/index.js': 'dist/snapse.js',
              '@/server.js': 'dist/snapse.js',
              '@/DOM/elements/DOMElements.js': 'dist/snapse.js',
              '@/DOM/elements/SVGElements.js': 'dist/snapse.SVG.js',
              '@/snapseAll.js': 'dist/snapse.js',
              '@/undo/undo.js': 'dist/snapse.js',
            }).map(([find, file]) => ({ find, replacement: resolve(root, file) })),
            // Package imports too (dist/snapse.SVG.js imports the core by name), so all share one instance
            ...Object.entries({
              snapse: 'dist/snapse.js',
              'snapse/DOM': 'dist/snapse.js',
              'snapse/SVG': 'dist/snapse.SVG.js',
              'snapse/server': 'dist/snapse.js',
            }).map(([name, file]) => ({ find: new RegExp(`^${name}$`), replacement: resolve(root, file) })),
          ]
        : undefined,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
      },
    },
    test: {
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/functionalTests/**',
          'src/**/internalTests/**',
          'src/common/test/**',
          'src/undo/benchmarks/**',
          'src/snapseAll.ts',
        ],
      },
    },
    build: {
      minify: !isDev && !ccPrebuild,
      sourcemap: isDev,
      emptyOutDir: false,
      copyPublicDir: false,
      lib: {
        entry: (ccPrebuild
          ? { 'snapse.cc.input': resolve(root, 'src/snapseAll.ts') }
          : {
              snapse: resolve(root, 'src/index.ts'),
              'snapse.DOM': resolve(root, 'src/DOM.ts'),
              'snapse.SVG': resolve(root, 'src/SVG.ts'),
              'snapse.server': resolve(root, 'src/server.ts'),
            }) as Record<string, string>,
        name: 'snapse',
        fileName: (format, entryName) => {
          const ext = format === 'es' ? 'js' : format
          return isDev ? `${entryName}.development.${ext}` : `${entryName}.${ext}`
        },
        formats: ccPrebuild ? ['es'] : isDev ? ['es', 'cjs'] : ['cjs'],
      },
      rollupOptions: {
        output: {
          manualChunks: ccPrebuild
            ? undefined
            : id => {
              if (id.startsWith(resolve(root, 'src'))) {
                return 'snapseCore'
              }
            },
        },
      },
    },
  }
})
