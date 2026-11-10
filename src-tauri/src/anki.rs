//! Reads Anki packages (.apkg / .colpkg): old (collection.anki2 / .anki21 with JSON note types) and new
//! (zstd-compressed collection.anki21b with protobuf note types and media list) formats.
//! Cards are rendered from their note type's templates; the note type's CSS, pictures, sounds, fonts and
//! image-occlusion masks are kept so cards look like they do in Anki.

use once_cell::sync::Lazy;
use regex::{Captures, Regex};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use unicode_normalization::UnicodeNormalization;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AnkiCard {
    pub front: String,
    pub back: String,
    /// Note type id whose CSS styles this card (see `Parsed::styles`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_id: Option<String>,
    /// Class of the wrapping element, like Anki's `card card1`.
    pub card_class: String,
    /// Tags of the note.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Learning state in Anki (only for cards that were already studied).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<AnkiProgress>,
}

/// Raw scheduling data of an Anki card (converted to Merkora's scheduler in the app).
#[derive(Serialize, Clone, Debug)]
pub struct AnkiProgress {
    /// 1 learning, 2 review, 3 relearning
    pub kind: i64,
    /// review: day number since collection creation; learning: unix seconds (or day number when > 1e9 is false)
    pub due: i64,
    /// interval in days (negative = seconds while learning)
    pub ivl: i64,
    /// ease in permille (2500 = 2.5)
    pub factor: i64,
    pub reps: i64,
    pub lapses: i64,
    /// suspended in Anki
    pub suspended: bool,
}

#[derive(Serialize, Debug)]
pub struct AnkiDeck {
    pub name: String,
    pub cards: Vec<AnkiCard>,
}

pub struct AnkiMedia {
    pub id: String,
    pub name: String,
    pub bytes: Vec<u8>,
}

pub struct Parsed {
    pub decks: Vec<AnkiDeck>,
    pub styles: HashMap<String, String>,
    pub media: Vec<AnkiMedia>,
    pub missing: usize,
    pub skipped: usize,
    /// Creation time of the collection (unix seconds) – base of review due days.
    pub crt: i64,
    /// Number of cards with learning progress in Anki.
    pub with_progress: usize,
}

// ---------- small helpers ----------
const ZSTD_MAGIC: [u8; 4] = [0x28, 0xb5, 0x2f, 0xfd];

fn maybe_unzstd(b: Vec<u8>) -> Result<Vec<u8>, String> {
    if b.len() > 4 && b[..4] == ZSTD_MAGIC {
        zstd::stream::decode_all(Cursor::new(b)).map_err(|e| format!("Entpacken fehlgeschlagen: {e}"))
    } else {
        Ok(b)
    }
}

enum PVal {
    Num(u64),
    Bytes(Vec<u8>),
}
type Proto = HashMap<u64, Vec<PVal>>;

