#!/usr/bin/env node
/**
 * Print a short, copy-pasteable failure summary from Playwright's JSON report.
 *
 * WHY THIS EXISTS
 * A red browser job used to mean opening the Actions log (or asking someone to
 * paste it) to find out what broke. The full report is still uploaded as an
 * artifact, but this puts the failing test titles, the first line of each
 * error and the artifact paths straight into the job log and the run summary.
 *
 * Usage: node e2e/summarise-results.mjs [path/to/results.json]
 * Never fails the build: a missing or malformed report is reported, not thrown.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const reportPath = process.argv[2] ?? 'test-results/results.json'

if (!existsSync(reportPath)) {
  console.log(`[e2e summary] no JSON report at ${reportPath} (did the run start?)`)
  process.exit(0)
}

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (error) {
  console.log(`[e2e summary] could not parse ${reportPath}: ${error.message}`)
  process.exit(0)
}

/** Playwright nests suites; collect every spec with its project name. */
function collect(suite, projectName, out = []) {
  const project = suite.projectName ?? projectName ?? suite.title
  for (const spec of suite.specs ?? []) {
    out.push({ project: project ?? 'default', ...spec })
  }
  for (const child of suite.suites ?? []) collect(child, project, out)
  return out
}

const specs = (report.suites ?? []).flatMap((suite) => collect(suite))

const failed = []
for (const spec of specs) {
  const results = spec.tests ?? []
  for (const test of results) {
    const attempts = test.results ?? []
    const last = attempts[attempts.length - 1]
    if (!last) continue
    if (last.status === 'passed' || last.status === 'skipped') continue
    const firstLine = (last.error?.message ?? last.error?.value ?? 'unknown error')
      .split('\n')[0]
      .trim()
    failed.push({
      project: test.projectName ?? spec.project,
      title: `${spec.title}${test.title && test.title !== spec.title ? ` — ${test.title}` : ''}`,
      file: spec.file ?? 'unknown file',
      status: last.status,
      error: firstLine.slice(0, 300),
      attachments: (last.attachments ?? []).map((a) => a.path ?? a.name).filter(Boolean),
    })
  }
}

if (failed.length === 0) {
  console.log(`[e2e summary] no failures in ${reportPath} (${specs.length} spec file entries)`)
  process.exit(0)
}

const lines = [`### Playwright failures (${failed.length})`, '']
for (const failure of failed) {
  lines.push(`- **${failure.project}** · \`${failure.file}\` › ${failure.title} (${failure.status})`)
  if (failure.error) lines.push(`  - ${failure.error}`)
  if (failure.attachments.length > 0) {
    lines.push(`  - artifacts: ${failure.attachments.join(', ')}`)
  }
}
lines.push('', 'Full report: the `playwright-report` and `test-results` artifacts on this run.')

const summary = lines.join('\n')
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}
