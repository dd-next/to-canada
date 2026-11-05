"""Small, strict parsers and merge logic for three official IRCC sources.

No scraped page-wide text, AI summaries or eligibility inference. News summaries
are the publisher's teaser; PDU titles stand alone; draw summaries use source fields.
"""
from __future__ import annotations

import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

BASE = "https://www.canada.ca"
NEWS_PAGE = BASE + "/en/immigration-refugees-citizenship/news/rss.html"
PDU_PAGE = BASE + "/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/updates.html"
ROUNDS_PAGE = BASE + "/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html"
SOURCES = [
    {"id": "ircc-news", "label": "IRCC newsroom", "url": NEWS_PAGE},
    {"id": "ircc-program-delivery", "label": "Program delivery updates", "url": PDU_PAGE},
    {"id": "ircc-express-entry", "label": "Express Entry rounds", "url": ROUNDS_PAGE},
]


class Node:
    def __init__(self, tag="", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, tag):
        for child in self.children:
            if isinstance(child, Node):
                if child.tag == tag:
                    yield child
                yield from child.find(tag)

    def text(self):
        return " ".join(c.text() if isinstance(c, Node) else c for c in self.children)


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.stack[-1].tag not in {"script", "style"}:
            self.stack[-1].children.append(data)


def text(value):
    return re.sub(r"\s+", " ", Document(unescape(str(value))).root.text()).strip()


def official_url(value, base=BASE):
    p = urlsplit(urljoin(base, unescape(value)))
    if p.scheme != "https" or p.hostname not in {"www.canada.ca", "canada.ca", "api.io.canada.ca"} or p.username or p.password:
        raise ValueError("Unexpected non-official publication URL")
    path = p.path.replace("/content/canadasite/", "/")
    query = [(k, v) for k, v in parse_qsl(p.query) if not k.startswith("utm_")]
    return urlunsplit((p.scheme, p.netloc, path, urlencode(query), ""))


def iso(value):
    value = str(value).strip()
    datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def news_endpoint(landing):
    for link in Document(landing).root.find("a"):
        url = link.attrs.get("href", "")
        parsed = urlsplit(url)
        query = dict(parse_qsl(parsed.query))
        if parsed.hostname == "api.io.canada.ca" and query.get("format") == "atom" and query.get("dept") == "departmentofcitizenshipandimmigration":
            # Atom exposes only <updated>. The same official API's JSON exposes
            # publishedDate, so do not relabel an update timestamp as publication.
            query["format"] = "json"
            query.pop("atomtitle", None)
            return official_url(urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), "")))
    raise ValueError("The official RSS page no longer identifies its IRCC news feed")


def rounds_endpoint(landing):
    match = re.search(r"(/content/dam/ircc/documents/json/[A-Za-z0-9_-]+_en\.json)#/rounds", unescape(landing))
    if not match:
        raise ValueError("The rounds page no longer identifies its structured draw data")
    return official_url(match[1])


def related(title):
    """Explicit named programs only; no inferred personal eligibility."""
    names = {
        "canadian experience class": "express-entry-cec",
        "federal skilled worker": "express-entry-fswp",
        "federal skilled trades": "express-entry-fstp",
        "provincial nominee": "pnp-overview",
        "atlantic immigration": "aip",
        "rural community immigration": "rcip",
        "francophone community immigration": "fcip",
        "start-up visa": "start-up-visa",
        "express entry": "express-entry",
    }
    return [pid for phrase, pid in names.items() if phrase in title.lower()]


def record(source, kind, title, url, published, **fields):
    url = official_url(url)
    title = text(title)
    if not title:
        raise ValueError("Publication has no title")
    return {"id": source + ":" + hashlib.sha256(url.encode()).hexdigest()[:20],
            "sourceId": source, "type": kind, "title": title, "url": url,
            "publishedAt": iso(published), "topics": [], "programIds": related(title), **fields}


