fn main() {
    // Expose the target triple so the gateway manager can find `binaries/maindy-gateway-<triple>` in dev.
    println!(
        "cargo:rustc-env=MAINDY_TARGET_TRIPLE={}",
        std::env::var("TARGET").unwrap_or_default()
    );
    tauri_build::build()
}
