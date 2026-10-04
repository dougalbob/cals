#!/usr/bin/env node
/**
 * Check every relative link and heading anchor in the documentation.
 *
 * WHY THIS EXISTS
 * The documents under `docs/` cross-reference each other constantly ("see
 * decisions 55–58", "see the pre-publish checklist"), and a rename that misses
 * one anchor sends the next session — or the owner — to a dead page. The
 * pre-publish checklist asks for "no stale claims"; this is the mechanical part
 * of that, so it can be run instead of trusted to a careful read.
 *
 * WHAT IT CHECKS
 *   * every relative link target in a Markdown file exists;
 *   * every `#anchor` in a link matches a real heading, using GitHub's rule
 *     (lower-case, drop punctuation, each space becomes a hyphen);
 *   * no link escapes the repository.
 * Absolute URLs are not fetched — this is offline and deterministic.
 *
 * USAGE
 *   node scripts/check-doc-links.mjs      # exits non-zero on a problem
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const skip = new Set(['node_modules', '.git', 'dist', 'preview', 'test-results', 'playwright-report'])

function markdownFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full))
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}

/** GitHub's heading-to-anchor rule. */
function anchorFor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/ /g, '-')
}

const files = markdownFiles(root)
const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]))
const problems = []

for (const [file, text] of sources) {
  const headings = new Set(
    [...text.matchAll(/^#{1,6}\s+.*$/gm)].map((match) =>
      anchorFor(match[0].replace(/^#+\s*/, '')),
    ),
  )

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const target = match[1]
    if (/^(https?:|mailto:)/.test(target)) continue

    const [pathPart, fragment] = target.split('#')
    const resolved = pathPart ? resolve(dirname(file), pathPart) : file
    const shown = relative(root, file)

    if (!resolved.startsWith(root)) {
      problems.push(`${shown}: link escapes the repository — ${target}`)
      continue
    }
    if (pathPart && !statSync(resolved, { throwIfNoEntry: false })) {
      problems.push(`${shown}: target does not exist — ${target}`)
      continue
    }
    if (fragment) {
      const targetHeadings =
        resolved === file
          ? headings
          : new Set(
              [...(sources.get(resolved) ?? readFileSync(resolved, 'utf8')).matchAll(/^#{1,6}\s+.*$/gm)].map(
                (entry) => anchorFor(entry[0].replace(/^#+\s*/, '')),
              ),
            )
      if (!targetHeadings.has(fragment)) {
        problems.push(`${shown}: no heading matches #${fragment} — ${target}`)
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Documentation links: ${problems.length} problem(s)\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`Documentation links: ${files.length} files, no broken links or anchors.`)
