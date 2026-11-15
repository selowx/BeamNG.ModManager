use super::details::normalize_beamng_url;
use super::BASE_URL;
use crate::models::{LocalMod, RepoModItem};
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use std::collections::HashMap;

static ID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"resource-(\d+)").unwrap());

pub fn build_listing_url(category: &str, sort_by: &str, page: u32) -> String {
    let base = if category.trim().is_empty() || category == "all" {
        format!("{}resources/", BASE_URL)
    } else {
        format!("{}resources/categories/{}/", BASE_URL, category.trim_matches('/'))
    };

    let order = if sort_by.trim().is_empty() {
        "last_update"
    } else {
        sort_by.trim()
    };

    if page <= 1 {
        format!("{}?order={}", base, order)
    } else {
        format!("{}?order={}&page={}", base, order, page)
    }
}

pub fn parse_resource_list_html(html: &str) -> (Vec<RepoModItem>, u32) {
    let doc = Html::parse_document(html);
    let item_sel = Selector::parse("li.resourceListItem").unwrap();
    let title_a_sel = Selector::parse("h3.title a[href^='resources/']").unwrap();
    let version_sel = Selector::parse("h3.title span.version").unwrap();
    let author_sel = Selector::parse("div.resourceDetails a[href^='resources/authors/'], div.resourceDetails a.username").unwrap();
    let cat_sel = Selector::parse("div.resourceDetails a[href^='resources/categories/']").unwrap();
    let tagline_sel = Selector::parse("div.tagLine").unwrap();
    let icon_sel = Selector::parse("a.resourceIcon img").unwrap();
    let rating_val_sel = Selector::parse("span.RatingValue span.Number").unwrap();
    let rating_hint_sel = Selector::parse("div.rating span.Hint").unwrap();
    let dl_sel = Selector::parse("dl.resourceDownloads dd").unwrap();
    let updated_sel = Selector::parse("dl.resourceUpdated abbr.DateTime, dl.resourceUpdated span.DateTime").unwrap();
    let page_nav_sel = Selector::parse("div.PageNav").unwrap();

    let mut items = Vec::new();

    for el in doc.select(&item_sel) {
        let id_attr = el.value().attr("id").unwrap_or_default();
        let resource_id = ID_RE
            .captures(id_attr)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse::<u64>().ok())
            .unwrap_or(0);

        if resource_id == 0 {
            continue;
        }

        let mut slug = String::new();
        let mut title = String::new();
        for a in el.select(&title_a_sel) {
            let href = a.value().attr("href").unwrap_or_default();
            if !href.contains("?prefix_id=") {
                slug = href.to_string();
                title = a.text().collect::<Vec<_>>().join("").trim().to_string();
                break;
            }
        }

        if title.is_empty() {
            continue;
        }

        let version = el.select(&version_sel).next().map(|v| v.text().collect::<String>().trim().to_string()).unwrap_or_else(|| "1.0".to_string());
        let author = el.select(&author_sel).next().map(|a| a.text().collect::<String>().trim().to_string()).unwrap_or_else(|| "BeamNG Creator".to_string());
        let category = el.select(&cat_sel).next().map(|c| c.text().collect::<String>().trim().to_string()).unwrap_or_else(|| "Mod".to_string());
        let tagline = el.select(&tagline_sel).next().map(|t| t.text().collect::<Vec<_>>().join(" ").trim().to_string()).unwrap_or_default();
        let icon_url = normalize_beamng_url(el.select(&icon_sel).next().and_then(|img| img.value().attr("src")).unwrap_or_default());
        let rating = el.select(&rating_val_sel).next().and_then(|r| r.text().collect::<String>().trim().parse::<f32>().ok()).unwrap_or(0.0);
        let rating_count = el.select(&rating_hint_sel).next()
            .and_then(|h| h.text().collect::<String>().split_whitespace().next().and_then(|n| n.replace(',', "").parse::<u32>().ok()))
            .unwrap_or(0);
        let mut dls = el.select(&dl_sel);
        let downloads = dls.next().and_then(|d| d.text().collect::<String>().trim().replace(',', "").parse::<u64>().ok()).unwrap_or(0);
        let subscriptions = dls.next().and_then(|d| d.text().collect::<String>().trim().replace(',', "").parse::<u64>().ok()).unwrap_or(0);
        let (updated_text, updated_timestamp) = if let Some(upd) = el.select(&updated_sel).next() {
            let txt = upd.value().attr("data-datestring").map(|s| s.to_string()).unwrap_or_else(|| upd.text().collect::<String>().trim().to_string());
            let ts = upd.value().attr("data-time").and_then(|t| t.parse::<u64>().ok()).unwrap_or(0);
            (txt, ts)
        } else { (String::from("Recent"), 0) };

        items.push(RepoModItem {
            resource_id, slug, title, version, author, tagline, category, rating, rating_count,
            downloads, subscriptions, updated_text, updated_timestamp, icon_url,
            install_status: "not_installed".to_string(), installed_version: None, local_mod_id: None,
            hydrated: true, tag_id: None, subscribed: None,
        });
    }

    let total_pages = doc
        .select(&page_nav_sel)
        .next()
        .and_then(|nav| nav.value().attr("data-last"))
        .and_then(|last| last.parse::<u32>().ok())
        .unwrap_or(100);

    (items, total_pages)
}

