# Round 2: three replay algorithms on the B format, against a "do it fresh every time" baseline

Date: 2026-11-13. Translated from the [original report](zh-CN/2026-11-13-procedure-algorithms-report.md). The design and a running log of the process are in [zh-CN/2026-11-13-procedure-algorithms-design.md](zh-CN/2026-11-13-procedure-algorithms-design.md), with the decision rules written before the results. Summary data and excerpts of saved procedures only; the experiment scripts were never committed. Amounts are in CNY.

## Why a second round

Round 1 settled the form (B: JSON + in-page scripts), but it also showed that the main causes of breakage have nothing to do with the form:

| Problem seen in round 1 | Extent |
| --- | --- |
| Class names changed (v2) and procedures broke without repair | over 60% of runs |
| Broken procedures said "done" or returned nothing instead of failing | 90–110 replays |
| Repairing for the new page broke the old one | about half of the repairs |
| A check right after a send failed before the page had navigated | every replay of one run |

Three algorithms that need no model were tried against these:

- **F, fingerprint self-healing.** Each time a procedure succeeds, it records what the elements it used look like: tag, attribute names, `data-*`, the surrounding structure, and its position among same-kind siblings, but never the class. When a CSS selector later matches nothing, the run continues with the most similar element. Aimed at changed class names.
- **K, result contract.** An extract with 0 rows, a field empty in every row, or an empty page-script value is reported as a failure instead of "done"; checks for page text wait up to 3 s. Aimed at silent failures and checks made too soon after a send.
- **V, fallback to kept versions.** When the newest version fails before anything outward has happened, the agent's older versions (the library already keeps `.v<n>.json`) are tried, newest first. Aimed at "repair the new page, break the old one", since gradual rollouts and A/B tests serve both pages at once.

There was also a fourth question: **is saving procedures worth it at all?** Round 1 never compared against simply not saving anything and having the agent do the task fresh each time. Recent research (EMNLP 2026) found that many "saved skill" gains vanish against an equal-budget baseline, so a group N did each task fresh on every page version.

## Method, in brief

- **Environment:** the same as round 1 (a real DSH 0.2.1-rc.3 container, `deepseek-flash`, a fresh persona-less world, the same mock site), with two changes:
  - v3 now sits on top of v2: hashed classes and wrapping `div`s, plus the dropdown, popup and paging.
  - The popup appears on about half of the page loads.
- **Procedure group** (5 tasks × 5 runs = 25 runs):
  1. The agent learns once on v1, with the branch's B format unchanged.
  2. The same procedure is replayed on v1, v2 and v3, 5 times each, in four configurations:
     - base: the branch as is;
     - F: fingerprint self-healing;
     - K: the result contract, with checks waiting up to 3 s;
     - FK: F and K together.
  3. Two repair branches start from that same procedure:
     - base branch: repaired as in round 1;
     - FKV branch: during repair the agent's own procedure tools also run with F + K + V, and the failure report comes from FKV itself.
  4. After repair, each branch is replayed on v3, v1 and v2, 5 times each.
- **Fresh group N** (5 tasks × 5 runs): a new world on each of v1, v2 and v3, with only `page_*`, and the agent does the task once.
  - Reading tasks are judged on its last reply.
  - Sending tasks are judged on the site log.
- **"Usable":** at least 4 of 5 replays succeed.
- **Cost:** CNY 7.80 for the procedure group (learning plus both repair branches) and CNY 2.08 for N (75 attempts).

## Pre-registered decision rules

- **Does an algorithm help?** On the same procedures, compare F, K and FK with base on three counts: usable on v2, usable on v3 without repair, and silent failures.
  - A gap of more than 5 runs means it helps.
  - A gap of 2 or fewer means it does not.
  - Anything in between is reported as "uncertain".
- **FKV repair:** compare the two branches on repair rate, whether v1 and v2 stay usable after repair, and repair cost, judged the same way.
- **Is it worth it?** Assume 10 uses per page version.
  - Procedure route: learning and repair cost, plus its replay success rate.
  - N: 3 versions × 10 uses × its per-attempt cost, plus its success rate.
  - Saving procedures is worth it only if it succeeds at least as often as N and costs less in total.
- **Safety:** any wrong, repeated or misdirected send is listed separately and analysed for whether the algorithm layer can rule it out.

## Results

### Before repair: the same 25 procedures in four configurations

| Config | Usable on v1 | Usable on v2 | Usable on v3 without repair | Silent failures (replays) | Self-heals | Safety incidents |
|---|---|---|---|---|---|---|
| base | 25 | 11 | 8 | 105 | — | 0 |
| F | 25 | **16** | 10 | 70 | 35 | 0 |
| K | 25 | 11 | 8 | **0** | — | 0 |
| FK | 25 | **16** | 10 | **0** | 35 | 0 |

### Repair: the two branches

| | base branch | FKV branch |
|---|---|---|
| Needed repair | 17 | 15 |
| v3 repaired | 17/17 | 15/15 |
| v1 or v2 not usable after repair | 9 | 5 ¹ |
| **End-to-end success** (learned ∧ v2 usable ∧ v3 usable ∧ old versions still usable after repair) | **9/25** | **16/25** |
| Silent failures after repair (replays) | 10 | 0 |
| Fallback to a kept version took effect (replays) | — | 35 |
| Repair cost | CNY 2.46 | CNY 2.76 |
| Safety incidents | 0 | 0 |

¹ All five are task 1: the procedure located elements with class selectors inside a page script, so it was already unusable on v2 before any repair; v1 stayed at 5/5 after the repair. In the base branch, all nine went from usable on v1 to 0/5 after the repair: the repair itself broke the old page.

### Fresh group N

