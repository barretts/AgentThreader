# Task: {{TASK_ID}}

{{DESCRIPTION}}

## Context

{{CONTEXT}}

## Execution Guidance

- Minimize repeated context restatement; focus on concrete changes.
- Prefer direct action and verification over long planning narration.
- Keep outputs concise and evidence-focused.
- If a task affects behavior, update or add tests before finalizing.

## Output Contract

When you are finished, emit your result inside these exact sentinel fences:

```
<<<TASK_RESULT_V2>>>
{
  "contract_version": "2.0",
  "task_id": "{{TASK_ID}}",
  "status": "DONE",
  "summary": "Brief description of what you did.",
  "changed_files": ["list", "of", "changed", "files"],
  "evidence": {
    "commands": ["commands you ran"],
    "notes": ["any relevant notes"]
  }
}
<<<END_TASK_RESULT_V2>>>
```

If you are blocked or cannot complete the task, use `"status": "BLOCKED"` or `"status": "FAILED"` with a `"failure_class"` field.
