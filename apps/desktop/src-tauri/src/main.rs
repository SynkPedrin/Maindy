// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    maindy_desktop_lib::run()
}