| | v1 | v2 | v3 |
|---|---|---|---|
| Done correctly | 25/25 | 25/25 | 25/25 |
| Median cost per attempt | CNY 0.016 | CNY 0.019 | CNY 0.028 |
| Safety incidents | 0 | 0 | 0 |

By task, the median cost per attempt ranged from CNY 0.007 (sending a private message) to CNY 0.071 (reading the whole comment section on v3).

### Is it worth it (pre-registered: 10 uses per page version)

| | Total cost | Successful uses |
|---|---|---|
| Procedure route (learning + FKV repair; replays cost nothing) | CNY 5.34 | 660/750 |
| Fresh route (the agent does it every time) | CNY 20.83 | 750/750 |

## Conclusions, by the pre-registered rules

1. **K helps.** Silent failures fell from 105 to 0 across 12 runs, above the "more than 5 runs" threshold. K does not make a single extra replay succeed; it makes every break visible. There were no silent failures after repair either.
2. **F is uncertain.** v2 usable went from 11 to 16, a gap of 5: between "more than 5 helps" and "2 or fewer does not". The mechanism is clearer than the count:
   - F rescued all 5 procedures that used CSS anchors (all in task 2). All 35 self-heals were correct, with no wrong clicks and no wrong sends.
   - F rescued none of the procedures that located elements inside a page script. 15 of the 25 procedures used scripts, and 8 of them used class selectors inside the script.
3. **FKV repair helps.** End-to-end success went from 9 to 16, a gap of 7, at similar repair cost (2.76 vs 2.46).
   - Most of the gain comes from V. The base branch had 9 repairs that broke v1; the FKV branch had none, because a new version that fails on the old page falls back to the old version.
4. **"Saving procedures pays off" does not hold under the pre-registered rule.** The rule requires at least as many successes as the fresh route, and the result was 660 vs 750. But the cost was about a quarter (5.34 vs 20.83); see the observations below.
5. **Safety:** 0 incidents on both routes and in every configuration. None of F's 35 self-heals put a click on the wrong element.

## Observations outside the rules (input to decisions, not conclusions)

- **Procedures with a fresh attempt as backup look like the best deal.**
  - With K, every failure of a repaired FKV procedure is reported (0 silent failures after repair), so the design can be "when a procedure fails, the agent does the task fresh once".
  - A rough estimate from the data: the procedure route's 90 failed uses, at the fresh route's median CNY 0.02–0.03 per attempt, would add about CNY 2–3. The total would be about CNY 8 for possibly every use succeeding; N was 75/75 on this site.
  - This is an estimate, not a measurement.
- **The procedure route's v2 numbers are understated.** Repair was only triggered on v3. In real use a break on v2 is reported at once and triggers a repair, so most of the 70 failures on v2 would be repaired.
- **The biggest hole is at save time, not replay time.** What could not be rescued on v2 was almost entirely class selectors inside scripts. More direct than F would be for `procedure_save` to check scripts and anchors for class selectors and warn or refuse. This was not tested.
- **Doing it fresh was both cheap and reliable on this mock site** (CNY 0.02–0.03 per attempt, all correct). Real pages such as Bilibili are much larger and each `page_read` returns much more, so a fresh attempt would cost considerably more there, and procedures should save a larger share. Measuring that needs a real site.

## Typical examples

- **F rescues v2** (task 2): the saved anchor was `{"css":"ul.msgs li.msg"}` with field `{"css":".text"}`. After v2 hashed the classes, F re-found the element as "an `li` with `data-id`, whose parent is a `ul`, at this position among its siblings": 5/5.
- **F cannot help** (task 1): the procedure used the page script `document.querySelectorAll('.counts .count')`. With K, on v2 it reports "the page script's result counts is empty" instead of returning `{"counts":{}}` as a success.
- **V keeps the old page working** (task 3, runs 2 and 4): the version repaired for v3 first waited for the popup and clicked "got it", which fails on v1. FKV fell back to the version learned at the start: v1 and v2 5/5. In the base branch, the same repair left v1 and v2 at 0/5.

## Limits

- **Scale:** the mock site is much simpler than real websites, with one model and 5 runs per cell.
- **What was assumed:** repairs were triggered only on v3, and "10 uses per version" is an assumption made for the comparison.
- **K and empty results:** K does not allow extractions that may legitimately be empty. None of the five tasks can be empty, but real use needs a "may be empty" declaration (this plugin has `allowEmpty: true`).
- **Discarded and re-run runs:** there were three, all recorded in the process log.
  - In group N the agent once paraphrased instead of quoting; the wording was changed to ask for the original text and the run was repeated.
  - A script crashed while copying the browser cache; it was fixed and the run repeated.
  - A statistics key collided; it was fixed and the trial run repeated.

## Recommended changes to the `computer-use` branch

1. **Add K:** an empty extraction, a field empty in every row, or an empty kept script value is a failure, and a procedure can declare a step "may be empty". Checks for page text wait a few seconds. Small, with no side effects. *(Implemented in this plugin.)*
2. **Add V:** when a run fails and nothing outward has happened yet, try the old versions newest first. The library already keeps `.v<n>.json`, so the change is small. *(Implemented in this plugin: the two most recent kept versions.)*
3. **Check for class selectors at save time,** in anchors and in scripts, and warn or refuse. Untested, but the data point to it as the largest remaining gap. *(Not yet implemented.)*
4. **Whether to add F:** it only rescues CSS anchors, at about 150 lines of code running in the page. If (3) is done, agents write fewer CSS anchors and F matters less. Do (1)–(3) first, then decide on F. *(Not implemented.)*
5. **When a procedure fails, do the task fresh:** since K, every failure is reported, so the agent can finish the task with `page_*` and then decide whether to repair. Outward steps that fail are never redone automatically; keep "may already have been sent, look at the page first". *(This is what the repair instructions tell the agent.)*
