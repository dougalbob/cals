# Metrics evidence & presentation — working document

| Field | Value |
|---|---|
| **Status** | 🟡 **WORKING RESEARCH** — an evidence ledger and evolving design brief, not a final implementation specification or clinical guideline |
| **Last reviewed** | 2026-10-05 |
| **Owner** | @dougalbob |
| **Purpose** | Build an auditable basis for where cals metrics come from, how they are calculated, and how their uncertainty and units should be shown in the UI |
| **Related** | [`../CURRENT_STATE.md`](../CURRENT_STATE.md), [`vision-and-open-questions.md`](vision-and-open-questions.md) (product decisions), [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md) (phase plan) |

> Keep **evidence**, **owner preferences**, **working proposals**, and **settled decisions** distinct. The ideas below are being researched together; they are not all approved product requirements. Accepted decisions are recorded in [`vision-and-open-questions.md`](vision-and-open-questions.md), and implementation status stays in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).
>
> cals is a personal tracking tool, not a diagnostic or dietetic service. A chart can describe the values entered; it cannot infer an individual's health or body composition from circumference or weight alone.
>
> **Priority note (2026-10-05):** decision 88's role and user-switching work is complete, published as
> `v2.0.0-dev-rc26` and signed off by the owner. Phase 14 is next and is scoped into six slices in
> [`../architecture/phase-14-plan.md`](../architecture/phase-14-plan.md); **decision 95 settles the weigh-in
> trend** this file researches in §4. Everything else here remains a research brief, not a specification — see
> [`../CURRENT_STATE.md`](../CURRENT_STATE.md) §4 for the current work order.

---

## 1. Project context and existing roadmap

Phase 14 already owns the windowed calorie bank, measurements, and metrics charts. The accepted roadmap decisions include:

- **Decision 67:** a tappable body map for recording measurements; it does not yet specify a body-measurements time-series chart.
- **Decision 69:** time-windowed Metrics charts pan rather than compressing an unlimited history into a fixed width.
- **Decision 70:** the weigh-in chart initially shows a pannable 30-day window and a trend line; the trend method is deliberately open.
- **Decision 71:** a pannable daily-goal-versus-consumed calorie chart.

