# Real IRCC parser examples

Small excerpts from the official sources with their original titles, dates,
links and draw fields.

- `news.json`: four entries from the JSON representation of the official API
  linked on https://www.canada.ca/en/immigration-refugees-citizenship/news/rss.html.
  Endpoint: `https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=json`.
- `news-atom.xml`: those same four publications in the official Atom feed,
  preserving the publisher's categories (news release vs backgrounder).
- `program-delivery.json` contains five entries retrieved on 2026-11-27,
  including an archive entry and the original misspelled wildfire URL.
  [Official IRCC JSON](https://www.canada.ca/content/dam/ircc/documents/json/pdi/pdu-en.json)
- `rounds.json`: rounds 453, 91a, 91b and 1 from
  https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json.
- Landing snippets preserve the endpoint-discovery attributes from the official
  RSS and Express Entry rounds pages. Non-data wrapper HTML is omitted.

Tests also deliberately modify these inputs to exercise duplicate records,
changed content, schema failures and irrelevant footer changes.
