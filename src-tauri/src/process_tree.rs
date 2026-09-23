//! A Windows job object holding a child process and everything it starts.
//!
//! `yt-dlp.exe` is a PyInstaller one-file build: the process we spawn is a bootloader that starts
//! a second `yt-dlp.exe` doing the real work, which in turn runs ffmpeg. Killing the spawned
//! process alone leaves that worker downloading and merging (and holding our stdout pipe open),
//! so cancel has to kill the whole job.

use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::ptr::{null, null_mut};
use std::time::Duration;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
    JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
    TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

pub struct ProcessTree(HANDLE);

// A job handle is a kernel handle; any thread may use it.
unsafe impl Send for ProcessTree {}
unsafe impl Sync for ProcessTree {}

impl ProcessTree {
    /// Puts `child` in a new job; processes it starts later join the job automatically. Call it
    /// right after spawning: the bootloader unpacks itself first, so its worker is not up yet.
    /// The job is kill-on-close, so dropping it or the app exiting also ends the tree.
    pub fn adopt(child: &tokio::process::Child) -> Option<Self> {
        let process = child.raw_handle()?;
        unsafe {
            let job = CreateJobObjectW(null(), null());
            if job.is_null() {
                return None;
            }
            let tree = ProcessTree(job);
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let limited = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) != 0;
            (limited && AssignProcessToJobObject(job, process as HANDLE) != 0).then_some(tree)
        }
    }

    pub fn kill(&self) {
        unsafe {
            TerminateJobObject(self.0, 1);
        }
    }

    /// Waits up to 3 s for every process in the job to exit, so the files they held are released.
    pub async fn wait_until_empty(&self) {
        for _ in 0..60 {
            if self.active_processes() == 0 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    fn active_processes(&self) -> u32 {
        unsafe {
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = zeroed();
            let ok = QueryInformationJobObject(
                self.0,
                JobObjectBasicAccountingInformation,
                &mut info as *mut _ as *mut c_void,
                size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
                null_mut(),
            );
            if ok == 0 { 0 } else { info.ActiveProcesses }
        }
    }
}

impl Drop for ProcessTree {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
