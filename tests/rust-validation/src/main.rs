//! Replays tests/vectors/vectors.json against bc-shamir 0.13.0.
//!
//!   cargo run --release -- ../vectors/vectors.json
//!
//! A recipe whose `t`, `n` or an index label is not a `u64` (NaN, a
//! fraction, a negative) has no Rust form: counted as `js-only`, never
//! compared. Every representable corpus input must match; there is no divergence allowance.
use bc_rand::{RandomNumberGenerator, SeededRandomNumberGenerator};
use bc_shamir::{recover_secret, split_secret};
use serde::Deserialize;
use std::panic::{catch_unwind, AssertUnwindSafe};

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
struct Vector { name: String, recipe: serde_json::Value, expect: String }

fn bytes(v: &serde_json::Value) -> Vec<u8> {
    if let Some(h) = v.get("hex") { return hex::decode(h.as_str().unwrap()).unwrap(); }
    if let Some(t) = v.get("text") { return t.as_str().unwrap().as_bytes().to_vec(); }
    let n = v["cycle"].as_u64().unwrap() as usize;
    let start = v.get("start").and_then(|s| s.as_u64()).unwrap_or(0) as usize;
    (0..n).map(|i| ((start + i) & 0xff) as u8).collect()
}
fn is_u64(v: &serde_json::Value) -> bool { v.as_u64().is_some() }
/// True when the recipe has an input the reference's `usize` cannot express.
fn js_only(r: &serde_json::Value) -> bool {
    let split_ok = |s: &serde_json::Value| is_u64(&s["t"]) && is_u64(&s["n"]);
    if r["k"] == "split" { return !split_ok(r); }
    if let Some(sh) = r.get("shares") {
        return sh.as_array().unwrap().iter().any(|s| !is_u64(&s["index"]));
    }
    if !split_ok(&r["from"]) { return true; }
    if let Some(l) = r.get("labels") { return l.as_array().unwrap().iter().any(|x| !is_u64(x)); }
    false
}
fn split(spec: &serde_json::Value) -> Result<Vec<Vec<u8>>, bc_shamir::Error> {
    let t = spec["t"].as_u64().unwrap() as usize;
    let n = spec["n"].as_u64().unwrap() as usize;
    let secret = bytes(&spec["secret"]);
    let rng = &spec["rng"];
    if rng.get("fake").is_some() {
        split_secret(t, n, &secret, &mut Fake)
    } else {
        let s: Vec<u64> = rng["seed"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().parse().unwrap()).collect();
        let mut g = SeededRandomNumberGenerator::new([s[0], s[1], s[2], s[3]]);
        split_secret(t, n, &secret, &mut g)
    }
}
fn run(r: &serde_json::Value) -> String {
    let out = catch_unwind(AssertUnwindSafe(|| -> String {
        let res: Result<String, bc_shamir::Error> = (|| {
            if r["k"] == "split" {
                return Ok(split(r)?.iter().map(hex::encode).collect::<Vec<_>>().join(","));
            }
            let (indexes, shares): (Vec<usize>, Vec<Vec<u8>>) = if let Some(sh) = r.get("shares") {
                let sh = sh.as_array().unwrap();
                (sh.iter().map(|s| s["index"].as_u64().unwrap() as usize).collect(), sh.iter().map(|s| bytes(&s["data"])).collect())
            } else {
                let all = split(&r["from"])?;
                let pos: Vec<usize> = r["indexes"].as_array().unwrap().iter().map(|i| i.as_u64().unwrap() as usize).collect();
                let idx: Vec<usize> = match r.get("labels") {
                    Some(l) => l.as_array().unwrap().iter().map(|i| i.as_u64().unwrap() as usize).collect(),
                    None => pos.clone(),
                };
                let mut shares: Vec<Vec<u8>> = pos.iter().map(|&i| all[i].clone()).collect();
                if let Some(c) = r.get("corrupt") {
                    shares[c["share"].as_u64().unwrap() as usize][c["byte"].as_u64().unwrap() as usize] ^= c["mask"].as_u64().unwrap() as u8;
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
    let path = std::env::args().nth(1).expect("path");
    let file: File = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    assert_eq!(file.count, file.vectors.len());
    let (mut ok, mut js_only_n, mut mismatch) = (0, 0, 0);
    for v in &file.vectors {
        if js_only(&v.recipe) { js_only_n += 1; continue; }
        let got = run(&v.recipe);
        if got == v.expect { ok += 1; }
        else { mismatch += 1; eprintln!("MISMATCH {}\n  rust: {}\n  ts:   {}", v.name, got, v.expect); }
    }
    println!("{} vectors - {ok} match, {js_only_n} js-only, {mismatch} MISMATCH", file.vectors.len());
    std::process::exit(if mismatch == 0 { 0 } else { 1 });
}
