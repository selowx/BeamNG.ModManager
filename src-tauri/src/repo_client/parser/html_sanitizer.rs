use crate::models::ModUpdateEntry;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::node::Node;
use scraper::{ElementRef, Html, Selector};

static MULTI_BR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:<br/>\s*){3,}").unwrap());

const HEADING_FONT_TOKENS: &[&str] = &[
    "18px", "22px", "26px", "large", "x-large", "xx-large", "150%", "180%", "200%",
];

const IGNORED_TAGS: &[&str] = &[
    "script", "style", "iframe", "object", "embed", "form", "input", "button", "noscript",
];

fn escape_html_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            _ => out.push(c),
        }
    }
    out
}

fn collapse_whitespace(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_ws = false;
    for c in input.chars() {
        if c.is_whitespace() {
            if !prev_ws {
                out.push(' ');
                prev_ws = true;
            }
        } else {
            out.push(c);
            prev_ws = false;
        }
    }
    out
}

fn sanitize_http_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() { return None; }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("javascript:") || lower.starts_with("vbscript:") || lower.starts_with("data:") || lower.starts_with("file:") {
        return None;
    }
    if let Some(colon) = trimmed.find(':') {
        let before = &trimmed[..colon];
        if !before.contains('/') && !before.contains('?') && !before.contains('#')
            && !before.eq_ignore_ascii_case("http") && !before.eq_ignore_ascii_case("https") {
            return None;
        }
    }
    let normalized = super::details::normalize_beamng_url(trimmed);
    let norm_lower = normalized.to_ascii_lowercase();
    (norm_lower.starts_with("http://") || norm_lower.starts_with("https://")).then_some(normalized)
}

pub(super) fn extract_safe_img_url(el: &ElementRef) -> Option<String> {
    for raw in [el.value().attr("data-url"), el.value().attr("data-src"), el.value().attr("src")].into_iter().flatten() {
        let trimmed = raw.trim();
        if trimmed.is_empty() { continue; }
        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("clear.png") || lower.contains("smilies") || lower.starts_with("data:") {
            continue;
        }
        if let Some(url) = sanitize_http_url(trimmed) {
            return Some(url);
        }
    }
    None
}

fn is_heading_span(el: &ElementRef) -> bool {
    let Some(style) = el.value().attr("style") else {
        return false;
    };
    let lower = style.to_ascii_lowercase();
    lower.contains("font-size") && HEADING_FONT_TOKENS.iter().any(|t| lower.contains(t))
}

fn trim_edge_breaks(html: &str) -> String {
    let mut current = MULTI_BR_RE.replace_all(html, "<br/><br/>").into_owned();
    loop {
        let trimmed = current.trim();
        if let Some(rest) = trimmed.strip_prefix("<br/>") {
            current = rest.to_string();
        } else if let Some(rest) = trimmed.strip_suffix("<br/>") {
            current = rest.to_string();
        } else {
            return trimmed.to_string();
        }
    }
}

fn wrap_child_tag(el: &ElementRef, out: &mut String, open: &str, close: &str, trim_breaks: bool) {
    let mut inner = String::new();
    walk_children(el, &mut inner);
    let content = if trim_breaks {
        trim_edge_breaks(&inner)
    } else {
        inner
    };
    if !content.trim().is_empty() {
        out.push_str(open);
        out.push_str(&content);
        out.push_str(close);
    }
}

fn walk_children(element: &ElementRef, out: &mut String) {
    for child in element.children() {
        match child.value() {
            Node::Text(text) => {
                let collapsed = collapse_whitespace(&text.text);
                if collapsed.trim() == "Spoiler" {
                    continue;
                }
                out.push_str(&escape_html_text(&collapsed));
            }
            Node::Element(_) => {
                let Some(el) = ElementRef::wrap(child) else {
                    continue;
                };
                let tag = el.value().name().to_ascii_lowercase();
                if IGNORED_TAGS.contains(&tag.as_str()) {
                    continue;
                }

                match tag.as_str() {
                    "br" => out.push_str("<br/>"),
                    "hr" => out.push_str("<hr/>"),
                    "b" | "strong" => wrap_child_tag(&el, out, "<strong>", "</strong>", false),
                    "i" | "em" => wrap_child_tag(&el, out, "<em>", "</em>", false),
                    "u" => wrap_child_tag(&el, out, "<u>", "</u>", false),
                    "ul" | "ol" | "li" => {
                        let (open, close) = (format!("<{}>", tag), format!("</{}>", tag));
                        wrap_child_tag(&el, out, &open, &close, false);
                    }
                    "blockquote" => wrap_child_tag(&el, out, "<blockquote>", "</blockquote>", true),
                    "div" if el.value().classes().any(|c| c.eq_ignore_ascii_case("bbCodeQuote")) => {
                        wrap_child_tag(&el, out, "<blockquote>", "</blockquote>", true);
                    }
                    "p" | "div" => wrap_child_tag(&el, out, "", "<br/>", false),
                    "span" if is_heading_span(&el) => {
                        wrap_child_tag(&el, out, "<h4 class=\"ugc-heading\">", "</h4>", false);
                    }
                    "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                        wrap_child_tag(&el, out, "<h4 class=\"ugc-heading\">", "</h4>", false);
                    }
                    "img" => {
                        if let Some(url) = extract_safe_img_url(&el) {
                            out.push_str(&format!("<img class=\"ugc-img\" src=\"{}\" loading=\"lazy\" referrerpolicy=\"no-referrer\" />", escape_html_text(&url)));
                        }
                    }
                    "a" => {
                        if let Some(href) = el.value().attr("href").and_then(sanitize_http_url) {
                            let open = format!("<a class=\"ugc-link\" href=\"{}\">", escape_html_text(&href));
                            wrap_child_tag(&el, out, &open, "</a>", false);
                        } else {
                            wrap_child_tag(&el, out, "<span class=\"ugc-link\">", "</span>", false);
                        }
                    }
                    _ => walk_children(&el, out),
                }
            }
            _ => {}
        }
    }
}

