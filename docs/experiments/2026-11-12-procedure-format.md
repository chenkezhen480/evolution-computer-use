# Round 1: what form a saved procedure should take

A: pure JSON · B: JSON + in-page scripts · C: whole script

Date: 2026-11-12. Translated from the [original report](zh-CN/2026-11-12-procedure-format-report.md); design in [zh-CN/2026-11-08-procedure-format-design.md](zh-CN/2026-11-08-procedure-format-design.md), with the decision rules written before the results. Summary data and excerpts of saved procedures only; the experiment scripts were never committed. Amounts are in CNY.

## Pre-registered decision rule

- **Primary metric, "end-to-end success":** the share of runs in which three things all hold:
  - the agent learned and saved a procedure on v1;
  - the procedure works on v2 without repair;
  - the procedure works on v3, after repair where needed.
- **Secondary metric:** tokens (cost) spent learning and repairing.
- **Ties:** when the gap is within the run-to-run spread, choose the simpler form (A < B < C).
- **Safety:** a group with any safety incident is not chosen unless the format itself can rule it out.

## Method

- **Code under test:** dsh-world's `computer/` on the local `computer-use` branch (`5e7ef2b`).
  - B ran unchanged.
  - A refused `script` steps.
  - C stored a procedure as `async (page, args) => …` and ran it in `node:vm` with a 60 s timeout.
  - The three groups shared the same `page_*` primitives, task wording and model.
- **Environment:** a real DSH (`runzhliu/deepseek-harness:0.2.1-rc.3-r1`) in Docker, `deepseek-flash`, Chromium + Xvfb in the container; a fresh world each time, no persona, no memory.
- **Mock site in three versions:**
  - v1: semantic markup; the agent learns here.
  - v2: classes become hashes and every element gets two extra wrapping `div`s; the text stays the same.
  - v3: v1 plus a "more" dropdown (its entry inside a `<template>`), a modal "new feature" popup, and paginated comments.
- **Five tasks:**
  1. Read three unread counts.
  2. Read one person's private messages.
  3. Send a private message (outward).
  4. Read all comments, including replies (v3 needs paging).
  5. Reply to one comment (outward; v3 needs paging to find it).
- **Each run:**
  1. Learn on v1 and save.
  2. Replay without the model: v1 ×10, v2 ×10, v3 ×1.
  3. If v3 failed, hand the failure report to the agent to repair.
  4. Replay v3 ×10 and v1 ×10, to see whether the old page still works after the repair.
  5. Runs that passed v3 the first time were replayed v3 ×10 afterwards.
- **Scale:** 3 groups × 5 tasks × 5 runs = 75 runs, all completed; total cost CNY 18.1.

"Usable" means at least 9 of 10 replays succeed.

## Results

| | A pure JSON | B JSON + script | C whole script |
|---|---|---|---|
| Learned | 25/25 | 25/25 | 25/25 |
| v1 replays succeeded | 240/250 ¹ | 250/250 | 250/250 |
| Usable on v2 without repair (runs) | 10/25 | 8/25 | 9/25 |
| Usable on v3 without repair | 5/25 | 5/25 | **11/25** |
| v3 repairs that succeeded | 17/20 | **20/20** | 12/14 |
| v1 broken after the repair | 10/17 | 8/20 | 6/12 |
| **End-to-end success** (learned ∧ v2 usable ∧ v3 usable; primary metric) | **9/25** | **8/25** | **9/25** |
| End-to-end success and v1 still usable after repair | 5/25 | 6/25 | 6/25 |
| Silent failures (procedure said success, result wrong; replays) | 90 | 110 | 90 |
| Safety incidents | 0 ² | 0 | 0 |
| Cost (learning + repair, 25 runs) | CNY 8.98 | CNY 4.81 | CNY 4.32 |
| Median cost per learning | CNY 0.036 | CNY 0.036 | CNY 0.045 |
| Median cost per repair | CNY 0.109 | CNY 0.125 | CNY 0.119 |
| Median procedure file size | 2.2 KB | 2.5 KB | 3.7 KB |

¹ A, task 3, run 4: the saved "send a private message" ran a `check` on the page text right after clicking "send", before the form's redirect had finished. All 10 replays failed, loudly, with the warning "may already have been sent"; in fact each replay sent exactly one message.

² The same run showed 20 "extra writes": messages from one replay that arrived late were counted in the next replay's window. The page text in the failure reports confirmed one send per replay, so the real count is 0. Later runs waited 1.5 s after each replay and counted writes tagged with an earlier replay as "late".

End-to-end success by task (A / B / C):

| Task | A | B | C |
| --- | --- | --- | --- |
| 1 | 3 | 1 | 1 |
| 2 | 0 | 1 | 1 |
| 3 | 4 | 5 | 4 |
| 4 | **0** | **0** | **2** |
| 5 | 2 | 1 | 1 |

Cost by task (A / B / C): task 4 cost **4.66** / 0.85 / 0.86 and task 5 cost 2.73 / 2.30 / 1.52; the other three tasks were each between 0.2 and 1.1.

## Conclusions, by the pre-registered rule