See the [decision log](vision-and-open-questions.md#bank-window-metrics-charts-and-app-polish--decisions-6673-2026-10-04) and the [Phase 14 work list](../CURRENT_STATE.md).

The React `/metrics` route is still a spike, not the delivered Phase 14 screen. It currently plots raw weight values, calorie and bank series, nutrition summaries, and a recent measurements table. The current API/data shape matters to the proposals below:

- `measurement_entries` stores dated rows with nullable circumference fields (bust, chest, waist, hips, upper arm, thigh, neck). `GET /api/measurements` currently returns only the newest **20** rows, newest first. A baseline calculated only from that response may not be the user's true first measurement. The fixture and TypeScript types represent values as number-or-null, while the Go model uses `sql.NullFloat64`; verify the real JSON wire shape and pin it with a handler contract test before building chart maths on it.
- `GET /api/weight?days=` returns a bounded, newest-first series ending today. Metrics chart panning needs a range/until contract, not just “the last N days.”
- The weight and measurement handlers scan SQLite `DATE` columns directly; the existing roadmap records the resulting RFC3339-date issue for Metrics. Normalize dates before date arithmetic, sorting, or matching.
- `GET /api/stats/calories` currently sums food/recipe Diary entries but not drink calories. The daily-consumed chart must not disagree with the ring/bank; include drinks before relying on it.

These are implementation constraints, not reasons to settle the visual design prematurely. See the deferred [metrics date issue](vision-and-open-questions.md#known-issue-deferred--rfc3339-dates-on-the-metrics-endpoints-2026-10-03).

---

## 2. Body Measurements chart: raw and indexed views

### 2.1 Owner's starting proposal (still open to research)

Provide a toggle between:

1. **Raw values (cm), default:** absolute body-part circumferences over time.
2. **Change from baseline (%):** each selected site's percentage difference from its baseline.

In indexed mode, put a zero reference line on a linear axis and show the baseline date clearly. Tooltips should retain the actual centimetres, not replace them with a percentage. A lone observation cannot show a trend; show an explanation such as “Add another measurement to compare change” rather than presenting a useful-looking but meaningless 0% line. Sort by date before choosing the baseline, ignore missing values, and guard against a zero or invalid baseline.

### 2.2 Calculation and baseline semantics

For one body site, after sorting its valid measurements by date ascending:

```text
baseline = earliest valid value for this site
change_percent = ((current_value_cm - baseline_cm) / baseline_cm) * 100
```

Worked example from the proposal:

```text
Baseline: 12 Jul, 104.5 cm
Current:   1 Oct,  98.2 cm
Change:   ((98.2 - 104.5) / 104.5) * 100 = -6.0287…% ≈ -6.03%
```

**Working recommendations:**

- Define a baseline **per body site** when sites have different histories. If several sites are compared, show each site's baseline date when they differ; alternatively, require the user to choose a shared measurement session. This needs a product decision.
- Do not silently reset the baseline when the user pans, changes the visible date window, or a new measurement arrives. For the first version, the earliest recorded valid value across the available history is the simplest default; an explicit user-selected baseline can be researched later.
- “Negative” means the circumference is smaller than its baseline. It is **not automatically synonymous with health or success** for every site or every user. Prefer neutral labelling such as **Change from baseline** and avoid encoding good/bad solely with red/green. If a user goal is later supported, show its direction separately.
- The formula can retain full precision in code and tests, but the display precision is open. Measurements are typically recorded to 0.1 cm; showing `-6.03%` is mathematically correct but may imply more certainty than a tape measurement supports. A one-decimal chart label, with the underlying values visible in the tooltip, is a reasonable starting point to test.
- Use only finite, positive observations. Treat absent values as absent—not zero—and handle a non-positive baseline defensively. Keep dates in chronological order. The write handler deletes existing rows for a user/date before inserting, but the schema has no unique `(user_id, date)` constraint; define deterministic behavior if duplicate dates are present.
- If the selected series has only one valid point, explain that a comparison needs another observation. Do not imply a trend or infer a missing value.

### 2.3 How to show several body sites

The draft raises a dual Y-axis for neck versus chest/waist/hips. Both measures are in centimetres, so a second scale would be a questionable first choice: dual axes are easy to misread, and independently tuned ranges can make unrelated or unequal changes look alike. Datawrapper's guidance recommends indexed charts for comparing relative changes and cautions about dual-axis charts for general audiences ([dual-axis guidance](https://www.datawrapper.de/blog/dual-axis-charts-guide)).

**Starting UI options to prototype:**

1. A body-site selector with one raw series at a time (clearest absolute reading; works well on a phone).
2. Small multiples, one panel per site. Shared scales make absolute magnitudes comparable but can flatten smaller ranges; independent scales reveal within-site change but must be clearly labelled and must not invite cross-panel magnitude comparisons.
3. A dual-axis plot only if a concrete comparison need remains after testing the first two options. If used, the axes, units, colors, and ranges must be unmistakable and documented.

The indexed view solves the different-magnitude problem more directly: after normalizing each series to its own disclosed baseline, users can compare relative change. It does **not** make different body sites medically interchangeable.

### 2.4 Tooltips, labels, and interaction

Proposed tooltip for the worked example:

```text
1 Oct · Waist
−6.0% from baseline
98.2 cm now · 104.5 cm on 12 Jul
```

Raw mode should show the exact stored/displayed centimetre value and date. Indexed mode should show the percentage, current cm value, baseline cm value, and baseline date. The chart title, Y-axis label, zero line, and accessible text should all change with the selected mode; color alone must not be the mode indicator. A segmented **Raw | % change** control is likely easier to understand than an unlabeled switch, but should be checked at phone widths.

The toggle should update without losing the selected body site or pan position. If the baseline is outside the currently visible window, keep the baseline date/value available and label it rather than changing the calculation.

### 2.5 Measurement quality: what the evidence supports

Circumference values are sensitive to *how and where* the tape is used. WHO's STEPS protocol specifies a consistent anatomical landmark for waist measurement, tape horizontal and snug without compressing skin, a normal expiration, and recording to 0.1 cm ([WHO STEPS physical-measurement protocol](https://cdn.who.int/media/docs/default-source/ncds/ncd-surveillance/steps/part3-section5.pdf)). An NHS Trust's public guidance also recommends repeating tape measurements, using consistent technique, and notes that measuring every two weeks is usually sufficient ([East Lancashire Hospitals NHS Trust](https://elht.nhs.uk/services/dietetics/body-measuring-techniques)).

A clinical consensus statement supports waist circumference as useful complementary information in clinical practice, while also describing limitations in inferring an individual's visceral fat precisely from circumference ([Ross et al., *Nature Reviews Endocrinology*, 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7027970/)). This supports presenting circumference as a tracked measurement, not as a direct body-fat estimate or diagnosis.

**UI/product implication:** consistency reminders and clear measurement instructions may improve the usefulness of the series more than extra decimal places. The chosen landmark/protocol should be documented per site; changing the protocol mid-series can look like a real body change when it is only a measurement-method change.

---

## 3. Measurement cadence and future reminders

**Owner direction (decision 87):** a measurement session should ideally recur in a **21–28 day** window. Once more than four weeks have passed since the most recent measurement, the future reminders feature may prompt the user to update, for example: “Please update measurements — last measurement was X weeks ago.” Reminders are not currently built.

This is a product cadence, not a claim that 3–4 weeks is a clinically optimal interval. The cited NHS Trust guidance says every two weeks is usually sufficient for circumference measurements; WHO's protocol focuses on standardized technique rather than prescribing a universal home-tracking interval. A 3–4 week reminder is a reasonable lower-friction preference to validate with the household, not a threshold established by those sources.

Decision 87 is a **narrow exception** to decision 46's “no notifications or reminders” rule. It does not authorize general logging/water nudges, push notifications, or any particular reminder delivery channel. Those remain undecided.

**Still to decide before implementing reminders:**

- Does any non-empty measurement entry count as a session, or must the user fill a defined set of body sites?
- What should happen if the user has never logged a measurement?
- After day 28, how often should the reminder repeat? Can it be snoozed or dismissed, and for how long?
- Is this a quiet in-app reminder, part of the future Issues/reminders surface, or another channel? No channel is approved yet.
- Should the interval be configurable per user, or should 21–28 days be a single household default?

---

## 4. Weigh-in chart: possible matching view and trend

A matching **Raw weight | % change** view is a candidate, not yet a settled requirement. The formula would use the earliest valid chronological weight as its baseline:

```text
weight_change_percent = ((current_weight - baseline_weight) / baseline_weight) * 100
```

Raw values should remain in the user's familiar display units (cals stores kg; the existing UI also presents stones and pounds). Indexed values are unit-independent. As with circumferences, keep the baseline stable while panning and disclose its date/value. Decide whether an explicit baseline selector is needed.

Decision 70 already asks for a 30-day default weight window, a pannable history, and a trend line. These are distinct layers and should be named clearly:

- **Observation:** the actual weigh-ins, shown as individual points.
- **Historical smoother/trend:** a descriptive summary of past observations, if there is enough data.
- **Forecast:** an estimate about future weight, which is a different statistical/physiological claim and is not implied by a historical trend line.

A seven-day moving average is a candidate historical smoother, not an established “true weight.” Orsama et al. analysed 4,657 measurements from 80 adults and used a seven-day centred moving-average filter when examining weekday/weekend weight rhythms ([2014 study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5644907/)). That is evidence that smoothing is a used analysis technique—not evidence that this is the best clinical trend for cals or that a flat three-week average proves a plateau.

**Issues to test before selecting a smoother:** weigh-ins can be sparse or irregular; a seven-calendar-day window may have too few observations; a centered average needs future points near the chart edge; a trailing average lags direction changes. Never interpolate unlogged days into apparent measurements. Compare a trailing/centered moving average with other simple smoothers against real-looking sparse data, and label the method in the UI.

> **✅ Settled by decision 95 (2026-10-05).** Phase 14 ships a **7-day moving average taken over weigh-ins
> rather than calendar days** — which is exactly the sparsity objection above: a calendar window comes up empty
> when nobody weighs in daily — drawn only where at least three points exist, labelled with its method, and
> never extrapolated into a date or a plateau. **The window is not final:** the owner records that 7 may prove
> wrong and that **10 or 14 days are the likely alternatives**, so it becomes a per-user setting in the Phase 15
> Settings/profile work (`users.weight_trend_days`, defaulting to 7 in Phase 14 with no control). The questions
> this file raises about *which* smoother is best, about baseline semantics and about uncertainty remain open;
> the target-weight ETA in §5 remains out of scope.

---

## 5. Target-weight ETA: review of the proposed model claims

The other agent's answer raises an important risk—long-term weight change is not a fixed-rate process—but overstates what can be concluded and recommends specific curve-fitting rules without evidence.

| Claim in the supplied answer | Evidence-based assessment for cals |
|---|---|
| A plain linear projection is “physiologically invalid.” | Too categorical. A straight-line fit can describe a recent historical segment; extrapolating that rate far into the future as a physiological prediction is the problem. Dynamic energy-balance research shows that body weight and energy expenditure adapt over time, so a fixed calorie-to-weight conversion or indefinite straight-line forecast can mislead. |
| Dietitians generally prefer an exponential/log curve, with a fitted final weight. | No source has been found for this universal professional preference. The NIDDK Body Weight Planner is based on a published dynamic model of energy balance and weight change, not simply an exponential curve fitted to a user's scale history. |
| A seven-day average is “the truth”; flat for three weeks means a plateau. | A smoother can reduce short-term variation, but it does not reveal a uniquely observable “true” weight. No validated plateau definition for this app has been established. A three-week threshold should not be presented as clinical fact. |
| Switch models at 4 and 12 weeks, then fit a logarithmic or exponential curve. | These duration cutoffs are not supported by the cited sources. Do not encode them as scientific thresholds without validation. |
| Add a forecast cone using a generic 10–15% metabolic-adaptation assumption. | No source has been found to justify one adaptation percentage for all users. A plausible-looking band is not a calibrated uncertainty interval. Do not draw one until its assumptions and coverage are tested. |
| Adjust the ETA using food-logging adherence. | A diary is not proof that intake was fully logged. cals explicitly treats unlogged days as unknown for bank calculations. Do not infer adherence from logging frequency without a clearly defined denominator and user research. |

NIDDK describes the research behind its Body Weight Planner as a dynamic mathematical model of body-weight change, and links it to Hall et al.'s *Lancet* paper. The model accounts for changing energy expenditure and weight over time and is intended for personalized calorie/physical-activity planning ([NIDDK model background](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner); [Hall et al., 2011](https://doi.org/10.1016/S0140-6736(11)60812-X); [dynamic-model web appendix (PDF)](https://www.niddk.nih.gov/-/media/Files/BWP/Hall_Lancet_Web_Appendix.pdf)). The appendix describes fluid/glycogen dynamics alongside energy-expenditure changes, further distinguishing this model from a simple fitted asymptote. This supports rejecting an unqualified “same rate forever” prediction; it does **not** mean cals can reproduce the NIDDK model from its present data.

### Safer research sequence

1. First agree on the **historical trend** calculation and show it separately from raw weigh-ins.
2. Do not show a target date merely because a chart can extrapolate a line. Gather and document the model's required inputs, intended horizon, missing-data behavior, and limitations.
3. If ETA remains valuable, compare an empirically fitted descriptive forecast with a published dynamic model. Validate against held-out historical periods, show prediction error/uncertainty, and avoid suggesting a guaranteed date or a diagnosis of “plateau.”
4. Only then decide whether the result belongs in cals, what users may configure, and how to explain the estimate in plain language.

At present, **target-weight ETA is a research question, not a Phase 14 acceptance criterion**. The formula `W(t) = W_final + (W_initial - W_final) * e^(-k*t)` is a candidate phenomenological curve only; `W_final` and `k` do not become physiological estimates merely by fitting them to a few months of weights.

---

## 6. Candidate acceptance checklist for the body-measurements toggle

This refines the supplied checklist into testable behavior. Items are proposals until agreed:

- Raw mode is the default and clearly labels absolute centimetres.
- The indexed mode uses the first **chronological valid** value for the selected site (or the explicitly chosen baseline, if that design is selected) and the exact formula above.
- Baseline date/value remains stable while panning; the UI names the baseline. If sites have separate baselines, each is disclosed.
- Null/missing values are omitted, not treated as zero; zero, negative, non-finite, and single-point cases get safe, understandable behavior.
- Tooltips show date and exact site/value in raw mode; indexed tooltips show percent, current cm, baseline cm, and baseline date.
- Chart title, units, axis, zero-reference line, legend/accessibility label, and any explanatory text stay in sync with the selected mode.
- Test dates in unsorted input, missing sites, different baseline dates, malformed/zero baselines, duplicate dates, and panning across the baseline.
- Toggle remains responsive and usable at a phone-sized viewport; it does not reset the selected body site or lose the user's chart position.
- Validate the display precision with users; do not imply measurement accuracy beyond the collection method.

The chart also depends on data access beyond the current 20-row measurement API limit if “first measurement” means the user's full history. Before implementation, decide whether to fetch a stable baseline separately, expand the endpoint, or let the user select a baseline.

---

## 7. Evidence register

Sources are evidence for the limited claims described here, not endorsements of every UI proposal.

| ID | Source | What it supports | Limits / use with care |
|---|---|---|---|
| **E1** | [WHO STEPS: Collecting physical measurements (PDF)](https://cdn.who.int/media/docs/default-source/ncds/ncd-surveillance/steps/part3-section5.pdf) | Standardized waist landmarks, level tape, normal expiration, snug/no compression, and measurement resolution | A trained-survey protocol; not a complete self-measurement guide for every body site |
| **E2** | [East Lancashire Hospitals NHS Trust: Body measuring techniques](https://elht.nhs.uk/services/dietetics/body-measuring-techniques) | Consistency, repeat measurements, and practical public guidance on periodic body/weight measurement | Local patient guidance; its two-week suggestion does not prove an optimal interval for every user |
| **E3** | [Ross et al., waist circumference consensus statement (2020)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7027970/) | Waist circumference can complement BMI and is useful for tracking intervention response | Does not make circumference a precise individual body-fat or visceral-fat measurement |
| **E4** | Datawrapper: [What to consider when creating dual-axis charts (2026)](https://www.datawrapper.de/blog/dual-axis-charts-guide); [Why not to use two axes](https://www.datawrapper.de/blog/dualaxis) | Dual axes can be misread; indexed charts and separated panels are alternatives for comparing trends | General data-visualization guidance, not a clinical charting standard |
| **E5** | [NIDDK: Research behind the Body Weight Planner](https://www.niddk.nih.gov/research-funding/at-niddk/labs-branches/laboratory-biological-modeling/integrative-physiology-section/research/body-weight-planner); Hall et al., [*Quantification of the effect of energy imbalance on bodyweight* (2011)](https://doi.org/10.1016/S0140-6736(11)60812-X) and [web appendix (PDF)](https://www.niddk.nih.gov/-/media/Files/BWP/Hall_Lancet_Web_Appendix.pdf) | Weight change is dynamic; the model accounts for energy-expenditure changes and fluid/glycogen dynamics | A model-based scenario tool is not a simple curve fit and cannot be assumed valid with cals' current inputs/log completeness |
| **E6** | Orsama et al., [*Weight Rhythms* (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5644907/) | Analysis of 4,657 measurements from 80 adults; used a seven-day centered filter to examine within-week weight rhythms | Observational study; supports considering smoothing, not a universal seven-day clinical rule or a forecast |

---

## 8. Open research questions

1. Should the body chart show one selected site, small multiples, or a different layout? Is any dual-axis use defensible for the actual task?
2. Is the baseline earliest-ever, user-selected, or a shared measurement session? What should happen when the API's current 20-row limit omits it?
3. Should a site's index use its own first recorded value, or should all displayed series require a common baseline date?
4. What chart window/default should body measurements use, and how does it interact with pan and indexed baseline?
5. ~~What trend smoother is understandable and stable for cals' actual weigh-in frequency? How much data is enough to draw it?~~ **Partly answered by decision 95: a moving average over weigh-ins, three points minimum, 7-day window defaulting per user.** Still open: whether a centred or trailing average reads better on sparse data, and whether the household wants the window at 10 or 14 days once the Phase 15 setting exists.
6. Is a target-weight ETA worth the additional assumptions and risk of false precision? If yes, which published model can be validly parameterized from data cals actually has?
7. How should uncertainty be communicated and calibrated, not merely illustrated?
8. What counts as a measurement session for reminder timing, and how should an overdue reminder repeat or be dismissed?
9. Given decision 87’s narrow measurement-reminder exception, which reminder surface/channel should deliver it?
10. Which measurement instructions should appear at entry time to reduce technique drift between sessions?

Append further research and owner observations here. When a proposal becomes a settled product choice, promote it into the numbered decision log and update the Phase 14 plan/current status in the same documentation pass.
