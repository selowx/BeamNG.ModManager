use once_cell::sync::Lazy;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

static LAST_BRIDGE_CALL: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));

/// Enforces a minimum `min_gap_ms` interval between outbound BeamNG Game Bridge API calls.
pub async fn pace_bridge_call(min_gap_ms: u64) {
    if min_gap_ms == 0 {
        return;
    }
    let min_gap = Duration::from_millis(min_gap_ms);
    let mut last = LAST_BRIDGE_CALL.lock().await;
    if let Some(prev) = *last {
        let elapsed = prev.elapsed();
        if elapsed < min_gap {
            tokio::time::sleep(min_gap - elapsed).await;
        }
    }
    *last = Some(Instant::now());
}

#[cfg(test)]
mod tests {
    use super::pace_bridge_call;
    use std::time::{Duration, Instant};

    #[tokio::test]
    async fn pace_bridge_call_enforces_minimum_gap_and_allows_zero() {
        let fast_start = Instant::now();
        pace_bridge_call(0).await;
        assert!(fast_start.elapsed() < Duration::from_millis(50));

        pace_bridge_call(50).await;
        let t0 = Instant::now();
        pace_bridge_call(50).await;
        assert!(t0.elapsed() >= Duration::from_millis(40));
    }
}
