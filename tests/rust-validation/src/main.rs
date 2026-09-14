//! Replays a vector file (tests/vectors/vectors.json, or the full corpus)
//! against bc-shamir 0.13.0.
//!
//!   cargo run --release --offline -- ../vectors/vectors.json
//!
//! Exit 0 iff every vector matches or is js-only. There is no divergence
//! allowance: a compared outcome that differs is a MISMATCH.
//!
//! Integer classification. A recipe integer is compared only when it has an
//! exact Rust form:
//! - a JSON number is compared when it is an integer in `[0, 2^53 - 1]`, the
//!   range a JavaScript `number` holds exactly; any other JSON number (NaN, a
//!   fraction, a negative, or a value above `Number.MAX_SAFE_INTEGER`) is
//!   js-only. Above `2^53 - 1` serde reads the decimal digits, which need not
//!   be the double JavaScript serialised, and the TypeScript side rejects such
//!   a `number` anyway;
//! - a `"<digits>n"` string is a `bigint`, compared when the digits fit a
//!   `u64` (js-only when negative or above `u64::MAX`);
//! - `"NaN"`, `"Infinity"` and `"-Infinity"` are js-only.
//! Any other field shape is unparsable: counted, reported, and a failure.
//! No vector field is `unwrap`ped outside a vector's `catch_unwind`, so a
//! malformed file cannot abort the run. `usize` is asserted to be 64 bits so
//! that every compared integer is the value the reference receives.
use bc_rand::{RandomNumberGenerator, SeededRandomNumberGenerator};
use bc_shamir::{recover_secret, split_secret};
use serde::Deserialize;
use serde_json::Value;
use std::panic::{catch_unwind, AssertUnwindSafe};

/// The largest integer a JavaScript `number` holds exactly (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// The counter generator the crate's tests use: 0, 17, 34, … (wrapping).
struct Fake;
impl rand_core::RngCore for Fake {
    fn next_u32(&mut self) -> u32 { unimplemented!() }
    fn next_u64(&mut self) -> u64 { unimplemented!() }
    fn fill_bytes(&mut self, dest: &mut [u8]) {
        let mut b: u8 = 0;
        for x in dest.iter_mut() { *x = b; b = b.wrapping_add(17); }
    }
}
impl rand_core::CryptoRng for Fake {}
impl RandomNumberGenerator for Fake {}

#[derive(Deserialize)]
struct File { count: usize, vectors: Vec<Vector> }
#[derive(Deserialize)]
struct Vector { name: String, recipe: Value, expect: String }

/// A recipe integer's Rust form.
enum Int { Exact(u64), JsOnly, Unparsable }

fn int(v: &Value) -> Int {
    match v {
        Value::Number(_) => match v.as_u64() {
            Some(x) if x <= MAX_SAFE_INTEGER => Int::Exact(x),
            _ => Int::JsOnly,
        },
        Value::String(s) => {
            if s == "NaN" || s == "Infinity" || s == "-Infinity" { return Int::JsOnly; }
            let Some(body) = s.strip_suffix('n') else { return Int::Unparsable };
            let (negative, digits) = match body.strip_prefix('-') {
                Some(d) => (true, d),
                None => (false, body),
            };
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                return Int::Unparsable;
            }
            match digits.parse::<u64>() {
                Ok(0) => Int::Exact(0),
                Ok(_) if negative => Int::JsOnly,
                Ok(x) => Int::Exact(x),
                Err(_) => Int::JsOnly,
            }
        }
        _ => Int::Unparsable,
    }
}

/// How a whole recipe is handled: compared, counted as js-only, or rejected.
#[derive(Clone, Copy, PartialEq)]
enum Class { Compare, JsOnly, Unparsable }

