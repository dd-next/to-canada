"""Program directory (ProgramRecord[]) and its source records. Every fact below was read from the cited official page on
2026-11-04 (see README for pages that could not be read). No eligibility scoring; reference only."""
from __future__ import annotations

from common.fetch import now_iso
from common_i import TODAY

C = "https://www.canada.ca/en/immigration-refugees-citizenship/services"
IC = C + "/immigrate-canada"

# source id -> (title, publisher, url, page date / note)
SOURCES = {
    "ircc-hub": ("Live in Canada permanently (IRCC immigration programs hub, incl. paused and closed programs)", "Immigration, Refugees and Citizenship Canada", IC + ".html", None),
    "ircc-express-entry": ("Express Entry: Who can apply", "Immigration, Refugees and Citizenship Canada", IC + "/express-entry/who-can-apply.html", None),
    "ircc-pnp": ("Immigrate as a provincial nominee", "Immigration, Refugees and Citizenship Canada", IC + "/provincial-nominees.html", None),
    "ircc-pnp-nonee": ("Provincial Nominee Program: Non-Express Entry process", "Immigration, Refugees and Citizenship Canada", IC + "/provincial-nominees/non-express-entry.html", "page dated 2026-06-05"),
    "ircc-aip": ("Atlantic Immigration Program (and how-to-immigrate page)", "Immigration, Refugees and Citizenship Canada", IC + "/atlantic-immigration.html", "page dated 2026-09-01"),
    "ircc-rural-franco": ("Rural and Francophone Community Immigration pilots (participating communities)", "Immigration, Refugees and Citizenship Canada", IC + "/rural-franco-pilots.html", "page dated 2026-08-31"),
    "ircc-rcip": ("Rural Community Immigration Pilot: overview and Who can apply", "Immigration, Refugees and Citizenship Canada", IC + "/rural-franco-pilots/rural-immigration.html", "pages dated 2026-04-30 / 2025-08-13"),
    "ircc-fcip": ("Francophone Community Immigration Pilot: overview and Who can apply", "Immigration, Refugees and Citizenship Canada", IC + "/rural-franco-pilots/franco-immigration.html", "pages dated 2026-04-30 / 2025-08-13"),
    "ircc-caregivers": ("Caregivers (home care workers)", "Immigration, Refugees and Citizenship Canada", IC + "/caregivers.html", "page dated 2026-01-27"),
    "ircc-doctors": ("Live and work as a medical doctor in Canada", "Immigration, Refugees and Citizenship Canada", IC + "/medical-doctors.html", None),
    "ircc-closed-pilots": ("Closed pilots: Agri-Food Pilot; Rural and Northern Immigration Pilot; TR to PR pathway", "Immigration, Refugees and Citizenship Canada", IC + "/agri-food-pilot.html", "pages dated 2026-04-27 and later"),
    "ircc-startup-self": ("Start-up Visa Program; Self-Employed Persons Program", "Immigration, Refugees and Citizenship Canada", IC + "/start-visa.html", None),
    "ircc-quebec-skilled": ("Quebec-selected skilled workers: About the process", "Immigration, Refugees and Citizenship Canada", IC + "/quebec-skilled-workers.html", "page dated 2026-03-11"),
    "ircc-pre-arrival": ("Pre-arrival services: Get help before you arrive in Canada", "Immigration, Refugees and Citizenship Canada", C + "/settle-canada/pre-arrival-services.html", "page dated 2026-03-05"),
    "ircc-newcomer-services": ("Find free newcomer services near you", "Immigration, Refugees and Citizenship Canada", "https://ircc.canada.ca/english/newcomers/services/index.asp", None),
    "ircc-settling": ("Settling in Canada (incl. Choose a city)", "Immigration, Refugees and Citizenship Canada", C + "/settle-canada.html", None),
    "prog-ab": ("Alberta Advantage Immigration Program (AAIP) and application streams", "Government of Alberta", "https://www.alberta.ca/alberta-advantage-immigration-program", "AAIP updates listed up to 2026-08-12"),
    "prog-bc": ("BC Provincial Nominee Program: program, Skills Immigration and invitations to apply", "Government of British Columbia (WelcomeBC)", "https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program", "pages updated 2026-05-28 to 2026-10-29"),
    "prog-mb": ("Manitoba Provincial Nominee Program (MPNP) and stream pages", "Government of Manitoba (Manitoba Immigration)", "https://immigratemanitoba.com/mpnp/", None),
    "prog-sk": ("Saskatchewan Immigrant Nominee Program (SINP): Browse SINP Programs", "Government of Saskatchewan", "https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program", None),
    "prog-on": ("Ontario Immigrant Nominee Program (OINP) and Ontario Workforce Priority stream", "Government of Ontario", "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp", None),
    "prog-nb": ("New Brunswick Provincial Nominee Program and Skilled Worker stream", "Government of New Brunswick (Immigration New Brunswick)", "https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program.html", None),
    "prog-ns": ("Nova Scotia Immigration (NSNP news items)", "Government of Nova Scotia", "https://liveinnovascotia.com/nova-scotia-nominee-program", None),
    "prog-nl": ("Newfoundland and Labrador Provincial Nominee Program (NLPNP): overview and Skilled Worker category", "Government of Newfoundland and Labrador", "https://www.gov.nl.ca/immigration/immigrating-to-newfoundland-and-labrador/provincial-nominee-program/overview/", None),
    "prog-nt": ("Northwest Territories Nominee Program: Immigrate Here; Employer-Driven Stream", "Government of the Northwest Territories", "https://www.immigratenwt.ca/immigrate-here", None),
    "prog-qc": ("Québec immigration: programs for skilled workers (PSTQ, PRTQ, pilot programs)", "Gouvernement du Québec", "https://www.quebec.ca/en/immigration/permanent/skilled-workers", "pages updated 2025-12-22 to 2026-08-31"),
    "prog-peq": ("Programme de l'experience quebecoise (PEQ) (French-language page; no English page found)", "Gouvernement du Québec", "https://www.quebec.ca/immigration/permanente/travailleurs-qualifies/programme-experience-quebecoise", "page dated 2026-10-29 (Derniere mise a jour)"),
    "comm-sudbury": ("Greater Sudbury RCIP and FCIP (Invest Sudbury)", "City of Greater Sudbury Economic Development", "https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/", None),
    "comm-kelowna": ("Immigration to Rural and Francophone Communities (FCIP) - Kelowna", "Societe de developpement economique de la Colombie-Britannique (SDECB)", "https://www.sdecb.com/en/pilot-program/", None),
}
PNP_PAGE = {  # province -> IRCC-linked owning page (from the IRCC provincial-nominees page)
}


