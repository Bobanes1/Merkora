use super::*;
use std::io::Write;

const PNG: &[u8] = &[137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4];

fn zip_files(files: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut buf = Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let opts = zip::write::SimpleFileOptions::default();
        for (name, data) in files {
            z.start_file(*name, opts).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }
    buf.into_inner()
}

fn db_bytes(setup: impl FnOnce(&Connection)) -> Vec<u8> {
    let path = std::env::temp_dir().join(format!("merkora-test-{}.sqlite", uuid::Uuid::new_v4().simple()));
    {
        let db = Connection::open(&path).unwrap();
        setup(&db);
    }
    let b = std::fs::read(&path).unwrap();
    let _ = std::fs::remove_file(&path);
    b
}

const OLD_SCHEMA: &str = "
CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);";

fn old_collection(models: &str, decks: &str, notes: &[(i64, i64, &str, &str)], cards: &[(i64, i64, i64, i64)]) -> Vec<u8> {
    db_bytes(|db| {
        db.execute_batch(OLD_SCHEMA).unwrap();
        db.execute("INSERT INTO col VALUES (1,0,0,0,11,0,0,0,'{}',?1,?2,'{}','{}')", [models, decks]).unwrap();
        for (id, mid, flds, tags) in notes {
            db.execute(
                "INSERT INTO notes VALUES (?1,'g',?2,0,0,?3,?4,'',0,0,'')",
                rusqlite::params![id, mid, tags, flds],
            )
            .unwrap();
        }
        for (id, nid, did, ord) in cards {
            db.execute(
                "INSERT INTO cards VALUES (?1,?2,?3,?4,0,0,0,0,?1,0,0,0,0,0,0,0,0,'')",
                rusqlite::params![id, nid, did, ord],
            )
            .unwrap();
        }
    })
}

fn counter() -> impl FnMut() -> String {
    let mut n = 0;
    move || {
        n += 1;
        format!("m{n}")
    }
}

#[test]
fn classic_format_with_css_images_and_cloze() {
    let models = r#"{
      "100": {"type":0,"css":".card { color: navy; background: url('bg.png'); }",
              "flds":[{"name":"Front","ord":0},{"name":"Back","ord":1},{"name":"Bild","ord":2}],
              "tmpls":[{"ord":0,"qfmt":"{{Front}}{{#Bild}}<div class=pic>{{Bild}}</div>{{/Bild}}","afmt":"{{FrontSide}}\n<hr id=answer>\n{{Back}}"},
                       {"ord":1,"qfmt":"{{Back}}","afmt":"{{FrontSide}}<hr id=\"answer\">{{Front}}"}]},
      "200": {"type":1,"css":"","flds":[{"name":"Text","ord":0},{"name":"Back Extra","ord":1}],
              "tmpls":[{"ord":0,"qfmt":"{{cloze:Text}}","afmt":"{{cloze:Text}}<br>{{#Back Extra}}<i>{{Back Extra}}</i>{{/Back Extra}}"}]}
    }"#;
    let decks = r#"{"1":{"name":"Default"},"10":{"name":"Biologie::Zelle"}}"#;
    let notes = [
        (1, 100, "Was ist ein Mitochondrium?\x1fDas Kraftwerk <span style=\"color:red\">der Zelle</span>\x1f<img src=\"cell.png\">", "bio"),
        (2, 100, "Hund\x1fdog [sound:dog.mp3]\x1f", ""),
        (3, 200, "Die {{c1::Zellmembran}} umgibt die {{c2::Zelle::Ort}}.\x1f", ""),
    ];
    let cards = [(11, 1, 10, 0), (12, 2, 10, 0), (13, 2, 10, 1), (14, 3, 10, 0), (15, 3, 10, 1)];
    let zip = zip_files(&[
        ("collection.anki2", old_collection(models, decks, &notes, &cards)),
        ("media", br#"{"0":"cell.png","1":"dog.mp3","2":"bg.png"}"#.to_vec()),
        ("0", PNG.to_vec()),
        ("1", vec![73, 68, 51]),
        ("2", PNG.to_vec()),
    ]);
    let r = parse_apkg(&zip, &mut counter()).unwrap();
    assert_eq!(r.decks.len(), 1);
    let d = &r.decks[0];
    assert_eq!(d.name, "Biologie::Zelle");
    assert_eq!(d.cards.len(), 5);
    let c = &d.cards[0];
    // image-only field is not "empty": the conditional section keeps the picture
    assert!(c.front.contains("<div class=pic><img data-media=\"m1\""), "{}", c.front);
    assert!(c.back.contains("style=\"color:red\""), "inline style kept: {}", c.back);
    assert!(!c.back.contains("Mitochondrium"), "FrontSide removed");
    assert_eq!(c.style_id.as_deref(), Some("100"));
    assert_eq!(c.card_class, "card card1");
    assert!(r.styles["100"].contains("url(\"merkora-media:"), "css url linked: {}", r.styles["100"]);
    assert!(d.cards[1].back.contains("<audio controls data-media="));
    assert!(d.cards[2].front.starts_with("dog"));
    assert_eq!(d.cards[2].card_class, "card card2");
    assert!(d.cards[3].front.contains("[…]") && !d.cards[3].front.contains("Zellmembran"));
    assert!(d.cards[3].back.contains("<span class=\"cloze\">Zellmembran</span>"));
    assert!(d.cards[4].front.contains("[Ort]"));
    assert!(!d.cards[3].back.contains("Back Extra") && !d.cards[3].back.contains("{{"));
    assert_eq!(r.media.len(), 3);
    assert_eq!(r.missing, 0);
}

