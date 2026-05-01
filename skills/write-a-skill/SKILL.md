---
id: write-a-skill
name: Skill Authoring Assistant
version: 1.0.0
description: >
  Guides the creation of new agent skills with correct structure, progressive disclosure,
  and bundled reference resources. Produces a SKILL.md with a routing-optimized description,
  optional reference files, and utility scripts where deterministic operations are needed.
  Invoke when the user wants to create, write, or build a new skill file.
capability:
  type: agentic-pipeline
  inputs:
    - "skill_domain:string"
    - "use_cases:list[string]"
    - "reference_materials:list[string]"
  outputs:
    - "skill_md:file"
    - "reference_md:file"
    - "scripts:directory"
graph:
  depends_on: []
  complements: ["grill-me"]
  co_used_with: ["git-diff-summarizer"]
compatibility:
  claude_code: true
  gemini: true
  mcp: false
risk: safe
---

## Process

### Step 1 — Gather Requirements

Ask the user:
- What task or domain does this skill cover?
- What specific use cases must it handle?
- Does it need executable scripts or instructions only?
- Are there reference materials to incorporate?

### Step 2 — Draft the Skill

Produce:
- `SKILL.md` — concise instructions (target under 100 lines)
- `REFERENCE.md` — detailed documentation if content exceeds 500 lines
- `scripts/` — utility scripts for deterministic, repeatable operations

### Step 3 — Review With User

Present the draft and ask:
- Does this cover all intended use cases?
- Is anything missing or ambiguous?
- Should any section be expanded or reduced?

---

## Directory Structure

```
skill-name/
├── SKILL.md           # Primary instructions (required)
├── REFERENCE.md       # Extended documentation (if needed)
├── EXAMPLES.md        # Worked examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

---

## SKILL.md Template

```markdown
---
id: skill-name
name: Human-Readable Skill Name
version: 1.0.0
description: >
  One-paragraph capability description. Specific enough for BM25 routing.
  Use when [explicit trigger conditions].
capability:
  type: data-transform|code-execution|retrieval|agentic-pipeline|ml-inference
  inputs: [...]
  outputs: [...]
graph:
  depends_on: []
  complements: [...]
  co_used_with: [...]
compatibility:
  claude_code: true
  gemini: true
  mcp: true
risk: safe|network|exec|critical|unsafe
---

## Quick Start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced Features

See REFERENCE.md
```

---

## Description Requirements

The `description` field is the sole routing signal — the agent reads it to decide whether to load this skill. It must be specific enough to distinguish this skill from all others.

**Requirements:**
- Maximum 1024 characters
- Written in third person
- First sentence: what the skill does
- Second sentence: "Use when [specific triggers, keywords, file types, or user phrases]"

**Good:**
> Extracts text, tables, and form fields from PDF files; merges and splits documents. Use when working with PDF files or when the user mentions forms, document extraction, or PDF processing.

**Poor:**
> Helps with documents.

---

## When to Add Scripts

Add a `scripts/` entry when:
- The operation is fully deterministic (validation, formatting, linting)
- The same code would be regenerated repeatedly across invocations
- Explicit error handling is required for edge cases

## When to Split Into Separate Files

Split when:
- `SKILL.md` exceeds 100 lines
- Content spans distinct domains (e.g., finance schema vs. sales schema)
- Advanced reference material is rarely needed during normal use

---

## Review Checklist

- [ ] `description` includes explicit trigger conditions ("Use when...")
- [ ] `SKILL.md` is under 100 lines
- [ ] No time-sensitive or environment-specific information embedded
- [ ] Terminology is consistent throughout
- [ ] At least one concrete example is included
- [ ] Cross-references are one level deep (no nested includes)