fn varint(buf: &[u8], i: &mut usize) -> Option<u64> {
    let mut result = 0u64;
    let mut shift = 0u32;
    loop {
        let b = *buf.get(*i)?;
        *i += 1;
        result |= ((b & 0x7f) as u64) << shift;
        if b < 0x80 {
            return Some(result);
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
}

/// Minimal protobuf reader: field number → values (numbers for varints, bytes for length-delimited).
fn read_proto(buf: &[u8]) -> Proto {
    let mut out: Proto = HashMap::new();
    let mut i = 0usize;
    while i < buf.len() {
        let Some(key) = varint(buf, &mut i) else { break };
        let field = key >> 3;
        let val = match key & 7 {
            0 => match varint(buf, &mut i) {
                Some(v) => PVal::Num(v),
                None => break,
            },
            2 => {
                let Some(len) = varint(buf, &mut i) else { break };
                let len = len as usize;
                if i + len > buf.len() {
                    break;
                }
                let v = buf[i..i + len].to_vec();
                i += len;
                PVal::Bytes(v)
            }
            1 => {
                i += 8;
                PVal::Num(0)
            }
            5 => {
                i += 4;
                PVal::Num(0)
            }
            _ => break,
        };
        out.entry(field).or_default().push(val);
    }
    out
}
fn proto_str(m: &Proto, f: u64) -> String {
    match m.get(&f).and_then(|v| v.first()) {
        Some(PVal::Bytes(b)) => String::from_utf8_lossy(b).into_owned(),
        _ => String::new(),
    }
}
fn proto_num(m: &Proto, f: u64) -> Option<u64> {
    match m.get(&f).and_then(|v| v.first()) {
        Some(PVal::Num(n)) => Some(*n),
        _ => None,
    }
}

fn has_table(db: &Connection, name: &str) -> bool {
    db.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1", [name], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
        > 0
}

// ---------- note types ----------
#[derive(Default)]
struct NoteType {
    cloze: bool,
    css: String,
    fields: Vec<String>,
    tmpls: Vec<Option<(String, String)>>,
}

fn set_at<T: Default>(v: &mut Vec<T>, i: usize, val: T) {
    if v.len() <= i {
        v.resize_with(i + 1, T::default);
    }
    v[i] = val;
}

fn read_note_types(db: &Connection) -> Result<HashMap<i64, NoteType>, String> {
    let mut map: HashMap<i64, NoteType> = HashMap::new();
    let e = |e: rusqlite::Error| e.to_string();
    if has_table(db, "notetypes") {
        let mut st = db.prepare("SELECT id, config FROM notetypes").map_err(e)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<Vec<u8>>>(1)?)))
            .map_err(e)?;
        for row in rows.flatten() {
            let cfg = read_proto(&row.1.unwrap_or_default());
            map.insert(
                row.0,
                NoteType { cloze: proto_num(&cfg, 1) == Some(1), css: proto_str(&cfg, 3), ..Default::default() },
            );
        }
        let mut st = db.prepare("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord").map_err(e)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, String>(2)?)))
            .map_err(e)?;
        for (ntid, ord, name) in rows.flatten() {
            if let Some(nt) = map.get_mut(&ntid) {
                set_at(&mut nt.fields, ord.max(0) as usize, name);
            }
        }
        let mut st = db.prepare("SELECT ntid, ord, config FROM templates ORDER BY ntid, ord").map_err(e)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<Vec<u8>>>(2)?)))
            .map_err(e)?;
        for (ntid, ord, cfg) in rows.flatten() {
            if let Some(nt) = map.get_mut(&ntid) {
                let cfg = read_proto(&cfg.unwrap_or_default());
                set_at(&mut nt.tmpls, ord.max(0) as usize, Some((proto_str(&cfg, 1), proto_str(&cfg, 2))));
            }
        }
    } else {
        let models: String = db.query_row("SELECT models FROM col", [], |r| r.get(0)).map_err(e)?;
        let json: serde_json::Value = serde_json::from_str(&models).map_err(|e| e.to_string())?;
        if let Some(obj) = json.as_object() {
            for (id, m) in obj {
                let mut nt = NoteType {
                    cloze: m["type"].as_i64() == Some(1),
                    css: m["css"].as_str().unwrap_or("").to_string(),
                    ..Default::default()
                };
                for f in m["flds"].as_array().into_iter().flatten() {
                    let ord = f["ord"].as_u64().unwrap_or(nt.fields.len() as u64) as usize;
                    set_at(&mut nt.fields, ord, f["name"].as_str().unwrap_or("").to_string());
                }
                for t in m["tmpls"].as_array().into_iter().flatten() {
                    let ord = t["ord"].as_u64().unwrap_or(nt.tmpls.len() as u64) as usize;
                    let q = t["qfmt"].as_str().unwrap_or("").to_string();
                    let a = t["afmt"].as_str().unwrap_or("").to_string();
                    set_at(&mut nt.tmpls, ord, Some((q, a)));
                }
                map.insert(id.parse::<i64>().unwrap_or(0), nt);
            }
        }
    }
    Ok(map)
}

