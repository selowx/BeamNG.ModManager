use std::collections::HashMap;

#[derive(Clone)]
enum Tok { Text(String), Open(String, Option<String>, String), Close(String, String) }

fn is_known_tag(name: &str) -> bool {
    matches!(name, "B" | "I" | "U" | "S" | "STRIKE" | "ICODE" | "COLOR" | "SIZE" | "FONT" | "LIST" | "OLIST" | "*" | "+" | "HR" | "H1" | "H2" | "H3" | "H4" | "H5" | "H6" | "LEFT" | "CENTER" | "RIGHT" | "CODE" | "QUOTE" | "SPOILER" | "URL" | "FORUMURL" | "USER" | "IMG" | "ATTACH" | "MEDIA")
}

fn replace_ci(input: &str, needle: &str, repl: &str) -> String {
    let lower = input.to_ascii_lowercase();
    if lower.len() != input.len() { return input.replace(needle, repl); }
    let (mut out, mut pos) = (String::with_capacity(input.len()), 0);
    while let Some(idx) = lower[pos..].find(needle) { out.push_str(&input[pos..pos + idx]); out.push_str(repl); pos += idx + needle.len(); }
    out.push_str(&input[pos..]); out
}

fn normalize_and_escape(raw: &str) -> String {
    let mut s = raw.replace("\r\n", "\n").replace('\r', "\n").replace("\\/", "/");
    for pat in ["[br]", "<br />", "<br/>", "<br>"] { s = replace_ci(&s, pat, "\n"); }
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn wrap_loose_list_lines(s: &str) -> String {
    let (mut out, mut in_list, mut in_code, mut loose) = (Vec::new(), 0usize, false, false);
    for line in s.split('\n') {
        let (low, tr) = (line.to_ascii_lowercase(), line.trim_start());
        if in_list == 0 && !in_code && (tr.starts_with("[*]") || tr.starts_with("[+]")) {
            if !loose { out.push("[LIST]".to_string()); loose = true; }
        } else if loose { out.push("[/LIST]".to_string()); loose = false; }
        out.push(line.to_string());
        if low.contains("[code]") { in_code = true; }
        if low.contains("[/code]") { in_code = false; }
        if !in_code {
            in_list += low.matches("[list]").count() + low.matches("[list=").count() + low.matches("[olist]").count();
            in_list = in_list.saturating_sub(low.matches("[/list]").count() + low.matches("[/olist]").count());
        }
    }
    if loose { out.push("[/LIST]".to_string()); }
    out.join("\n")
}

fn tokenize(s: &str) -> Vec<Tok> {
    let (mut toks, mut buf, mut i) = (Vec::new(), String::new(), 0);
    while i < s.len() {
        if s.as_bytes()[i] == b'[' {
            if let Some(end) = s[i + 1..].find(']') {
                let inner = &s[i + 1..i + 1 + end];
                if !inner.is_empty() && !inner.contains('[') && !inner.contains('\n') && inner.len() <= 512 {
                    let close = inner.starts_with('/');
                    let body = if close { &inner[1..] } else { inner };
                    let (rn, attr) = match body.find('=') { Some(eq) if !close => (&body[..eq], Some(body[eq + 1..].to_string())), _ => (body, None) };
                    let name = rn.trim().to_ascii_uppercase();
                    if (!close || attr.is_none()) && is_known_tag(&name) {
                        if !buf.is_empty() { toks.push(Tok::Text(std::mem::take(&mut buf))); }
                        let raw = s[i..=i + 1 + end].to_string();
                        toks.push(if close { Tok::Close(name, raw) } else { Tok::Open(name, attr, raw) });
                        i += end + 2; continue;
                    }
                }
            }
        }
        if let Some(ch) = s[i..].chars().next() { buf.push(ch); i += ch.len_utf8(); } else { break; }
    }
    if !buf.is_empty() { toks.push(Tok::Text(buf)); }
    toks
}

fn unquote(s: &str) -> &str {
    let t = s.trim();
    t.strip_prefix('\'').and_then(|x| x.strip_suffix('\'')).or_else(|| t.strip_prefix("&quot;").and_then(|x| x.strip_suffix("&quot;"))).unwrap_or(t).trim()
}

fn sanitize_http_url(raw: &str) -> Option<(String, String)> {
    let u = unquote(raw);
    if u.is_empty() || u.chars().any(|c| c.is_whitespace() || "<>\"'\\".contains(c)) { return None; }
    let low = u.to_ascii_lowercase();
    if !(low.starts_with("http://") || low.starts_with("https://")) { return None; }
    let host = u.split_once("://").map(|(_, r)| r).unwrap_or("");
    (!host.is_empty() && !host.starts_with('/')).then(|| (u.to_string(), u.replace("&amp;", "&")))
}

fn sanitize_css_color(raw: &str) -> Option<String> {
    let c = unquote(raw);
    if let Some(h) = c.strip_prefix('#') { return ((h.len() == 3 || h.len() == 6) && h.chars().all(|x| x.is_ascii_hexdigit())).then(|| format!("#{}", h)); }
    let low = c.to_ascii_lowercase();
    if let Some(inner) = low.strip_prefix("rgb(").and_then(|x| x.strip_suffix(')')) {
        let p: Vec<&str> = inner.split(',').collect();
        return (p.len() == 3 && p.iter().all(|x| x.trim().parse::<u8>().is_ok())).then(|| format!("rgb({}, {}, {})", p[0].trim(), p[1].trim(), p[2].trim()));
    }
    ((3..=24).contains(&c.len()) && c.chars().all(|x| x.is_ascii_alphabetic())).then_some(low)
}

fn sanitize_bb_size(raw: &str) -> Option<&'static str> {
    match unquote(raw) { "1" => Some("0.75em"), "2" => Some("0.85em"), "3" => Some("0.95em"), "4" => Some("1em"), "5" => Some("1.15em"), "6" => Some("1.35em"), "7" => Some("1.6em"), _ => None }
}

