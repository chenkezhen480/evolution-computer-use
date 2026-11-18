# Experiments behind the procedure engine

English | [简体中文原文](zh-CN/)

The way this plugin stores, replays and repairs learned procedures was chosen by two controlled experiments run during the development of [dsh-world](https://github.com/chenkezhen480/dsh-world) in November 2026. This folder holds their reports and pre-registered designs. The experiment harness itself (mock site, runner scripts, containers) was never committed, in dsh-world or here: only summary data and excerpts of the procedures the agent saved.

| Round | Question | Report | Design (decision rules written before results) |
| --- | --- | --- | --- |
| 1 (2026-11-12) | What form should a saved procedure take: pure JSON, JSON + in-page scripts, or a whole script? | [English](2026-11-12-procedure-format.md) · [中文](zh-CN/2026-11-12-procedure-format-report.md) | [中文](zh-CN/2026-11-08-procedure-format-design.md) |
| 2 (2026-11-13) | Which replay algorithms help, and is saving procedures worth it compared with doing the task fresh every time? | [English](2026-11-13-procedure-algorithms.md) · [中文](zh-CN/2026-11-13-procedure-algorithms-report.md) | [中文](zh-CN/2026-11-13-procedure-algorithms-design.md) |

The Chinese documents are the originals and the source of record; the English versions are faithful translations of the reports. In the originals the agent is "她" (dsh-world's companion persona); here it is "the agent". The copies of the two designs here omit a few details of the machine the experiments ran on: where the API key was read from, and which desktop programs were running. Nothing about the method or the results was removed.

## Setup shared by both rounds

- A real DSH host (`runzhliu/deepseek-harness:0.2.1-rc.3-r1`) in Docker, model `deepseek-flash`, Chromium under Xvfb in the container; every run starts from a fresh world with no persona and no memory.
- A local mock site imitating a message center, private messages and a comment section, with a fake logged-in account and a log of every write, in three versions:
  - **v1**: semantic markup; the agent learns here.
  - **v2**: cosmetic redesign. Class names become hashes and every element gets two extra wrapping `div`s; the text stays the same.
  - **v3**: structural redesign. The entry moves into a "more" dropdown, a modal "new feature" popup appears, and comments are paginated. In round 2, v3 sits on top of v2 and the popup shows on about half the loads.
- Five tasks:
  1. Read the three unread counts.
  2. Read one person's private messages.
  3. Send a private message (outward).
  4. Read all comments, including replies (v3 needs paging).
  5. Reply to one comment (outward; v3 needs paging to find it).
- Each run: the agent learns on v1 and saves a procedure. The procedure is then replayed without the model on v1, v2 and v3. Where v3 fails, the failure report goes back to the agent to repair the procedure, and the repaired one is replayed on all versions again.
- Safety is checked against the site's write log: any wrong, repeated or misdirected send counts as an incident.

## What they found, and what this plugin does about it

| Finding | Evidence | In this plugin |
| --- | --- | --- |
| The form hardly matters for survival; JSON + in-page scripts (B) is the simplest form that handles paging and repairs best. | Round 1: end-to-end success 9 / 8 / 9 of 25 for A / B / C; B repaired 20/20, C 12/14; pure JSON cost much more on the paging task. | The format is B: declarative steps plus `script` steps (`procedure_save`'s format note). |
| **Silent failures** are more common than loud ones: a broken selector extracts nothing and the procedure reports "done". | Round 1: 90–110 silent failed replays per group. | **K, result contract**: an empty `extract`, a field empty in every row, or an empty kept `script` value is a failure naming the step; `allowEmpty: true` marks steps that may legitimately be empty; `check` waits up to 3 s. Round 2: silent failures 105 → 0. |
| **Repairing for the new page often breaks the old one**, and sites roll out redesigns gradually (A/B tests), so both pages coexist. | Round 1: about half of the repairs broke v1. | **V, fallback to kept versions**: when the newest version fails before anything outward happened, the two most recent `.v<n>.json` versions are tried, newest first. Round 2: repairs that broke old pages 9 → 0; end-to-end success 9/25 → 16/25 (with K and V together). |
| A `check` right after a send fails before the page has navigated. | Round 1: one run failed every replay although each message was sent. | `check` waits up to 3 s instead of judging at once. |
| Outward steps must never be retried blindly. | 0 safety incidents across both rounds and all configurations. | A failed `outward` step is always reported as "may already have been sent"; no fallback once anything outward ran. |
| **F, fingerprint self-healing** (re-finding an element by tag, attributes and position when its CSS selector stops matching) rescues CSS anchors but not class selectors inside scripts. | Round 2: v2 usable 11 → 16 of 25, an "uncertain" result under the pre-registered rule; all 35 self-heals were correct. | **Not implemented.** The reports suggest a cheaper fix first. |
| The biggest remaining hole is at save time: procedures that locate elements by CSS class break on any redesign. | Round 2: what F could not rescue was almost entirely class selectors in scripts. | **Not implemented**: anchors may still use `css`, and nothing warns about class selectors when a procedure is saved. This is the most promising next change. |
| Doing the task fresh every time is more reliable on this small mock site, but costs about four times as much. | Round 2: 750/750 vs 660/750 successful uses, CNY 20.83 vs CNY 5.34 for 10 uses per page version. | Since K, every failure is reported, so the instructions tell the agent to finish the task by hand when a replay fails, then save the repaired version under the same name. |

## Limits

These are the experiments' own limits, as their reports state them:

- The mock site is far simpler than a real website.
- Only one model was tested, with 5 runs per cell.
- In round 2, repairs were triggered only on v3.
- Neither round used a real platform such as Bilibili.
- The desktop side (the `desktop` tool and `where: "desktop" | "screen"` procedures) was not part of either experiment.
