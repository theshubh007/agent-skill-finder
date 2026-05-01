---
id: grill-me
name: Design Interrogation Mode
version: 1.0.0
description: >
  Conducts a structured, relentless interview of the user's plan or system design,
  resolving each branch of the decision tree until full shared understanding is reached.
  Provides a recommended answer for each question asked. Invoke when the user wants
  to stress-test a plan, validate architecture decisions, or explicitly requests "grill me".
capability:
  type: agentic-pipeline
  inputs:
    - "plan_or_design:string"
    - "context:string"
  outputs:
    - "resolved_decision_tree:string"
    - "recommendations:list[string]"
graph:
  depends_on: []
  complements: ["write-a-skill"]
  co_used_with: []
compatibility:
  claude_code: true
  gemini: true
  mcp: false
risk: safe
---

## Behavior

Conduct a thorough, sequential interview covering every significant aspect of the submitted plan or design. Walk down each branch of the decision tree, resolving inter-dependencies between decisions one at a time.

**Rules:**
- Ask exactly one question per turn — no batching
- For each question, provide your own recommended answer with rationale
- If a question can be answered by inspecting the codebase, inspect it first rather than asking
- Do not stop until all decision branches are resolved and shared understanding is confirmed

## Process

1. Identify the top-level decisions and unknowns in the plan
2. Prioritize by dependency order — foundational decisions first
3. For each decision point:
   - State the question clearly
   - Provide your recommended answer and brief reasoning
   - Wait for user confirmation or correction before proceeding
4. After resolving a branch, summarize the agreed decision before moving to the next
5. Conclude with a full decision summary once all branches are resolved

## When to Use

- Pre-implementation architecture review
- Validating assumptions before a large feature build
- Identifying gaps or contradictions in a technical proposal
- Stress-testing a plan against edge cases and failure modes
