// `process.env.NODE_ENV` is replaced at build time by vite's `define`, so it must appear verbatim.
// A module-scoped ambient type lets both the main tsc and the declaration build resolve `process`
// without depending on @types/node being in scope (the dts program does not include it).
declare const process: { env: { NODE_ENV?: string } }

export const DEV = process.env.NODE_ENV !== 'production'