fn varint(mut n: u64, out: &mut Vec<u8>) {
    while n > 127 {
        out.push((n as u8 & 127) | 128);
        n >>= 7;
    }
    out.push(n as u8);
}
enum F<'a> {
    N(u64),
    S(&'a str),
    B(Vec<u8>),
}
fn pb(fields: &[(u64, F)]) -> Vec<u8> {
    let mut out = vec![];
    for (f, v) in fields {
        match v {
            F::N(n) => {
                varint(f * 8, &mut out);
                varint(*n, &mut out);
            }
            F::S(s) => {
                varint(f * 8 + 2, &mut out);
                varint(s.len() as u64, &mut out);
                out.extend_from_slice(s.as_bytes());
            }
            F::B(b) => {
                varint(f * 8 + 2, &mut out);
                varint(b.len() as u64, &mut out);
                out.extend_from_slice(b);
            }
        }
    }
    out
}

#[test]
fn new_format_with_image_occlusion() {
    let col = db_bytes(|db| {
        db.execute_batch("
CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob);
CREATE TABLE fields (ntid integer, ord integer, name text, config blob);
CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob);
CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob);
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
INSERT INTO col VALUES (1,0,0,0,18,0,0,0,'','','','','');").unwrap();
        db.execute("INSERT INTO notetypes VALUES (500,'Einfach',0,0,?1)", [pb(&[(1, F::N(0)), (3, F::S(".card{font-family:arial}"))])]).unwrap();
        db.execute("INSERT INTO notetypes VALUES (700,'Bildverdeckung',0,0,?1)", [pb(&[(1, F::N(1)), (3, F::S("#image-occlusion-container{}"))])]).unwrap();
        db.execute_batch("INSERT INTO fields VALUES (500,0,'Vorderseite',X''),(500,1,'Rückseite',X''),(700,0,'Occlusion',X''),(700,1,'Image',X''),(700,2,'Header',X''),(700,3,'Back Extra',X''),(700,4,'Comments',X'');").unwrap();
        db.execute("INSERT INTO templates VALUES (500,0,'Karte 1',0,0,?1)", [pb(&[(1, F::S("{{Vorderseite}}")), (2, F::S("{{FrontSide}}<hr id=answer>{{Rückseite}}"))])]).unwrap();
        db.execute("INSERT INTO templates VALUES (700,0,'IO',0,0,?1)", [pb(&[(1, F::S("<div style=\"display:none\">{{cloze:Occlusion}}</div>{{Image}}<canvas></canvas><script>anki.imageOcclusion.setup()</script>")), (2, F::S("{{cloze:Occlusion}}{{Image}}"))])]).unwrap();
        db.execute("INSERT INTO decks VALUES (1,'Default',0,0,X'',X''),(77,?1,0,0,X'',X'')", ["Anatomie\x1fHerz"]).unwrap();
        db.execute("INSERT INTO notes VALUES (1,'a',500,0,0,'','maison\x1fdas Haus <img src=''haus%20bild.jpg''>','',0,0,'')", []).unwrap();
        db.execute("INSERT INTO notes VALUES (2,'b',700,0,0,'',?1,'',0,0,'')", [
            "{{c1::image-occlusion:rect:left=.1:top=.2:width=.3:height=.1:oi=1}}{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.05:oi=1}}\x1f<img src=\"herz.png\">\x1fDas Herz\x1fExtra-Info\x1f"
        ]).unwrap();
        db.execute_batch("INSERT INTO cards VALUES (1,1,77,0,0,0,0,0,1,0,0,0,0,0,0,0,0,''),(2,2,77,0,0,0,0,0,2,0,0,0,0,0,0,0,0,''),(3,2,77,1,0,0,0,0,3,0,0,0,0,0,0,0,0,'');").unwrap();
    });
    let dummy = old_collection(
        r#"{"1":{"type":0,"flds":[{"name":"Front","ord":0}],"tmpls":[{"ord":0,"qfmt":"{{Front}}","afmt":"{{Front}}"}]}}"#,
        r#"{"1":{"name":"Default"}}"#,
        &[(1, 1, "Please update to the latest Anki version", "")],
        &[(1, 1, 1, 0)],
    );
    let media_list = pb(&[
        (1, F::B(pb(&[(1, F::S("haus bild.jpg")), (2, F::N(PNG.len() as u64))]))),
        (1, F::B(pb(&[(1, F::S("herz.png")), (2, F::N(PNG.len() as u64))]))),
    ]);
    let z = |b: &[u8]| zstd::stream::encode_all(Cursor::new(b), 3).unwrap();
    let zip = zip_files(&[
        ("collection.anki2", dummy),
        ("collection.anki21b", z(&col)),
        ("media", z(&media_list)),
        ("0", z(PNG)),
        ("1", z(PNG)),
    ]);
    let r = parse_apkg(&zip, &mut counter()).unwrap();
    assert_eq!(r.decks.len(), 1);
    assert_eq!(r.decks[0].name, "Anatomie::Herz");
    let cards = &r.decks[0].cards;
    assert_eq!(cards.len(), 3);
    assert_eq!(cards[0].front, "maison");
    assert!(cards[0].back.contains("data-media=") && !cards[0].back.contains("maison"));
    // image occlusion: picture with an SVG overlay, the asked mask is active
    let io1 = &cards[1];
    assert!(io1.front.contains("io-wrap") && io1.front.contains("data-media="), "{}", io1.front);
    assert!(io1.front.contains("<rect class=\"io-active\""), "{}", io1.front);
    assert!(io1.front.contains("<ellipse class=\"io-inactive\""), "{}", io1.front);
    assert!(io1.front.contains("Das Herz"));
    assert!(!io1.front.contains("<script"));
    assert!(io1.back.contains("io-revealed") && io1.back.contains("Extra-Info"));
    assert!(cards[2].front.contains("<ellipse class=\"io-active\""));
    assert_eq!(r.media.len(), 2, "both pictures found");
    assert!(r.media.iter().all(|m| m.bytes == PNG));
    assert_eq!(r.missing, 0);
    assert!(r.styles.contains_key("500"));
}

