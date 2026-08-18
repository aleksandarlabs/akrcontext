# Plan

## Workflow

- EDD

## Why

`defaults.allowedWorkflows` includes EDD, and this is the task it was named for: the deliverable
*is* the evidence mechanism. There is no feature to specify and no bug to drive out with a test.
The work is deciding what evidence a refactor must produce, then building the thing that produces
it.

`TDD` was rejected because the artifacts here are scenarios, and a scenario is already a test. A
test that a test exists adds nothing.

`fast-patch` was rejected: six capsules will rely on this, and a preservation gate that passes no
matter what is worse than none — it converts an unchecked property into a checked-looking one.

`SDD` was rejected: the scenario schema and the report format are fixed and this task does not
change them. If a scenario cannot be expressed, that is a finding, not a design opportunity.

## Steps

### Understand what "unchanged" means per surface

1. For each of the six surfaces, write down in `log.md` what the CLI actually prints and which part
   of it is the contract. `doctor --json` has consumers; `doctor` human output has readers; the
   hook trace has both. They do not need the same strictness, and pinning everything at byte level
   produces scenarios that fail on unrelated work.
2. Note which surfaces vary between runs on the same tree — timestamps, host paths, build output
   hashes. Those either get excluded or the scenario is unusable.

### Build the scenarios

3. Create the `refactor` suite and one scenario for the smallest surface first, end to end, to
   establish the shape before repeating it six times.
4. Run it twice on the same ref. Any disagreement with itself is a defect in the scenario.
5. **Prove it catches a change.** Introduce a one-character output change, confirm the scenario
   fails, revert. Record the transcript. This step is the difference between a gate and a
   decoration, and it is the one most likely to be skipped.
6. Repeat for the remaining five surfaces, running steps 4 and 5 for each.
7. Cover the `judge` failure paths explicitly. They have the most interesting output and the least
   convenient setup, which is exactly why they get skipped.

### Wire the gate

8. Document the gate in `evals/README.md`, and correct the Refactor row of the "Minimum evidence"
   table to name the command.
9. Confirm `pnpm eval:compare` reports `preserved` for all new scenarios against an unchanged tree.

### Update the six capsules

10. Edit `acceptance-criteria.md` in TASK-026, 027, 029, 033, 034 and 035 to cite the gate.
11. **Delete** the manual capture procedures the gate replaces. Leaving both is how the automation
    gets ignored.
12. Where a manual step survives, write the one sentence saying why the gate does not reach it.
    TASK-027's characterization tests are the clear case: they pin branches the CLI never prints.

### Close out

13. `CHANGELOG.md`, additive only, continuations indented two spaces.
14. `pnpm lint && pnpm build && npx vitest run`, plus both eval commands, output recorded verbatim.

## Risks

- **A gate that cannot fail.** The worst outcome of this task, and it looks identical to success:
  six scenarios, all green, protecting nothing. Six capsules would then ship believing they were
  checked. Step 5 exists for this and applies to every scenario individually, not once for the
  suite.
- **Over-pinning.** A scenario that fixes every byte of human output fails on an unrelated wording
  improvement six months from now, and the response will be to weaken or delete it. Step 1 is where
  that is avoided, by deciding per surface what the contract actually is.
- **Under-pinning.** The opposite failure and the harder one to see. A scenario asserting only the
  exit code passes through any presentation change, which is precisely what TASK-034 and TASK-035
  must not do.
- **Non-determinism.** Timestamps and host paths make a scenario fail randomly, and a randomly
  failing gate gets disabled. Step 2 and the run-twice check in step 4 catch this before six
  capsules depend on it.
- **Editing six other capsules is unusual and easy to get wrong.** Removing a manual procedure
  without the gate genuinely covering that property leaves the property unchecked while looking
  more rigorous than before. Step 12 is the guard.
- **Ordering.** This must land before the six refactors. Afterwards the base ref contains the
  refactored behaviour and the scenarios would pin the result rather than protect against it.
