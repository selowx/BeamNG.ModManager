#[cfg(target_os = "windows")]
mod win32 {
    use std::ffi::c_void;
    use std::ptr;

    const CF_UNICODETEXT: u32 = 13;
    const GMEM_MOVEABLE: u32 = 0x0002;
    const MAX_CLIPBOARD_WCHARS: usize = 1_048_576;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(hwnd: *mut c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn GetClipboardData(format: u32) -> *mut c_void;
        fn SetClipboardData(format: u32, mem: *mut c_void) -> *mut c_void;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, bytes: usize) -> *mut c_void;
        fn GlobalLock(mem: *mut c_void) -> *mut c_void;
        fn GlobalUnlock(mem: *mut c_void) -> i32;
        fn GlobalFree(mem: *mut c_void) -> *mut c_void;
    }

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }

    fn open_clipboard_guard() -> Result<ClipboardGuard, String> {
        for attempt in 0..3 {
            if unsafe { OpenClipboard(ptr::null_mut()) } != 0 {
                return Ok(ClipboardGuard);
            }
            if attempt < 2 {
                std::thread::sleep(std::time::Duration::from_millis(8));
            }
        }
        Err("Failed to open Windows clipboard.".to_string())
    }

    pub fn read_text() -> Result<String, String> {
        let _guard = open_clipboard_guard()?;
        let handle = unsafe { GetClipboardData(CF_UNICODETEXT) };
        if handle.is_null() {
            return Ok(String::new());
        }
        let ptr = unsafe { GlobalLock(handle) as *const u16 };
        if ptr.is_null() {
            return Ok(String::new());
        }
        let mut len = 0usize;
        while len < MAX_CLIPBOARD_WCHARS && unsafe { *ptr.add(len) } != 0 {
            len += 1;
        }
        let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
        let text = String::from_utf16_lossy(slice);
        unsafe {
            GlobalUnlock(handle);
        }
        Ok(text)
    }

    pub fn write_text(text: &str) -> Result<(), String> {
        let utf16 = super::encode_utf16_nul(text);
        let bytes = utf16.len().saturating_mul(std::mem::size_of::<u16>());
        let handle = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes) };
        if handle.is_null() {
            return Err("Failed to allocate clipboard memory.".to_string());
        }
        let dst = unsafe { GlobalLock(handle) as *mut u16 };
        if dst.is_null() {
            unsafe {
                GlobalFree(handle);
            }
            return Err("Failed to lock clipboard memory.".to_string());
        }
        unsafe {
            ptr::copy_nonoverlapping(utf16.as_ptr(), dst, utf16.len());
            GlobalUnlock(handle);
        }
        let _guard = match open_clipboard_guard() {
            Ok(g) => g,
            Err(err) => {
                unsafe {
                    GlobalFree(handle);
                }
                return Err(err);
            }
        };
        unsafe {
            EmptyClipboard();
            if SetClipboardData(CF_UNICODETEXT, handle).is_null() {
                GlobalFree(handle);
                return Err("Failed to write text to clipboard.".to_string());
            }
        }
        Ok(())
    }
}

pub fn encode_utf16_nul(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn read_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        win32::read_text()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(String::new())
    }
}

pub fn write_clipboard_text(text: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win32::write_text(text)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::encode_utf16_nul;

    #[test]
    fn encodes_utf16_with_trailing_nul() {
        let encoded = encode_utf16_nul("BeamNG");
        assert_eq!(encoded, vec![66, 101, 97, 109, 78, 71, 0]);
    }
}