fn sanitize_font(raw: &str) -> Option<String> {
    let f = unquote(raw);
    (!f.is_empty() && f.len() <= 48 && f.chars().all(|c| c.is_ascii_alphanumeric() || " ,-_".contains(c))).then(|| f.to_string())
}

struct Parser<'a> { toks: &'a [Tok], pos: usize, attachments: &'a HashMap<String, String>, images: Vec<String> }

impl<'a> Parser<'a> {
    fn trim_breaks(mut cur: &str) -> &str {
        cur = cur.trim();
        while let Some(r) = cur.strip_prefix("<br/>") { cur = r.trim_start(); }
        while let Some(r) = cur.strip_suffix("<br/>") { cur = r.trim_end(); }
        cur
    }

    fn collect_raw(&mut self, stop: &str) -> String {
        let mut out = String::new();
        while self.pos < self.toks.len() {
            match &self.toks[self.pos] {
                Tok::Close(name, _) if name == stop => { self.pos += 1; break; }
                Tok::Close(_, raw) | Tok::Open(_, _, raw) | Tok::Text(raw) => { out.push_str(raw); self.pos += 1; }
            }
        }
        out
    }

    fn parse_until(&mut self, stop: Option<&str>, stop_bullet: bool) -> (String, String, bool) {
        let (mut html, mut plain, mut hit) = (String::new(), String::new(), false);
        while self.pos < self.toks.len() {
            match &self.toks[self.pos] {
                Tok::Close(name, _) if stop == Some(name.as_str()) => { self.pos += 1; hit = true; break; }
                Tok::Close(name, _) if stop_bullet && (name == "LIST" || name == "OLIST") => break,
                Tok::Close(_, _) => { self.pos += 1; }
                Tok::Open(name, _, _) if stop_bullet && (name == "*" || name == "+") => break,
                Tok::Text(t) => { self.pos += 1; html.push_str(&t.replace('\n', "<br/>")); plain.push_str(t); }
                Tok::Open(name, attr, raw) => {
                    let (n, a, r) = (name.clone(), attr.clone(), raw.clone());
                    self.pos += 1;
                    self.handle_open(&n, a.as_deref(), &r, &mut html, &mut plain);
                }
            }
        }
        (html, plain, hit)
    }

    fn emit_img(&mut self, html: &mut String, src: &str, plain_src: &str) {
        html.push_str(&format!("<img class=\"ugc-img\" src=\"{}\" loading=\"lazy\" referrerpolicy=\"no-referrer\" />", src));
        if !self.images.iter().any(|x| x == plain_src) { self.images.push(plain_src.to_string()); }
    }

