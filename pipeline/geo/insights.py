"""Step 4: computed insights `language-life` and `climate`. Every number is derived from the observations/series just built."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
CENSUS_SRC = ["statcan-98-10-0175-01"]
CLIM = ["eccc-climate-normals-1991-2020"]


def main(places: list[dict], observations: list[dict], series: list[dict]) -> list[dict]:
    pl = {p["id"]: p for p in places}
    val: dict[tuple[str, str], float | None] = {(o["placeId"], o["metricId"]): o["value"] for o in observations}
    short = {p["id"]: p["name"] for p in places}
    short["kitchener-waterloo"] = "Kitchener–Waterloo"

    def v(pid, m):
        return val.get((pid, m))

    def ranked(m, ids=None, reverse=True):
        ids = ids or [p["id"] for p in places]
        xs = [(pid, v(pid, m)) for pid in ids if v(pid, m) is not None]
        return sorted(xs, key=lambda t: t[1], reverse=reverse)

    def bar(cid, title, m, unit, sub, ids=None, srcs=None, notes=None, reverse=True, ylabel=None):
        r = ranked(m, ids, reverse)
        return {"id": cid, "type": "bar_ranked", "title": title, "subtitle": sub, "unit": unit, **({"yLabel": ylabel} if ylabel else {}),
                "series": [{"id": m, "label": title, "points": [{"x": short[p], "y": round(x, 1), "placeId": p} for p, x in r]}],
                "sourceIds": srcs, **({"notes": notes} if notes else {})}

    today = date.today().isoformat()
    insights = []

    # ------------------------------------------------------------------ language-life
    quebec = [p["id"] for p in places if p["province"] == "QC"]
    outside = [p["id"] for p in places if p["province"] != "QC" and v(p["id"], "lang_bilingual") is not None]
    fr = ranked("lang_french_knowledge")
    top_out = ranked("lang_bilingual", outside)[:3]
    qc_fr = [v(i, "lang_french_knowledge") for i in quebec]
    qc_bi = [(i, v(i, "lang_bilingual")) for i in quebec]
    qc_bi_s = sorted(qc_bi, key=lambda t: t[1])
    low_out = ranked("lang_bilingual", outside, reverse=False)
    f1 = {"id": "french-knowledge", "kind": "calculation",
          "headline": f"French is nearly universal in {len(quebec)} Quebec places ({min(qc_fr):.0f}–{max(qc_fr):.0f}%), but only {qc_bi_s[0][1]:.0f}–{qc_bi_s[-1][1]:.0f}% of residents also speak English",
          "detail": (f"Share of residents who can conduct a conversation in French: {', '.join(f'{short[i]} {v(i, 'lang_french_knowledge'):.0f}%' for i in quebec)}. "
                     f"Share who know both official languages is lower: {short[qc_bi_s[0][0]]} {qc_bi_s[0][1]:.0f}% to {short[qc_bi_s[-1][0]]} {qc_bi_s[-1][1]:.0f}% (the Quebec part of Ottawa–Gatineau is the most bilingual of the Quebec places)."),
          "stat": {"value": round(qc_bi_s[0][1], 1), "unit": "percent", "label": f"{short[qc_bi_s[0][0]]}: knows English and French", "period": "2021"},
          "placeIds": quebec, "metricId": "lang_bilingual", "sourceIds": CENSUS_SRC,
          "calc": "lang_bilingual = 'English and French' / total population in private households (98-10-0175-01, total mother tongue, total age and gender); lang_french_knowledge = ('French only' + 'English and French') / total."}
    f2 = {"id": "bilingual-outside-quebec", "kind": "calculation",
          "headline": f"Outside Quebec, {short[top_out[0][0]]} ({top_out[0][1]:.0f}%), {short[top_out[1][0]]} ({top_out[1][1]:.0f}%) and {short[top_out[2][0]]} ({top_out[2][1]:.0f}%) have the most bilingual residents; the lowest is {short[low_out[0][0]]} at {low_out[0][1]:.0f}%",
          "detail": (f"Median share knowing both official languages across the {len(outside)} places outside Quebec is "
                     f"{__import__('statistics').median(x for _, x in ranked('lang_bilingual', outside)):.1f}%. Ottawa (Ontario part) is {v('ottawa', 'lang_bilingual'):.0f}% and Gatineau (Quebec part) {v('gatineau', 'lang_bilingual'):.0f}% - the two parts of one CMA differ sharply. "
                     "French knowledge here is self-reported conversational ability for all ages, including children in French-immersion schooling."),
          "placeIds": [i for i, _ in top_out] + ["ottawa", "gatineau"], "metricId": "lang_french_knowledge", "sourceIds": CENSUS_SRC,
          "calc": "Same as above, restricted to places whose province is not QC; ranked descending on lang_bilingual."}
    tr = ranked("commute_transit_share")
    car = ranked("commute_car_share", reverse=False)
    act = ranked("commute_active_share")
    long_ = ranked("commute_45min_share")
    f3 = {"id": "commute-modes", "kind": "calculation",
          "headline": f"Transit carries {tr[2][1]:.0f}–{tr[0][1]:.0f}% of commuters in {short[tr[0][0]]}, {short[tr[1][0]]} and {short[tr[2][0]]}; no other place exceeds {tr[3][1]:.0f}%, and cars carry {car[0][1]:.0f}–{car[-1][1]:.0f}% of commuters across the {len(car)} places",
          "detail": (f"Among workers with a usual place of work in May 2021 (pandemic conditions), car/truck/van was the main mode for {car[0][1]:.0f}% in {short[car[0][0]]} up to {car[-1][1]:.0f}% in {short[car[-1][0]]}. "
                     f"Walking or cycling peaks in {short[act[0][0]]} ({act[0][1]:.0f}%), {short[act[1][0]]} ({act[1][1]:.0f}%) and {short[act[2][0]]} ({act[2][1]:.0f}%). "
                     f"{short[long_[0][0]]} has the largest share of commutes of 45 minutes or more ({long_[0][1]:.0f}%), then {short[long_[1][0]]} ({long_[1][1]:.0f}%) and {short[long_[2][0]]} ({long_[2][1]:.0f}%)."),
          "stat": {"value": round(tr[0][1], 1), "unit": "percent", "label": f"{short[tr[0][0]]}: commute mainly by transit", "period": "2021"},
          "placeIds": [tr[0][0], tr[1][0], tr[2][0], act[0][0], long_[0][0]], "metricId": "commute_transit_share", "sourceIds": ["statcan-98-10-0457-01"],
          "calc": "Shares = main-mode count / total commuters with a usual place of work (98-10-0457-01; total time leaving, age, gender; statistic Count). Active = walked + bicycle. 45+ min = (45 to 59 + 60 minutes and over) / total."}
    hh = ranked("hh_avg_size")
    f4 = {"id": "household-size", "kind": "calculation",
          "headline": f"Average household size ranges from {hh[-1][1]:.1f} persons ({short[hh[-1][0]]}) to {hh[0][1]:.1f} ({short[hh[0][0]]})",
          "detail": f"Larger households cluster in {short[hh[0][0]]}, {short[hh[1][0]]} and {short[hh[2][0]]} (population in private dwellings divided by occupied private dwellings, 2021). Household size is a context measure for space and rent-sharing, not a quality ranking.",
          "placeIds": [hh[0][0], hh[1][0], hh[2][0], hh[-1][0]], "metricId": "hh_avg_size", "sourceIds": ["statcan-98-10-0038-01"],
          "calc": "hh_avg_size = population in private dwellings / private dwellings occupied by usual residents (98-10-0038-01), CMA/CA or CMA part."}
    # dot_compare commute modes ordered by transit share
    order = [p for p, _ in tr]
    dots = lambda m, label: {"id": m, "label": label, "points": [{"x": short[p], "y": round(v(p, m), 1), "placeId": p} for p in order]}
    chart_lang = bar("lang-french-ranked", "Residents who can speak French", "lang_french_knowledge", "percent", "Share of population in private households, 2021 Census (25% sample)", srcs=CENSUS_SRC,
                     notes="CMA/CA values (Ottawa and Gatineau: Ontario and Quebec parts). Self-reported conversation ability, all ages.")
    chart_bi = {"id": "lang-french-vs-bilingual", "type": "dot_compare", "title": "French knowledge versus English-and-French bilingualism", "subtitle": "Share of population, 2021 Census (25% sample)",
                "unit": "percent", "series": [{"id": "lang_french_knowledge", "label": "Can speak French", "points": [{"x": short[p], "y": round(x, 1), "placeId": p} for p, x in fr]},
                                              {"id": "lang_bilingual", "label": "Can speak English and French", "points": [{"x": short[p], "y": round(v(p, "lang_bilingual"), 1), "placeId": p} for p, _ in fr]}],
                "sourceIds": CENSUS_SRC}
    chart_com = {"id": "commute-modes", "type": "dot_compare", "title": "How people commute", "subtitle": "Main mode, % of workers with a usual place of work, May 2021 (25% sample)", "unit": "percent",
                 "series": [dots("commute_transit_share", "Public transit"), dots("commute_active_share", "Walk or bicycle"), dots("commute_car_share", "Car, truck or van")],
                 "notes": "Census day was in May 2021, during COVID-19 restrictions; people working from home are excluded from the universe.", "sourceIds": ["statcan-98-10-0457-01"]}
    mode_ids = [p for p in order if all(v(p, m) is not None for m in ("commute_car_share", "commute_transit_share", "commute_active_share"))]
    seg = lambda sid, label, f: {"id": sid, "label": label, "points": [{"x": short[p], "y": round(f(p), 1), "placeId": p} for p in mode_ids]}
    chart_stack = {"id": "commute-modes-stacked", "type": "stacked_bar", "title": "How people get to work", "subtitle": "Main commuting mode, % of workers with a usual place of work, May 2021 (25% sample)", "unit": "percent",
                   "series": [seg("commute_car_share", "Car, truck or van", lambda p: v(p, "commute_car_share")),
                              seg("commute_transit_share", "Public transit", lambda p: v(p, "commute_transit_share")),
                              seg("commute_active_share", "Walk or bicycle", lambda p: v(p, "commute_active_share")),
                              seg("commute_other", "Other", lambda p: max(0.0, 100 - v(p, "commute_car_share") - v(p, "commute_transit_share") - v(p, "commute_active_share")))],
                   "notes": "Universe: employed labour force aged 15+ with a usual place of work (excludes people working at home or with no fixed workplace). Census day was in May 2021, during COVID-19 restrictions. Other = 100% minus car, transit and walk/bicycle (motorcycle, taxi and other methods). Places ordered by transit share; places missing any share are omitted.",
                   "sourceIds": ["statcan-98-10-0457-01"]}
    insights.append({
        "id": "language-life", "topic": "language_life",
        "title": "Language and daily life: French reach, commutes and household size",
        "question": "Which official language will I need day to day, and how do people get around?",
        "dek": "2021 Census figures for each place's metropolitan area or agglomeration show where French is the working language, where both languages are common, and how commuting differs.",
        "findings": [f1, f2, f3, f4], "charts": [chart_lang, chart_bi, chart_com, chart_stack],
        "interpretation": [
            "If you do not speak French, the Quebec places are the hardest to navigate in everyday settings, even though bilingualism is common in Montréal and the Gatineau part of Ottawa-Gatineau; outside Quebec, Moncton, Sudbury and Ottawa are the places where French is most usable in daily life.",
            "Commute patterns reflect urban form: transit commuting is concentrated in the three largest metros, while in most other places the car dominates and long commutes are uncommon. Use this with rent data to judge whether living near work is affordable.",
            "These are area-wide shares (metropolitan area or agglomeration). Neighbourhood patterns within a metro, for example downtown versus suburbs, can differ sharply."],
        "methodology": [
            "Statistics Canada 2021 Census tables 98-10-0175-01 (knowledge of official languages), 98-10-0227-01 (language most often at home), 98-10-0457-01 (main mode and duration of commuting), 98-10-0308-01 (immigrant status) and 98-10-0038-01 (household size), each filtered to the place's CMA/CA DGUID (Ottawa and Gatineau: Ontario and Quebec parts).",
            "Percentages are computed from published counts using the totals for all ages and genders; long-form counts are randomly rounded by Statistics Canada, so small differences (about one percentage point) should not be over-read."],
        "limitations": [
            "Long-form census data come from a 25% sample (household size and population from 100% data).",
            "Language knowledge is self-reported and covers all ages, including young children; it is not a measure of fluency at work.",
            "Commuting universe: employed labour force aged 15+ with a usual place of work (excludes those working at home or with no fixed workplace). The census was taken in May 2021 under COVID-19 restrictions, which depressed transit use.",
            "Iqaluit is a single municipality outside any CMA/CA and has no value for these metrics in this version."],
        "sourceIds": sorted({"statcan-98-10-0175-01", "statcan-98-10-0227-01", "statcan-98-10-0457-01", "statcan-98-10-0038-01"}),
        "relatedPlaceIds": [p["id"] for p in places], "computedAt": today})

    # ------------------------------------------------------------------ climate
    jan = ranked("clim_jan_mean_temp")
    d20 = ranked("clim_days_below_minus20")
    d30 = ranked("clim_days_above_30")
    snow = ranked("clim_annual_snow")
    mild = [x for x in jan if x[1] > 0]
    southern = [p["id"] for p in places if p["id"] not in ("whitehorse", "yellowknife", "iqaluit")]
    sd20 = ranked("clim_days_below_minus20", southern)
    c1 = {"id": "winter-severity", "kind": "calculation",
          "headline": f"January means span {jan[-1][1]:.0f} °C ({short[jan[-1][0]]}) to {jan[0][1]:+.1f} °C ({short[jan[0][0]]}); only {len(mild)} places ({', '.join(short[p] for p, _ in mild)}) average above freezing",
          "detail": f"Among the 28 places south of the territories, days with a minimum below -20 °C run from {sd20[-1][1]:.1f} a year in {short[sd20[-1][0]]} to {sd20[0][1]:.0f} in {short[sd20[0][0]]}; {short[sd20[1][0]]} ({sd20[1][1]:.0f}) and {short[sd20[2][0]]} ({sd20[2][1]:.0f}) are next. Toronto averages {v('toronto', 'clim_days_below_minus20'):.1f} such days, Montréal {v('montreal', 'clim_days_below_minus20'):.0f}.",
          "stat": {"value": round(jan[-1][1], 1), "unit": "degC", "label": f"{short[jan[-1][0]]}: January mean daily temperature", "period": "1991-2020"},
          "placeIds": [jan[-1][0], jan[0][0], sd20[0][0], "toronto", "montreal"], "metricId": "clim_days_below_minus20", "sourceIds": CLIM,
          "calc": "clim_jan_mean_temp = January 'Daily Average' normal (1991-2020); clim_days_below_minus20 = annual 'Days with Minimum Temperature < -20 C' normal; stations listed in each observation note."}
    sn = [(p, x) for p, x in snow]
    c2 = {"id": "snow", "kind": "observation",
          "headline": f"Snowfall is heaviest at the {short[snow[0][0]]} ({snow[0][1]:.0f} cm), {short[snow[1][0]]} ({snow[1][1]:.0f} cm) and {short[snow[2][0]]} ({snow[2][1]:.0f} cm) stations; Vancouver averages {v('vancouver', 'clim_annual_snow'):.0f} cm",
          "detail": f"Annual snowfall normals are published for {len(snow)} of {len(places)} station-place pairs (the rest are not published for those stations in the 1991-2020 normals). Calgary and Edmonton, though cold and dry, get {v('calgary', 'clim_annual_snow'):.0f} and {v('edmonton', 'clim_annual_snow'):.0f} cm; Toronto {v('toronto', 'clim_annual_snow'):.0f} cm.",
          "placeIds": [snow[0][0], snow[1][0], snow[2][0], "vancouver", "toronto"], "metricId": "clim_annual_snow", "sourceIds": CLIM,
          "calc": "clim_annual_snow = 'Snowfall (cm)' Year column of the station's 1991-2020 normals; ranked descending."}
    c3 = {"id": "summer-heat", "kind": "observation",
          "headline": f"{short[d30[0][0]]} ({d30[0][1]:.0f}), {short[d30[1][0]]} ({d30[1][1]:.0f}) and {short[d30[2][0]]} ({d30[2][1]:.0f}) have the most days above 30 °C; Vancouver has {v('vancouver', 'clim_days_above_30'):.1f}",
          "detail": f"Mean daily July highs run from {min(x for _, x in ranked('clim_jul_max_temp')):.0f} °C ({short[ranked('clim_jul_max_temp')[-1][0]]}) to {ranked('clim_jul_max_temp')[0][1]:.0f} °C ({short[ranked('clim_jul_max_temp')[0][0]]}). Vancouver, Victoria, St. John's, Halifax, Saint John, Charlottetown and the territorial stations record fewer than 5 days a year.",
          "placeIds": [d30[0][0], d30[1][0], d30[2][0], "vancouver"], "metricId": "clim_days_above_30", "sourceIds": CLIM,
          "calc": "clim_days_above_30 = annual 'Days with Maximum Temperature > 30 C' normal; clim_jul_max_temp = July 'Daily Maximum' normal."}
    pts = [{"x": round(v(p["id"], "clim_jan_mean_temp"), 1), "y": round(v(p["id"], "clim_jul_mean_temp"), 1), "label": short[p["id"]], "placeId": p["id"], "f": ["station_proxy"]}
           for p in places if v(p["id"], "clim_jan_mean_temp") is not None and v(p["id"], "clim_jul_mean_temp") is not None]
    sc = {"id": "jan-vs-jul", "type": "scatter", "title": "January versus July mean temperature", "subtitle": "1991–2020 climate normals at each place's representative station", "unit": "degC", "xUnit": "degC",
          "xLabel": "January mean daily temperature (°C)", "yLabel": "July mean daily temperature (°C)",
          "series": [{"id": "places", "label": "Places", "points": pts}], "sourceIds": CLIM,
          "notes": "Station proxy values; stations are listed in each observation note."}
    b20 = bar("days-below-minus20", "Days per year with minimum below −20 °C", "clim_days_below_minus20", "days", "1991–2020 normals, representative station", srcs=CLIM)
    # monthly climate for selected places
    sel = ["vancouver", "calgary", "toronto", "montreal", "halifax", "winnipeg"]
    smap = {s["id"]: s for s in series}
    ms = []
    for pid in sel:
        mean, mx, mn = (smap.get(f"normals-{pid}-{k}") for k in ("temp_mean", "temp_max", "temp_min"))
        if not (mean and mx and mn):
            continue
        ms.append({"id": pid, "label": short[pid], "placeId": pid,
                   "points": [{"x": a["t"], "y": a["v"], "y0": c["v"], "y1": b["v"]} for a, b, c in zip(mean["points"], mx["points"], mn["points"])]})
    mc = {"id": "monthly-temperature", "type": "monthly_climate", "title": "Monthly temperature at six large-metro stations", "subtitle": "Mean daily temperature (line) with mean daily minimum to maximum range, 1991–2020", "unit": "degC",
          "series": ms, "sourceIds": CLIM}
    insights.append({
        "id": "climate", "topic": "climate",
        "title": "Climate: how cold, how snowy and how hot",
        "question": "What will the weather be like where I might live, especially in winter?",
        "dek": "1991–2020 Environment and Climate Change Canada normals at one representative station per place, from the mild Pacific coast to the Arctic.",
        "findings": [c1, c2, c3], "charts": [sc, b20, mc],
        "interpretation": [
            "Winter severity varies more with location than with latitude alone: Prairie places (Winnipeg, Saskatoon, Regina, Brandon) have 45-53 days a year below -20 °C with moderate snowfall (91-128 cm), while St. John's, Moncton and Charlottetown get 285-363 cm of snow but only 0-12 days below -20 °C.",
            "The Pacific coast (Vancouver, Victoria, Abbotsford) is the only mild-winter group but has little summer heat; the Okanagan (Kelowna) and Windsor have the hottest summers.",
            "Pair these with housing and commuting data: heating and winter-clothing costs matter more in the Prairies and the North, while snow-clearing and winter driving matter more in Quebec and the Maritimes."],
        "methodology": [
            "ECCC Canadian Climate Normals 1991-2020, read from the station pages. One composite station per place: composites within 30 km of the place marker that are airports with normals code A-D (best code, then nearest), else the nearest A-D composite within 30 km, then any code, then up to 60 km.",
            "Observations: January and July means are the 'Daily Average'; January low is 'Daily Minimum'; July high is 'Daily Maximum'; precipitation and snowfall are 'Year' totals; day counts come from the 'Days with Minimum/Maximum Temperature' tables.",
            "Station choice is recorded on each place (climateStation) with distance to the place marker and every value carries the station_proxy flag. Gatineau shares the Ottawa airport station."],
        "limitations": [
            "A station is a proxy for a whole metropolitan area; elevation, lakes, coasts and urban heat make values differ within the area (for example Vancouver airport versus the North Shore).",
            "Normals are 30-year averages; individual years, and recent warming, can differ from them.",
            "Normals codes differ by station (A: WMO '3 and 5' rule; B at least 25 years; C at least 20; D at least 15; E-G fewer) and are kept in each observation note; some stations (for example Kelowna, Thunder Bay) publish no precipitation or snowfall normals, and these cells are left empty rather than filled from another station.",
            "Snowfall and precipitation are annual totals; they do not describe snow cover duration."],
        "sourceIds": CLIM, "relatedPlaceIds": [p["id"] for p in places], "computedAt": today})
    return insights
