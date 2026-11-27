fn main() {
    // GNU/LLVM Windows builds can import MinGW runtime DLLs that the installers
    // do not bundle (see issue #1). Ship Windows binaries built with MSVC.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("msvc")
    {
        panic!("Windows builds require the MSVC target. Run npm run build:windows with the Visual Studio C++ Build Tools installed.");
    }
    tauri_build::build()
}
