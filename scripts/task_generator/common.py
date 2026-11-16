import os

def render_task(task_dict):
    task_id = task_dict["id"]
    name = task_dict["name"]
    status = task_dict["status"]
    goal = task_dict["goal"]
    why = task_dict["why"]
    reqs = task_dict["requirements"]
    blocked_by = task_dict["blocked_by"]
    blocks = task_dict["blocks"]
    arch = task_dict["architecture"]
    skills = task_dict["skills"]
    files = task_dict["inspect_files"]
    current_behavior = task_dict["current_behavior"]
    required_behavior = task_dict["required_behavior"]
    contracts = task_dict["contracts"]
    commands = task_dict["commands"]
    data_changes = task_dict["data_changes"]
    security = task_dict["security"]
    error_handling = task_dict["error_handling"]
    edge_cases = task_dict["edge_cases"]
    observability = task_dict["observability"]
    unit_tests = task_dict["unit_tests"]
    integration_tests = task_dict["integration_tests"]
    e2e_tests = task_dict["e2e_tests"]
    security_tests = task_dict["security_tests"]
    manual_verification = task_dict["manual_verification"]
    risk_level = task_dict["risk_level"]
    review_reqs = task_dict["review_requirements"]
    commit = task_dict["commit"]

    req_str = "\n".join(f"- {r}" for r in reqs)
    blocked_by_str = "\n".join(f"- {b}" for b in blocked_by) if blocked_by else "- None"
    blocks_str = "\n".join(f"- {b}" for b in blocks) if blocks else "- None"
    arch_str = "\n".join(f"- {a}" for a in arch)
    files_str = "\n".join(f"- `{f}`" for f in files)
    
    # Skills format
    if not skills:
        skills_str = "Required Skills: None — no applicable project skill found."
    else:
        skills_list = []
        for i, s in enumerate(skills, 1):
            s_block = [
                f"### Skill {i}: {s['name']}",
                f"- Skill: {s['name']}",
                f"- Location: `{s['location']}`",
                f"- Why required: {s['why']}",
                f"- Installation/activation required: {s.get('activation', 'No')}",
                "- Instructions that apply to this task:"
            ]
            for instr in s["instructions"]:
                s_block.append(f"  - {instr}")
            skills_list.append("\n".join(s_block))
        skills_str = "\n\n".join(skills_list)
        skills_str += "\n\nBefore modifying code:\n1. Inspect the skill documentation.\n2. Install/activate it if required.\n3. Strictly follow its implementation and testing rules."

    commands_str = "\n".join(f"{i}. {c}" for i, c in enumerate(commands, 1))
    edge_cases_str = "\n".join(f"- {e}" for e in edge_cases)
    
    unit_tests_str = "\n".join(f"- {t}" for t in unit_tests) if unit_tests else "- None"
    integration_tests_str = "\n".join(f"- {t}" for t in integration_tests) if integration_tests else "- None"
    e2e_tests_str = "\n".join(f"- {t}" for t in e2e_tests) if e2e_tests else "- None"
    security_tests_str = "\n".join(f"- {t}" for t in security_tests) if security_tests else "- None"

    md = f"""# TASK-{task_id} — {name}

## Status

{status}

## Goal

{goal}

## Why This Task Exists

{why}

## Requirement References

{req_str}

## Dependencies

### Blocked By
{blocked_by_str}

### Blocks
{blocks_str}

## Architecture References

{arch_str}

Do not redesign these decisions in this task.

## Required Skills

{skills_str}

## Files / Components to Inspect First

{files_str}

## Current Behavior

{current_behavior}

## Required Behavior

{required_behavior}

## Inputs / Outputs / Contracts

{contracts}

## Implementation Commands

Execute in this order:

{commands_str}

## Data / Database Changes

{data_changes}

## Security Requirements

{security}

## Error Handling

{error_handling}

## Edge Cases

{edge_cases_str}

## Observability

{observability}

## Tests Required

### Unit
{unit_tests_str}

### Integration
{integration_tests_str}

### End-to-End
{e2e_tests_str}

### Security / Regression
{security_tests_str}

Do not mark the task complete until required tests pass.

## Manual Verification

{manual_verification}

## Definition of Done

- [ ] Required skills inspected and activated
- [ ] Requirement behavior implemented
- [ ] Architecture rules followed
- [ ] Security requirements satisfied
- [ ] Tests added
- [ ] Relevant tests pass
- [ ] Lint passes
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Documentation updated where required
- [ ] Requirement traceability updated
- [ ] Independent review completed according to risk
- [ ] No unresolved blocking review findings
- [ ] Manual verification completed when required

## Independent Review Requirement

Risk Level:
{risk_level}

Review requirements:
{review_reqs}

Reviewer must use a fresh context and inspect the actual implementation.

## Commit Guidance

Suggested commit:

`{commit}`

Only commit a meaningful green change.

## Completion Report

When finished, report:

- files changed,
- migrations created,
- tests added,
- commands executed,
- test results,
- assumptions,
- known limitations,
- review status,
- manual verification status.

Do not simply report "done."
"""
    return md
