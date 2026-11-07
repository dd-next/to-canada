# Express Entry CRS calculator

Route: `/express-entry`. Entry points: primary navigation and Immigration.
The existing site is English; the calculator follows that convention.

The implementation follows IRCC’s **published CRS criteria effective November
3, 2026**, checked November 8, 2026 in Asia/Bangkok (November 7 UTC). It does not
calculate the separate Federal Skilled Worker 67-point grid, program eligibility,
category eligibility, or the likelihood of receiving an invitation.

## Sources

- [Official calculator](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score.html), page modified November 5, 2026.
- [CRS criteria and tables](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html), page modified November 3, 2026.
- [High-wage occupations](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/high-wage.html), list effective November 3, 2026, based on 2023–2025 data.
- [Language tests and TEF instructions](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html).
- [Valid job offers](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/job-offer.html).

The secondary reference supplied during development, Lawpoint, is not the
authority for scoring or language-test conversion.

## Scoring contract

`src/model/crs.ts` contains pure calculation and completeness checks.
`src/model/crs-language.ts` contains the five approved tests and their four
ability-specific score-band tables. No service call, local storage, cookie,
query parameter or saved explorer occupation supplies answers. Leaving the
page or reloading clears the form.

- Core factors cap at 570 without an accompanying spouse, or 530 with one.
  Partner factors add up to 40. A non-accompanying partner or a partner who
  is a Canadian citizen/PR uses the scale without a spouse and no partner points.
- Labour market integration is **max(Canadian work-length points + high-wage
  experience points, high-wage job-offer points)**. Work-length points range to
  80/70; high-wage experience adds 20/40/70 for the 1.3×/1.5×/2× tiers. Offers
  give 50/70/100. A job offer does not create Canadian experience for the skill
  transferability factors, and has no separate additional-points award.
- A high-wage tier comes from the official occupation/NOC list, not the
  applicant’s salary. Experience can combine qualifying occupations to meet
  a threshold. The form explains the 12-month/1,560-hour requirement and links
  directly to IRCC’s current list. No local wage data determines a tier.
- Each education/foreign-experience transferability group caps at 50, and all
  transferability factors including a trade certificate cap at 100. The lowest
  first-language ability controls the all-four-skills thresholds.
- The second language must be the other official language; it caps at 22 with
  a spouse and 24 without. TEF uses **Équivalence ancien score**, not Score / 699.
- Additional points (nomination, Canadian study, sibling and French) together
  cap at 600. Total CRS caps at **1,270**, achievable with or without a spouse.
- Unanswered fields do not count as “no” or zero. All active questions must be
  answered before a total is shown. Expired first-language tests block the score.
  Hidden spouse answers and deselected tests cannot contribute points.

## Two disclosed differences in the official web calculator

The product owner explicitly chose published CRS rules, with an explanation
when they differ from the public web calculator. Do not silently copy these
web-calculator defects into the scoring model.

1. **TCF as first language at NCLC 4.** The public calculator’s `tcf` row `B`
   awards 0 per ability; the published CRS table awards 6 per ability. The
   fixture with four NCLC 4 abilities gives 225 on the public calculator and
   **249** under the published table.
2. **French first, PTE Core second.** The public calculator’s French-bonus
   branch checks second-test codes `A`/`B`, but PTE is code `E`. It therefore
   awards 25 instead of 50 when French is NCLC 7+ and English CLB 5+ in all four
   skills. The reference fixture gives 360 on the web calculator and **385**
   under the published criteria. When nomination already fills the 600-point
   additional cap, the bonus breakdown differs but the final total does not.

Affected results show the explanation directly above the breakdown, the
published-criteria estimate, and the matching public-calculator total. The
official Express Entry system remains authoritative; neither this estimate
nor the public calculator determines eligibility or constitutes an invitation.

## Verification

```bash
npm run check:crs
npm run check:model
npm run build
```

`dev/fixtures/crs/official-calculator.json` stores 92 independent reference
profiles and every official age, education and language band, with source
SHA-256 hashes. Expected results were captured by executing IRCC’s downloaded
calculator script with its own dropdown codes and reading its result sections;
they were not computed by the new model. All tests run offline.

89 complete score breakdowns agree exactly. Three explicit fixtures cover
the two discrepancies above, including the nomination-cap case. Tests also
check every age and education row on both spouse scales, all 160 raw test-score
bands, all three language-points roles, conditional fields, expired tests,
language ordering, limits, and prevention of double counting.

Browser validation covers desktop and mobile layouts, native select controls,
the incomplete form, a 424-point IELTS example, the 1,270 maximum, spouse
transitions, switching tests, expired results, resetting, discrepancy notices,
and the links from Immigration and to Express Entry rounds.

## Updating the rules

The page identifies the rule effective date and last check date separately.
There is no automatic freshness claim or live fetch from IRCC. On a rule change:

1. Read the current calculator, criteria, language tables and high-wage guidance.
2. Capture reference inputs and result breakdowns independently from the app;
   retain source dates and hashes. Review whether the two discrepancies remain.
3. Update the pure model and input guidance together; preserve the distinction
   between scoring and program eligibility.
4. Refresh fixtures, run the checks above and exercise the conditional form
   in a browser. Update `CRS_RULES` only after this verification.

Applicants with an existing invitation must check which rules and high-wage
list applied on their invitation date. The current calculator does not provide
historical rule versions.
