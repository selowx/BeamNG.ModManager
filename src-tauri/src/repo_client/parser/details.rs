use super::html_sanitizer::sanitize_ugc_html;
use super::BASE_URL;
use crate::models::{ModUpdateEntry, RepoModDetails};
use regex::Regex;
use scraper::{Html, Selector};

pub fn parse_mod_details_html(html: &str, slug: &str, fallback_id: u64) -> (RepoModDetails, u64) {
    let doc = Html::parse_document(html);

    let h1_sel = Selector::parse("div.resourceInfo h1").unwrap();
    let ver_sel = Selector::parse("div.resourceInfo h1 span.muted").unwrap();
    let tagline_sel = Selector::parse("p.tagLine").unwrap();
    let author_sel = Selector::parse("dl.author a.username, div.resourceInfo a.username").unwrap();
    let desc_sel = Selector::parse("blockquote.ugc.baseHtml").unwrap();
    let dl_btn_sel = Selector::parse("label.downloadButton a.inner, a.callToAction[href*='download'], a[href*='download?version=']").unwrap();
    let size_sel = Selector::parse("label.downloadButton small.minorText").unwrap();
    let icon_sel = Selector::parse("div.resourceImage img.resourceIcon").unwrap();
    let gallery_sel = Selector::parse("blockquote.ugc.baseHtml img").unwrap();

    let version = doc
        .select(&ver_sel)
        .next()
        .map(|v| v.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| "1.0".to_string());

    let raw_h1 = doc
        .select(&h1_sel)
        .next()
        .map(|h| h.text().collect::<Vec<_>>().join(" ").trim().to_string())
        .unwrap_or_else(|| "BeamNG Mod".to_string());
    let title = raw_h1
        .strip_suffix(&version)
        .unwrap_or(&raw_h1)
        .trim()
        .to_string();

    let tagline = doc
        .select(&tagline_sel)
        .next()
        .map(|t| t.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let author = doc
        .select(&author_sel)
        .next()
        .map(|a| a.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| "BeamNG Creator".to_string());

    let desc_el = doc.select(&desc_sel).next();
    let description_text = desc_el
        .as_ref()
        .map(|d| {
            d.text()
                .collect::<Vec<_>>()
                .join(" ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let description_html = desc_el
        .as_ref()
        .map(sanitize_ugc_html)
        .unwrap_or_default();

    let update_li_sel = Selector::parse("div.section.updates ol li").unwrap();
    let update_link_sel = Selector::parse("a").unwrap();
    let update_date_sel = Selector::parse(".DateTime, .muted, span.date").unwrap();
    let mut recent_updates = Vec::new();
    for li in doc.select(&update_li_sel).take(5) {
        let id = li
            .value()
            .attr("id")
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let link_title = li
            .select(&update_link_sel)
            .next()
            .map(|a| {
                a.text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        let title = if !link_title.is_empty() {
            link_title
        } else {
            li.text()
                .collect::<Vec<_>>()
                .join(" ")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        };
        let date_text = li
            .select(&update_date_sel)
            .next()
            .map(|d| {
                let txt = d
                    .text()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                if !txt.is_empty() {
                    txt
                } else {
                    d.value().attr("title").unwrap_or_default().trim().to_string()
                }
            })
            .unwrap_or_default();
        if !title.is_empty() {
            recent_updates.push(ModUpdateEntry {
                id,
                title,
                date_text,
                body_html: String::new(),
            });
        }
    }

    let mut download_url = None;
    for a in doc.select(&dl_btn_sel) {
        if let Some(href) = a.value().attr("href") {
            if href.contains("download?version=") {
                download_url = Some(normalize_beamng_url(href));
                break;
            }
        }
    }
    if download_url.is_none() {
        let dl_re = Regex::new(r#"href="(resources/[^"]+download\?version=\d+)""#).unwrap();
        if let Some(caps) = dl_re.captures(html) {
            if let Some(m) = caps.get(1) {
                download_url = Some(normalize_beamng_url(m.as_str()));
            }
        }
    }

    let file_size_text = doc
        .select(&size_sel)
        .next()
        .map(|s| s.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| "ZIP Archive".to_string());

    let tag_re = Regex::new(r"beamng:v1/subscriptionMod/([A-Z0-9a-z]+)").unwrap();
    let tag_id = tag_re
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    let rid_re = Regex::new(r"resources/[^/]+\.(\d+)/").unwrap();
    let resolved_id = rid_re
        .captures(html)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse::<u64>().ok())
        .unwrap_or(fallback_id);

    let bucket = resolved_id / 1000;
    let icon_url = doc
        .select(&icon_sel)
        .next()
        .and_then(|i| i.value().attr("src"))
        .map(normalize_beamng_url)
        .unwrap_or_else(|| {
            format!(
                "https://www.beamng.com/data/resource_icons/{}/{}.jpg",
                bucket, resolved_id
            )
        });

    let mut gallery_images = Vec::new();
    for img in doc.select(&gallery_sel) {
        if let Some(full_src) = super::html_sanitizer::extract_safe_img_url(&img) {
            if !gallery_images.contains(&full_src) {
                gallery_images.push(full_src);
            }
            if gallery_images.len() >= 8 {
                break;
            }
        }
    }

    (
        RepoModDetails {
            resource_id: resolved_id,
            slug: slug.to_string(),
            title,
            version,
            author,
            tagline,
            description_text,
            description_html,
            recent_updates,
            category: "Official Repo".to_string(),
            rating: 5.0,
            downloads: 0,
            file_size_text,
            tag_id,
            download_url,
            icon_url,
            gallery_images,
            install_status: "not_installed".to_string(),
            installed_version: None,
            subscribed: None,
        },
        resolved_id,
    )
}

pub fn resolve_zip_filename(response: &reqwest::Response, slug: &str, resource_id: u64) -> String {
    if let Some(cd) = response.headers().get("content-disposition") {
        if let Ok(cd_str) = cd.to_str() {
            let re = Regex::new(r#"filename="?([^";]+\.zip)"?"#).unwrap();
            if let Some(caps) = re.captures(cd_str) {
                if let Some(m) = caps.get(1) {
                    return sanitize_filename(m.as_str());
                }
            }
        }
    }

    let final_url = response.url().path();
    if let Some(last_seg) = final_url.split('/').next_back() {
        if last_seg.to_lowercase().ends_with(".zip") {
            return sanitize_filename(last_seg);
        }
    }

    let clean = slug
        .trim_start_matches("resources/")
        .trim_end_matches('/')
        .split('.')
        .next()
        .unwrap_or("beamng_mod")
        .replace('-', "_");
    format!("{}_{}.zip", clean, resource_id)
}

pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

pub fn normalize_beamng_url(raw: &str) -> String {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        raw.to_string()
    } else if raw.starts_with("//") {
        format!("https:{}", raw)
    } else {
        format!("{}{}", BASE_URL, raw.trim_start_matches('/'))
    }
}
