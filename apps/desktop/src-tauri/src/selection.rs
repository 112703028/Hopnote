use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::sleep;
use std::time::{Duration, Instant};

use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_C, VK_CONTROL, VK_LWIN, VK_MENU, VK_Q, VK_RWIN, VK_SHIFT,
};

// Keys of the global hotkey. They must be physically up before we send Ctrl+C,
// otherwise the target app sees e.g. Alt+Ctrl+C.
const HOTKEY_KEYS: [VIRTUAL_KEY; 6] = [VK_MENU, VK_SHIFT, VK_CONTROL, VK_LWIN, VK_RWIN, VK_Q];

// Alt pressed and released with no other key in between is taken as a lone Alt
// tap: Chrome moves focus to its toolbar. The hotkey swallows the Q, so we
// inject an unassigned key while Alt is still held.
const MASK_KEY: VIRTUAL_KEY = VIRTUAL_KEY(0xE8);

const KEY_RELEASE_TIMEOUT: Duration = Duration::from_millis(1000);
const CLIPBOARD_TIMEOUT: Duration = Duration::from_millis(500);
const POLL_INTERVAL: Duration = Duration::from_millis(10);
const SETTLE_INTERVAL: Duration = Duration::from_millis(30);
const SETTLE_MAX_ROUNDS: u32 = 10;

// Holding the hotkey makes it fire repeatedly; only one copy may run at a time.
static BUSY: AtomicBool = AtomicBool::new(false);

/// Copies the current selection of the foreground app by sending Ctrl+C.
/// Returns `true` if the clipboard changed, `false` if nothing was copied
/// (no selection, or another copy was already running).
#[tauri::command]
pub async fn copy_selection() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(copy_selection_blocking)
        .await
        .map_err(|e| e.to_string())?
}

fn copy_selection_blocking() -> Result<bool, String> {
    if BUSY.swap(true, Ordering::SeqCst) {
        return Ok(false);
    }
    let result = send_copy_and_wait();
    BUSY.store(false, Ordering::SeqCst);
    result
}

fn send_copy_and_wait() -> Result<bool, String> {
    if is_down(VK_MENU) {
        send_mask_key()?;
    }
    if !wait_until(|| HOTKEY_KEYS.iter().all(|k| !is_down(*k)), KEY_RELEASE_TIMEOUT) {
        return Err("hotkey keys were not released in time".to_string());
    }

    let before = clipboard_sequence();
    send_ctrl_c()?;

    if !wait_until(|| clipboard_sequence() != before, CLIPBOARD_TIMEOUT) {
        return Ok(false);
    }
    wait_for_clipboard_to_settle();
    Ok(true)
}

fn is_down(key: VIRTUAL_KEY) -> bool {
    // The high bit (the sign bit) is set while the key is held.
    unsafe { GetAsyncKeyState(key.0 as i32) < 0 }
}

fn clipboard_sequence() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

fn wait_until(mut condition: impl FnMut() -> bool, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if condition() {
            return true;
        }
        sleep(POLL_INTERVAL);
    }
    false
}

// Emptying the clipboard and then setting its data each bump the counter, so
// reading right after the first change can see an empty clipboard.
fn wait_for_clipboard_to_settle() {
    let mut last = clipboard_sequence();
    for _ in 0..SETTLE_MAX_ROUNDS {
        sleep(SETTLE_INTERVAL);
        let now = clipboard_sequence();
        if now == last {
            return;
        }
        last = now;
    }
}

fn key_input(key: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: key,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn send_inputs(inputs: &[INPUT]) -> Result<(), String> {
    let sent = unsafe { SendInput(inputs, size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(())
    } else {
        // Typically the foreground window runs as administrator (UIPI blocks us).
        Err(format!("SendInput sent {sent} of {} events", inputs.len()))
    }
}

fn send_mask_key() -> Result<(), String> {
    send_inputs(&[
        key_input(MASK_KEY, KEYBD_EVENT_FLAGS(0)),
        key_input(MASK_KEY, KEYEVENTF_KEYUP),
    ])
}

fn send_ctrl_c() -> Result<(), String> {
    let key_down = KEYBD_EVENT_FLAGS(0);
    send_inputs(&[
        key_input(VK_CONTROL, key_down),
        key_input(VK_C, key_down),
        key_input(VK_C, KEYEVENTF_KEYUP),
        key_input(VK_CONTROL, KEYEVENTF_KEYUP),
    ])
}