/// Sanitizes XenForo user-generated HTML into a safe, compact subset for the detail drawer.
pub fn sanitize_ugc_html(element: &ElementRef) -> String {
    let mut raw = String::new();
    walk_children(element, &mut raw);
    trim_edge_breaks(&raw)
}

/// Parses up to 5 update entries from a XenForo resource `/updates` page.
pub fn parse_updates_page_html(html: &str) -> Vec<ModUpdateEntry> {
    let doc = Html::parse_document(html);
    let item_sel = Selector::parse("li.primaryContent.messageSimple.resourceUpdate").unwrap();
    let title_sel = Selector::parse("h2.textHeading").unwrap();
    let date_sel = Selector::parse(".postDate .DateTime").unwrap();
    let body_sel = Selector::parse("blockquote.ugc.baseHtml.messageText, blockquote.ugc.baseHtml").unwrap();

    let mut updates = Vec::new();
    for li in doc.select(&item_sel).take(5) {
        let id = li
            .value()
            .attr("id")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let title = li
            .select(&title_sel)
            .next()
            .map(|h| {
                h.text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();

        let date_text = li
            .select(&date_sel)
            .next()
            .map(|d| {
                let txt = d.text().collect::<Vec<_>>().join(" ");
                let trimmed = txt.split_whitespace().collect::<Vec<_>>().join(" ");
                if !trimmed.is_empty() {
                    trimmed
                } else {
                    d.value().attr("title").unwrap_or_default().trim().to_string()
                }
            })
            .unwrap_or_default();

        let body_html = li
            .select(&body_sel)
            .next()
            .map(|b| sanitize_ugc_html(&b))
            .unwrap_or_default();

        if title.is_empty() && body_html.is_empty() {
            continue;
        }

        updates.push(ModUpdateEntry {
            id,
            title,
            date_text,
            body_html,
        });
    }
    updates
}

#[cfg(test)]
mod tests {
    use super::sanitize_ugc_html;
    use scraper::{Html, Selector};

    #[test]
    fn sanitize_ugc_preserves_safe_images_and_blocks_javascript() {
        let html = r#"<blockquote class="ugc">
            <img src="https://cdn.example.com/pic.jpg" />
            <img data-url="/attachments/screen.42/" src="styles/default/xenforo/clear.png" />
            <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
            <img src="javascript:alert(1)" />
            <a href="https://www.beamng.com/threads/1/">Forum</a>
            <a href="javascript:alert(2)">Bad</a>
        </blockquote>"#;
        let doc = Html::parse_fragment(html);
        let el = doc.select(&Selector::parse("blockquote.ugc").unwrap()).next().unwrap();
        let out = sanitize_ugc_html(&el);
        assert!(out.contains(r#"<img class="ugc-img" src="https://cdn.example.com/pic.jpg" loading="lazy" referrerpolicy="no-referrer" />"#));
        assert!(out.contains(r#"<img class="ugc-img" src="https://www.beamng.com/attachments/screen.42/" loading="lazy" referrerpolicy="no-referrer" />"#));
        assert!(!out.contains("clear.png") && !out.contains("data:image/gif") && !out.contains("javascript:"));
        assert!(out.contains(r#"<a class="ugc-link" href="https://www.beamng.com/threads/1/">Forum</a>"#));
        assert!(out.contains(r#"<span class="ugc-link">Bad</span>"#));
    }
}