fn class_of(i: Int) -> Class {
    match i { Int::Exact(_) => Class::Compare, Int::JsOnly => Class::JsOnly, Int::Unparsable => Class::Unparsable }
}
/// Unparsable dominates, then js-only.
fn fold(classes: impl IntoIterator<Item = Class>) -> Class {
    classes.into_iter().fold(Class::Compare, |acc, c| match (acc, c) {
        (Class::Unparsable, _) | (_, Class::Unparsable) => Class::Unparsable,
        (Class::JsOnly, _) | (_, Class::JsOnly) => Class::JsOnly,
        _ => Class::Compare,
    })
}
/// A `Bytes` spec (`hex`, `text` or `cycle`/`start`); its integers must be exact.
fn bytes_class(v: &Value) -> Class {
    if let Some(h) = v.get("hex") {
        return match h.as_str().map(hex::decode) { Some(Ok(_)) => Class::Compare, _ => Class::Unparsable };
    }
    if let Some(t) = v.get("text") {
        return if t.is_string() { Class::Compare } else { Class::Unparsable };
    }
    let exact = |x: &Value| matches!(int(x), Int::Exact(_));
    let cycle_ok = v.get("cycle").is_some_and(exact);
    let start_ok = v.get("start").is_none_or(exact);
    if cycle_ok && start_ok { Class::Compare } else { Class::Unparsable }
}
fn rng_class(v: &Value) -> Class {
    if v.get("fake").is_some_and(|f| f == &Value::Bool(true)) { return Class::Compare; }
    let seed_ok = v.get("seed").and_then(Value::as_array).is_some_and(|words| {
        words.len() == 4 && words.iter().all(|w| w.as_str().is_some_and(|s| s.parse::<u64>().is_ok()))
    });
    if seed_ok { Class::Compare } else { Class::Unparsable }
}
fn split_class(s: &Value) -> Class {
    let then = match s.get("then") {
        Some(t) => fold([class_of(int(&t["t"])), class_of(int(&t["n"])), bytes_class(&t["secret"])]),
        None => Class::Compare,
    };
    fold([class_of(int(&s["t"])), class_of(int(&s["n"])), bytes_class(&s["secret"]), rng_class(&s["rng"]), then])
}
/// Every element of `v` classified by `f`; a missing or non-array `v` is unparsable.
fn each(v: Option<&Value>, f: impl Fn(&Value) -> Class) -> Class {
    match v.and_then(Value::as_array) {
        Some(items) => fold(items.iter().map(f)),
        None => Class::Unparsable,
    }
}
fn classify(r: &Value) -> Class {
    if r["k"] == "split" { return split_class(r); }
    if r["k"] != "recover" { return Class::Unparsable; }
    if let Some(sh) = r.get("shares") {
        return each(Some(sh), |s| fold([class_of(int(&s["index"])), bytes_class(&s["data"])]));
    }
    // Positions into the split must be exact; labels may be js-only.
    let positions = each(r.get("indexes"), |i| match int(i) { Int::Exact(_) => Class::Compare, _ => Class::Unparsable });
    let labels = match r.get("labels") { Some(l) => each(Some(l), |x| class_of(int(x))), None => Class::Compare };
    let corrupt = match r.get("corrupt") {
        Some(c) => fold(["share", "byte", "mask"].map(|k| match int(&c[k]) { Int::Exact(_) => Class::Compare, _ => Class::Unparsable })),
        None => Class::Compare,
    };
    fold([split_class(&r["from"]), positions, labels, corrupt])
}

