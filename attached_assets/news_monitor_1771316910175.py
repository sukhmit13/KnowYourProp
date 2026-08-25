"""
news_monitor.py
---------------
Fetches neighborhood news from Block Club Chicago, Eater Chicago,
Crain's, and What Now Chicago. Matches articles to a property
by neighborhood name and proximity keywords.

Install:  pip install feedparser requests geopy
"""

import feedparser
import requests
import json
import os
import time
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

# ── RSS FEEDS ────────────────────────────────────────────────────────────────

RSS_FEEDS = {
    # Block Club – one feed per neighborhood (WordPress category pattern)
    "block_club_west_town":        "https://blockclubchicago.org/category/wicker-park-bucktown-west-town/feed/",
    "block_club_logan_square":     "https://blockclubchicago.org/category/logan-square/feed/",
    "block_club_pilsen":           "https://blockclubchicago.org/category/pilsen-little-village/feed/",
    "block_club_near_west":        "https://blockclubchicago.org/category/near-west-side-west-loop/feed/",
    "block_club_river_north":      "https://blockclubchicago.org/category/river-north/feed/",
    "block_club_lincoln_park":     "https://blockclubchicago.org/category/lincoln-park/feed/",
    "block_club_lakeview":         "https://blockclubchicago.org/category/lake-view/feed/",
    "block_club_uptown":           "https://blockclubchicago.org/category/uptown/feed/",
    "block_club_humboldt":         "https://blockclubchicago.org/category/humboldt-park/feed/",
    "block_club_citywide":         "https://blockclubchicago.org/feed/",   # fallback

    # Other high-signal sources
    "eater_chicago":               "https://chicago.eater.com/rss/index.xml",
    "what_now_chicago":            "https://whatnow.com/chicago/feed/",
    "chicago_yimby":               "https://chicagoyimby.com/feed/",
    "crains_restaurants":          "https://www.chicagobusiness.com/section/restaurants/rss",
    "timeout_chicago":             "https://www.timeout.com/chicago/rss/restaurants-bars-and-cafes",
}

# ── NEIGHBORHOOD → FEED MAPPING ──────────────────────────────────────────────

# Maps Chicago neighborhood names to which Block Club feed covers them.
# Add more as needed.
NEIGHBORHOOD_FEED_MAP = {
    "west town":         ["block_club_west_town"],
    "wicker park":       ["block_club_west_town"],
    "bucktown":          ["block_club_west_town"],
    "ukrainian village": ["block_club_west_town"],
    "logan square":      ["block_club_logan_square"],
    "humboldt park":     ["block_club_humboldt"],
    "pilsen":            ["block_club_pilsen"],
    "little village":    ["block_club_pilsen"],
    "west loop":         ["block_club_near_west"],
    "near west side":    ["block_club_near_west"],
    "river north":       ["block_club_river_north"],
    "lincoln park":      ["block_club_lincoln_park"],
    "lakeview":          ["block_club_lakeview"],
    "lake view":         ["block_club_lakeview"],
    "uptown":            ["block_club_uptown"],
}

# Keywords that signal relevant real-estate / business activity
SIGNAL_KEYWORDS = [
    # Openings
    "opening", "opens", "open soon", "coming soon", "new restaurant",
    "new bar", "new shop", "new store", "new cafe", "new coffee",
    "debut", "launching", "launch", "grand opening",
    # Development
    "development", "construction", "renovation", "redevelopment",
    "mixed-use", "apartment", "condo", "retail", "ground floor",
    "building permit", "planned development",
    # Business signals
    "lease", "signed", "moving in", "relocating",
    # Chef / notable operator signals
    "chef", "restaurateur", "bartender", "baker", "concept",
]

# ── SIMPLE IN-MEMORY CACHE ───────────────────────────────────────────────────
# Swap for Redis or a DB table in production.
_cache = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


def _cache_key(feed_name):
    return f"rss:{feed_name}"


def _is_stale(feed_name):
    key = _cache_key(feed_name)
    if key not in _cache:
        return True
    fetched_at = _cache[key].get("fetched_at", 0)
    return (time.time() - fetched_at) > CACHE_TTL_SECONDS


def _store(feed_name, entries):
    _cache[_cache_key(feed_name)] = {
        "entries": entries,
        "fetched_at": time.time(),
    }


def _load(feed_name):
    return _cache.get(_cache_key(feed_name), {}).get("entries", [])


# ── FETCH HELPERS ─────────────────────────────────────────────────────────────

def fetch_feed(feed_name, url):
    """Parse one RSS feed; return list of article dicts."""
    if not _is_stale(feed_name):
        return _load(feed_name)

    try:
        feed = feedparser.parse(url)
        entries = []
        for e in feed.entries:
            published = e.get("published", e.get("updated", ""))
            entries.append({
                "source":    feed_name,
                "title":     e.get("title", ""),
                "url":       e.get("link", ""),
                "summary":   e.get("summary", "")[:400],
                "published": published,
            })
        _store(feed_name, entries)
        return entries
    except Exception as ex:
        print(f"[news_monitor] Error fetching {feed_name}: {ex}")
        return []