fn read_decks(db: &Connection) -> HashMap<i64, String> {
    let mut map = HashMap::new();
    if has_table(db, "decks") {
        if let Ok(mut st) = db.prepare("SELECT id, name FROM decks") {
            if let Ok(rows) = st.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))) {
                for (id, name) in rows.flatten() {
                    map.insert(id, name.replace('\x1f', "::"));
                }
            }
        }
    } else if let Ok(decks) = db.query_row("SELECT decks FROM col", [], |r| r.get::<_, String>(0)) {
        if let Ok(serde_json::Value::Object(obj)) = serde_json::from_str::<serde_json::Value>(&decks) {
            for (id, d) in obj {
                if let (Ok(id), Some(name)) = (id.parse::<i64>(), d["name"].as_str()) {
                    map.insert(id, name.to_string());
                }
            }
        }
    }
    map
}

// ---------- template rendering ----------
static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]*>").unwrap());
static EMPTY_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?si)^(?:\s|&nbsp;|</?(?:br|div|p)\s*/?>)*$").unwrap());
static CLOZE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?s)\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}").unwrap());
static FURI_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r" ?([^ >\[]+?)\[(.+?)\]").unwrap());
static ANSWER_HR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?is)^\s*(?:<br\s*/?>\s*)*<hr[^>]*id\s*=\s*["']?answer["']?[^>]*>"#).unwrap());

fn strip_html(s: &str) -> String {
    TAG_RE.replace_all(s, "").replace("&nbsp;", " ")
}
/// Same rule as Anki: only whitespace and empty line breaks/divs count as empty (an image alone is not empty).
fn is_empty_field(s: &str) -> bool {
    EMPTY_RE.is_match(s)
}

enum Node {
    Text(String),
    Var(String),
    Section { neg: bool, name: String, body: Vec<Node> },
}

fn parse_template(t: &str) -> Vec<Node> {
    type Frame = (Option<(bool, String)>, Vec<Node>);
    let mut stack: Vec<Frame> = vec![(None, vec![])];
    let mut rest = t;
    while let Some(start) = rest.find("{{") {
        let text = &rest[..start];
        if !text.is_empty() {
            stack.last_mut().unwrap().1.push(Node::Text(text.to_string()));
        }
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            stack.last_mut().unwrap().1.push(Node::Text(rest[start..].to_string()));
            rest = "";
            break;
        };
        let tag = after[..end].trim();
        rest = &after[end + 2..];
        if let Some(n) = tag.strip_prefix('#') {
            stack.push((Some((false, n.trim().to_string())), vec![]));
        } else if let Some(n) = tag.strip_prefix('^') {
            stack.push((Some((true, n.trim().to_string())), vec![]));
        } else if let Some(n) = tag.strip_prefix('/') {
            let n = n.trim();
            let open = stack.iter().skip(1).any(|(h, _)| h.as_ref().map(|x| x.1 == n).unwrap_or(false));
            if open {
                loop {
                    let (head, body) = stack.pop().unwrap();
                    let (neg, name) = head.unwrap();
                    let done = name == n;
                    stack.last_mut().unwrap().1.push(Node::Section { neg, name, body });
                    if done {
                        break;
                    }
                }
            }
        } else if !tag.starts_with('!') {
            stack.last_mut().unwrap().1.push(Node::Var(tag.to_string()));
        }
    }
    if !rest.is_empty() {
        stack.last_mut().unwrap().1.push(Node::Text(rest.to_string()));
    }
    while stack.len() > 1 {
        let (head, body) = stack.pop().unwrap();
        let (neg, name) = head.unwrap();
        stack.last_mut().unwrap().1.push(Node::Section { neg, name, body });
    }
    stack.pop().map(|f| f.1).unwrap_or_default()
}

struct Ctx<'a> {
    fields: &'a [(String, String)],
    cloze: usize,
    answer: bool,
    deck: &'a str,
    tags: &'a str,
}

fn lookup<'a>(ctx: &'a Ctx, name: &str) -> Option<&'a str> {
    if let Some((_, v)) = ctx.fields.iter().find(|(k, _)| k == name) {
        return Some(v);
    }
    let lower = name.to_lowercase();
    ctx.fields.iter().find(|(k, _)| k.to_lowercase() == lower).map(|(_, v)| v.as_str())
}