1. **The primary metric is a tie** (9 / 8 / 9). The run-to-run spread is far larger than the gap. Counting "v1 still usable after repair" as well gives 5 / 6 / 6.
2. **On the secondary metric, cost, A is clearly more expensive.** Nearly all of the gap is task 4, the paging task.
   - A cost CNY 0.69–1.44 per run on it, B 0.11–0.24 and C 0.11–0.30; the ranges do not overlap.
   - A repaired only 2 of 5 runs of that task.
   - The difference between B and C (4.81 vs 4.32) is within the spread.
3. **B and C tie, so the simpler one wins: B**, the format the `computer-use` branch already had.
   - No group had a safety incident, so the safety rule did not decide anything.
   - But `node:vm` is not a security boundary: adopting C would need separate isolation, one more reason for B.

## Observations

**Pure JSON cannot handle "unknown number of pages".** Repairing task 4, group A could only hard-code each page. Each `extract` replaced the previous result, so only the last page came back (the 0/10-after-repair cases):

```json
{"open":".../video/BV1lab"}, {"extract":{"list":{"css":"li[data-rpid]"}, …}},
{"open":".../video/BV1lab?page=2"}, {"extract":{…}},
{"open":".../video/BV1lab?page=3"}, {"extract":{…}}
→ actually returned {"rows":[{"author":"小李","content":"收藏了，慢慢看"}]}
```

**With scripts, the agent wrote redesign-proof procedures the first time.** Group C was usable on v3 without repair 11 times, against 5 each for A and B. The typical task 4 script opened page after page until there was no "next", and read data by `data-rpid` and tag names rather than classes, so neither v2 nor v3 needed a repair:

```js
for (let p = 1; p <= 100; p++) {
  await page.open(p === 1 ? base : base + '?page=' + p);
  const data = await page.eval("… document.querySelectorAll('li[data-rpid]') … return { rows, next };");
  …
  if (!data.next) break;
}
```

C repaired less reliably than B, though (12/14 vs 20/20): a B repair usually changed one or two declared steps, while a C repair rewrote a whole block of code.

**Breaking on a redesign has nothing to do with the form.** In all three groups only 30–40% of procedures survived v2. Every failing procedure inspected located elements by CSS class (`.msgs`, `.counts .count`), all of which vanished when classes were hashed. That is how anchors were written, not how procedures were stored.

**Silent failures outnumber loud ones.** Most failures on v2 raised no error. The extract came back empty, and the procedure still returned "done." or similar through its `summary` template. In real use the agent would conclude "no new messages", which is more dangerous than an error.

**Repairing the new version often breaks the old one,** in about half the cases in every group. Repairing, the agent sees only v3, so it hard-codes "close the popup, click 'more'". Where B and C did write conditions, they covered only v3's two cases and missed v1's original page. Sites like Bilibili roll out gradually and run A/B tests, so old and new pages coexisting is real.

## Limits of the experiment

- **What v3 tested:**
  - v3 was built on v1 without v2's hashed classes, so class-based procedures happened to work on v3.
  - Most task 2 procedures opened the private-message URL directly and bypassed v3's dropdown.
  - The popup only covered the page and did not block reading text, so task 2 tested little on v3.
- **Metric choice:** end-to-end success did not count "v1 still usable after repair" in advance. The table lists both, and the conclusion is the same.
- **Repair reports were too helpful:** for silent failures, the report handed to the agent came from the experiment's judge ("expected the result to contain …"). In real use the agent only sees what the procedure returned, so repair rates may be overstated.
- **The popup was never intermittent:** even seeds made the v3 popup appear every time, so a popup that sometimes appears was not tested.
- **Scale and timing:** one model (deepseek-flash) with 5 runs per cell. Runs went 2–3 at a time, so page timing may have been tighter than in a lone run.
- **Shortcuts:** the experiment plugin attached tools to a headless session, bypassing the "home session only" wiring, and Chromium ran with `--no-sandbox` inside the container.

## Recommended changes to the `computer-use` branch

The changes with the most effect have nothing to do with the form and help all three groups:

1. **Anchors without classes.** The format note should say "use role + name/text, `data-*` attributes or tag structure, not classes", and `procedure_save` should warn about (or refuse) `css` anchors and class selectors in scripts. This targets the roughly 60% of runs that broke on v2. *(Not yet in this plugin.)*
2. **Empty extraction is an error.** An `extract` that finds nothing fails, unless the procedure declares that it may be empty; saving warns when a `summary` references no extracted value. This targets silent failures. *(The failure on empty results is implemented, as K in round 2; the `summary` warning is not.)*
3. **A `check` after an outward action waits.** A `check` right after an `outward` step polls for a few seconds, as `wait` does. *(Implemented: `check` waits up to 3 s.)*
4. **Repairs keep old pages working.** The repair instructions should say "a redesign may be gradual, and the old page must keep working; write conditions for optional popups and dropdowns". If possible, a repaired procedure should also be checked against a page state the pre-repair version handled. *(Addressed differently: V falls back to kept versions; see round 2.)*
5. **An accumulating extract for JSON.** `extract` with `as` could append across pages instead of replacing. This is only needed without scripts; with B, a script does it, so it was not added.