fn normalize_title(raw: &str) -> String {
    crate::local_mods::scanner::decode_mod_text(raw)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn normalize_alphanum(raw: &str) -> String {
    raw.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn extract_slug_base(slug: &str) -> &str {
    let trimmed = slug.trim().trim_matches('/');
    let no_prefix = trimmed.strip_prefix("resources/").or_else(|| trimmed.strip_prefix("bridge/")).unwrap_or(trimmed);
    match no_prefix.rsplit_once('.') {
        Some((base, suffix)) if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) => base,
        _ => no_prefix,
    }
}

fn is_safe_stem_match(stem_alnum: &str, target_alnum: &str) -> bool {
    if stem_alnum.len() < 6 || target_alnum.len() < 6 {
        return false;
    }
    let Some(rem) = stem_alnum.strip_prefix(target_alnum) else {
        return false;
    };
    rem.is_empty()
        || rem.chars().all(|c| c.is_ascii_digit())
        || (rem.starts_with('v') && rem[1..].chars().next().is_some_and(|c| c.is_ascii_digit()))
}

pub struct LocalModIndex<'a> {
    by_tag_id: HashMap<String, &'a LocalMod>,
    by_resource_id: HashMap<u64, &'a LocalMod>,
    by_stem_alnum: HashMap<String, &'a LocalMod>,
    stems: Vec<(String, &'a LocalMod)>,
    by_norm_title: HashMap<String, &'a LocalMod>,
}

impl<'a> LocalModIndex<'a> {
    pub fn new(local_mods: &'a [LocalMod]) -> Self {
        let mut by_tag_id = HashMap::new();
        let mut by_resource_id = HashMap::new();
        let mut by_stem_alnum = HashMap::new();
        let mut stems = Vec::new();
        let mut by_norm_title = HashMap::new();

        for lm in local_mods {
            if let Some(tid) = lm.tag_id.as_deref().map(|s| s.trim().to_ascii_uppercase()).filter(|s| !s.is_empty()) {
                by_tag_id.entry(tid).or_insert(lm);
            }
            if let Some(rid) = lm.resource_id.filter(|&r| r > 0) {
                by_resource_id.entry(rid).or_insert(lm);
            }
            let raw_stem = lm.filename.strip_suffix(".zip").or_else(|| lm.filename.strip_suffix(".ZIP")).unwrap_or(&lm.id);
            let stem_alnum = normalize_alphanum(raw_stem);
            if stem_alnum.len() >= 4 {
                by_stem_alnum.entry(stem_alnum.clone()).or_insert(lm);
                stems.push((stem_alnum, lm));
            }
            let norm_title = normalize_title(&lm.title);
            if !norm_title.is_empty() {
                by_norm_title.entry(norm_title).or_insert(lm);
            }
        }
        Self { by_tag_id, by_resource_id, by_stem_alnum, stems, by_norm_title }
    }

    pub fn find(&self, tag_id: Option<&str>, resource_id: u64, slug: &str, title: &str) -> Option<&'a LocalMod> {
        if let Some(tid) = tag_id.map(|s| s.trim().to_ascii_uppercase()).filter(|s| !s.is_empty()) {
            if let Some(&lm) = self.by_tag_id.get(&tid) { return Some(lm); }
        }
        if resource_id > 0 {
            if let Some(&lm) = self.by_resource_id.get(&resource_id) { return Some(lm); }
        }
        let slug_alnum = normalize_alphanum(extract_slug_base(slug));
        let norm_title = normalize_title(title);
        let title_alnum = normalize_alphanum(&norm_title);
        if slug_alnum.len() >= 4 {
            if let Some(&lm) = self.by_stem_alnum.get(&slug_alnum) { return Some(lm); }
        }
        if title_alnum.len() >= 4 {
            if let Some(&lm) = self.by_stem_alnum.get(&title_alnum) { return Some(lm); }
        }
        for (stem_alnum, lm) in &self.stems {
            if is_safe_stem_match(stem_alnum, &slug_alnum) || is_safe_stem_match(stem_alnum, &title_alnum) {
                return Some(lm);
            }
        }
        if !norm_title.is_empty() {
            if let Some(&lm) = self.by_norm_title.get(&norm_title) { return Some(lm); }
        }
        None
    }
}