#[test]
fn broken_file_gives_clear_error() {
    let e = parse_apkg(&[1, 2, 3], &mut counter()).err().unwrap();
    assert!(e.contains("gültige Anki-Datei"), "{e}");
}

#[test]
fn template_sections() {
    let nodes = parse_template("A{{#X}}[{{X}}]{{/X}}{{^Y}}noY{{/Y}}{{#Y}}hasY{{/Y}}{{hint:X}}");
    let fields = vec![("X".to_string(), "x".to_string()), ("Y".to_string(), "<br>".to_string())];
    let ctx = Ctx { fields: &fields, cloze: 1, answer: false, deck: "D", tags: "" };
    let mut out = String::new();
    render(&nodes, &ctx, &mut out);
    assert_eq!(out, "A[x]noY<details class=\"hint\"><summary>Hinweis</summary>x</details>");
}

#[test]
fn progress_and_tags_are_read() {
    let models = r#"{"1":{"type":0,"flds":[{"name":"Front","ord":0},{"name":"Back","ord":1}],"tmpls":[{"ord":0,"qfmt":"{{Front}}","afmt":"{{Back}}"}]}}"#;
    let col = db_bytes(|db| {
        db.execute_batch(OLD_SCHEMA).unwrap();
        db.execute("INSERT INTO col VALUES (1,1700000000,0,0,11,0,0,0,'{}',?1,'{\"1\":{\"name\":\"Default\"}}','{}','{}')", [models]).unwrap();
        db.execute_batch("
INSERT INTO notes VALUES (1,'a',1,0,0,' bio wichtig ','Frage AAntwort A','',0,0,'');
INSERT INTO notes VALUES (2,'b',1,0,0,'','Frage BAntwort B','',0,0,'');
INSERT INTO cards VALUES (11,1,1,0,0,0,2,2,120,30,2300,7,1,0,0,0,0,'');
INSERT INTO cards VALUES (12,2,1,0,0,0,0,0,5,0,0,0,0,0,0,0,0,'');").unwrap();
    });
    let zip = zip_files(&[("collection.anki2", col), ("media", b"{}".to_vec())]);
    let r = parse_apkg(&zip, &mut counter()).unwrap();
    assert_eq!(r.crt, 1700000000);
    assert_eq!(r.with_progress, 1);
    let cards = &r.decks[0].cards;
    let a = cards.iter().find(|c| c.front == "Frage A").unwrap();
    let p = a.progress.as_ref().unwrap();
    assert_eq!((p.kind, p.due, p.ivl, p.factor, p.reps, p.lapses), (2, 120, 30, 2300, 7, 1));
    assert_eq!(a.tags, vec!["bio", "wichtig"]);
    assert!(cards.iter().find(|c| c.front == "Frage B").unwrap().progress.is_none());
}
