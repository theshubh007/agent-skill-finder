---
id: meeting-action-extractor
name: Meeting Action Extractor
version: 1.0.0
description: >
  Extracts structured action items from a meeting transcript or notes, identifying
  the task description, assigned owner name, due date or relative deadline, and
  priority level for each item. Returns a sorted action_items list and a
  one-paragraph meeting summary.
capability:
  type: data-transform
  inputs:
    - "transcript:string"
    - "meeting_date:string"
  outputs:
    - "action_items:list"
    - "summary:string"
    - "owner_list:list"
graph:
  depends_on: []
  complements: ["calendar-event-creator", "slack-message-sender"]
  co_used_with: ["meeting-notes-formatter", "email-draft-writer"]
compatibility:
  claude_code: true
  gemini: true
  codex: false
  cursor: false
  mcp: true
risk: safe
---

## What this skill does

Parses raw meeting transcript text and extracts every action item mentioned,
whether stated explicitly ("I'll do X by Friday") or implied ("can you send
that report?"). For each action item, identifies: what needs to be done, who
is responsible, when it's due, and the priority level. Also generates a
2–3 sentence meeting summary.

## Inputs

- `transcript` — raw text of the meeting transcript, notes, or chat log
- `meeting_date` — date the meeting occurred in `YYYY-MM-DD` format; used to resolve relative deadlines like "next Thursday" into absolute dates

## Outputs

- `action_items` — list of `{task, owner, deadline, priority, source_quote}` objects
- `summary` — 2–3 sentence plain-English summary of the meeting discussion
- `owner_list` — deduplicated list of people who were assigned at least one task

## Priority levels

- `high` — explicit deadline pressure or blocking other work
- `normal` — standard task with a clear owner
- `low` — mentioned but not urgently owned

## Example input

```
Sarah: I'll update the landing page copy by end of week.
John: Can you also send the budget numbers to finance by Thursday?
Sarah: Sure. Mike, can you follow up with the vendor on the Q3 contract?
```

## Example output

```json
{
  "action_items": [
    {"task": "Update landing page copy", "owner": "Sarah", "deadline": "2025-05-02", "priority": "normal"},
    {"task": "Send budget numbers to finance", "owner": "Sarah", "deadline": "2025-04-29", "priority": "high"},
    {"task": "Follow up with vendor on Q3 contract", "owner": "Mike", "deadline": null, "priority": "normal"}
  ],
  "summary": "Team reviewed landing page and budget timelines. Three action items assigned to Sarah and Mike with two deadlines this week.",
  "owner_list": ["Sarah", "Mike"]
}
```