fn render_cloze(text: &str, n: usize, answer: bool) -> String {
    CLOZE_RE
        .replace_all(text, |c: &Captures| {
            let num: usize = c[1].parse().unwrap_or(0);
            let ans = &c[2];
            if num != n {
                return ans.to_string();
            }
            if answer {
                format!("<span class=\"cloze\">{ans}</span>")
            } else {
                format!("<span class=\"cloze\">[{}]</span>", c.get(3).map(|m| m.as_str()).unwrap_or("…"))
            }
        })
        .into_owned()
}

fn cloze_only(text: &str, n: usize) -> String {
    CLOZE_RE
        .captures_iter(text)
        .filter(|c| c[1].parse::<usize>().unwrap_or(0) == n)
        .map(|c| c[2].to_string())
        .collect::<Vec<_>>()
        .join(", ")
}

fn furigana(s: &str, mode: &str) -> String {
    FURI_RE
        .replace_all(s, |c: &Captures| match mode {
            "kana" => c[2].to_string(),
            "kanji" => c[1].to_string(),
            _ => format!("<ruby><rb>{}</rb><rt>{}</rt></ruby>", &c[1], &c[2]),
        })
        .into_owned()
}

fn render_var(tag: &str, ctx: &Ctx) -> String {
    match tag {
        "FrontSide" | "Card" | "CardFlag" | "Type" | "CardID" => return String::new(),
        "Tags" => return ctx.tags.to_string(),
        "Deck" => return ctx.deck.to_string(),
        "Subdeck" => return ctx.deck.rsplit("::").next().unwrap_or("").to_string(),
        _ => {}
    }
    let parts: Vec<&str> = tag.split(':').collect();
    let name = parts.last().map(|s| s.trim()).unwrap_or("");
    let filters: Vec<&str> = parts[..parts.len().saturating_sub(1)].iter().map(|s| s.trim()).collect();
    let Some(v) = lookup(ctx, name) else { return String::new() };
    let mut v = v.to_string();
    for f in filters.iter().rev() {
        if f.starts_with("type") {
            return String::new();
        }
        match *f {
            "cloze" => v = render_cloze(&v, ctx.cloze, ctx.answer),
            "cloze-only" => v = cloze_only(&v, ctx.cloze),
            "text" => v = strip_html(&v),
            "furigana" | "kana" | "kanji" => v = furigana(&v, f),
            "hint" => {
                if !is_empty_field(&v) {
                    v = format!("<details class=\"hint\"><summary>Hinweis</summary>{v}</details>");
                }
            }
            _ if f.starts_with("tts") => v = strip_html(&v),
            _ => {}
        }
    }
    v
}

fn render(nodes: &[Node], ctx: &Ctx, out: &mut String) {
    for n in nodes {
        match n {
            Node::Text(t) => out.push_str(t),
            Node::Var(tag) => out.push_str(&render_var(tag, ctx)),
            Node::Section { neg, name, body } => {
                let field = name.rsplit(':').next().unwrap_or(name).trim();
                let val = lookup(ctx, field);
                let mut empty = val.map(is_empty_field).unwrap_or(true);
                if name.starts_with("cloze:") && !empty {
                    empty = !val.unwrap_or("").contains(&format!("{{{{c{}::", ctx.cloze));
                }
                if empty == *neg {
                    render(body, ctx, out);
                }
            }
        }
    }
}

// ---------- image occlusion (Anki 23.10+) ----------
struct Shape {
    ord: usize,
    kind: String,
    props: HashMap<String, String>,
}

