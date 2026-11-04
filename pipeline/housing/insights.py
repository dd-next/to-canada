"""Insights `housing-rents` and `arrival-budget`, computed from the outputs of the other modules."""
from __future__ import annotations

import statistics as st

from common_h import places, quarter_label, statcan_geo_key

AS = "statcan-46-10-0092-01"
CM = "cmhc-rms-2025"
CP = "statcan-18-10-0004-01"
MB = "statcan-11-10-0066-01"
APT = {"1br": "Apartment - 1 bedroom", "2br": "Apartment - 2 bedrooms"}


def _num(s):
    try:
        return float(str(s).replace(",", ""))
    except ValueError:
        return None


def _r(x, n=0):
    return None if x is None else round(x, n)


def build(ask_ctx, cmhc_ctx, cpi_ctx, mbm_ctx, today: str):
    lk, refs = ask_ctx["lk"], sorted(ask_ctx["df"].REF_DATE.unique())
    latest, y1, q1_25 = refs[-1], refs[-5], refs[-6]
    q2025_4 = refs[-3]  # 2025-10 = 2025-Q4, the quarter containing CMHC's October survey
    y2019 = [r for r in refs if r.startswith("2019")]
    PL = {p["id"]: p for p in places()}
    names = {k: v["raw"]["name"] for k, v in PL.items()}

    def ask(pid, ut, rd, est="Average asking rent"):
        dg, _ = statcan_geo_key(PL[pid])
        v = lk.get((dg, est, APT[ut], rd))
        return None if v is None or v[1] in ("..", "F", "x") else (v[0] if v[0] == v[0] else None)

    covered = [p for p in PL if ask(p, "1br", latest) is not None]
    # ---------------------------------------------------------------- housing-rents
    r1 = sorted(((ask(p, "1br", latest), p) for p in covered))
    low, high = r1[0], r1[-1]
    med1 = st.median(v for v, _ in r1)
    below_med = [p for v, p in r1 if v <= 1300]
    f1 = {
        "id": "asking-1br-range", "kind": "observation",
        "headline": f"1-bedroom asking rents run from ${low[0]:,.0f} in {names[low[1]]} to ${high[0]:,.0f} in {names[high[1]]}",
        "detail": (f"Average advertised rent for a 1-bedroom apartment in {quarter_label(latest)} across the {len(r1)} of our 31 places that the table covers: "
                   f"median ${med1:,.0f}; the five lowest are " + ", ".join(f"{names[p]} (${v:,.0f})" for v, p in r1[:5]) + "; the five highest are "
                   + ", ".join(f"{names[p]} (${v:,.0f})" for v, p in r1[::-1][:5]) + ". Asking rent applies to units currently advertised, so it is the price a new arrival "
                   "would see on listing sites, not what long-term tenants pay. Charlottetown, Brandon, Whitehorse, Yellowknife and Iqaluit are not in this table (CMAs only)."),
        "stat": {"value": low[0], "unit": "CAD_month", "label": f"lowest 1-bedroom asking rent ({names[low[1]]})", "period": quarter_label(latest)},
        "placeIds": [low[1], high[1]], "metricId": "rent_asking_1br", "sourceIds": [AS],
        "calc": f"Table 46-10-0092-01, 'Apartment - 1 bedroom', 'Average asking rent', REF_DATE {latest} ({quarter_label(latest)}); sorted ascending over places with a published value; median over {len(r1)} places.",
    }
    # change vs a year earlier and vs 2019 average
    chg = []
    for p in covered:
        a, b, c = ask(p, "1br", latest), ask(p, "1br", y1), ask(p, "1br", q1_25)
        base19 = [ask(p, "1br", r) for r in y2019]
        base19 = [x for x in base19 if x is not None]
        d1 = None if b is None else (a / b - 1) * 100
        d5 = None if c is None else (a / c - 1) * 100
        d19 = (a / (sum(base19) / len(base19)) - 1) * 100 if len(base19) == 4 else None
        chg.append((p, a, d1, d5, d19))
    c1 = sorted([x for x in chg if x[2] is not None], key=lambda x: x[2])
    fell = [x for x in c1 if x[2] < 0]
    c19 = sorted([x for x in chg if x[4] is not None], key=lambda x: x[4])
    agree = sum(1 for x in chg if x[2] is not None and x[3] is not None and (x[2] < 0) == (x[3] < 0))
    both = sum(1 for x in chg if x[2] is not None and x[3] is not None)
    f2 = {
        "id": "asking-1br-change-1y", "kind": "calculation",
        "headline": f"Over the past year 1-bedroom asking rents fell in {len(fell)} of {len(c1)} places, led by {', '.join(names[x[0]] for x in c1[:3])}",
        "detail": (f"Change in the 1-bedroom average asking rent, {quarter_label(latest)} vs {quarter_label(y1)}: median {st.median(x[2] for x in c1):+.1f}%. Largest falls: "
                   + ", ".join(f"{names[x[0]]} {x[2]:+.1f}%" for x in c1[:4]) + ". Largest rises: " + ", ".join(f"{names[x[0]]} {x[2]:+.1f}%" for x in c1[::-1][:4])
                   + f". Direction agrees with the change vs {quarter_label(q1_25)} in {agree} of {both} places. CAUTION: StatCan marks {quarter_label(y1)} estimates as modelled (one listing platform was unavailable), so treat the year-on-year figure as indicative. "
                   "These are advertised-price changes, not changes in what sitting tenants pay."),
        "stat": {"value": _r(st.median(x[2] for x in c1), 1), "unit": "percent", "label": "median 1-bedroom asking-rent change, 1 year", "period": quarter_label(latest)},
        "placeIds": [x[0] for x in c1[:3]] + [x[0] for x in c1[::-1][:3]], "metricId": "rent_asking_1br_change_1y", "sourceIds": [AS],
        "calc": f"(asking 1-bedroom apartment rent {quarter_label(latest)} / {quarter_label(y1)} - 1) x 100 from published rounded values; median across {len(c1)} places with both values.",
    }
    f3 = {
        "id": "asking-1br-since-2019", "kind": "calculation",
        "headline": f"Since 2019 advertised 1-bedroom rents are up most in {names[c19[::-1][0][0]]} (+{c19[-1][4]:.0f}%) and least in {names[c19[0][0]]} ({c19[0][4]:+.0f}%)",
        "detail": (f"Latest ({quarter_label(latest)}) 1-bedroom asking rent vs the mean of the four 2019 quarters: median {st.median(x[4] for x in c19):+.0f}%. Biggest increases: "
                   + ", ".join(f"{names[x[0]]} {x[4]:+.0f}%" for x in c19[::-1][:5]) + "; smallest: " + ", ".join(f"{names[x[0]]} {x[4]:+.0f}%" for x in c19[:4])
                   + ". Dollar rents are nominal (not adjusted for general inflation). The 2019 base comes from the first quarters of an experimental listings series, "
                     "when listing coverage may have been thinner, so very large percentage rises should be read as 'substantially higher', not as exact."),
        "stat": {"value": _r(st.median(x[4] for x in c19), 0), "unit": "percent", "label": "median change in 1-bedroom asking rent vs 2019 average", "period": quarter_label(latest)},
        "placeIds": [x[0] for x in c19[::-1][:4]] + [x[0] for x in c19[:2]], "metricId": "rent_asking_1br", "sourceIds": [AS],
        "calc": f"(asking 1-bedroom rent {quarter_label(latest)} / mean(2019-Q1..Q4) - 1) x 100, nominal dollars; places with all four 2019 quarters.",
    }
    # asking vs CMHC (2-bedroom, timing-matched: asking in 2025-Q4 vs CMHC October 2025)
    gaps = []
    for p in covered:
        if p not in cmhc_ctx:
            continue
        row = cmhc_ctx[p]["rent"]["2br"]["Oct-25"]
        cm = _num(row[0])
        a = ask(p, "2br", q2025_4)
        if cm and a:
            gaps.append((p, a, cm, (a / cm - 1) * 100, row[1]))
    gaps.sort(key=lambda x: x[3])
    med_gap = st.median(x[3] for x in gaps)
    f4 = {
        "id": "asking-vs-cmhc-2br", "kind": "calculation",
        "headline": f"Advertised 2-bedroom rents sit a median {med_gap:.0f}% above CMHC's average rent; the gap ranges from {gaps[0][3]:+.0f}% to {gaps[-1][3]:+.0f}%",
        "detail": (f"Asking rent for 2-bedroom apartments in {quarter_label(q2025_4)} (StatCan) vs CMHC's October 2025 average rent for purpose-built apartments, {len(gaps)} places. "
                   "Largest gaps: " + ", ".join(f"{names[x[0]]} {x[3]:+.0f}% (asking ${x[1]:,.0f} vs ${x[2]:,.0f})" for x in gaps[::-1][:4])
                   + "; smallest: " + ", ".join(f"{names[x[0]]} {x[3]:+.0f}%" for x in gaps[:3]) + ". The gap is not 'overpricing': the two measure different things - "
                     "units advertised for rent during a quarter on listing platforms (new leases, any building type) vs a survey of the average rent across all "
                     "units in purpose-built rental structures of 3+ units, including long-standing tenancies. For a newcomer, the asking rent is the better guide to what a new lease costs."),
        "stat": {"value": _r(med_gap, 1), "unit": "percent", "label": "median asking vs CMHC average rent gap, 2-bedroom", "period": "2025-Q4 vs Oct 2025"},
        "placeIds": [x[0] for x in gaps[::-1][:3]] + [x[0] for x in gaps[:2]], "metricId": "rent_cmhc_avg_2br", "sourceIds": [AS, CM],
        "calc": f"(asking 2-bedroom apartment rent, REF_DATE {q2025_4} / CMHC table 1.1.2 average rent 2-bedroom Oct-25 - 1) x 100; Ottawa/Gatineau use provincial parts; places in both sources.",
    }
    # CPI rent vs asking change: only places with a city-level rented-accommodation CPI
    idx, cl = cpi_ctx["idx"], cpi_ctx["latest"]
    from cpi import CITY, RENT, pct
    cp = []
    for p, g in CITY.items():
        v = pct(idx, g, RENT, cl)
        if v is not None:
            cp.append((p, v))
    cp.sort(key=lambda x: x[1])
    f5 = {
        "id": "cpi-rent-1y", "kind": "observation",
        "headline": f"In the {len(cp)} cities with a rent CPI, rents already being paid changed by between {cp[0][1]:+.1f}% and {cp[-1][1]:+.1f}% over the 12 months to {cl}",
        "detail": ("12-month change in the CPI 'rented accommodation' index (rent and related tenant costs), " + ", ".join(f"{names[p]} {v:+.1f}%" for p, v in cp[::-1][:5]) + " at the top and "
                   + ", ".join(f"{names[p]} {v:+.1f}%" for p, v in cp[:4]) + " at the bottom. CPI measures change in rents of the existing rental stock (including renewals), so it can differ in direction from asking rents on new listings. "
                     "It says nothing about which city is cheaper. Charlottetown's value covers Charlottetown and Summerside; other places without a city CPI use provincial values (see map layer flags)."),
        "stat": {"value": _r(st.median(v for _, v in cp), 1), "unit": "percent", "label": "median 12-month change, rent CPI (cities)", "period": cl},
        "placeIds": [p for p, _ in cp[::-1][:3]] + [p for p, _ in cp[:2]], "metricId": "cpi_rent_change_1y", "sourceIds": [CP],
        "calc": f"CPI 'Rented accommodation' index (2002=100), {cl} / same month a year earlier - 1, x 100, for the cities StatCan publishes in table 18-10-0004-01.",
    }
    # charts
    bar1 = {"id": "asking-1br-ranked", "type": "bar_ranked", "title": f"Average asking rent, 1-bedroom apartment, {quarter_label(latest)}",
            "subtitle": "CMA values; lowest to highest", "unit": "CAD_month",
            "series": [{"id": "asking_1br", "label": "Asking rent, 1 bedroom", "points": [{"x": names[p], "y": v, "placeId": p} for v, p in r1]}],
            "notes": "Apartments advertised on major rental platforms during the quarter (StatCan experimental estimates, rounded to $10). Ottawa and Gatineau are the Ontario and Quebec parts of the CMA. Charlottetown, Brandon, Whitehorse, Yellowknife, Iqaluit not covered.",
            "sourceIds": [AS]}
    sel = ["toronto", "vancouver", "montreal", "calgary", "ottawa", "halifax", "winnipeg", "quebec-city"]
    lines = []
    for p in sel:
        pts = [{"x": quarter_label(r), "y": ask(p, "1br", r)} for r in refs]
        lines.append({"id": f"asking_1br_{p}", "label": names[p], "placeId": p, "points": pts})
    line = {"id": "asking-1br-history", "type": "line", "title": "1-bedroom asking rent over time, selected CMAs", "subtitle": "Quarterly, 2019-Q1 to " + quarter_label(latest),
            "unit": "CAD_month", "series": lines,
            "notes": "Nominal dollars. 2025-Q2 and Q3 estimates are flagged by StatCan as modelled (a listing platform was unavailable). Early-2019 quarters come from a young experimental series.", "sourceIds": [AS]}
    dot = {"id": "asking-vs-cmhc-dots", "type": "dot_compare", "title": "2-bedroom: advertised (asking) vs CMHC average rent",
           "subtitle": "Asking rent 2025-Q4 vs CMHC October 2025 survey average, sorted by gap", "unit": "CAD_month",
           "series": [{"id": "asking", "label": "Asking rent (StatCan, 2025-Q4)", "points": [{"x": names[x[0]], "y": x[1], "placeId": x[0]} for x in gaps]},
                      {"id": "cmhc", "label": "CMHC average rent (Oct 2025)", "points": [{"x": names[x[0]], "y": x[2], "placeId": x[0], **({"f": ["use_with_caution"]} if x[4] == "d" else {})} for x in gaps]}],
           "notes": "Different populations: listings of units for rent in a quarter (all rental dwelling types in CMA) vs the stock average of purpose-built rental apartments (3+ units).", "sourceIds": [AS, CM]}
    ins1 = {
        "id": "housing-rents", "topic": "housing",
        "title": f"Asking rents range from about ${low[0]:,.0f} to ${high[0]:,.0f} for a 1-bedroom, and advertised rents are usually above what the CMHC survey finds tenants pay",
        "question": "Where are rents lower, how have they changed, and how do advertised rents compare with what existing tenants pay?",
        "dek": f"What a new lease costs on listing sites in {quarter_label(latest)}, how it moved in the past year and since 2019, and how it compares with CMHC's survey of rents actually charged.",
        "findings": [f1, f2, f3, f4, f5], "charts": [bar1, line, dot],
        "interpretation": [
            "For a first apartment, the asking rent is the number to budget with: it reflects units a newcomer can actually apply for today. The lowest asking rents here are in Quebec (Sherbrooke, Québec City), parts of the Prairies (Regina, Edmonton) and some Atlantic cities (Saint John), while Halifax is among the higher-rent places; the ranking is only about price, not wages, job availability or vacancy.",
            "The CMHC average covers all units in purpose-built rental buildings, including long-standing tenancies whose rent only changes at renewal (and, in some provinces, within increase limits), so it describes a different, slower-moving part of the market than new listings; the CPI rent index likewise tracks rents of the existing rental stock.",
            "A fall in asking rents over a year does not mean cheap housing is easy to find: check vacancy rates (CMHC) alongside, and view listings directly.",
        ],
        "methodology": [
            "Asking rents: StatCan table 46-10-0092-01 (experimental Quarterly Rent Statistics), average asking rent for apartments by bedroom count in each CMA, rounded to $10 by StatCan; Ottawa and Gatineau use the Ontario and Quebec parts of the CMA.",
            "Change since 2019 compares the latest quarter with the mean of the four 2019 quarters; 1-year change compares with the same quarter a year earlier.",
            "CMHC: Rental Market Survey, October 2025, average rent by bedroom type for private apartments in structures of 3+ units, per centre (CMA/CA); the asking-vs-CMHC comparison uses asking rent for 2025-Q4 (the quarter containing the October survey) to match timing.",
            "CPI: 12-month change in 'rented accommodation' (the rent sub-index published at city level), table 18-10-0004-01, latest month.",
        ],
        "limitations": [
            "Asking rents are advertised prices from online platforms, not signed leases; they exclude subsidised units, lease transfers and short-term rentals, and coverage varies by city and size of rental market.",
            "StatCan flags 2025-Q2 and Q3 estimates as modelled (one platform unavailable); year-on-year changes use 2025-Q2 as the comparison quarter and are indicative.",
            "Experimental series starting 2019: early-2019 estimates may be less well-covered; percentage rises since 2019 are nominal.",
            "CMHC covers purpose-built rental structures of 3+ units only; asking rents cover all listed rental apartments in the CMA. The two are not the same population and the gap is not an error measure.",
            "Not covered by StatCan asking rents: Charlottetown, Brandon, Whitehorse, Yellowknife, Iqaluit (CMHC covers Charlottetown and Yellowknife only). CPI is a price-change measure and is published for only some cities.",
        ],
        "sourceIds": [AS, CM, CP], "relatedPlaceIds": sorted(set(sum([f["placeIds"] for f in (f1, f2, f3, f4, f5)], []))), "computedAt": today,
    }

    # ---------------------------------------------------------------- arrival-budget
    vals = mbm_ctx["values"]
    SCEN = {
        "single": {"label": "Single adult, 1-bedroom apartment", "n": 1, "ut": "1br", "buffer": 15000},
        "family": {"label": "Couple + 1 child (3 persons), 2-bedroom apartment", "n": 3, "ut": "2br", "buffer": 25000},
    }
    res = {k: [] for k in SCEN}
    for p in covered:
        tot, shel = vals.get((p, "total")), vals.get((p, "shelter"))
        for k, s in SCEN.items():
            rent = ask(p, s["ut"], latest)
            if rent is None or tot is None:
                continue
            nonshelter_m = (tot - shel) * (s["n"] / 4) ** 0.5 / 12
            monthly = rent + nonshelter_m
            res[k].append({"p": p, "rent": rent, "non": nonshelter_m, "monthly": monthly, "months": s["buffer"] / monthly})
    for k in res:
        res[k].sort(key=lambda x: -x["months"])
    s1, s3 = res["single"], res["family"]
    g1 = {
        "id": "runway-single", "kind": "calculation",
        "headline": f"A single adult with $15,000 and no income lasts about {s1[0]['months']:.1f} months in {names[s1[0]['p']]} but {s1[-1]['months']:.1f} in {names[s1[-1]['p']]}",
        "detail": (f"Scenario, not a prediction: monthly cost = {quarter_label(latest)} average asking rent for a 1-bedroom apartment + the MBM non-shelter basket (food, clothing, transportation, communication, other) "
                   "for one person (reference-family cost x sqrt(1/4) = 50%, divided by 12). Longest runway: " + ", ".join(f"{names[x['p']]} {x['months']:.1f}" for x in s1[:4])
                   + "; shortest: " + ", ".join(f"{names[x['p']]} {x['months']:.1f}" for x in s1[::-1][:4]) + f" months. Median {st.median(x['months'] for x in s1):.1f} months. "
                     "Excluded: one-off costs (flights, deposits, furniture), taxes, benefits, income, health costs and any shelter cost beyond rent."),
        "stat": {"value": _r(st.median(x["months"] for x in s1), 1), "unit": "months", "label": "median months of runway, single adult, $15,000", "period": quarter_label(latest)},
        "placeIds": [s1[0]["p"], s1[1]["p"], s1[-1]["p"], s1[-2]["p"]], "metricId": "rent_asking_1br", "sourceIds": [AS, MB],
        "calc": "months = 15,000 / (asking rent 1BR + (MBM total - MBM shelter) x sqrt(1/4) / 12); MBM = 2025 current dollars, 2023 base, reference family of four; rent = REF_DATE %s." % latest,
    }
    g3 = {
        "id": "runway-family", "kind": "calculation",
        "headline": f"A couple with a child and $25,000 lasts about {s3[0]['months']:.1f} months in {names[s3[0]['p']]} but {s3[-1]['months']:.1f} in {names[s3[-1]['p']]}",
        "detail": ("Scenario: 2-bedroom asking rent + MBM non-shelter costs scaled to 3 persons (x sqrt(3/4) = 87%). Longest runway: " + ", ".join(f"{names[x['p']]} {x['months']:.1f}" for x in s3[:4])
                   + "; shortest: " + ", ".join(f"{names[x['p']]} {x['months']:.1f}" for x in s3[::-1][:4]) + f" months (median {st.median(x['months'] for x in s3):.1f}). "
                   "Rent is "
                   f"{100 * st.median(x['rent'] / x['monthly'] for x in s3):.0f}% of the median monthly outlay, so rent differences between cities drive most of the spread."),
        "stat": {"value": _r(st.median(x["months"] for x in s3), 1), "unit": "months", "label": "median months of runway, couple + child, $25,000", "period": quarter_label(latest)},
        "placeIds": [s3[0]["p"], s3[1]["p"], s3[-1]["p"], s3[-2]["p"]], "metricId": "rent_asking_2br", "sourceIds": [AS, MB],
        "calc": "months = 25,000 / (asking rent 2BR + (MBM total - MBM shelter) x sqrt(3/4) / 12).",
    }
    # share of non-shelter that is basket vs rent difference
    rent_share = [x["rent"] / x["monthly"] for x in s1]
    g5 = {
        "id": "basket-vs-rent", "kind": "calculation",
        "headline": f"Rent is {100 * min(rent_share):.0f}% to {100 * max(rent_share):.0f}% of the single-adult monthly outlay; the non-rent basket is far more similar between cities",
        "detail": (f"Non-shelter MBM costs for one person range from ${min(x['non'] for x in s1):,.0f} to ${max(x['non'] for x in s1):,.0f} a month across these places "
                   f"({names[min(s1, key=lambda x: x['non'])['p']]} lowest, {names[max(s1, key=lambda x: x['non'])['p']]} highest), whereas 1-bedroom asking rent spans "
                   f"${min(x['rent'] for x in s1):,.0f} to ${max(x['rent'] for x in s1):,.0f}. The MBM is a modest-basket benchmark, not an individual's actual spending."),
        "stat": {"value": _r(100 * st.median(rent_share), 0), "unit": "percent", "label": "median share of monthly outlay that is rent (single adult)", "period": quarter_label(latest)},
        "placeIds": [min(s1, key=lambda x: x["rent"] / x["monthly"])["p"], max(s1, key=lambda x: x["rent"] / x["monthly"])["p"]],
        "metricId": "cost_mbm_total", "sourceIds": [AS, MB],
        "calc": "rent / (rent + (MBM total - MBM shelter) x 0.5 / 12) for each place; non-shelter = total - shelter (includes food, clothing, transportation, communication, other).",
    }
    b1 = {"id": "runway-single-ranked", "type": "bar_ranked", "title": "Months a $15,000 buffer lasts - single adult, 1-bedroom",
          "subtitle": "Scenario: no income; asking rent + MBM non-shelter basket for one person", "unit": "months", "yLabel": "months",
          "series": [{"id": "runway_single", "label": "Months of runway", "points": [{"x": names[x["p"]], "y": round(x["months"], 1), "placeId": x["p"]} for x in s1]}],
          "notes": "Excludes one-off arrival costs, taxes, benefits and income. MBM 2025 current dollars; rent 2026-Q2.", "sourceIds": [AS, MB]}
    b2 = {"id": "runway-both", "type": "dot_compare", "title": "Months of runway by household type",
          "subtitle": "Single adult ($15,000, 1BR) vs couple + 1 child ($25,000, 2BR)", "unit": "months", "yLabel": "months",
          "series": [{"id": "single", "label": "Single adult, $15,000", "points": [{"x": names[x["p"]], "y": round(x["months"], 1), "placeId": x["p"]} for x in s1]},
                     {"id": "family", "label": "Couple + 1 child, $25,000", "points": [{"x": names[x["p"]], "y": round(next(y for y in s3 if y["p"] == x["p"])["months"], 1), "placeId": x["p"]} for x in s1 if any(y["p"] == x["p"] for y in s3)]}],
          "notes": "Scenario only. Savings buffers are stated assumptions, not typical values.", "sourceIds": [AS, MB]}
    ins2 = {
        "id": "arrival-budget", "topic": "budget",
        "title": f"With no income, a $15,000 buffer covers about {s1[-1]['months']:.0f} to {s1[0]['months']:.0f} months for a single adult depending on the city",
        "question": "If I arrive with savings and no income yet, how many months could I cover housing and everyday costs in each place?",
        "dek": "A transparent scenario: sourced asking rent plus Market Basket Measure non-shelter costs, scaled to household size. Change the assumptions to match your situation.",
        "findings": [g1, g3, g5], "charts": [b1, b2],
        "interpretation": [
            "Use this as a stress test of how quickly savings run down, not a forecast. Because rent is the biggest and most variable piece, the same savings buy more months in lower-rent places - but job prospects and wages differ too (see the work pages).",
            "Real first-months spending usually also includes a rental deposit or first/last month, furnishing, winter clothing and transport to settle in; these are left out here and would shorten the runway.",
        ],
        "methodology": [
            "Monthly cost = latest average asking rent for the stated apartment size (StatCan 46-10-0092-01) + non-shelter MBM costs / 12.",
            "Non-shelter MBM = Total threshold - Shelter component (Food, Clothing, Transportation, Communication services, Other expenses) from StatCan 11-10-0066-01, 2023-base MBM, 2025 current dollars, for the MBM region mapped to each place; this is the reference family of four.",
            "Household scaling uses StatCan's square-root equivalence scale: cost for n persons = reference-family cost x sqrt(n/4) (1 person 50%, 3 persons 87%). We verified it reproduces the published family-size totals in table 11-10-0104-01 (Toronto 2025: 1 person 31,440; 2 persons 44,463; 3 persons 54,456).",
            "Months of runway = stated savings / monthly cost. Stated savings are $15,000 (single) and $25,000 (couple + 1 child). No income, no taxes, no benefits, no one-off costs, no inflation between 2025 (MBM) and the rent quarter.",
        ],
        "limitations": [
            "MBM regions differ from the CMAs and several places share one regional value (e.g. Victoria, Kelowna and Abbotsford-Mission all use 'British Columbia, population 100,000 to 499,999'); Gatineau's mapping to the Quebec 100,000-499,999 class is an assumption.",
            "The MBM is a modest-basket benchmark for a reference family, scaled by an equivalence scale; it is not a measure of what an individual newcomer spends, and it covers 2025 prices while rents are 2026-Q2.",
            "Asking rents are averages of advertised apartments; the cheapest listings may be smaller or in less central areas.",
            "Coverage: places not in the StatCan rent table (Charlottetown, Brandon, Whitehorse, Yellowknife, Iqaluit) are excluded.",
        ],
        "sourceIds": [AS, MB], "relatedPlaceIds": sorted(set(sum([f["placeIds"] for f in (g1, g3, g5)], []))), "computedAt": today,
    }
    extra = {"runway": {k: [(x["p"], round(x["months"], 2)) for x in v] for k, v in res.items()}, "gaps": [(g[0], round(g[3], 1)) for g in gaps]}
    return [ins1, ins2], extra