pub fn find_matching_local_mod<'a>(
    local_mods: &'a [LocalMod], tag_id: Option<&str>, resource_id: u64, slug: &str, title: &str,
) -> Option<&'a LocalMod> {
    LocalModIndex::new(local_mods).find(tag_id, resource_id, slug, title)
}

pub fn annotate_install_status(items: &mut [RepoModItem], local_mods: &[LocalMod]) {
    let index = LocalModIndex::new(local_mods);
    for item in items.iter_mut() {
        let matched = index.find(item.tag_id.as_deref(), item.resource_id, &item.slug, &item.title);
        if let Some(lm) = matched {
            if item.tag_id.is_none() { item.tag_id = lm.tag_id.clone(); }
            item.installed_version = Some(lm.version.clone());
            item.local_mod_id = Some(lm.id.clone());
            let norm_item = crate::repo_client::update_checker::normalize_ver(&item.version);
            let norm_local = crate::repo_client::update_checker::normalize_ver(&lm.version);
            item.install_status = if lm.location == "staging" { "staged" }
                else if !norm_item.is_empty() && norm_local != norm_item { "update_available" }
                else if !lm.active { "disabled" }
                else { "installed" }.to_string();
        } else {
            item.installed_version = None;
            item.local_mod_id = None;
            item.install_status = "not_installed".to_string();
        }
        item.subscribed = item.tag_id.as_deref().and_then(crate::bridge_client::is_tag_subscribed).or(item.subscribed);
    }
}

#[cfg(test)]
mod tests {
    use super::annotate_install_status;
    use crate::models::{LocalMod, RepoModItem};

    #[test]
    fn annotate_matches_by_tag_id_with_fallback_resource_id_and_normalizes_ver() {
        let local = vec![LocalMod {
            id: "my_mod".into(), filename: "my_mod.zip".into(), full_path: "x".into(), origin_dir: "repo".into(),
            location: "repo".into(), active: true, pinned: false, title: "Ben &amp; Jerry&#039;s Mod".into(),
            author: "Dev".into(), version: "v1.0".into(), tag_id: Some("m9abc12".into()), resource_id: None,
            category: "vehicle".into(), size_bytes: 1, date_added: 1, last_update: None, icon_url: None,
            has_update: false, latest_version: None, latest_slug: None, subscribed: Some(true),
        }];
        let mut items = vec![RepoModItem {
            resource_id: 55_123_456, slug: "bridge/M9ABC12".into(), title: "Completely Different Repo Name".into(),
            version: "1.0".into(), author: "Dev".into(), tagline: "".into(), category: "Vehicles".into(),
            rating: 5.0, rating_count: 1, downloads: 10, subscriptions: 5, updated_text: "Now".into(),
            updated_timestamp: 1, icon_url: "".into(), install_status: "not_installed".into(),
            installed_version: None, local_mod_id: None, hydrated: true, tag_id: Some("M9ABC12".into()), subscribed: Some(true),
        }];
        annotate_install_status(&mut items, &local);
        assert_eq!(items[0].install_status, "installed");
        assert_eq!(items[0].local_mod_id.as_deref(), Some("my_mod"));
        assert_eq!(items[0].installed_version.as_deref(), Some("v1.0"));
    }
}