def fetch_all_feeds(feed_names=None):
    """Fetch multiple feeds; return flat list of articles."""
    names = feed_names or list(RSS_FEEDS.keys())
    articles = []
    for name in names:
        url = RSS_FEEDS.get(name)
        if url:
            articles.extend(fetch_feed(name, url))
    return articles


# ── MATCHING ─────────────────────────────────────────────────────────────────

def _contains_any(text, keywords):
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)


def _article_is_relevant(article):
    """Return True if article title or summary contains a signal keyword."""
    combined = article["title"] + " " + article["summary"]
    return _contains_any(combined, SIGNAL_KEYWORDS)


def _article_mentions_neighborhood(article, neighborhood):
    """Return True if article mentions this neighborhood."""
    if not neighborhood:
        return True
    combined = (article["title"] + " " + article["summary"]).lower()
    return neighborhood.lower() in combined


def _within_days(article, days=90):
    """Return True if article was published within the last N days."""
    pub = article.get("published", "")
    if not pub:
        return True  # unknown date – include it
    try:
        # feedparser returns a time struct in 'published_parsed'
        # but we stored the raw string; parse it simply
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(pub)
        return dt >= datetime.now(dt.tzinfo) - timedelta(days=days)
    except Exception:
        return True


def find_relevant_articles(neighborhood, days=90):
    """
    Main entry point.
    Returns list of relevant articles for a neighborhood,
    sorted newest-first.
    """
    neighborhood_lower = neighborhood.lower().strip()

    # Pick the best feeds for this neighborhood
    feed_names = NEIGHBORHOOD_FEED_MAP.get(neighborhood_lower, [])
    # Always include citywide + non-Block-Club sources
    feed_names = list(set(feed_names + [
        "block_club_citywide",
        "eater_chicago",
        "what_now_chicago",
        "chicago_yimby",
        "crains_restaurants",
    ]))

    articles = fetch_all_feeds(feed_names)

    results = []
    for art in articles:
        if not _within_days(art, days):
            continue
        if not _article_is_relevant(art):
            continue
        if not _article_mentions_neighborhood(art, neighborhood):
            continue
        results.append(art)

    # Deduplicate by URL
    seen = set()
    unique = []
    for art in results:
        if art["url"] not in seen:
            seen.add(art["url"])
            unique.append(art)

    # Sort newest first (rough: reverse chronological by published string)
    unique.sort(key=lambda a: a.get("published", ""), reverse=True)

    return unique[:10]  # cap at 10 articles per report


# ── AI SUMMARY OF NEWS ───────────────────────────────────────────────────────

def summarize_news_for_ai(articles, neighborhood):
    """
    Format articles into a compact string for inclusion
    in your main AI property summary prompt.
    """
    if not articles:
        return "No recent news coverage found for this neighborhood."

    lines = [f"RECENT NEWS ({neighborhood}, last 90 days):"]
    for art in articles[:5]:
        lines.append(f"- [{art['source'].replace('_', ' ').title()}] {art['title']}")
        if art.get("summary"):
            # strip HTML tags crudely
            import re
            clean = re.sub(r"<[^>]+>", "", art["summary"])
            lines.append(f"  → {clean[:150]}")
        lines.append(f"  URL: {art['url']}")
    return "\n".join(lines)


# ── FLASK ROUTE (add to your existing app.py) ─────────────────────────────────
# Paste the lines below into your existing Flask app.

FLASK_ROUTE_SNIPPET = '''
# ── Add this import at the top of app.py ──
from news_monitor import find_relevant_articles, summarize_news_for_ai

# ── Add this route ──
@app.route("/api/neighborhood-news")
def neighborhood_news():
    neighborhood = request.args.get("neighborhood", "")
    if not neighborhood:
        return jsonify({"error": "neighborhood param required"}), 400

    articles = find_relevant_articles(neighborhood, days=90)
    return jsonify({
        "neighborhood": neighborhood,
        "article_count": len(articles),
        "articles": articles,
    })
'''

# ── QUICK TEST ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    hood = sys.argv[1] if len(sys.argv) > 1 else "west town"
    print(f"\nFetching news for: {hood}\n{'─'*50}")
    arts = find_relevant_articles(hood, days=120)
    if not arts:
        print("No relevant articles found.")
    for a in arts:
        print(f"\n📰 {a['title']}")
        print(f"   Source : {a['source']}")
        print(f"   Date   : {a['published'][:16]}")
        print(f"   URL    : {a['url']}")
        if a.get("summary"):
            import re
            print(f"   Snippet: {re.sub(chr(60)+'[^>]+>','',a['summary'])[:120]}…")
    print(f"\n{'─'*50}")
    print(summarize_news_for_ai(arts, hood))
