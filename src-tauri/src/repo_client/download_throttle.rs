use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};

/// Shared token-pacing rate limiter across concurrent download streams.
pub struct DownloadRateLimiter {
    limit_bps: AtomicU64,
    generation: AtomicU64,
    next_available: Mutex<Instant>,
}

impl DownloadRateLimiter {
    pub fn new(limit_bps: u64) -> Self {
        Self {
            limit_bps: AtomicU64::new(limit_bps),
            generation: AtomicU64::new(0),
            next_available: Mutex::new(Instant::now()),
        }
    }

    pub fn set_limit_bps(&self, limit_bps: u64) {
        let prev = self.limit_bps.swap(limit_bps, Ordering::SeqCst);
        if prev != limit_bps {
            self.generation.fetch_add(1, Ordering::SeqCst);
            let mut guard = match self.next_available.lock() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            *guard = Instant::now();
        }
    }

    pub fn limit_bps(&self) -> u64 {
        self.limit_bps.load(Ordering::Relaxed)
    }

    /// Paces `bytes` against the active byte-per-second limit.
    /// Returns immediately when the limit is 0 (unlimited).
    pub async fn acquire(&self, bytes: usize) {
        if bytes == 0 {
            return;
        }
        let limit = self.limit_bps.load(Ordering::Relaxed);
        if limit == 0 {
            return;
        }

        let gen = self.generation.load(Ordering::Acquire);
        let chunk_dur = Duration::from_secs_f64((bytes as f64) / (limit as f64));
        let target = {
            let mut next = match self.next_available.lock() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            let now = Instant::now();
            let base = if *next > now { *next } else { now };
            let scheduled = base + chunk_dur;
            *next = scheduled;
            scheduled
        };

        loop {
            if self.limit_bps.load(Ordering::Relaxed) == 0
                || self.generation.load(Ordering::Acquire) != gen
            {
                return;
            }
            let now = Instant::now();
            if now >= target {
                return;
            }
            let remaining = target.saturating_duration_since(now);
            sleep(remaining.min(Duration::from_millis(150))).await;
        }
    }
}

impl Default for DownloadRateLimiter {
    fn default() -> Self {
        Self::new(0)
    }
}

#[cfg(test)]
mod tests {
    use super::DownloadRateLimiter;
    use tokio::time::{Duration, Instant};

    #[tokio::test]
    async fn no_limit_is_immediate() {
        let limiter = DownloadRateLimiter::new(0);
        let start = Instant::now();
        limiter.acquire(10_000_000).await;
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn rate_limit_paces_burst() {
        let limiter = DownloadRateLimiter::new(200_000);
        let start = Instant::now();
        limiter.acquire(50_000).await;
        limiter.acquire(50_000).await;
        let elapsed = start.elapsed();
        assert!(
            elapsed >= Duration::from_millis(350),
            "expected paced burst >= 350ms, got {:?}",
            elapsed
        );
        limiter.set_limit_bps(0);
        assert_eq!(limiter.limit_bps(), 0);
        let immediate_start = Instant::now();
        limiter.acquire(5_000_000).await;
        assert!(immediate_start.elapsed() < Duration::from_millis(50));
    }
}
