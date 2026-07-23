# Comprehension Gate Contract

Tracked schemas live here; personal sessions never do. A local session uses:

```txt
.akrctx/local/comprehension/TASK-XXX/<session-id>/
  scope.json
  rubric.json
  transcript.md
  result.json
  learning-report.md
```

Create `rubric.json` before collecting any developer answer. Keep expected answers private until the session ends. Validate JSON artifacts against the schemas in this directory. `learning-report.md` may contain the Mermaid change map, test matrix, and learning summary. Personal session files are ignored by Git and must never be staged.
