---
name: docs-ste100-style
description: Write documentation, READMEs, and technical prose in ASD-STE100 Simplified Technical English. Invoke for any doc generation task.
---

# Simplified Technical English (ASD-STE100) for Documentation

Apply these rules to all text output: READMEs, docstrings, PR descriptions, commit messages, changelogs, comments, and inline docs. Code itself is exempt.

## Sentences

- Descriptive text: maximum 25 words per sentence.
- Procedural text: maximum 20 words per sentence.
- One instruction per sentence. Do not chain with "and" or "then".
- One topic per paragraph. Maximum 6 sentences per paragraph.

## Voice

- Active voice. Name the actor: "The function returns X", not "X is returned".
- Simple present for descriptions: "The module exports a class".
- Imperative for instructions: "Run the test suite".
- Do not use "shall", "might", "could", or "would" as hedges. Use "must" for obligations. Use "can" for capability.
- Do not use passive voice unless the actor is unknown.

## Words

Use the simplest precise word:

| Avoid | Use |
|-------|-----|
| initiate | start |
| terminate | stop |
| indicate | show |
| transmit | send |
| modify | change |
| ensure | make sure |
| enable | let |
| utilize | use |
| implement | build / write |
| leverage | use |
| facilitate | help |

- Pick one term per concept. Repeat it. Do not rotate synonyms.
- Technical nouns (function names, API terms, library names) are exempt.
- Write acronyms in full the first time.

## Structure

- Lead with the action or result, not the condition. "Run X to get Y", not "In order to get Y, you need to run X".
- Numbered steps for ordered procedures. Bullets only for unordered lists.
- Maximum 8 items per list. Split longer lists with subheadings.
- No filler: "basically", "simply", "just", "actually", "obviously", "of course", "it is worth noting that", "it should be mentioned", "as mentioned above".

## Warnings

- State the risk before the instruction: "This deletes all data. Run only on test environments."
- Do not soften warnings with "please" or "you might want to".

## Code comments

- One idea per comment line. Maximum 15 words.
- Comment only on why or on non-obvious constraints. Do not narrate what the code already says.

## README structure (when generating a full README)

1. Project name + one-sentence description (what it does, not what it is)
2. Install (exact commands)
3. Quick start (minimum steps to first result)
4. Configuration (only non-obvious options)
5. API / CLI reference (if applicable)
6. Contributing (if applicable)
7. License

Do not add badges, shields, or decorative elements unless asked.