/// An integer `classify` has already accepted as exact.
fn u(v: &Value) -> usize {
    match int(v) { Int::Exact(x) => x as usize, _ => panic!("integer field was classified as exact") }
}
fn bytes(v: &Value) -> Vec<u8> {
    if let Some(h) = v.get("hex") { return hex::decode(h.as_str().unwrap()).unwrap(); }
    if let Some(t) = v.get("text") { return t.as_str().unwrap().as_bytes().to_vec(); }
    let n = u(&v["cycle"]);
    let start = v.get("start").map(u).unwrap_or(0);
    (0..n).map(|i| ((start + i) & 0xff) as u8).collect()
}
fn seeded(rng: &Value) -> SeededRandomNumberGenerator {
    let s: Vec<u64> = rng["seed"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().parse().unwrap()).collect();
    SeededRandomNumberGenerator::new([s[0], s[1], s[2], s[3]])
}
/// One `split_secret` call drawing from `g`; a recipe's generator is created once and shared by its splits.
fn split_with(spec: &Value, g: &mut impl RandomNumberGenerator) -> Result<Vec<Vec<u8>>, bc_shamir::Error> {
    split_secret(u(&spec["t"]), u(&spec["n"]), &bytes(&spec["secret"]), g)
}
fn split(spec: &Value) -> Result<Vec<Vec<u8>>, bc_shamir::Error> {
    if spec["rng"].get("fake").is_some() { split_with(spec, &mut Fake) } else { split_with(spec, &mut seeded(&spec["rng"])) }
}
fn hex_join(shares: &[Vec<u8>]) -> String {
    shares.iter().map(hex::encode).collect::<Vec<_>>().join(",")
}
/// A split recipe: the first split, and the `then` split from the same generator, joined by `;`.
fn split_recipe(r: &Value) -> Result<String, bc_shamir::Error> {
    fn go(r: &Value, g: &mut impl RandomNumberGenerator) -> Result<String, bc_shamir::Error> {
        let mut out = hex_join(&split_with(r, g)?);
        if let Some(then) = r.get("then") {
            out.push(';');
            out.push_str(&hex_join(&split_with(then, g)?));
        }
        Ok(out)
    }
    if r["rng"].get("fake").is_some() { go(r, &mut Fake) } else { go(r, &mut seeded(&r["rng"])) }
}
fn run(r: &Value) -> String {
    let out = catch_unwind(AssertUnwindSafe(|| -> String {
        let res: Result<String, bc_shamir::Error> = (|| {
            if r["k"] == "split" { return split_recipe(r); }
            let (indexes, shares): (Vec<usize>, Vec<Vec<u8>>) = if let Some(sh) = r.get("shares") {
                let sh = sh.as_array().unwrap();
                (sh.iter().map(|s| u(&s["index"])).collect(), sh.iter().map(|s| bytes(&s["data"])).collect())
            } else {
                let all = split(&r["from"])?;
                let pos: Vec<usize> = r["indexes"].as_array().unwrap().iter().map(u).collect();
                let idx: Vec<usize> = match r.get("labels") {
                    Some(l) => l.as_array().unwrap().iter().map(u).collect(),
                    None => pos.clone(),
                };
                let mut shares: Vec<Vec<u8>> = pos.iter().map(|&i| all[i].clone()).collect();
                if let Some(c) = r.get("corrupt") {
                    shares[u(&c["share"])][u(&c["byte"])] ^= u(&c["mask"]) as u8;
                }
                (idx, shares)
            };
            Ok(hex::encode(recover_secret(&indexes, &shares)?))
        })();
        match res { Ok(s) => s, Err(e) => format!("throw:{e:?}") }
    }));
    out.unwrap_or_else(|_| "throw:panic".into())
}

fn main() {
    assert_eq!(usize::BITS, 64, "the harness compares 64-bit usize values; build for a 64-bit target");
    let path = std::env::args().nth(1).expect("usage: shamir-validation <vectors.json>");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
    let file: File = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{path} is not a vector file: {e}"));
    assert_eq!(file.count, file.vectors.len(), "count does not equal the number of vectors");
    let (mut ok, mut js_only, mut mismatch, mut unparsable) = (0, 0, 0, 0);
    for v in &file.vectors {
        match classify(&v.recipe) {
            Class::JsOnly => { js_only += 1; continue; }
            Class::Unparsable => { unparsable += 1; eprintln!("UNPARSABLE {}", v.name); continue; }
            Class::Compare => {}
        }
        let got = run(&v.recipe);
        if got == v.expect { ok += 1; }
        else { mismatch += 1; eprintln!("MISMATCH {}\n  rust: {}\n  ts:   {}", v.name, got, v.expect); }
    }
    let tail = if unparsable > 0 { format!(", {unparsable} unparsable") } else { String::new() };
    println!("{} vectors - {ok} match, {js_only} js-only, {mismatch} MISMATCH{tail}", file.vectors.len());
    std::process::exit(if mismatch == 0 && unparsable == 0 { 0 } else { 1 });
}
