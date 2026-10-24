# Postmortem: <short title of the incident>

<!--
A template for after an incident (Phase 10, lesson 7). Copy it, fill it in and keep it with the
others: incidents/2026-10-24-frozen-redis.md, for example.

It is "blameless": it tells what happened and why the system allowed it, not who made a mistake. If
a person could break it with one command, the flaw is that the system let them do it without a
warning; the next person would do the same. Name roles ("whoever was on call"), not culprits. Write
it in the following days, while it is still remembered, and with the data in front of you: the times
of the alerts, the charts, the traces, the log.

Delete these comments when you fill it in.
-->

- **Date:** <day of the incident>
- **Duration:** <from when it started until it was resolved, and how long it took to be detected>
- **Severity:** <urgent / warning: the one of the alert that fired, or the one that should have fired>
- **Author:** <who writes it>
- **Status:** <draft / reviewed / actions finished>

## Summary

<!-- Three or four sentences that someone who wasn't there can understand: what failed, what the
customers noticed, how it was fixed. -->

## Impact

<!-- What the people who use the shop noticed, with numbers: how many requests failed, how many
customers couldn't sign in, how many emails arrived late and how late, whether anything was lost.
And how much of the SLO's error budget was spent ("99% of the requests to /v2 without a 5xx"). -->

## Timeline

<!-- Each moment with its time, from the source that says it (the alert's email, the log, a
chart). From the first symptom, even if nobody saw it then, until everything went back to normal. -->

| Time | What happened | Source |
| ---- | ------------- | ------ |
|      |               |        |

## Cause

<!-- What caused it and why the system allowed it. Ask "why?" several times, until you reach
something that can be changed: there is rarely a single cause. -->

## What went well

<!-- What helped: the alert that warned, the dashboard that said where to look, the time limit that
kept everything from hanging, the queue that kept the jobs until Redis came back. -->

## What went wrong

<!-- What got in the way or took long: an alert that didn't fire, or fired late; data that wasn't
anywhere; a step nobody knew how to do. -->

## Where we were lucky

<!-- What didn't turn out worse by chance: there was little traffic at that hour, the disk didn't
fill up. Next time there may not be that luck. -->

## Actions

<!-- Concrete changes, each with a person responsible and a date. "Be more careful" is not an
action; "an alert if the queue goes over 100 jobs" is. -->

| Action | Owner | Due | Status |
| ------ | ----- | --- | ------ |
|        |       |     |        |
