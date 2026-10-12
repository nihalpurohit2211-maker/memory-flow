# MemoryFlow — Master Prompt

## Launch — paste this into Antigravity

```text
/goal Build MemoryFlow by reading plan.md and read.md in this workspace and completing Stages 0–5. Use the light theme and required features exactly as scoped. Make routine decisions independently; implement, run, inspect, and fix each milestone before continuing.

Use one Builder and one focused Reviewer at the two planned checkpoints, with at most two agents and no recursive delegation. If delegation is unavailable, disclose it and perform a separate review pass. Keep context and reports concise.

STRICTLY LOCAL: never push, publish, deploy, create remotes/PRs, tunnel, or upload project or media files. Bind servers to 127.0.0.1. Preserve original media and existing work. Dependencies/documentation may be downloaded; no cloud processing or runtime external assets.

Use real local import and persistence; label demo content and suggestions honestly. Do not fake AI grouping or test results. Maintain the progress section in plan.md so work can resume. Continue without milestone approvals, respecting tool permissions. Finish with the verified localhost URL, start commands, checks passed, and any remaining blockers. Stop when acceptance criteria pass.
```

If `/goal` is not in your command menu, remove only that prefix and submit the same prompt normally. This prompt starts execution, not another planning interview.

## Optional focused browser review
Use only if browser inspection did not already run. This is a separate chat invocation, not an automatic nested command. Count the browser reviewer within the two-agent limit. Replace the address if the running app uses a different port.

```text
/browser Inspect http://127.0.0.1:5173 against plan.md at 390px and desktop sizes. Check Flow, viewer, back navigation, related moments, Timeline, Universe, keyboard access, and reduced motion. Use only demo/fixture media; do not upload anything or edit code. Return concise reproducible defects. If this browser cannot reach localhost, report that limitation.
```

## Resume after interruption

```text
Continue MemoryFlow from the progress section in plan.md. Inspect existing changes, complete the next unfinished stage, verify it, and continue. Keep everything local; never push or publish. Do not restart completed work or expand scope.
```
