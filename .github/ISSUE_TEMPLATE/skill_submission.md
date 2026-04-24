---
name: Skill submission
about: Submit a new skill for inclusion in the canonical index
title: '[skill] '
labels: skill-submission
assignees: ''
---

## Skill name

<!-- e.g. `my-new-skill` -->

## Registry source

<!-- Which registry does this skill come from? -->

## Description

<!-- One sentence: what does this skill do? -->

## Capability type

<!-- e.g. bioinformatics | visualization | retrieval | code-execution | ... -->

## Graph edges declared

- `depends_on`: <!-- list skill IDs this skill requires, or "none" -->
- `complements`: <!-- list skill IDs that naturally follow this one -->

## Slop gate pre-check

- [ ] Description is unique (not a paraphrase of an existing skill)
- [ ] `scripts/` directory exists with at least one executable file
- [ ] No name collision with existing canonical skills (edit-distance > 2)
- [ ] At least one graph edge declared (not isolated)

## SKILL.md link

<!-- Link to the SKILL.md file, or paste frontmatter below -->
