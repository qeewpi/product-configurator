<!-- BEGIN:nextjs-agent-rules -->
# Next.js Notes

This project uses a Next.js variant with conventions that may differ from older examples. Before writing application code, review the relevant guides in `node_modules/next/dist/docs/` and follow any deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:github-issues -->
# GitHub Issue Guide

Use this file as the source of truth for GitHub issues in this repository.

## Labels

Every issue must have exactly one primary type label:

- `type: feature` for new user-facing functionality or expanded workflows
- `type: bug` for broken behavior, regressions, or incorrect results
- `type: maintenance` for refactors, tests, docs, tooling, and internal cleanup
- `type: discussion` for ideas or questions that need alignment before implementation

Optional supporting labels:

- `area: configurator`
- `area: top-lid`
- `area: bottom-tray`
- `area: clips`
- `area: export`
- `area: variants`
- `area: ui`
- `area: docs`
- `needs: triage`
- `needs: investigation`
- `needs: discussion`
- `needs: tests`
- `needs: docs`
- `needs: follow-up`

## Rules

- Keep titles short, specific, and outcome-focused.
- Use exactly one `type:` label.
- Add `area:` labels only when they help routing or filtering.
- Add `needs:` labels only when they describe real next steps.
- Include acceptance criteria for `type: feature` when the work is testable.
- Call out variant-specific behavior when relevant.
- Do not mix unrelated work in one issue.

## Title Examples

- `Separate configurator into part-specific views`
- `Split export output by part`
- `Fix clip color persistence after switching views`

## Feature Template

### Summary
One short paragraph describing the change.

### Details
- What should change
- What should stay the same
- Variant-specific rules

### Acceptance Criteria
- [ ] User-visible behavior
- [ ] Variant handling
- [ ] Export behavior, if relevant
- [ ] Regression coverage or validation, if needed

## Bug Template

### Description  
(Provide a clear and concise description of the problem.)  

### Steps to Reproduce  
1. [Step 1]  
2. [Step 2]  

### Expected Behavior  
(Explain what you expected to happen.)  

### Actual Behavior  
(Explain what actually happened.)  

### Environment  
- OS:  
- Browser/Version:  

### Additional Information  
(Add screenshots, logs, or other helpful details.)  

## Notes

- Use `type: feature` for new capability work.
- Use `type: bug` for defects.
- Use `type: maintenance` for internal or support work.
- Use `type: discussion` when implementation should wait for alignment.
- If GitHub issue types are introduced later, replace the `type:` labels instead of using both.
<!-- END:github-issues -->