fn parse_io_shapes(text: &str) -> Vec<Shape> {
    let mut out = vec![];
    for c in CLOZE_RE.captures_iter(text) {
        let ord: usize = c[1].parse().unwrap_or(0);
        let Some(rest) = c[2].trim().strip_prefix("image-occlusion:") else { continue };
        let mut pieces = rest.split(':');
        let kind = pieces.next().unwrap_or("rect").trim().to_string();
        let mut props: HashMap<String, String> = HashMap::new();
        let mut last: Option<String> = None;
        for p in pieces {
            if let Some((k, v)) = p.split_once('=') {
                props.insert(k.trim().to_string(), v.to_string());
                last = Some(k.trim().to_string());
            } else if let Some(k) = &last {
                // a ':' inside a value (e.g. a text label)
                if let Some(v) = props.get_mut(k) {
                    v.push(':');
                    v.push_str(p);
                }
            }
        }
        out.push(Shape { ord, kind, props });
    }
    out
}

fn num(p: &HashMap<String, String>, k: &str) -> f64 {
    p.get(k).and_then(|v| v.trim().parse::<f64>().ok()).unwrap_or(0.0)
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Builds the picture with its masks: the asked mask is red, other masks yellow ("hide all") and
/// on the answer side the asked area is only outlined.
fn render_io(fields: &[(String, String)], n: usize, answer: bool) -> Option<String> {
    let occl = fields.iter().find(|(_, v)| v.contains("image-occlusion:"))?;
    let shapes = parse_io_shapes(&occl.1);
    if shapes.is_empty() {
        return None;
    }
    let image = fields.iter().find(|(_, v)| v.to_lowercase().contains("<img")).map(|(_, v)| v.as_str()).unwrap_or("");
    let field = |name: &str| {
        fields.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str()).filter(|v| !is_empty_field(v))
    };
    let pixel = shapes.iter().any(|s| {
        ["left", "top", "width", "height"].iter().any(|k| num(&s.props, k) > 1.5)
    });
    let mut svg = String::new();
    let mut labels = String::new();
    for s in &shapes {
        let active = s.ord == n;
        let hide_all = s.props.get("oi").map(|v| v.trim() == "1").unwrap_or(false);
        let class = if active {
            if answer {
                "io-revealed"
            } else {
                "io-active"
            }
        } else if hide_all {
            "io-inactive"
        } else {
            continue;
        };
        let (l, t) = (num(&s.props, "left"), num(&s.props, "top"));
        match s.kind.as_str() {
            "ellipse" => {
                let (rx, ry) = (num(&s.props, "rx"), num(&s.props, "ry"));
                svg.push_str(&format!(
                    r#"<ellipse class="{class}" cx="{}" cy="{}" rx="{rx}" ry="{ry}" vector-effect="non-scaling-stroke"/>"#,
                    l + rx,
                    t + ry
                ));
            }
            "polygon" => {
                let pts = s.props.get("points").cloned().unwrap_or_default();
                svg.push_str(&format!(
                    r#"<polygon class="{class}" points="{}" vector-effect="non-scaling-stroke"/>"#,
                    esc(pts.trim())
                ));
            }
            "text" => {
                let txt = s.props.get("text").cloned().unwrap_or_default();
                if !pixel {
                    labels.push_str(&format!(
                        r#"<div class="io-text" style="left:{}%;top:{}%">{}</div>"#,
                        l * 100.0,
                        t * 100.0,
                        esc(&txt)
                    ));
                }
            }
            _ => {
                let (w, h) = (num(&s.props, "width"), num(&s.props, "height"));
                svg.push_str(&format!(
                    r#"<rect class="{class}" x="{l}" y="{t}" width="{w}" height="{h}" vector-effect="non-scaling-stroke"/>"#
                ));
            }
        }
    }
    let mut out = String::new();
    if let Some(h) = field("Header") {
        out.push_str(&format!("<div class=\"io-header\">{h}</div>"));
    }
    out.push_str(&format!(
        r#"<div class="io-wrap">{image}<svg class="io-overlay"{} viewBox="0 0 1 1" preserveAspectRatio="none">{svg}</svg>{labels}</div>"#,
        if pixel { r#" data-px="1""# } else { "" }
    ));
    if answer {
        if let Some(extra) = field("Back Extra") {
            out.push_str(&format!("<div class=\"io-extra\">{extra}</div>"));
        }
    }
    Some(out)
}

// ---------- media ----------
static IMG_SRC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?is)<(?:img|audio|video|source)\b[^>]*>"#).unwrap()
});
static SRC_ATTR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?is)\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#).unwrap());
static SOUND_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[sound:([^\]]+)\]").unwrap());
static URL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(?i)url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)"#).unwrap());

