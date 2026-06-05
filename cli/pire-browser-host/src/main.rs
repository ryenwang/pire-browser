fn main() {
    if let Err(err) = pire_browser_core::host::run_native_host() {
        eprintln!("{err:#}");
        std::process::exit(1);
    }
}
