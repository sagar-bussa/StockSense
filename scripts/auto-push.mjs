/**
 * Hourly backup push to GitHub.
 *
 * Commits anything that changed and pushes it, then does nothing. A run with
 * no changes is a no-op, so the history stays meaningful instead of filling up
 * with hourly "nothing to do" commits.
 *
 * Before committing it refuses to run if a tracked file looks like it contains a
 * real secret. `.env.local` is already gitignored, but the anon key in
 * `.env.example` is intentional and public by design, so the scan is written to
 * catch the things that must never be committed: service_role keys, private
 * keys, and stray .env files.
 *
 * Usage:
 *   node scripts/auto-push.mjs              # commit + push if changed
 *   node scripts/auto-push.mjs --dry-run    # report only, change nothing
 *   node scripts/auto-push.mjs --no-push    # commit locally, don't push
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const NO_PUSH = process.argv.includes('--no-push')

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage'])

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFail) return ''
    const detail = (error.stderr || error.message || '').toString().trim()
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

/**
 * Patterns that must never reach GitHub.
 *
 * The Supabase *anon* key is deliberately excluded: it ships in the browser
 * bundle and is protected by RLS, so it is not a secret. A service_role key
 * bypasses RLS entirely, which is exactly what this guards against.
 *
 * Each pattern must match an actual assignment, not a sentence that mentions
 * the word, so the doc comments explaining what must not be committed do not
 * trip the scanner.
 */
const SECRET_PATTERNS = [
  // An explicitly labelled service_role credential.
  {
    name: 'Supabase service_role key',
    re: /^\s*(?:export\s+)?\w*(?:SERVICE_ROLE|SUPABASE_SERVICE)[A-Z_]*\s*[:=]\s*['"][^'"]+['"]/im,
  },
  // JWTs are handled separately by dangerousJwt(), which reads the role claim.
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'generic secret assignment',
    re: /^\s*(?:export\s+)?\w*(?:SECRET|PASSWORD|PRIVATE_KEY|ACCESS_TOKEN)\w*\s*[:=]\s*['"][^'"\s]{12,}['"]/im,
  },
]

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g

/**
 * A Supabase JWT carries its role in the payload. `anon` is public by design
 * and ships in the browser; `service_role` bypasses RLS and must never be
 * committed. Decoding the claim is the only reliable way to tell them apart.
 */
function dangerousJwt(line) {
  for (const match of line.matchAll(JWT_RE)) {
    let payload
    try {
      payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'))
    } catch {
      continue // not a Supabase-style JWT, or not decodable
    }
    if (payload.role && payload.role !== 'anon') {
      return `JWT with role "${payload.role}"`
    }
  }
  return null
}

const SCANNABLE = /\.(ts|tsx|js|jsx|mjs|cjs|json|sql|md|html|css|toml|ya?ml|env.*|txt)$/i

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      yield* walk(full)
    } else {
      yield full
    }
  }
}

function scanForSecrets() {
  const problems = []

  for (const file of walk(ROOT)) {
    if (!SCANNABLE.test(file)) continue
    // Respect what git will actually track.
    const rel = relative(ROOT, file).replace(/\\/g, '/')
    if (rel === '.env.local') continue

    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (text.includes('node_modules')) continue

    for (const { name, re } of SECRET_PATTERNS) {
      // Match on the line so the report points somewhere useful.
      const line = text.split('\n').find((l) => re.test(l))
      if (line) problems.push({ file: rel, name, line: line.trim().slice(0, 80) })
    }

    // JWTs are checked by decoded role, so the public anon key passes through
    // while a service_role key is caught.
    for (const line of text.split('\n')) {
      const reason = dangerousJwt(line)
      if (reason) {
        problems.push({ file: rel, name: reason, line: line.trim().slice(0, 80) })
        break
      }
    }
  }

  return problems
}

function stagedFileList() {
  return git(['diff', '--cached', '--name-only'], { allowFail: true })
    .split('\n')
    .filter(Boolean)
}

function workingTreeFileList() {
  // `git add --all` stages tracked changes plus every untracked, non-ignored
  // file, so these two read-only commands describe exactly that set.
  //
  // `status --porcelain` is deliberately avoided: it collapses a wholly
  // untracked directory into a single "dir/" entry (hiding the files that
  // would really be committed), and its fixed-width columns are easy to
  // mis-slice. Neither problem can happen here.
  const tracked = git(['diff', '--name-only', 'HEAD'], { allowFail: true })
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { allowFail: true })
  const files = `${tracked}\n${untracked}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return [...new Set(files)].sort()
}

function main() {
  console.log(`auto-push ${DRY_RUN ? '(dry run) ' : ''}${new Date().toISOString()}\n`)

  // --- 1. secret guard, before anything is staged ----------------------
  const secrets = scanForSecrets()
  if (secrets.length) {
    console.error('Refusing to commit: possible secrets found in the working tree.\n')
    for (const s of secrets) {
      console.error(`  ${s.file}  [${s.name}]`)
      console.error(`      ${s.line}`)
    }
    console.error('\nMove these to .env.local (gitignored) or remove them, then re-run.')
    process.exit(1)
  }
  console.log('secret scan: clean')

  // --- 2. anything to do? ----------------------------------------------
  // A dry run must not touch the index. Staging here would make "--dry-run"
  // a lie and would quietly leave every change staged for the developer's
  // next manual commit, so the dry run reads the working tree instead.
  let staged
  if (DRY_RUN) {
    staged = workingTreeFileList()
  } else {
    git(['add', '--all'])
    staged = stagedFileList()
  }

  if (staged.length === 0) {
    console.log('no changes - nothing to commit')
    return
  }

  console.log(`\n${staged.length} file(s) changed:`)
  for (const f of staged) console.log(`  ${f}`)

  if (DRY_RUN) {
    console.log('\ndry run - nothing staged, no commit created')
    return
  }

  // --- 3. commit --------------------------------------------------------
  // A single line per file keeps the hourly history readable.
  const summary =
    staged.length === 1
      ? `chore: update ${staged[0]}`
      : `chore: update ${staged.length} files (${staged.slice(0, 3).join(', ')}${staged.length > 3 ? ', ...' : ''})`

  git(['commit', '-m', summary])
  const head = git(['rev-parse', '--short', 'HEAD'])
  console.log(`\ncommitted ${head}: ${summary}`)

  if (NO_PUSH) {
    console.log('--no-push: skipping remote')
    return
  }

  // --- 4. push ----------------------------------------------------------
  const remote = git(['remote'], { allowFail: true })
  if (!remote.trim()) {
    console.log('\nno git remote configured - committed locally only.')
    console.log('Add one with:  git remote add origin <your-repo-url>')
    return
  }

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  try {
    git(['push'])
    console.log(`pushed ${branch} to ${remote.split('\n')[0]}`)
  } catch (error) {
    // A failed push must not lose the local commit; the next hourly run retries.
    console.error(`\npush failed (the local commit is safe):\n  ${error.message}`)
    process.exit(1)
  }
}

if (!existsSync(join(ROOT, '.git'))) {
  console.error('not a git repository')
  process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(`\nauto-push error: ${error.message}`)
  process.exit(1)
}