fn is_remote(src: &str) -> bool {
    let s = src.trim().to_lowercase();
    s.starts_with("http:") || s.starts_with("https:") || s.starts_with("data:") || s.starts_with("//") || s.starts_with('#')
}

fn unescape_name(s: &str) -> String {
    let t = s
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    match percent_encoding::percent_decode_str(&t).decode_utf8() {
        Ok(d) => d.into_owned(),
        Err(_) => t,
    }
}

struct MediaIds<'a> {
    used: Vec<(String, String)>, // (file name, id) in first-use order
    index: HashMap<String, String>,
    uid: &'a mut dyn FnMut() -> String,
}
impl MediaIds<'_> {
    fn id(&mut self, name: &str) -> String {
        if let Some(id) = self.index.get(name) {
            return id.clone();
        }
        let id = (self.uid)();
        self.index.insert(name.to_string(), id.clone());
        self.used.push((name.to_string(), id.clone()));
        id
    }
    fn link_css_urls(&mut self, s: &str) -> String {
        URL_RE
            .replace_all(s, |c: &Captures| {
                let raw = c.get(1).or(c.get(2)).or(c.get(3)).map(|m| m.as_str()).unwrap_or("");
                if raw.is_empty() || is_remote(raw) {
                    return c[0].to_string();
                }
                format!("url(\"merkora-media:{}\")", self.id(&unescape_name(raw)))
            })
            .into_owned()
    }
    fn link_html(&mut self, html: &str) -> String {
        let s = SOUND_RE
            .replace_all(html, |c: &Captures| {
                format!("<audio controls data-media=\"{}\"></audio>", self.id(&unescape_name(c[1].trim())))
            })
            .into_owned();
        let s = IMG_SRC_RE
            .replace_all(&s, |c: &Captures| {
                let tag = &c[0];
                let Some(m) = SRC_ATTR_RE.captures(tag) else { return tag.to_string() };
                let src = m.get(1).or(m.get(2)).or(m.get(3)).map(|x| x.as_str()).unwrap_or("");
                if src.is_empty() || is_remote(src) {
                    return tag.to_string();
                }
                let id = self.id(&unescape_name(src));
                tag.replacen(&m[0], &format!(" data-media=\"{id}\""), 1)
            })
            .into_owned();
        // pictures used as backgrounds in style attributes
        if s.contains("url(") {
            self.link_css_urls(&s)
        } else {
            s
        }
    }
}

fn read_media_map(zip: &mut zip::ZipArchive<Cursor<&[u8]>>) -> HashMap<String, String> {
    let mut map = HashMap::new(); // file name → zip entry
    let raw = match zip.by_name("media") {
        Ok(mut f) => {
            let mut v = vec![];
            if f.read_to_end(&mut v).is_err() {
                return map;
            }
            v
        }
        Err(_) => return map,
    };
    if raw.first() == Some(&b'{') {
        if let Ok(serde_json::Value::Object(obj)) = serde_json::from_slice::<serde_json::Value>(&raw) {
            for (k, name) in obj {
                if let Some(n) = name.as_str() {
                    map.insert(n.to_string(), k);
                }
            }
        }
        return map;
    }
    if let Ok(bytes) = maybe_unzstd(raw) {
        let list = read_proto(&bytes);
        for (i, e) in list.get(&1).into_iter().flatten().enumerate() {
            if let PVal::Bytes(b) = e {
                let m = read_proto(b);
                let entry = proto_num(&m, 255).map(|n| n.to_string()).unwrap_or_else(|| i.to_string());
                map.insert(proto_str(&m, 1), entry);
            }
        }
    }
    map
}