def sources(retrieved: str) -> list[dict]:
    out = []
    for sid, (title, pub, url, note) in SOURCES.items():
        d = {"id": sid, "title": title, "publisher": pub, "url": url, "downloadUrl": url, "retrievedAt": retrieved,
             "referencePeriod": f"Page(s) read on {TODAY}", "licence": "Government website content; reproduced here only as short factual paraphrases with a link to the original page",
             "attribution": f"Source: {pub}, {url}", "transformations": ["Text paraphrased factually; no scoring or eligibility judgement added."],
             "notes": [note] if note else [], "status": "ok"}
        out.append(d)
    return out


def rec(id, name, jur, operator, cat, purpose, audience, geography, conds, job, url, src, *, short=None, parent=None,
        placeIds=None, status=None, links=None):
    r = {"id": id, "name": name, "jurisdiction": jur, "operator": operator, "category": cat, "purpose": purpose,
         "audience": audience, "geography": geography, "majorConditions": conds, "jobOfferRequired": job,
         "officialUrl": url, "lastChecked": TODAY, "sourceId": src}
    if short:
        r["shortName"] = short
    if parent:
        r["parentId"] = parent
    r["placeIds"] = placeIds or []
    if status:
        r["status"] = status
    if links:
        r["links"] = [{"label": a, "url": b} for a, b in links]
    return r


def st(value, note, url):
    return {"value": value, "note": note, "sourceUrl": url}


