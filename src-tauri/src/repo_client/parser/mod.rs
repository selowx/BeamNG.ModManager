pub mod details;
pub mod html_sanitizer;
pub mod listing;

pub use details::*;
pub use html_sanitizer::*;
pub use listing::*;

pub const BASE_URL: &str = "https://www.beamng.com/";