fn read_entry(zip: &mut zip::ZipArchive<Cursor<&[u8]>>, name: &str) -> Option<Vec<u8>> {
    let mut f = zip.by_name(name).ok()?;
    let mut v = Vec::with_capacity(f.size() as usize);
    f.read_to_end(&mut v).ok()?;
    Some(v)
}

// ---------- main ----------
pub fn parse_apkg(bytes: &[u8], uid: &mut dyn FnMut() -> String) -> Result<Parsed, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "Die Datei ist keine gültige Anki-Datei (.apkg) oder beschädigt.".to_string())?;
    // Newer Anki versions put a dummy "please update Anki" collection.anki2 next to the real collection.anki21b.
    let col_name = ["collection.anki21b", "collection.anki21", "collection.anki2"]
        .into_iter()
        .find(|n| zip.by_name(n).is_ok())
        .ok_or_else(|| "Das ist keine Anki-Datei (keine Sammlung gefunden).".to_string())?;
    let col = maybe_unzstd(read_entry(&mut zip, col_name).ok_or("Die Sammlung konnte nicht gelesen werden.")?)?;

    let tmp = std::env::temp_dir().join(format!("merkora-import-{}.sqlite", uuid::Uuid::new_v4().simple()));
    std::fs::write(&tmp, &col).map_err(|e| format!("Zwischenspeichern fehlgeschlagen: {e}"))?;
    let result = (|| {
        let db = Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| format!("Die Sammlung konnte nicht geöffnet werden: {e}"))?;
        let res = parse_collection(&db, &mut zip, uid);
        drop(db);
        res
    })();
    let _ = std::fs::remove_file(&tmp);
    result
}

