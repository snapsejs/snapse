// Strips comments from every tracked .ts file, counts the remaining bytes, and
// reports what share of those bytes lives in *.test.ts files.
//
// Usage: node scripts/testByteShare.mjs [--verbose]

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const verbose = process.argv.includes('--verbose')

const files = execFileSync('git', ['ls-files', '*.ts'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)

/**
 * Returns `source` with every comment token removed, leaving all other bytes
 * (whitespace included) untouched. Uses the TypeScript scanner so that `//` and
 * `/*` sequences inside string, template and regex literals are not mistaken
 * for comments.
 */
function stripComments(source) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    source,
  )

  let out = ''
  let prevSignificant = ts.SyntaxKind.Unknown

  for (;;) {
    let token = scanner.scan()
    if (token === ts.SyntaxKind.EndOfFileToken) break

    // Decide whether a `/` opens a regex literal rather than a division
    // operator. If it does, the scanner would otherwise tokenize the leading
    // `/` as SlashToken and could read `//` inside the pattern as a comment.
    if (
      (token === ts.SyntaxKind.SlashToken
        || token === ts.SyntaxKind.SlashEqualsToken)
      && regexAllowedAfter(prevSignificant)
    ) {
      token = scanner.reScanSlashToken()
    }

    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia
      && token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out += scanner.getTokenText()
    }

    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia
      && token !== ts.SyntaxKind.MultiLineCommentTrivia
      && token !== ts.SyntaxKind.WhitespaceTrivia
      && token !== ts.SyntaxKind.NewLineTrivia
    ) {
      prevSignificant = token
    }
  }

  return out
}

/**
 * True when a `/` following a token of `kind` must begin a regex literal (the
 * preceding token cannot terminate an expression).
 */
function regexAllowedAfter(kind) {
  switch (kind) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.CloseParenToken:
    case ts.SyntaxKind.CloseBracketToken:
    case ts.SyntaxKind.CloseBraceToken:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.SuperKeyword:
      return false
    default:
      return true
  }
}

let totalBytes = 0
let testBytes = 0

for (const file of files) {
  const stripped = stripComments(readFileSync(file, 'utf8'))
  const bytes = Buffer.byteLength(stripped, 'utf8')
  totalBytes += bytes
  if (file.endsWith('.test.ts')) testBytes += bytes
  if (verbose) console.log(`${bytes}\t${file}`)
}

const pct = totalBytes === 0 ? 0 : (testBytes / totalBytes) * 100

console.log(`comment-stripped bytes (all .ts):   ${totalBytes}`)
console.log(`comment-stripped bytes (.test.ts):  ${testBytes}`)
console.log(`.test.ts share:                      ${pct.toFixed(2)}%`)