def news_atom_endpoint(json_endpoint):
    parsed = urlsplit(json_endpoint)
    query = dict(parse_qsl(parsed.query))
    query['format'] = 'atom'
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ''))


def news_publication_types(atom_raw):
    ns = {"a": "http://www.w3.org/2005/Atom"}
    feed = ET.fromstring(atom_raw)
    entries = feed.findall("a:entry", ns)
    if not entries:
        raise ValueError("IRCC Atom feed has no publication metadata")
    types = {}
    for entry in entries:
        link, category = entry.find("a:link", ns), entry.find("a:category", ns)
        if link is not None and category is not None and category.get('term'):
            types[official_url(link.attrib['href'])] = text(category.attrib['term'])
    return types


def parse_news(raw, publication_types=None):
    rows = json.loads(raw)["feed"]["entry"]
    if not isinstance(rows, list) or not rows:
        raise ValueError("IRCC news feed is empty or has changed format")
    result = []
    for row in rows:
        title = text(row["title"])
        description = text(row.get("teaser", ""))
        fields = {}
        subtype = (publication_types or {}).get(official_url(row['link']))
        if subtype:
            fields['publicationType'] = subtype
        if description and description != title:
            fields["description"] = description
        # Exact explicit program names provide useful topics without inferring an
        # affected audience from an unrelated mention in page chrome.
        topics = ["Express Entry"] if "express entry" in title.lower() else []
        if "francophone" in title.lower():
            topics.append("Francophone immigration")
        for phrase, label in [("asylum", "Asylum"), ("citizenship", "Citizenship"),
                              ("international student", "International students"), ("work permit", "Work permits")]:
            if phrase in title.lower():
                topics.append(label)
        if row.get("modifiedDate"):
            fields["updatedAt"] = iso(row["modifiedDate"])
        result.append(record("ircc-news", "news", title, row["link"], row["publishedDate"], topics=topics, **fields))
    return result


PDU_TOPICS = {"cit": "Citizenship", "pr": "Permanent residents", "ref": "Refugees",
              "man": "Service delivery", "req": "Standard requirements", "med": "Medical", "tr": "Temporary residents"}


def parse_pdu(raw, earliest_year):
    tables = [n for n in Document(raw).root.find("table") if n.attrs.get("id") == "tbl"]
    if len(tables) != 1:
        raise ValueError("Program delivery update table missing or ambiguous")
    result = []
    for row in tables[0].find("tr"):
        cells = list(row.find("td"))
        if not cells:
            continue
        if len(cells) != 3:
            raise ValueError("Program delivery table columns changed")
        date = cells[2].attrs.get("data-order", "")
        # Some legacy archive rows use a YYYY-MM-DD suffix in human text. Never
        # infer the date from the page modification stamp or retrieval clock.
        iso(date)
        if int(date[:4]) < earliest_year:
            continue
        links = list(cells[1].find("a"))
        if len(links) != 1:
            raise ValueError("Program delivery publication link missing or ambiguous")
        codes = re.findall(r"[a-z]+", cells[0].text().lower())
        if not codes:
            raise ValueError("Program delivery category is missing")
        # The live table contains typos ('red', 'reg') and undocumented legacy
        # tags ('id', 'info'). Only expand the codes the official filter defines.
        topics = list(dict.fromkeys(PDU_TOPICS[c] for c in codes if c in PDU_TOPICS))
        item = record("ircc-program-delivery", "program_delivery", links[0].text(),
                      links[0].attrs["href"], date, topics=topics, audience="IRCC staff and stakeholders")
        result.append(item)
    if not result:
        raise ValueError("No recent program delivery updates found")
    return result