fn parse_collection(
    db: &Connection,
    zip: &mut zip::ZipArchive<Cursor<&[u8]>>,
    uid: &mut dyn FnMut() -> String,
) -> Result<Parsed, String> {
    let note_types = read_note_types(db)?;
    let deck_names = read_decks(db);
    let media_map = read_media_map(zip);

    let mut st = db
        .prepare(
            "SELECT c.did, c.odid, c.ord, n.mid, n.flds, n.tags, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.odue FROM cards c JOIN notes n ON n.id = c.nid ORDER BY c.did, c.due, n.id, c.ord",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                [6, 7, 8, 9, 10, 11, 12, 13].map(|i| r.get::<_, Option<i64>>(i).ok().flatten().unwrap_or(0)),
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut media = MediaIds { used: vec![], index: HashMap::new(), uid };
    let mut parsed_tmpls: HashMap<(i64, usize), (Vec<Node>, Vec<Node>)> = HashMap::new();
    let mut deck_order: Vec<String> = vec![];
    let mut by_deck: HashMap<String, Vec<AnkiCard>> = HashMap::new();
    let mut styles: HashMap<String, String> = HashMap::new();
    let mut skipped = 0usize;
    let mut with_progress = 0usize;
    let crt: i64 = db.query_row("SELECT crt FROM col", [], |r| r.get(0)).unwrap_or(0);

    for row in rows {
        let Ok((did, odid, ord, mid, flds, tags, sched)) = row else {
            skipped += 1;
            continue;
        };
        let ord = ord.max(0) as usize;
        let deck = deck_names
            .get(&if odid != 0 { odid } else { did })
            .cloned()
            .unwrap_or_else(|| "Anki-Import".to_string());
        let values: Vec<&str> = flds.split('\x1f').collect();
        let nt = note_types.get(&mid);
        let fields: Vec<(String, String)> = match nt {
            Some(nt) => nt
                .fields
                .iter()
                .enumerate()
                .map(|(i, name)| (name.clone(), values.get(i).copied().unwrap_or("").to_string()))
                .collect(),
            None => values.iter().enumerate().map(|(i, v)| (format!("Feld {}", i + 1), v.to_string())).collect(),
        };

        let (front, back) = if let Some(io) = (|| {
            let fq = render_io(&fields, ord + 1, false)?;
            let fa = render_io(&fields, ord + 1, true)?;
            Some((fq, fa))
        })() {
            io
        } else if let Some(nt) = nt {
            let tidx = if nt.cloze { 0 } else { ord };
            let tmpl = nt
                .tmpls
                .get(tidx)
                .and_then(|t| t.as_ref())
                .or_else(|| nt.tmpls.iter().flatten().next());
            match tmpl {
                Some((q, a)) if !q.is_empty() || !a.is_empty() => {
                    let key = (mid, tidx);
                    if !parsed_tmpls.contains_key(&key) {
                        parsed_tmpls.insert(key, (parse_template(q), parse_template(a)));
                    }
                    let (qn, an) = &parsed_tmpls[&key];
                    let ctx = Ctx { fields: &fields, cloze: ord + 1, answer: false, deck: &deck, tags: tags.trim() };
                    let mut f = String::new();
                    render(qn, &ctx, &mut f);
                    let ctx = Ctx { answer: true, ..ctx };
                    let mut b = String::new();
                    render(an, &ctx, &mut b);
                    (f, ANSWER_HR_RE.replace(&b, "").into_owned())
                }
                _ => fallback(&values),
            }
        } else {
            fallback(&values)
        };

        let front = media.link_html(&front).trim().to_string();
        let back = media.link_html(&back).trim().to_string();
        let lower = front.to_lowercase();
        if strip_html(&front).trim().is_empty()
            && !lower.contains("data-media=")
            && !lower.contains("<img")
            && !lower.contains("<svg")
        {
            skipped += 1;
            continue;
        }
        let mut style_id = None;
        if let Some(nt) = nt {
            if !nt.css.trim().is_empty() {
                let key = mid.to_string();
                if !styles.contains_key(&key) {
                    let css = media.link_css_urls(&nt.css);
                    styles.insert(key.clone(), css);
                }
                style_id = Some(key);
            }
        }
        if !by_deck.contains_key(&deck) {
            deck_order.push(deck.clone());
        }
        let [ctype, queue, due, ivl, factor, reps, lapses, odue] = sched;
        let progress = (ctype >= 1 && ctype <= 3).then(|| {
            with_progress += 1;
            AnkiProgress {
                kind: ctype,
                // cards in a filtered deck keep their original due date in odue
                due: if odid != 0 && odue != 0 { odue } else { due },
                ivl,
                factor,
                reps,
                lapses,
                suspended: queue == -1,
            }
        });
        by_deck.entry(deck).or_default().push(AnkiCard {
            front,
            back,
            style_id,
            card_class: format!("card card{}", ord + 1),
            tags: tags.split_whitespace().map(str::to_string).collect(),
            progress,
        });
    }

    // The referenced pictures, sounds and fonts.
    let mut files = vec![];
    let mut missing = 0usize;
    let used = std::mem::take(&mut media.used);
    for (name, id) in used {
        let nfc: String = name.nfc().collect();
        let nfd: String = name.nfd().collect();
        let entry = media_map.get(&name).or_else(|| media_map.get(&nfc)).or_else(|| media_map.get(&nfd)).cloned();
        let raw = entry
            .and_then(|e| read_entry(zip, &e))
            .or_else(|| read_entry(zip, &name))
            .or_else(|| read_entry(zip, &nfc));
        match raw.map(maybe_unzstd) {
            Some(Ok(bytes)) => files.push(AnkiMedia { id, name, bytes }),
            _ => missing += 1,
        }
    }

    let decks: Vec<AnkiDeck> = deck_order
        .into_iter()
        .map(|name| {
            let cards = by_deck.remove(&name).unwrap_or_default();
            AnkiDeck { name, cards }
        })
        .collect();
    if decks.is_empty() {
        return Err("In dieser Datei wurden keine Karten gefunden.".to_string());
    }
    Ok(Parsed { decks, styles, media: files, missing, skipped, crt, with_progress })
}

/// Unknown note type: first field is the question, the rest the answer.
fn fallback(values: &[&str]) -> (String, String) {
    let front = values.first().copied().unwrap_or("").to_string();
    let back = values.iter().skip(1).filter(|v| !is_empty_field(v)).copied().collect::<Vec<_>>().join("<br>");
    (front, back)
}

#[cfg(test)]
mod tests;