    fn handle_open(&mut self, name: &str, attr: Option<&str>, raw: &str, html: &mut String, plain: &mut String) {
        match name {
            "HR" => {
                if matches!(self.toks.get(self.pos), Some(Tok::Close(n, _)) if n == "HR") { self.pos += 1; }
                html.push_str("<hr/>"); plain.push('\n');
            }
            "B" | "I" | "U" | "S" | "STRIKE" | "ICODE" => {
                let tag = match name { "B" => "strong", "I" => "em", "U" => "u", "ICODE" => "code", _ => "s" };
                let (ih, ip, _) = self.parse_until(Some(name), false);
                html.push_str(&format!("<{}>{}</{}>", tag, ih, tag)); plain.push_str(&ip);
            }
            "COLOR" | "SIZE" | "FONT" => {
                let (ih, ip, _) = self.parse_until(Some(name), false);
                let style = match name {
                    "COLOR" => attr.and_then(sanitize_css_color).map(|v| format!("color: {}", v)),
                    "SIZE" => attr.and_then(sanitize_bb_size).map(|v| format!("font-size: {}", v)),
                    _ => attr.and_then(sanitize_font).map(|v| format!("font-family: {}", v)),
                };
                if let Some(st) = style { html.push_str(&format!("<span style=\"{}\">{}</span>", st, ih)); } else { html.push_str(&ih); }
                plain.push_str(&ip);
            }
            "H1" | "H2" | "H3" | "H4" | "H5" | "H6" => {
                let (ih, ip, _) = self.parse_until(Some(name), false);
                html.push_str(&format!("<h4 class=\"ugc-heading\">{}</h4>", Self::trim_breaks(&ih)));
                plain.push_str(&format!("{}\n", ip.trim()));
            }
            "LEFT" | "CENTER" | "RIGHT" => {
                let (ih, ip, _) = self.parse_until(Some(name), false);
                html.push_str(&format!("<div style=\"text-align: {}\">{}</div>", name.to_ascii_lowercase(), Self::trim_breaks(&ih)));
                plain.push_str(&ip);
            }
            "CODE" => {
                let rc = self.collect_raw("CODE");
                html.push_str(&format!("<pre><code>{}</code></pre>", rc.trim_matches('\n')));
                plain.push_str(&format!("{}\n", rc.trim()));
            }
            "QUOTE" => {
                let (ih, ip, _) = self.parse_until(Some("QUOTE"), false);
                let who = attr.map(unquote).unwrap_or("");
                let hdr = if who.is_empty() { String::new() } else { format!("<div class=\"text-[11px] text-zinc-400 font-semibold mb-1\">{} wrote:</div>", who) };
                html.push_str(&format!("<blockquote>{}{}</blockquote>", hdr, Self::trim_breaks(&ih)));
                plain.push_str(&format!("{}\n", ip.trim()));
            }
            "SPOILER" => {
                let (ih, ip, _) = self.parse_until(Some("SPOILER"), false);
                let title = attr.map(unquote).filter(|s| !s.is_empty()).unwrap_or("Spoiler");
                html.push_str(&format!("<details><summary>{}</summary><div>{}</div></details>", title, Self::trim_breaks(&ih)));
                plain.push_str(&format!("{}\n", ip.trim()));
            }
            "LIST" | "OLIST" => {
                let ord = name == "OLIST" || attr.map(|a| matches!(unquote(a), "1" | "a" | "A" | "i" | "I")).unwrap_or(false);
                let tag = if ord { "ol" } else { "ul" };
                let mut items = String::new();
                while self.pos < self.toks.len() {
                    match &self.toks[self.pos] {
                        Tok::Close(c, _) if c == name => { self.pos += 1; break; }
                        Tok::Open(o, _, _) if o == "*" || o == "+" => {
                            self.pos += 1;
                            let (ih, ip, hit) = self.parse_until(Some(name), true);
                            let clean = Self::trim_breaks(&ih);
                            if !clean.is_empty() { items.push_str(&format!("<li>{}</li>", clean)); plain.push_str(&format!("• {}\n", ip.trim())); }
                            if hit { break; }
                        }
                        Tok::Text(t) if t.trim().is_empty() => { self.pos += 1; }
                        _ => {
                            let (ih, ip, _) = self.parse_until(Some(name), true);
                            let clean = Self::trim_breaks(&ih);
                            if !clean.is_empty() { items.push_str(&format!("<li>{}</li>", clean)); plain.push_str(&format!("{}\n", ip.trim())); }
                            break;
                        }
                    }
                }
                html.push_str(&format!("<{}>{}</{}>", tag, items, tag));
            }
            "URL" | "FORUMURL" => {
                let (ih, ip, _) = self.parse_until(Some(name), false);
                if let Some((href, _)) = attr.or(Some(ip.as_str())).and_then(sanitize_http_url) {
                    html.push_str(&format!("<a class=\"ugc-link\" href=\"{}\">{}</a>", href, if ih.trim().is_empty() { &href } else { &ih }));
                } else { html.push_str(&ih); }
                plain.push_str(&ip);
            }
            "USER" => {
                let (ih, ip, _) = self.parse_until(Some("USER"), false);
                let uid = attr.map(unquote).unwrap_or("");
                let href = if !uid.is_empty() && uid.chars().all(|c| c.is_ascii_digit()) {
                    Some(format!("https://www.beamng.com/members/{}/", uid))
                } else { sanitize_http_url(uid).map(|x| x.0) };
                if let Some(h) = href { html.push_str(&format!("<a class=\"ugc-link\" href=\"{}\">{}</a>", h, ih)); } else { html.push_str(&ih); }
                plain.push_str(&ip);
            }
            "IMG" => {
                let u = self.collect_raw("IMG");
                if let Some((s, ps)) = sanitize_http_url(&u) { self.emit_img(html, &s, &ps); }
            }
            "ATTACH" => {
                let id = self.collect_raw("ATTACH").trim().to_string();
                let res = self.attachments.get(&id).cloned().or_else(|| {
                    (!id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
                        .then(|| format!("https://www.beamng.com/attachments/{}/", id))
                });
                if let Some((s, ps)) = res.as_deref().and_then(sanitize_http_url) { self.emit_img(html, &s, &ps); }
            }
            "MEDIA" => {
                let id = self.collect_raw("MEDIA").trim().to_string();
                let kind = attr.map(unquote).unwrap_or("").to_ascii_lowercase();
                let safe = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
                if kind == "youtube" && safe {
                    html.push_str(&format!("<a class=\"ugc-link\" href=\"https://www.youtube.com/watch?v={}\">Watch Showcase Video on YouTube</a>", id));
                    plain.push_str("YouTube Video");
                } else if kind == "beamng" {
                    let u = if safe { Some(format!("https://media.beamng.com/{}/", id)) } else { sanitize_http_url(&id).map(|x| x.0) };
                    if let Some((s, ps)) = u.as_deref().and_then(sanitize_http_url) { self.emit_img(html, &s, &ps); }
                }
            }
            _ => { html.push_str(raw); plain.push_str(raw); }
        }
    }
}

pub fn parse_bbcode_to_html(raw: &str, attachments: &HashMap<String, String>) -> (String, String, Vec<String>) {
    let toks = tokenize(&wrap_loose_list_lines(&normalize_and_escape(raw)));
    let mut parser = Parser { toks: &toks, pos: 0, attachments, images: Vec::new() };
    let (html, raw_plain, _) = parser.parse_until(None, false);
    let plain = raw_plain.replace("&quot;", "\"").replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&");
    (plain.trim().to_string(), html, parser.images)
}

#[cfg(test)]
mod tests {
    use super::parse_bbcode_to_html;
    use std::collections::HashMap;