def parse_rounds(raw):
    rows = json.loads(raw)["rounds"]
    if not isinstance(rows, list) or not rows:
        raise ValueError("Express Entry draw data is empty or changed format")
    result = []
    for row in rows:
        number = str(row["drawNumber"])
        if not re.fullmatch(r"\d+[a-z]?", number):
            raise ValueError("Unexpected round identifier")
        links = list(Document(row["drawNumberURL"]).root.find("a"))
        if len(links) != 1:
            raise ValueError("Draw publication link missing or ambiguous")
        category = text(row["drawName"])
        invitations = int(str(row["drawSize"]).replace(",", ""))
        cutoff = int(row["drawCRS"])
        if not category or invitations <= 0 or not 0 <= cutoff <= 1200:
            raise ValueError("Invalid Express Entry draw fields")
        draw = {"round": number, "date": iso(row["drawDate"]), "category": category,
                "invitations": invitations, "crsCutoff": cutoff}
        if row.get("drawCutOff"):
            draw["tieBreaking"] = text(row["drawCutOff"])
        item = record("ircc-express-entry", "express_entry", f"Express Entry #{number} — {category}",
                      links[0].attrs["href"], row["drawDate"], topics=["Express Entry", category],
                      programIds=list(dict.fromkeys(["express-entry", *related(category)])), draw=draw,
                      description=f"{invitations:,} invitations issued; CRS score of the lowest-ranked candidate invited: {cutoff}.")
        # Publication URL spelling can change; the official round number is the
        # persistent identity, including distinct rounds 91a and 91b.
        item["id"] = "ircc-express-entry:" + number
        result.append(item)
    return result


def content_hash(item):
    meaningful = {k: v for k, v in item.items() if k not in {"firstSeenAt", "lastCheckedAt", "contentHash", "contentChangedAt"}}
    return hashlib.sha256(json.dumps(meaningful, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def merge_source(previous, rows, source, checked_at, error=None):
    """An unsuccessful source retains every old entry and successful-check time."""
    old = {r["id"]: r for r in previous.get("entries", []) if r["sourceId"] == source["id"]}
    status = next((s for s in previous.get("sources", []) if s["id"] == source["id"]), {})
    merged = dict(old)
    if error is None:
        seen = {}
        for row in rows:
            hashed = content_hash(row)
            if row["id"] in seen and seen[row["id"]] != hashed:
                raise ValueError("Conflicting duplicate publication records")
            seen[row["id"]] = hashed
            prev = old.get(row["id"], {})
            merged[row["id"]] = {**row, "firstSeenAt": prev.get("firstSeenAt", checked_at),
                                 "lastCheckedAt": checked_at, "contentHash": hashed}
            # This is our observation of a content change, not the publisher's
            # modification date. Keep those concepts separate.
            if prev.get("contentHash") and prev["contentHash"] != hashed:
                merged[row["id"]]["contentChangedAt"] = checked_at
            elif prev.get("contentChangedAt"):
                merged[row["id"]]["contentChangedAt"] = prev["contentChangedAt"]
    entries = list(merged.values())
    dates = sorted(r["publishedAt"][:10] for r in entries)
    state = {**source, "status": "failed" if error else "ok", "lastCheckedAt": checked_at,
             "lastSuccessfulCheckAt": status.get("lastSuccessfulCheckAt") if error else checked_at,
             "coverageStart": dates[0] if dates else None, "coverageEnd": dates[-1] if dates else None,
             "count": len(entries)}
    if error:
        state["error"] = error
    return entries, state


def validate_feed(feed):
    if feed.get("schemaVersion") != 1 or not isinstance(feed.get("entries"), list):
        raise ValueError("Invalid updates snapshot")
    ids = set()
    for item in feed["entries"]:
        if item["id"] in ids or item["type"] not in {"news", "program_delivery", "express_entry"}:
            raise ValueError("Duplicate or invalid update")
        ids.add(item["id"])
        official_url(item["url"])
        iso(item["publishedAt"])
        iso(item["firstSeenAt"])
        iso(item["lastCheckedAt"])
        if content_hash(item) != item["contentHash"]:
            raise ValueError("Update content hash does not match")
    if {s["id"] for s in feed["sources"]} != {s["id"] for s in SOURCES}:
        raise ValueError("Missing source status")