def build() -> list[dict]:
    R = []
    A = R.append
    I = "IRCC"
    # ------------------------------------------------------------ federal economic
    A(rec("express-entry", "Express Entry", "federal", I, "federal_economic",
          "Online system IRCC uses to manage permanent residence applications from skilled workers under three programs; candidates in the pool are invited in rounds, highest-ranked first.",
          "Skilled workers and tradespeople, in Canada or abroad.", "Canada outside Quebec (Quebec selects its own skilled workers).",
          ["Manages three programs: Canadian Experience Class, Federal Skilled Worker Program, Federal Skilled Trades Program.",
           "Candidates create a profile and enter the pool; IRCC invites the candidates with the most points in rounds.",
           "A provincial nomination adds 600 points to an Express Entry profile (per IRCC's PNP page)."],
          "varies", IC + "/express-entry.html", "ircc-express-entry", short="Express Entry",
          links=[("Who can apply", IC + "/express-entry/who-can-apply.html"), ("Immigrate as a provincial nominee", IC + "/provincial-nominees.html")]))
    A(rec("express-entry-cec", "Canadian Experience Class (Express Entry)", "federal", I, "federal_economic",
          "Express Entry program for skilled workers with eligible Canadian work experience.", "Workers with Canadian skilled work experience (NOC TEER 0-3).", "Canada outside Quebec.",
          ["Language: CLB 7 for TEER 0 or 1 occupations; CLB 5 for TEER 2 or 3 occupations.",
           "Work experience: 1 year in Canada within the last 3 years (full-time or part-time combination), in TEER 0, 1, 2 or 3.",
           "Education not required."], "no", IC + "/express-entry/who-can-apply.html", "ircc-express-entry", parent="express-entry", short="CEC"))
    A(rec("express-entry-fswp", "Federal Skilled Worker Program (Express Entry)", "federal", I, "federal_economic",
          "Express Entry program for skilled workers with eligible foreign or Canadian work experience.", "Skilled workers (NOC TEER 0-3), in Canada or abroad.", "Canada outside Quebec.",
          ["Language: CLB 7.", "Work experience: 1 year continuous within the last 10 years in the primary occupation (TEER 0-3).",
           "Secondary education required; more selection points for post-secondary education.",
           "Job offer not required, but a valid job offer earns selection criteria points."], "no", IC + "/express-entry/who-can-apply.html", "ircc-express-entry", parent="express-entry", short="FSWP"))
    A(rec("express-entry-fstp", "Federal Skilled Trades Program (Express Entry)", "federal", I, "federal_economic",
          "Express Entry program for skilled workers who are qualified in a skilled trade.", "Tradespeople in eligible skilled-trade occupations (TEER 2 or 3 key groups).", "Canada outside Quebec.",
          ["Language: CLB 5 for speaking and listening, CLB 4 for reading and writing.", "Work experience: 2 years within the last 5 years in a skilled trade.",
           "Requires a valid full-time job offer of at least 1 year, or a certificate of qualification in the trade from a Canadian authority.", "Education not required."],
          "yes", IC + "/express-entry/who-can-apply.html", "ircc-express-entry", parent="express-entry", short="FSTP"))
    A(rec("pnp-overview", "Provincial Nominee Program (PNP) - federal overview", "federal", I, "provincial_nominee",
          "Lets provinces and territories nominate people with the skills, education and work experience to contribute to their economy who want to live there and become permanent residents.",
          "Workers, business people and others who want to live in a specific province or territory.", "All provinces and territories except Quebec and Nunavut (which have no PNP per IRCC).",
          ["Each province or territory sets its own streams and requirements and its own annual nomination numbers.",
           "Two ways to apply: through Express Entry (nomination adds 600 points) or the non-Express Entry process; the province says which applies.",
           "IRCC makes the final permanent residence decision after the nomination."],
          "varies", IC + "/provincial-nominees.html", "ircc-pnp", short="PNP",
          status=st("open", "IRCC's 'Non-Express Entry process' page shows 'Status Open' (page dated 2026-06-05).", IC + "/provincial-nominees/non-express-entry.html"),
          links=[("Express Entry process", IC + "/provincial-nominees/express-entry.html"), ("Non-Express Entry process", IC + "/provincial-nominees/non-express-entry.html")]))
    A(rec("aip", "Atlantic Immigration Program (AIP)", "federal", I, "atlantic",
          "Pathway to permanent residence for skilled foreign workers and international graduates who want to work and live in New Brunswick, Nova Scotia, Prince Edward Island or Newfoundland and Labrador; helps employers fill jobs they cannot fill locally.",
          "Skilled workers and recent graduates of recognized Atlantic post-secondary institutions, abroad or in Canada as temporary residents.", "NB, NS, PE and NL.",
          ["Requires a job offer from an employer designated by the Atlantic province.",
           "Candidate must be a recent graduate of a recognized post-secondary institution in Atlantic Canada or a skilled worker.",
           "Province issues an endorsement (after a settlement plan) before the permanent residence application to IRCC.",
           "Applicants may apply for a work permit while waiting if they have a qualifying job offer and a referral letter from the province."],
          "yes", IC + "/atlantic-immigration.html", "ircc-aip", short="AIP",
          status=st("open", "IRCC's 'Immigrate through the Atlantic Immigration Program' page shows 'Status Open' (page dated 2026-06-22).", IC + "/atlantic-immigration/how-to-immigrate.html"),
          links=[("How to immigrate (AIP)", IC + "/atlantic-immigration/how-to-immigrate.html"), ("Hire (employers)", IC + "/atlantic-immigration/hire-immigrant.html")]))
    ropen = st("open", "IRCC's pilot page shows 'Status Open' (page dated 2026-04-30).", IC + "/rural-franco-pilots/rural-immigration.html")
    A(rec("rcip", "Rural Community Immigration Pilot (RCIP)", "federal", I, "community_pilot",
          "Permanent residence for skilled workers who want to work and settle in rural and more remote communities; communities approve (designate) employers to hire for jobs they cannot fill locally.",
          "Skilled workers with a job offer in a participating community.", "14 participating communities across NS, ON, MB, SK, AB and BC (see community records).",
          ["Valid job offer from a designated employer in the community.", "At least 1 year (1,560 hours) of related work experience in the past 3 years.",
           "Approved language test; Canadian educational credential or foreign equivalent; proof of enough money to support yourself and your family.",
           "Community-specific requirements and community recommendation also apply (published by each community)."],
          "yes", IC + "/rural-franco-pilots/rural-immigration.html", "ircc-rcip", short="RCIP", status=ropen,
          links=[("Who can apply", IC + "/rural-franco-pilots/rural-immigration/eligibility.html"), ("Participating communities", IC + "/rural-franco-pilots.html")]))
    A(rec("fcip", "Francophone Community Immigration Pilot (FCIP)", "federal", I, "community_pilot",
          "Permanent residence for skilled workers who want to work and settle in rural remote Francophone-minority communities; communities approve employers to hire for jobs they cannot fill locally.",
          "Skilled workers with a job offer in a participating Francophone-minority community.", "6 participating communities in NB, ON, MB and BC (see community records).",
          ["Valid job offer from a designated employer in the community.", "At least 1 year (1,560 hours) of related work experience in the past 3 years.",
           "Approved language test; Canadian educational credential or foreign equivalent; proof of enough money.",
           "Community-specific requirements apply (for example, Kelowna's page states a French level of CLB 5)."],
          "yes", IC + "/rural-franco-pilots/franco-immigration.html", "ircc-fcip", short="FCIP",
          status=st("open", "IRCC's pilot page shows 'Status Open' (page dated 2026-04-30).", IC + "/rural-franco-pilots/franco-immigration.html"),
          links=[("Who can apply", IC + "/rural-franco-pilots/franco-immigration/eligibility.html")]))
    A(rec("physicians-pathways", "Medical doctors: Express Entry category and PNP spaces", "federal", I, "federal_economic",
          "IRCC pathways to make permanent residence simpler for international medical doctors.", "Medical doctors, with or without Canadian work experience.", "Canada outside Quebec (provinces and territories nominate).",
          ["Express Entry category for medical doctors with at least 1 year of full-time Canadian work experience as a doctor in the last 3 years.",
           "5,000 federal immigration spaces reserved through the PNP to nominate doctors with job offers or letters of support.",
           "Doctors nominated by a province or territory get a work permit processed in 14 days.",
           "Must have credentials assessed and be licensed by a provincial or territorial regulatory authority to work as a doctor."],
          "varies", IC + "/medical-doctors.html", "ircc-doctors"))
    A(rec("hcw-pilots", "Home Child Care Provider Pilot and Home Support Worker Pilot", "federal", I, "federal_economic",
          "Former caregiver permanent residence pilots (IRCC's caregivers page also lists the Home Care Worker Immigration pilots).", "Caregivers.", "Canada.",
          ["IRCC's caregivers page states 'The last day to apply was June 17, 2024' for this pilot pair."], "unknown", IC + "/caregivers.html", "ircc-caregivers",
          status=st("closed", "'Home Child Care Provider Pilot and Home Support Worker Pilot - Closed. The last day to apply was June 17, 2024.'", IC + "/caregivers.html")))
    A(rec("agri-food-pilot", "Agri-Food Pilot", "federal", I, "federal_economic", "Pilot that let experienced, non-seasonal workers in specific agri-food industries and occupations immigrate permanently.",
          "Agriculture and agri-food workers.", "Canada.", ["IRCC: the pilot ended on May 14, 2025; applications accepted before that date continue to be processed."], "unknown", IC + "/agri-food-pilot.html", "ircc-closed-pilots",
          status=st("closed", "'The Agri-Food Pilot ended on May 14, 2025.' Status Closed.", IC + "/agri-food-pilot.html")))
    A(rec("rnip", "Rural and Northern Immigration Pilot (RNIP)", "federal", I, "community_pilot", "Former community-driven pilot that created a permanent residence path for skilled workers in smaller communities; succeeded by the RCIP.",
          "Skilled workers with a job in a participating community.", "Eleven communities (ON, MB, SK, AB, BC) per IRCC's closed page.", ["IRCC: the pilot ended on August 31, 2024; applications received on or before that date continue to be processed."], "yes",
          IC + "/rural-northern-immigration-pilot.html", "ircc-closed-pilots",
          status=st("closed", "'The Rural and Northern Immigration Pilot ended on August 31, 2024.'", IC + "/rural-northern-immigration-pilot.html")))
    A(rec("tr-pr-pathway", "Temporary resident to permanent resident pathway", "federal", I, "federal_economic", "Limited-time 2021 pathway to permanent residence for certain temporary workers and recent graduates.",
          "Temporary residents in essential or health occupations and recent graduates (2021).", "Canada.", ["IRCC: the pathway closed on November 5, 2021."], "unknown", IC + "/tr-pr-pathway.html", "ircc-closed-pilots",
          status=st("closed", "'This pathway closed on November 5, 2021.'", IC + "/tr-pr-pathway.html")))
    A(rec("start-up-visa", "Start-up Visa Program", "federal", I, "federal_economic", "Program for immigrant entrepreneurs with skills and potential to build innovative businesses in Canada (outside Quebec).",
          "Entrepreneurs.", "Canada outside Quebec.", ["IRCC describes the targeted businesses as innovative, able to create jobs for Canadians and able to compete globally.", "IRCC (re-read 2026-11-05): applying requires a valid 2025 commitment certificate and applying by June 30, 2026 (that date has passed); the program is closed to all other applications."], "not_applicable", IC + "/start-visa.html", "ircc-startup-self",
          status=st("paused", "IRCC page (re-read 2026-11-05): 'Status: Paused'; only holders of a valid 2025 commitment certificate could apply, by June 30, 2026 (passed); closed to all other applications.", IC + "/start-visa.html")))
    A(rec("self-employed-persons", "Self-Employed Persons Program", "federal", I, "federal_economic", "Permanent residence program for people with relevant experience in cultural activities or athletics.",
          "Self-employed people in cultural activities or athletics.", "Canada outside Quebec.", ["IRCC: for people who will make a significant contribution to the cultural or athletic life of Canada."], "not_applicable", IC + "/self-employed.html", "ircc-startup-self",
          status=st("paused", "IRCC page: 'Status Paused'.", IC + "/self-employed.html")))
    # ------------------------------------------------------------ Quebec
    Q = "https://www.quebec.ca/en/immigration/permanent/skilled-workers"
    A(rec("qc-pstq", "Skilled Worker Selection Program (PSTQ)", "QC", "Ministere de l'Immigration, de la Francisation et de l'Integration (Quebec)", "quebec",
          "Quebec's program for skilled workers who want to settle and work permanently in Quebec, whether in Quebec or abroad; replaces the PRTQ.", "Skilled workers.", "Quebec.",
          ["Four streams cover all occupations; general requirements apply to all, plus stream-specific criteria.",
           "Submit an expression of interest and receive an invitation before applying for selection (Certificat de selection du Quebec, CSQ).",
           "General conditions include age 18+, intending to take up eligible employment in Quebec, a signed Financial Self-Sufficiency Contract for three months, and the attestation of learning of democratic and Quebec values.",
           "Quebec selects first; IRCC then processes the federal permanent residence application."],
          "varies", Q + "/skilled-worker-selection-program", "prog-qc", short="PSTQ",
          links=[("Requirements", Q + "/skilled-worker-selection-program/requirements"), ("IRCC: Quebec-selected skilled workers", IC + "/quebec-skilled-workers.html")]))
    PEQ = "https://www.quebec.ca/immigration/permanente/travailleurs-qualifies/programme-experience-quebecoise"
    A(rec("qc-peq", "Quebec Experience Program (PEQ)", "QC", "Ministere de l'Immigration, de la Francisation et de l'Integration (Quebec)", "quebec",
          "Quebec program (Programme de l'experience quebecoise) for temporary foreign workers and foreign graduates of Quebec institutions who want to settle permanently in Quebec.", "Temporary foreign workers and foreign students who graduated in Quebec.", "Quebec.",
          ["Two streams: Temporary Foreign Workers and Quebec Graduates; general conditions plus stream-specific conditions (details on the stream pages, not read in full).",
           "Quebec's page (in French): the intake period, open since July 2, 2026, closed on October 31, 2026, so applications can no longer be submitted; no decision has been made about a possible new intake period.",
           "After October 31, 2026, requests to add or remove family members are still possible for files without a decision or with a selection certificate (CSQ) issued.",
           "Quebec's page points people who want to immigrate permanently to declare interest in Arrima for a possible invitation to the PSTQ."],
          "varies", PEQ, "prog-peq", short="PEQ",
          status=st("closed", "Quebec page (French, updated 2026-10-29): 'La periode de reception des demandes au Programme de l'experience quebecoise, qui etait ouverte depuis le 2 juillet 2026, est fermee depuis le 31 octobre 2026. Il n'est donc plus possible de presenter une demande dans ce programme. Il n'y a pas de decision prise quant a une possible nouvelle periode de reception des demandes.' (the English quebec.ca PEQ page was not available: HTTP 410/404)", PEQ),
          links=[("Selection conditions (French)", PEQ + "/conditions-selection")]))
    A(rec("qc-prtq", "Regular Skilled Worker Program (PRTQ)", "QC", "Ministere de l'Immigration, de la Francisation et de l'Integration (Quebec)", "quebec", "Former Quebec skilled worker program, replaced by the PSTQ.", "Skilled workers invited before 29 November 2024.", "Quebec.",
          ["Quebec's page: you must have received an invitation before November 29, 2024 to apply for selection under the PRTQ."], "unknown", Q + "/regular-skilled-worker-program", "prog-qc", parent=None,
          status=st("closed", "'The PRTQ has been replaced by the Programme de selection des travailleurs qualifies (PSTQ).' Invitations only before November 29, 2024.", Q + "/regular-skilled-worker-program")))
    A(rec("qc-food-processing-pilot", "Permanent immigration pilot program for workers in food processing", "QC", "Ministere de l'Immigration, de la Francisation et de l'Integration (Quebec)", "quebec",
          "Quebec pilot for temporary foreign workers in the food-processing sector.", "Temporary foreign workers in food processing.", "Quebec.",
          ["Quebec's page: the pilot ended as planned on January 1, 2026; applications submitted before that date continue to be processed."], "unknown", Q + "/food-processing", "prog-qc",
          status=st("closed", "'ended as planned on January 1, 2026. It is no longer possible to submit an application under this program.'", Q + "/food-processing")))
    A(rec("qc-other-pilots", "Quebec permanent immigration pilots (orderlies; AI, IT and visual effects)", "QC", "Ministere de l'Immigration, de la Francisation et de l'Integration (Quebec)", "quebec",
          "Quebec lists pilot programs for temporary foreign workers who work as orderlies and for workers in the artificial intelligence, information technology and visual effects sectors.", "Temporary foreign workers in those occupations or sectors.", "Quebec.",
          ["Details were not read; see the official pages."], "unknown", Q, "prog-qc"))
    # ------------------------------------------------------------ Alberta
    AB = "https://www.alberta.ca/aaip-application-streams"
    A(rec("ab-aaip", "Alberta Advantage Immigration Program (AAIP)", "AB", "Government of Alberta (Opportunity Alberta)", "provincial_nominee",
          "Economic immigration program that nominates people for permanent residence in Alberta to fill job shortages or to buy or start a business.", "Workers and entrepreneurs.", "Alberta.",
          ["Four streams for workers (Tourism and Hospitality, Alberta Opportunity, Alberta Express Entry, Rural Renewal) and four for entrepreneurs (Rural Entrepreneur, Graduate Entrepreneur, Farm, Foreign Graduate Entrepreneur).",
           "Nominees must have skills to fill job shortages or plan to buy or start a business, and be able to provide for their families.",
           "Most worker streams must meet Alberta job offer and employer requirements; IRCC makes the final decision."],
          "varies", "https://www.alberta.ca/alberta-advantage-immigration-program", "prog-ab", short="AAIP",
          links=[("Application streams", AB), ("Eligibility Explorer", "https://aaip.alberta.ca/eligibility-explorer")]))
    A(rec("ab-aaip-opportunity", "Alberta Opportunity Stream", "AB", "AAIP", "provincial_nominee", "Nomination for people already living and working in Alberta.", "Qualified candidates who live and work in Alberta.", "Alberta.",
          ["Live and work in Alberta.", "Have a job offer from an Alberta employer."], "yes", AB, "prog-ab", parent="ab-aaip"))
    A(rec("ab-aaip-tourism", "Tourism and Hospitality Stream", "AB", "AAIP", "provincial_nominee", "Nomination for tourism and hospitality workers already in Alberta.", "Candidates who live and work in Alberta in the sector.", "Alberta.",
          ["Live and work in Alberta.", "Full-time job offer to continue working with an Alberta tourism and hospitality sector employer."], "yes", AB, "prog-ab", parent="ab-aaip"))
    A(rec("ab-aaip-express-entry", "Alberta Express Entry Stream", "AB", "AAIP", "provincial_nominee", "Invitations to apply for nomination for Express Entry candidates aligned with Alberta priorities.", "Candidates with profiles in the Express Entry pool.", "Alberta.",
          ["Express Entry profile aligned with minimum requirements and provincial economic, sector and occupational priorities.", "Selected candidates are invited to apply; dedicated pathways exist for health care professionals, technology workers and police occupations."], "unknown", AB, "prog-ab", parent="ab-aaip"))
    A(rec("ab-aaip-rural-renewal", "Rural Renewal Stream", "AB", "AAIP", "provincial_nominee", "Community-driven stream: communities apply to be designated, then endorse candidates.", "Temporary workers with a job offer in a designated Alberta community.", "Designated rural Alberta communities.",
          ["Community must be designated before recruiting and endorsing candidates.", "Candidate needs a job offer from an Alberta employer in the designated community and an endorsement letter from the community."], "yes", AB, "prog-ab", parent="ab-aaip"))
    # ------------------------------------------------------------ BC
    BC = "https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program"
    A(rec("bc-pnp", "BC Provincial Nominee Program (BC PNP)", "BC", "Government of British Columbia (BC PNP)", "provincial_nominee",
          "Economic immigration program offering a pathway to permanent residency for workers, entrepreneurs and businesses that meet B.C.'s labour market and economic development needs.", "Skilled workers, health authority workers, entrepreneurs and businesses.", "British Columbia.",
          ["Two main pathways: Skills Immigration (workers) and Entrepreneur Immigration.", "Candidates register and are invited to apply in periodic rounds; invitation targets include priority groups such as health care and childcare.",
           "Application fee for workers: $1,750 CAD (registration has no fee), per the BC PNP page."], "varies", BC + "/the-bc-provincial-nominee-program", "prog-bc", short="BC PNP",
          status=st("intake_rounds", "BC PNP 'Invitations to apply' page (last updated October 29, 2026): 'Periodically, the BC PNP invites candidates in its registration pool to apply to the program.'", BC + "/invitations-to-apply"),
          links=[("Invitations to apply", BC + "/invitations-to-apply"), ("Workers: Skills Immigration", "https://www.welcomebc.ca/immigrate-to-b-c/for-workers")]))
    SK_ = "https://www.welcomebc.ca/immigrate-to-b-c/for-workers"
    A(rec("bc-pnp-skilled-worker", "BC PNP Skills Immigration: Skilled Worker stream", "BC", "BC PNP", "provincial_nominee", "Nomination for workers with a job offer in B.C.", "Workers with a B.C. job offer in a NOC TEER 0-3 occupation.", "British Columbia.",
          ["Full-time, indeterminate job offer from an eligible B.C. employer, supported by an Employer Declaration Form.", "Minimum two years full-time-equivalent work experience; meet occupation education and licensing credentials.",
           "Canadian Language Benchmark level 4; meet minimum wage and income requirements.", "Certain occupations (e.g. administrative assistants, retail sales supervisors) are listed as ineligible."], "yes", SK_, "prog-bc", parent="bc-pnp"))
    A(rec("bc-pnp-health-authority", "BC PNP Skills Immigration: Health Authority stream", "BC", "BC PNP", "provincial_nominee", "Nomination for health workers employed by a B.C. health authority.", "Workers with a job offer from a B.C. health authority in an eligible occupation.", "British Columbia.",
          ["Full-time, indeterminate job offer from a B.C. health authority employer, with an Employer Declaration Form.", "Meet work experience and education required by the BC PNP and the health authority; CLB level 4."], "yes", SK_, "prog-bc", parent="bc-pnp"))
    # ------------------------------------------------------------ Manitoba
    MB = "https://immigratemanitoba.com/mpnp/"
    A(rec("mb-mpnp", "Manitoba Provincial Nominee Program (MPNP)", "MB", "Manitoba Immigration", "provincial_nominee", "Economic immigration program that selects and nominates people whose skills match Manitoba's labour market and community needs.", "Skilled workers, Manitoba graduates, investors and entrepreneurs.", "Manitoba.",
          ["Three pathways: Skilled Worker Stream, International Education Stream, Business Investor Stream.", "Applicants are selected on their potential to become economically established in Manitoba."], "varies", MB, "prog-mb", short="MPNP"))
    A(rec("mb-skilled-worker", "MPNP Skilled Worker Stream", "MB", "Manitoba Immigration", "provincial_nominee", "Locally driven stream based on Manitoba employers' needs.", "Internationally trained workers, in Manitoba or abroad.", "Manitoba.",
          ["Two pathways: Skilled Worker in Manitoba (strong connection through ongoing employment) and Skilled Worker Overseas.", "Selection considers skills, education, work experience and official-language proficiency."], "varies", MB + "skilled-worker/", "prog-mb", parent="mb-mpnp"))
    A(rec("mb-ies", "MPNP International Education Stream", "MB", "Manitoba Immigration", "provincial_nominee", "Faster pathway to nomination for international students graduating from designated Manitoba institutions.", "Graduates of designated Manitoba post-secondary institutions.", "Manitoba.",
          ["Three pathways: Career Employment, Graduate Internship, International Student Entrepreneur Pilot.", "Graduates of institutions in other provinces are not eligible (they may use the Skilled Worker in Manitoba pathway)."], "varies", MB + "ies/", "prog-mb", parent="mb-mpnp"))
    A(rec("mb-bis", "MPNP Business Investor Stream", "MB", "Manitoba Immigration", "provincial_nominee", "Recruits and nominates business investors and entrepreneurs who intend to start or buy a business in Manitoba.", "Entrepreneurs and farm investors.", "Manitoba.",
          ["Two pathways: Entrepreneur Pathway and Farm Investor Pathway (rural Manitoba)."], "not_applicable", MB + "bis/", "prog-mb", parent="mb-mpnp"))
    # ------------------------------------------------------------ Saskatchewan
    SKU = "https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program"
    A(rec("sk-sinp", "Saskatchewan Immigrant Nominee Program (SINP)", "SK", "Government of Saskatchewan", "provincial_nominee", "Provincial nominee program with categories by applicant type.", "Skilled workers, workers already in Saskatchewan, entrepreneurs, farm owners and operators.", "Saskatchewan.",
          ["Categories: International Skilled Worker; Worker with Saskatchewan Work Experience; Entrepreneur; Farm Owner and Operator.", "Eligibility for an International Skilled Worker sub-category is assessed with a points grid.", "Language requirements and processing statistics are published on the SINP site."], "varies", SKU, "prog-sk", short="SINP",
          links=[("Browse SINP programs", SKU + "/browse-sinp-programs")]))
    # ------------------------------------------------------------ Ontario
    ON = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp"
    A(rec("on-oinp", "Ontario Immigrant Nominee Program (OINP)", "ON", "Government of Ontario (OINP)", "provincial_nominee", "Ontario's economic immigration program; nominates people with skills and experience the Ontario economy needs.", "Foreign workers with a job offer; self-employed physicians.", "Ontario.",
          ["Ontario's page: the new Ontario Workforce Priority stream has launched and all other streams are closed; further changes are signalled.", "IRCC makes the final permanent residence decision."], "varies", ON, "prog-on", short="OINP",
          links=[("Closed streams", "https://www.ontario.ca/page/ontario-immigrant-nominee-program-streams"), ("Previous invitations to apply", "https://www.ontario.ca/page/invitations-apply-oinp")]))
    A(rec("on-oinp-previous-streams", "OINP previous streams (closed)", "ON", "OINP", "provincial_nominee", "Ontario's earlier OINP streams, replaced by the Ontario Workforce Priority stream.", "Previous OINP applicants.", "Ontario.",
          ["OINP page: 'all other streams are now closed'; the Closed streams page lists Ontario's previous immigration streams."], "unknown", "https://www.ontario.ca/page/ontario-immigrant-nominee-program-streams", "prog-on", parent="on-oinp",
          status=st("closed", "OINP page: 'The new Ontario Workforce Priority stream has now launched, and all other streams are now closed.'", ON)))
    A(rec("on-oinp-workforce-priority", "Ontario Workforce Priority stream", "ON", "OINP", "provincial_nominee", "Pathway for skilled foreign workers with a qualifying job offer and work experience in any NOC occupation; also open to eligible self-employed physicians without a job offer.", "Foreign workers with an Ontario job offer; self-employed physicians.", "Ontario.",
          ["Employer must register with the program and apply for approval of the employment position.", "Candidate registers an expression of interest and must receive an invitation to apply and apply within the deadline.",
           "Meet stream requirements: work experience or mandatory licence, valid licence if required, language, education, legal status if applicable, and intention to live and work in Ontario."], "yes", "https://www.ontario.ca/page/ontario-workforce-priority-stream", "prog-on", parent="on-oinp",
          status=st("open", "OINP page: 'The new Ontario Workforce Priority stream has now launched.'", ON)))
    # ------------------------------------------------------------ New Brunswick
    NB = "https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program"
    A(rec("nb-pnp", "New Brunswick Provincial Nominee Program (NBPNP)", "NB", "Immigration New Brunswick", "provincial_nominee", "Pathways to permanent residence for foreign nationals who want to live and work, or run a business, in New Brunswick.", "Graduates, workers and entrepreneurs.", "New Brunswick.",
          ["Streams: Skilled Worker, Express Entry, Strategic Initiative, Business Immigration; pilots: Critical Worker Pilot and Private Career College Graduate Pilot.", "Candidates submit an expression of interest (valid 365 days); invitations to apply are issued only to selected individuals.",
           "Immigration New Brunswick nominates; IRCC makes the final decision."], "varies", NB + ".html", "prog-nb", short="NBPNP",
          status=st("intake_rounds", "NBPNP page: 'The following streams are subject to scheduled invitation draws: Skilled Worker, Express Entry, Strategic Initiative.'", NB + ".html")))
    A(rec("nb-skilled-worker", "NB Skilled Worker stream", "NB", "Immigration New Brunswick", "provincial_nominee", "Pathway for foreign workers with a full-time, non-seasonal job or job offer in New Brunswick.", "Workers in New Brunswick or with a job offer from an eligible employer.", "New Brunswick.",
          ["Age 19 or older; CLB level 4 in all four language skills.", "Support of an eligible employer operating in New Brunswick for the past 24 months.", "Meet the job requirements for the NOC occupation; pathway-specific rules (e.g. New Brunswick Experience: six months full time with the same employer and six months living in the province)."], "yes", NB + "/skilled-worker-stream.html", "prog-nb", parent="nb-pnp"))
    A(rec("nb-express-entry", "NB Express Entry stream", "NB", "Immigration New Brunswick", "provincial_nominee", "Provincial stream linked to Express Entry candidates.", "Express Entry candidates.", "New Brunswick.", ["Details not read; see the official page."], "unknown", NB + "/express-entry-stream.html", "prog-nb", parent="nb-pnp"))
    # ------------------------------------------------------------ Nova Scotia / PEI / NL / Yukon / NWT
    A(rec("ns-nsnp", "Nova Scotia Nominee Program (NSNP)", "NS", "Nova Scotia Office of Immigration and Population Growth", "provincial_nominee", "Nova Scotia's provincial nominee program.", "Workers and others selected by Nova Scotia.", "Nova Scotia.",
          ["Candidates submit an expression of interest (EOI) to a stream; Nova Scotia periodically selects from the EOI pool by provincial priorities and capacity (re-read 2026-11-05 at liveinnovascotia.com, which novascotiaimmigration.com now redirects to).", "EOIs have a 12-month validity period effective May 1, 2026 (transition measures apply).", "Application fees from September 1, 2026, charged only once an EOI is selected: $1,000 for worker streams, $2,000 for the entrepreneur stream; no fee to submit an EOI.", "July 14, 2026: one-time expansion of 2026 selection priorities for active EOIs submitted on or before June 30, 2026, covering candidates already working in Nova Scotia whose work permit expires in 2026 or earlier.", "Per the EOI Selection page (updated October 23, 2026), 946 candidates were selected in September 2026; October 2026 not yet reported.", "Stream-by-stream eligibility conditions were not read."], "unknown", "https://liveinnovascotia.com/nova-scotia-nominee-program", "prog-ns", short="NSNP",
          status=st("intake_rounds", "NSNP page (re-read 2026-11-05): candidates submit an EOI and Nova Scotia 'periodically selects' from the pool.", "https://liveinnovascotia.com/nova-scotia-nominee-program")))
    A(rec("pe-pnp", "PEI Provincial Nominee Program", "PE", "Government of Prince Edward Island", "provincial_nominee", "Prince Edward Island's provincial nominee program (IRCC links to the 'Immigrate to PEI as a worker' page).", "Workers.", "Prince Edward Island.",
          ["The province's page could not be read (HTTP 403 from the host), so no conditions are recorded."], "unknown", "https://www.princeedwardisland.ca/en/topic/immigrate-to-pei-as-a-worker", "ircc-pnp", short="PEI PNP"))
    NL = "https://www.gov.nl.ca/immigration/immigrating-to-newfoundland-and-labrador/provincial-nominee-program"
    A(rec("nl-nlpnp", "Newfoundland and Labrador Provincial Nominee Program (NLPNP)", "NL", "Office of Immigration and Multiculturalism", "provincial_nominee", "Helps employers with labour market challenges and skilled workers, international graduates and entrepreneurs settle in the province.", "Skilled workers, graduates, entrepreneurs.", "Newfoundland and Labrador.",
          ["Categories: Express Entry Skilled Worker; Skilled Worker; International Graduate; International Entrepreneur; International Graduate Entrepreneur.", "Applicants submit an expression of interest, then an invitation to apply."], "varies", NL + "/overview/", "prog-nl", short="NLPNP"))
    A(rec("nl-skilled-worker", "NLPNP Skilled Worker category", "NL", "Office of Immigration and Multiculturalism", "provincial_nominee", "Category for skilled workers with a job offer from an eligible Newfoundland and Labrador employer.", "Skilled workers.", "Newfoundland and Labrador.",
          ["Expression of interest through the Immigration Accelerator Portal; invited applicants have 30 days to submit a complete application.", "Job offer: full-time (at least 30 hours per week), at least one year with reasonable expectation of extension, salaried or hourly, meeting employment standards."], "yes", NL + "/applicants/skilled-worker/", "prog-nl", parent="nl-nlpnp"))
    A(rec("yt-ynp", "Yukon Nominee Program", "YT", "Government of Yukon", "provincial_nominee", "Yukon's nominee program (IRCC links to yukon.ca).", "Workers and others selected by Yukon.", "Yukon.",
          ["Yukon's page could not be read (HTTP 403 from the host), so no conditions are recorded."], "unknown", "https://yukon.ca/en/immigration/apply-immigrate-yukon/immigrate-yukon", "ircc-pnp"))
    NT = "https://www.immigratenwt.ca"
    A(rec("nt-nwtnp", "Northwest Territories Nominee Program (NTNP)", "NT", "Government of the Northwest Territories", "provincial_nominee", "Nominates people to move to the NWT for employer-supported jobs or to open, purchase or invest in a business.", "Workers with an NWT job offer; business people; Francophone applicants.", "Northwest Territories.",
          ["Streams: Employer-Driven Stream, Business Stream, Francophone Stream.", "Employer-Driven Stream: job offer from an NWT employer, who applies on the worker's behalf."], "varies", NT + "/immigrate-here", "prog-nt", short="NWTNP",
          status=st("closed", "NWT page: 'The Northwest Territories Nominee Program has closed its 2025 intake. The program has received enough applications to fill its nomination cap of 300.' (page re-read 2026-11-05; wording unchanged; the page does not say whether or when intake will reopen)", NT + "/immigrate-here")))
    # ------------------------------------------------------------ RCIP/FCIP communities
    R_COMM = [("pictou", "Pictou County", "NS", [], "https://pictoucountypartnership.com/program/rural-community-immigration-pilot-rcip/"), ("north-bay", "North Bay and Area", "ON", [], "https://nbrcip.ca/"),
              ("sudbury", "Greater Sudbury", "ON", ["sudbury"], "https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/"), ("timmins", "Timmins", "ON", [], "https://timminsedc.com/immigration/"),
              ("sault-ste-marie", "Sault Ste. Marie", "ON", [], "https://welcometossm.com/rcip/"), ("thunder-bay", "Thunder Bay", "ON", ["thunder-bay"], "https://gotothunderbay.ca/immigration/"),
              ("steinbach", "Steinbach", "MB", [], "https://steinbachedc.com/rcip/"), ("altona-rhineland", "Altona/Rhineland", "MB", [], "https://ared-rpga.com/immigration/rcip/"),
              ("brandon", "Brandon", "MB", ["brandon"], "https://economicdevelopmentbrandon.com/rcip/rcip"), ("moose-jaw", "Moose Jaw", "SK", [], "https://rcip.mjchamber.com/"),
              ("claresholm", "Claresholm", "AB", [], "https://claresholm-rcip.ca/"), ("west-kootenay", "West Kootenay", "BC", [], "https://westkootenayimmigration.ca/"),
              ("north-okanagan-shuswap", "North Okanagan Shuswap", "BC", [], "https://rcipnorthokanaganshuswap.com/"), ("peace-liard", "Peace Liard", "BC", [], "https://www.nebcimmigration.ca/")]
    for cid, nm, pr, pl, url in R_COMM:
        src, extra = "ircc-rural-franco", []
        if cid == "brandon":
            extra = ["Brandon's own RCIP page (economicdevelopmentbrandon.com) could not be read: its TLS certificate chain could not be verified from our fetcher (re-tried 2026-11-05; verification not bypassed). Only IRCC's pilot-wide conditions and its listing of Brandon are recorded here."]
        if cid == "sudbury":
            src = "comm-sudbury"
            extra = ["Sudbury's page: delivered by the City of Greater Sudbury Economic Development; employers are expected to look locally before recruiting foreign nationals; approved candidates can apply for PR and an LMIA-exempt work permit."]
        A(rec(f"rcip-{cid}", f"RCIP - {nm}", pr, f"{nm} community organization (RCIP)", "community_pilot", f"Community recommendation and employer designation for the Rural Community Immigration Pilot in {nm}.", "Skilled workers with a job offer from a designated employer in the community.", f"{nm} and area (boundary map on IRCC's page).",
              ["Pilot-wide conditions apply (see RCIP record): designated-employer job offer, 1,560 hours related experience in 3 years, language test, education, funds."] + extra + ["Community-specific requirements are published on the community's own website."],
              "yes", url, src, parent="rcip", placeIds=pl, links=[("IRCC participating communities", IC + "/rural-franco-pilots.html")]))
    F_COMM = [("acadian-peninsula", "Acadian Peninsula", "NB", [], "https://inspirepeninsuleacadienne.ca/programme-pilote-immigration-communautes-francophones/"),
              ("sudbury", "Greater Sudbury", "ON", ["sudbury"], "https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/"), ("timmins", "Timmins", "ON", [], "https://timminsedc.com/immigration/"),
              ("superior-east", "Superior East Region", "ON", [], "https://superioreastcfdc.ca/superioreastcfdc.ca/index.php/fcip"),
              ("st-pierre-jolys", "St. Pierre Jolys", "MB", [], "https://villagestpierrejolys.ca/p/francophone-communities-immigration-pilot-program"), ("kelowna", "Kelowna", "BC", ["kelowna"], "https://www.sdecb.com/en/pilot-program/")]
    for cid, nm, pr, pl, url in F_COMM:
        src, extra = "ircc-rural-franco", []
        if cid == "sudbury":
            src = "comm-sudbury"
            extra = ["Sudbury's page: the FCIP is delivered by the City of Greater Sudbury Economic Development together with the RCIP."]
        if cid == "kelowna":
            src = "comm-kelowna"
            extra = ["Kelowna's page (SDECB): French level of CLB 5; diploma equivalent or superior to a Canadian high school diploma; eligible-profession experience; intention to settle in Kelowna; bona fide job offer from a designated employer; referral from SDECB before the IRCC application."]
        A(rec(f"fcip-{cid}", f"FCIP - {nm}", pr, f"{nm} community organization (FCIP)", "community_pilot", f"Community recommendation and employer designation for the Francophone Community Immigration Pilot in {nm}.", "Skilled workers with a job offer from a designated employer in the community.", f"{nm} and area (boundary map on IRCC's page).",
              ["Pilot-wide conditions apply (see FCIP record): designated-employer job offer, 1,560 hours related experience in 3 years, language test, education, funds."] + extra + ["Community-specific requirements are published on the community's own website."],
              "yes", url, src, parent="fcip", placeIds=pl, links=[("IRCC participating communities", IC + "/rural-franco-pilots.html")]))
    # ------------------------------------------------------------ newcomer support
    A(rec("ircc-pre-arrival", "IRCC free pre-arrival services", "federal", I, "pre_arrival", "Free online services to prepare for the move and adapt to life in Canada while still in the home country; once in Canada they connect newcomers to local organizations.", "Prospective and approved immigrants, before arriving in Canada.", "Canada (delivered online).",
          ["Free of charge, per IRCC."], "not_applicable", C + "/settle-canada/pre-arrival-services.html", "ircc-pre-arrival", short="Pre-arrival services"))
    A(rec("ircc-newcomer-services", "Find free newcomer services near you (IRCC service finder)", "federal", I, "settlement_support", "Search tool for IRCC-funded settlement services (language, employment, community connections) by postal code, city or province.", "Eligible permanent residents, approved PR applicants, protected persons and certain temporary residents.", "Canada outside Quebec (the finder does not include Quebec providers).",
          ["Eligible groups include permanent residents (including resettled refugees), successful PR applicants approved in principle, protected persons, and temporary residents in certain programs (e.g. the AIP).",
           "IRCC notice: starting April 1, 2026, economic class permanent residents can access newcomer services for a limited time.", "In Quebec, use Quebec's integration support services instead."], "not_applicable", "https://ircc.canada.ca/english/newcomers/services/index.asp", "ircc-newcomer-services",
          links=[("Integration support in Quebec", "https://www.quebec.ca/en/immigration/settle-and-integrate-in-quebec")]))
    A(rec("ircc-settling-in-canada", "Settling in Canada (IRCC guide, incl. Choose a city)", "federal", I, "settlement_support", "IRCC information hub for newcomers: choosing a city, preparing financially, provinces and territories, credentials, job search, language and driving.", "Newcomers and prospective newcomers.", "Canada.",
          ["Includes a 'Choose a city' page on city size, community diversity and francophone communities."], "not_applicable", C + "/settle-canada.html", "ircc-settling",
          links=[("Choose a city", C + "/settle-canada/choose-city.html")]))
    for r in R:
        if r["id"] in ("qc-peq", "nt-nwtnp", "ns-nsnp", "start-up-visa", "self-employed-persons", "pnp-overview", "aip", "rcip", "fcip", "bc-pnp", "on-oinp-workforce-priority", "on-oinp-previous-streams", "nb-pnp"):
            r["lastChecked"] = "2026-11-05"
            if r.get("status"):
                pass
    return R
