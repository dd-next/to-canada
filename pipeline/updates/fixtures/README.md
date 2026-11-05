# Real IRCC parser examples

Small excerpts retrieved on 2026-11-05, without changing titles, dates, links or
draw fields. These are test inputs, not a second published data snapshot.

- `news.json`: four entries from the JSON representation of the official API
  linked on https://www.canada.ca/en/immigration-refugees-citizenship/news/rss.html.
  Endpoint: `https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=json`.
- `news-atom.xml`: those same four publications in the official Atom feed,
  preserving the publisher's categories (news release vs backgrounder).
- `program-delivery.html`: table header and first three rows from
  https://www.canada.ca/en/immigration-refugees-citizenship/corporate/publications-manuals/operational-bulletins-manuals/updates.html.
- `rounds.json`: rounds 453, 91a, 91b and 1 from
  https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json.
- Landing snippets preserve the endpoint-discovery attributes from the official
  RSS and Express Entry rounds pages. Non-data wrapper HTML is omitted.

Tests also deliberately modify these inputs to exercise duplicate records,
changed content, schema failures and irrelevant footer changes.
