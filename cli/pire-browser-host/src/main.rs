fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = if args.first().map(String::as_str) == Some("--cleanup-ephemeral") {
        match args.get(1) {
            Some(root) if args.len() == 2 => {
                pire_browser_core::launch::run_ephemeral_cleanup_worker(std::path::Path::new(root))
            }
            _ => Err(anyhow::anyhow!(
                "--cleanup-ephemeral requires exactly one owned root path"
            )),
        }
    } else {
        pire_browser_core::host::run_native_host()
    };
    if let Err(err) = result {
        eprintln!("{err:#}");
        std::process::exit(1);
    }
}