    #[test]
    fn parses_bbcode_variants_and_blocks_xss() {
        let att = HashMap::from([("12345".into(), "https://api.beamng.com/s1/v4/download/mods/abc/images/12345.png".into())]);
        let src = "[*][B]Engine[/B]: V8\n[*][COLOR=rgb(255, 128, 0)][SIZE=5]Turbo[/SIZE][/COLOR]\n[LIST=1][*]One[*]Two[/LIST]\n[SPOILER=Specs]Details[/SPOILER]\n[URL='https://beamng.com']Site[/URL]\n[IMG]https://example.com/a.jpg[/IMG]\n[ATTACH=full]12345[/ATTACH]\n[ATTACH]99999[/ATTACH]\n[MEDIA=youtube]dQw4w9WgXcQ[/MEDIA]\n<script>alert(1)</script>\n[URL=javascript:alert(1)]bad[/URL]";
        let (plain, html, imgs) = parse_bbcode_to_html(src, &att);
        assert!(html.contains("<ul><li><strong>Engine</strong>: V8</li><li><span style=\"color: rgb(255, 128, 0)\"><span style=\"font-size: 1.15em\">Turbo</span></span></li></ul>"));
        assert!(html.contains("<ol><li>One</li><li>Two</li></ol>"));
        assert!(html.contains("<details><summary>Specs</summary><div>Details</div></details>"));
        assert!(html.contains("<a class=\"ugc-link\" href=\"https://beamng.com\">Site</a>"));
        assert!(html.contains("<img class=\"ugc-img\" src=\"https://example.com/a.jpg\" loading=\"lazy\" referrerpolicy=\"no-referrer\" />"));
        assert!(html.contains("<img class=\"ugc-img\" src=\"https://api.beamng.com/s1/v4/download/mods/abc/images/12345.png\" loading=\"lazy\" referrerpolicy=\"no-referrer\" />"));
        assert!(html.contains("<img class=\"ugc-img\" src=\"https://www.beamng.com/attachments/99999/\" loading=\"lazy\" referrerpolicy=\"no-referrer\" />"));
        assert!(html.contains("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;") && !html.contains("<script>") && !html.contains("javascript:"));
        assert!(plain.contains("Engine: V8") && imgs.len() == 3);
    }
}
