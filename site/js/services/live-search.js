// Live literature search. Only extracted keywords leave the device, never the visitor's text.
// Each provider maps keywords to papers in one shared shape; adding a source = adding a provider.

import { europePmcQuery, extractKeywords, reconstructAbstract } from "../lib/search-core.js";

const stripTags = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const europePmc = (config) => ({
  name: "Europe PMC",
  enabled: () => true,
  async search(keywords) {
    const url = new URL(config.europe_pmc);
    const params = { query: europePmcQuery(keywords), resultType: "core", format: "json", pageSize: config.live_results, sort: "CITED desc" };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const d = await (await fetch(url)).json();
    return (d.resultList?.result || []).filter((r) => r.abstractText).map((r) => ({
      id: `epmc:${r.id}`, title: stripTags(r.title).replace(/\.$/, ""), authors: r.authorString, year: Number(r.pubYear),
      venue: r.journalInfo?.journal?.title || r.source, doi: r.doi, abstract: stripTags(r.abstractText), source: "Europe PMC",
      link: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`, license: r.license,
    }));
  },
});

export const openAlex = (config, getKey) => ({
  name: "OpenAlex",
  enabled: () => Boolean(getKey()),
  async search(keywords) {
    const url = new URL(config.openalex);
    const params = { search: keywords.join(" "), "per-page": 25, api_key: getKey(),
      select: "id,doi,title,publication_year,authorships,primary_location,abstract_inverted_index" };
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status}; check the key`);
    const d = await r.json();
    return (d.results || []).map((w) => {
      const abs = reconstructAbstract(w.abstract_inverted_index);
      const names = (w.authorships || []).map((a) => a.author?.display_name);
      return abs && { id: `oa:${w.id}`, title: w.title, year: w.publication_year, doi: w.doi?.replace("https://doi.org/", ""),
        authors: names.slice(0, 3).join(", ") + (names.length > 3 ? " et al." : ""),
        venue: w.primary_location?.source?.display_name, abstract: abs, source: "OpenAlex", link: w.doi || w.id };
    }).filter(Boolean);
  },
});

/** Query every enabled provider in parallel. Failures become notes, not errors. */
export async function liveSearch(text, providers) {
  const keywords = extractKeywords(text, 6);
  if (keywords.length < 2) return { keywords, papers: [], notes: ["Too few keywords for live search."] };
  const notes = [], papers = [];
  await Promise.all(providers.filter((p) => p.enabled()).map((p) =>
    p.search(keywords).then((found) => papers.push(...found)).catch((e) => notes.push(`${p.name} failed: ${e.message}`))));
  return { keywords, papers, notes };
}
