fn main() {
    // Re-embed sqlx migrations whenever a migration file is added/changed.
    println!("cargo:rerun-if-changed=migrations");
}
