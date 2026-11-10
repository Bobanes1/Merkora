//! Writes Anki packages (.apkg, classic collection.anki2 format that every Anki version imports)
//! from a Merkora deck: one note type per card look (with its CSS), pictures and sounds included.

use once_cell::sync::Lazy;
use regex::{Captures, Regex};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::io::{Cursor, Write};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCard {
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub style_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportDeck {
    pub name: String,
    pub cards: Vec<ExportCard>,
    #[serde(default)]
    pub styles: HashMap<String, String>,
}

/// Looks of Merkora's own cards and of image occlusions made in Merkora.
const BASE_CSS: &str = ".card { font-family: arial, sans-serif; font-size: 20px; text-align: center; color: black; background-color: white; }
img { max-width: 100%; height: auto; }
.cloze { font-weight: bold; color: blue; }
.io-wrap { position: relative; display: inline-block; max-width: 100%; }
.io-wrap img { display: block; max-width: 100%; height: auto; }
.io-overlay { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.io-active { fill: #ff8e8e; stroke: #212121; stroke-width: 1.5px; }
.io-inactive { fill: #ffeba2; stroke: #212121; stroke-width: 1.5px; }
.io-revealed { fill: rgba(255,142,142,.12); stroke: #e5484d; stroke-width: 2.5px; }";

static MEDIA_ATTR: Lazy<Regex> = Lazy::new(|| Regex::new(r#"data-media="([A-Za-z0-9_-]+)""#).unwrap());
static AUDIO_TAG: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"<audio[^>]*data-media="([A-Za-z0-9_-]+)"[^>]*>\s*</audio>"#).unwrap());
static MEDIA_REF: Lazy<Regex> = Lazy::new(|| Regex::new(r"merkora-media:([A-Za-z0-9_-]+)").unwrap());
static TAGS: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]*>").unwrap());

fn ext_for(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/bmp" => "bmp",
        "image/avif" => "avif",
        "audio/mpeg" => "mp3",
        "audio/ogg" => "ogg",
        "audio/wav" => "wav",
        "audio/mp4" => "m4a",
        "audio/aac" => "aac",
        "audio/flac" => "flac",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        "font/ttf" => "ttf",
        "font/otf" => "otf",
        "font/woff" => "woff",
        "font/woff2" => "woff2",
        _ => "bin",
    }
}

/// Collects the media a text uses and rewrites the references to Anki file names.
struct Media<'a> {
    names: HashMap<String, String>, // id -> file name
    load: &'a dyn Fn(&str) -> Option<(Vec<u8>, String)>,
    files: Vec<(String, Vec<u8>)>,
}
impl Media<'_> {
    fn name(&mut self, id: &str) -> Option<String> {
        if let Some(n) = self.names.get(id) {
            return Some(n.clone());
        }
        let (bytes, mime) = (self.load)(id)?;
        let name = format!("merkora-{id}.{}", ext_for(&mime));
        self.files.push((name.clone(), bytes));
        self.names.insert(id.to_string(), name.clone());
        Some(name)
    }
    fn html(&mut self, s: &str) -> String {
        let s = AUDIO_TAG
            .replace_all(s, |c: &Captures| match self.name(&c[1]) {
                Some(n) => format!("[sound:{n}]"),
                None => String::new(),
            })
            .into_owned();
        let s = MEDIA_ATTR
            .replace_all(&s, |c: &Captures| match self.name(&c[1]) {
                Some(n) => format!("src=\"{n}\""),
                None => String::new(),
            })
            .into_owned();
        self.css(&s)
    }
    fn css(&mut self, s: &str) -> String {
        MEDIA_REF
            .replace_all(s, |c: &Captures| self.name(&c[1]).unwrap_or_default())
            .into_owned()
    }
}

fn sha1_8(s: &str) -> i64 {
    let d = sha1_smol::Sha1::from(s).digest().bytes();
    i64::from(u32::from_be_bytes([d[0], d[1], d[2], d[3]]))
}

fn guid(n: u64) -> String {
    const ALPHA: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~";
    let mut v = uuid::Uuid::new_v4().as_u128() ^ u128::from(n);
    let mut out = String::new();
    for _ in 0..10 {
        out.push(ALPHA[(v % ALPHA.len() as u128) as usize] as char);
        v /= ALPHA.len() as u128;
    }
    out
}

const SCHEMA: &str = "
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_revlog_cid on revlog (cid);
CREATE INDEX ix_notes_csum on notes (csum);";

/// Builds the .apkg bytes. `load` returns a media file's bytes and type by id.
pub fn build_apkg(deck: &ExportDeck, load: &dyn Fn(&str) -> Option<(Vec<u8>, String)>) -> Result<Vec<u8>, String> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let now = now_ms / 1000;
    let did: i64 = now_ms;
    let mut media = Media { names: HashMap::new(), load, files: vec![] };

    // one note type per look
    let mut model_ids: HashMap<String, i64> = HashMap::new();
    let mut models = serde_json::Map::new();
    let mut model_for = |models: &mut serde_json::Map<String, serde_json::Value>, key: &str, css: &str, media: &mut Media| -> i64 {
        if let Some(id) = model_ids.get(key) {
            return *id;
        }
        let id = now_ms + 1 + model_ids.len() as i64;
        let fld = |name: &str, ord: i64| json!({"name": name, "ord": ord, "sticky": false, "rtl": false, "font": "Arial", "size": 20, "media": []});
        let name = if key.is_empty() { "Merkora".to_string() } else { format!("Merkora ({})", model_ids.len() + 1) };
        models.insert(
            id.to_string(),
            json!({
                "id": id, "name": name, "type": 0, "mod": now, "usn": -1, "sortf": 0, "did": did,
                "tmpls": [{"name": "Karte 1", "ord": 0, "qfmt": "{{Vorderseite}}", "afmt": "{{FrontSide}}\n\n<hr id=answer>\n\n{{Rückseite}}", "did": null, "bqfmt": "", "bafmt": ""}],
                "flds": [fld("Vorderseite", 0), fld("Rückseite", 1)],
                "css": format!("{BASE_CSS}\n{}", media.css(css)),
                "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
                "latexPost": "\\end{document}", "latexsvg": false,
                "req": [[0, "any", [0]]], "tags": [], "vers": []
            }),
        );
        model_ids.insert(key.to_string(), id);
        id
    };

    let tmp = std::env::temp_dir().join(format!("merkora-export-{}.anki2", uuid::Uuid::new_v4().simple()));
    let result = (|| -> Result<(), String> {
        let db = Connection::open(&tmp).map_err(|e| e.to_string())?;
        db.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
        for (i, c) in deck.cards.iter().enumerate() {
            let key = c.style_id.clone().unwrap_or_default();
            let css = deck.styles.get(&key).cloned().unwrap_or_default();
            let mid = model_for(&mut models, &key, &css, &mut media);
            let front = media.html(&c.front);
            let back = media.html(&c.back);
            let sfld = TAGS.replace_all(&front, "").trim().to_string();
            let tags = if c.tags.is_empty() { String::new() } else { format!(" {} ", c.tags.join(" ")) };
            let nid = now_ms + i as i64;
            tx.execute(
                "INSERT INTO notes VALUES (?1, ?2, ?3, ?4, -1, ?5, ?6, ?7, ?8, 0, '')",
                rusqlite::params![nid, guid(i as u64), mid, now, tags, format!("{front}\x1f{back}"), sfld, sha1_8(&sfld)],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO cards VALUES (?1, ?2, ?3, 0, ?4, -1, 0, 0, ?5, 0, 0, 0, 0, 0, 0, 0, 0, '')",
                rusqlite::params![nid, nid, did, now, i as i64 + 1],
            )
            .map_err(|e| e.to_string())?;
        }
        let deck_json = |id: i64, name: &str| {
            json!({"id": id, "name": name, "mod": now, "usn": -1, "lrnToday": [0, 0], "revToday": [0, 0], "newToday": [0, 0],
                   "timeToday": [0, 0], "collapsed": false, "browserCollapsed": false, "desc": "", "dyn": 0, "conf": 1,
                   "extendNew": 0, "extendRev": 0})
        };
        let decks = json!({"1": deck_json(1, "Default"), did.to_string(): deck_json(did, &deck.name)});
        let dconf = json!({"1": {
            "id": 1, "name": "Default", "mod": 0, "usn": 0, "maxTaken": 60, "autoplay": true, "timer": 0, "replayq": true, "dyn": false,
            "new": {"delays": [1.0, 10.0], "ints": [1, 4, 0], "initialFactor": 2500, "order": 1, "perDay": 20, "bury": false},
            "rev": {"perDay": 200, "ease4": 1.3, "maxIvl": 36500, "hardFactor": 1.2, "bury": false},
            "lapse": {"delays": [10.0], "mult": 0.0, "minInt": 1, "leechFails": 8, "leechAction": 1}
        }});
        let conf = json!({"activeDecks": [1], "curDeck": 1, "newSpread": 0, "collapseTime": 1200, "timeLim": 0, "estTimes": true,
                          "dueCounts": true, "curModel": null, "nextPos": deck.cards.len() + 1, "sortType": "noteFld", "sortBackwards": false});
        tx.execute(
            "INSERT INTO col VALUES (1, ?1, ?2, ?2, 11, 0, 0, 0, ?3, ?4, ?5, ?6, '{}')",
            rusqlite::params![now - now % 86400, now_ms, conf.to_string(), serde_json::Value::Object(models.clone()).to_string(), decks.to_string(), dconf.to_string()],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })();
    let col = std::fs::read(&tmp);
    let _ = std::fs::remove_file(&tmp);
    result?;
    let col = col.map_err(|e| e.to_string())?;

    let mut buf = Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let opts = zip::write::SimpleFileOptions::default();
        z.start_file("collection.anki2", opts).map_err(|e| e.to_string())?;
        z.write_all(&col).map_err(|e| e.to_string())?;
        let mut list = serde_json::Map::new();
        for (i, (name, bytes)) in media.files.iter().enumerate() {
            list.insert(i.to_string(), json!(name));
            z.start_file(i.to_string(), opts).map_err(|e| e.to_string())?;
            z.write_all(bytes).map_err(|e| e.to_string())?;
        }
        z.start_file("media", opts).map_err(|e| e.to_string())?;
        z.write_all(serde_json::Value::Object(list).to_string().as_bytes()).map_err(|e| e.to_string())?;
        z.finish().map_err(|e| e.to_string())?;
    }
    Ok(buf.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_package_reads_back() {
        let deck = ExportDeck {
            name: "Biologie".into(),
            cards: vec![
                ExportCard { front: "Was ist <b>ATP</b>?".into(), back: "Energie <img data-media=\"m1\">".into(), tags: vec!["bio".into()], style_id: None },
                ExportCard { front: "Hund".into(), back: "<audio controls data-media=\"m2\"></audio>".into(), tags: vec![], style_id: Some("s".into()) },
            ],
            styles: HashMap::from([("s".to_string(), ".card { color: navy; background: url(\"merkora-media:m1\"); }".to_string())]),
        };
        let load = |id: &str| match id {
            "m1" => Some((vec![137, 80, 78, 71], "image/png".to_string())),
            "m2" => Some((vec![73, 68, 51], "audio/mpeg".to_string())),
            _ => None,
        };
        let apkg = build_apkg(&deck, &load).unwrap();
        // read it back with Merkora's own importer
        let mut n = 0;
        let mut uid = || {
            n += 1;
            format!("x{n}")
        };
        let r = crate::anki::parse_apkg(&apkg, &mut uid).unwrap();
        assert_eq!(r.decks.len(), 1);
        assert_eq!(r.decks[0].name, "Biologie");
        let cards = &r.decks[0].cards;
        assert_eq!(cards.len(), 2);
        assert!(cards[0].front.contains("<b>ATP</b>"));
        assert!(cards[0].back.contains("data-media=") && !cards[0].back.contains("Was ist"));
        assert_eq!(cards[0].tags, vec!["bio"]);
        assert!(cards[1].back.contains("<audio"));
        assert_eq!(r.media.len(), 2);
        assert!(r.styles.values().any(|css| css.contains("color: navy") && css.contains("merkora-media:")));
    }
}
