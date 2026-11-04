"""Job Bank search-link templates (links only; no postings are fetched or stored)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common.fetch import now_iso  # noqa: E402

VERIFIED = "2026-11-04"
B = "https://www.jobbank.gc.ca/jobsearch/jobsearch"

# Job Bank's own city ids (from its location type-ahead, /core/ta-cityprovsuggest_en), looked up once on 2026-11-04.
# They are needed because Job Bank ignores a free-text locationstring unless locationparam carries its city id.
JB_CITY_IDS = {
    "toronto": ("Toronto (ON)", "22437"), "montreal": ("Montréal (QC)", "22446"), "vancouver": ("Vancouver (BC)", "39070"),
    "calgary": ("Calgary (AB)", "22310"), "edmonton": ("Edmonton (AB)", "22312"), "ottawa": ("Ottawa (ON)", "22409"),
    "gatineau": ("Gatineau (QC)", "22443"), "winnipeg": ("Winnipeg (MB)", "39073"), "quebec-city": ("Québec (QC)", "22447"),
    "hamilton": ("Hamilton (ON)", "39078"), "kitchener-waterloo": ("Kitchener (ON)", "39076"), "london": ("London (ON)", "39077"),
    "halifax": ("Halifax (NS)", "22390"), "victoria": ("Victoria (BC)", "39071"), "saskatoon": ("Saskatoon (SK)", "22463"),
    "regina": ("Regina (SK)", "22462"), "st-johns": ("St. John's (NL)", "22386"), "windsor": ("Windsor (ON)", "22427"),
    "kelowna": ("Kelowna (BC)", "22342"), "abbotsford-mission": ("Abbotsford (BC)", "22369"), "moncton": ("Moncton (NB)", "22382"),
    "saint-john": ("Saint John (NB)", "22380"), "fredericton": ("Fredericton (NB)", "22379"), "sherbrooke": ("Sherbrooke (QC)", "22448"),
    "sudbury": ("Sudbury (ON)", "22420"), "thunder-bay": ("Thunder Bay (ON)", "22422"), "charlottetown": ("Charlottetown (PE)", "22442"),
    "brandon": ("Brandon (MB)", "22376"), "whitehorse": ("Whitehorse (YT)", "22309"), "yellowknife": ("Yellowknife (NT)", "22391"),
    "iqaluit": ("Iqaluit (NU)", "39318"),
}

LOC_NOTE = ("Needs Job Bank's city id: pass locationparam={jbCityId} (from placeLocations in this file) and locationstring={city}. "
            "Without locationparam Job Bank silently ignores the location and searches all of Canada. "
            "The search covers the city and nearby communities (a default radius).")


def build() -> dict:
    t = []
    t.append({"id": "foreign-candidates", "label": "Job Bank for foreign candidates",
              "description": "Official Government of Canada guidance for candidates outside Canada, with the entry point to jobs open to international candidates.",
              "urlTemplate": "https://www.jobbank.gc.ca/findajob/foreign-candidates", "verifiedAt": VERIFIED,
              "notes": "Page lists three steps (eligibility, credential recognition, job search). It states that applicants who have not yet applied for immigration or a work permit should start with IRCC."})
    t.append({"id": "international-keyword", "label": "Jobs open to international candidates: {query}",
              "description": "Job Bank search for this occupation title across Canada, filtered to postings the employer marked as open to international candidates.",
              "urlTemplate": f"{B}?searchstring={{query}}&fglo=1&sort=M", "verifiedAt": VERIFIED,
              "notes": "fglo=1 is the filter used by the 'Search jobs open to international candidates' link on the foreign-candidates page. Employers decide whether to mark a posting; absence of the mark does not prove a job is closed to foreign applicants."})
    t.append({"id": "international-noc", "label": "Jobs open to international candidates by occupation group (NOC)",
              "description": "Same filter, matched on the NOC 2021 unit group code (fn21) instead of a keyword.",
              "urlTemplate": f"{B}?fn21={{noc}}&fglo=1&sort=M", "verifiedAt": VERIFIED,
              "notes": "fn21 takes the 5-digit NOC 2021 code. Verified with 72106 (welders)."})
    t.append({"id": "city-international", "label": "Jobs open to international candidates near {city}",
              "description": "Keyword search in the selected city, filtered to postings open to international candidates.",
              "urlTemplate": f"{B}?searchstring={{query}}&locationstring={{city}}&locationparam={{jbCityId}}&fglo=1&sort=M",
              "verifiedAt": VERIFIED, "notes": LOC_NOTE})
    t.append({"id": "city-all", "label": "All current postings near {city}",
              "description": "Keyword search in the selected city, all postings (including those limited to people already allowed to work in Canada).",
              "urlTemplate": f"{B}?searchstring={{query}}&locationstring={{city}}&locationparam={{jbCityId}}&sort=M",
              "verifiedAt": VERIFIED, "notes": LOC_NOTE + " Includes postings for Canadians, permanent residents and work-permit holders only."})
    t.append({"id": "city-noc", "label": "Postings in this occupation group near {city}",
              "description": "NOC 2021 unit group search in the selected city (all postings).",
              "urlTemplate": f"{B}?fn21={{noc}}&locationstring={{city}}&locationparam={{jbCityId}}&sort=M",
              "verifiedAt": VERIFIED, "notes": LOC_NOTE})
    return {
        "retrievedAt": now_iso(),
        "boards": [{"id": "jobbank", "label": "Job Bank - Government of Canada", "templates": t}],
        "placeLocations": {pid: {"label": lab, "jbCityId": cid} for pid, (lab, cid) in JB_CITY_IDS.items()},
        "feedStatus": {
            "currentPostingsFeed": "none_permitted",
            "explanation": ("Job Bank's Terms of use - Job seekers (https://www.jobbank.gc.ca/termsofuseseeker) prohibit scripts, robots, crawlers, screen scrapers and other "
                            "automated query programs, and no public API for current postings was found. The app therefore links to Job Bank searches and does not fetch or display "
                            "live postings. Job Bank publishes a monthly open-data CSV of postings (open.canada.ca dataset ea639e28-c0fc-48bf-b5dd-b8899bd43072, Open Government Licence - Canada); "
                            "it is historical (previous month) and must never be described as currently open."),
        },
    }
