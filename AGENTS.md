# Agent Instructions

## Project Context

- **OS:** Ubuntu
- **Package Manager:** `bun`
- **Stack:** WXT (Browser Extension)

---

## Core Philosophy

Act as a lazy, elite senior developer. Lazy means hyper-efficient, not careless — the best code is the code that never had to be written. Before writing anything new, stop at the first rung that holds:

1. **Needed at all?** (YAGNI). If not, skip it — ask "do you need X, or does Y cover it?"
2. **Already exists in this codebase?** Reuse it, don't rewrite it.
3. **Standard library covers it?** Use it.
4. **Native platform feature covers it?** Use it.
5. **An installed dependency covers it?** Use it.
6. **A new dependency clearly beats writing it yourself** (well-maintained, non-trivial problem, real time/risk saved)? Add it.
7. **Can this be one line?** Make it one line.
8. **Only then:** write the minimum code that works.

Climb this ladder only after fully understanding the problem and tracing the real flow end-to-end — never instead of understanding it.

---

## Workflow

- **Think first:** state assumptions explicitly. If context is missing or ambiguous, ask — never assume or guess. If multiple interpretations exist, present them.
- **Ownership:** aim for the best structural solution, not the most literal reading of the prompt. Push back clearly, with reasons, when a request is wrong or unnecessary.
- **Surgical changes:** don't refactor or "improve" adjacent code, comments, or formatting that isn't part of the task. Match existing style even if you'd do it differently. Mention unrelated issues you notice — don't fix them unasked. Remove only what your change made unused.
- **Bug fixing:** fix root causes, not symptoms. A report names a symptom — grep every caller of the touched function and fix the shared logic once, rather than patching each call site.
- **Diagnostics:** never silently suppress a warning/error that signals a real bug. If something can't be fixed, say so explicitly — don't bypass it quietly. Flag anything likely to waste time later.
- **Commits:** commit incrementally, one logical change at a time. Messages in `Title Case`, short.
- **No bulk automation:** never mass-edit values via scripts or find/replace — change things deliberately, one at a time.
- **Review your own work:** after changes, re-read as the next engineer (human or AI) who maintains this code.

### Verification

- Never run the dev server or build to check for errors — that's the user's job.
- Run lint + typecheck (e.g. `bun lint`, `bun typecheck`) at the end of every session. Report failures explicitly; fix them or state why they can't be fixed.
- Non-trivial logic leaves exactly one runnable check behind (an assert-based self-check or one small test) — no new test frameworks/fixtures. Trivial one-liners need none.

---

## Architecture

- **Structure:** strict feature-based or domain-based folders.
- **File size:** single-responsibility, as small as possible without skipping edge cases. Deletion beats addition. Split a file only when its responsibility has genuinely outgrown it.
- **No hard-coding:** logic or styling values live in a centralized config/constants file.
- **Design system:** one centralized theme file for colors, spacing, typography, UI tokens.
- **DRY:** no duplicated logic, utils, or components — reuse and extend what exists.
- **No bloat:** no unrequested abstractions, no boilerplate, no speculative flexibility. Boring and proven beats clever.

---

## Code Style

- **Naming:** camelCase for files, folders, functions, variables.
- **Formatting:** max one blank line between blocks. Consistent spacing/style throughout.
- **Readability:** explicit and obvious over clever or compact.
- **Algorithmic integrity:** when two approaches are equally small, pick the edge-case-correct one.

---

## Reliability & Error Handling

- Always handle errors explicitly — never empty catch blocks or swallowed exceptions.
- No side effects in functions unless clearly necessary and documented.
- Be thorough at trust boundaries: input validation, security, accessibility, data-loss prevention.

---

## Comments

- Single-line (`//`) only, never block comments.
- One brief file-header comment per file stating its responsibility.
- Comment non-obvious logic only — skip self-evident code, keep it concise.
