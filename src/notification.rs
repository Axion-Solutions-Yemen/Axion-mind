use std::io::Write;
use std::process::{Command, Stdio};

pub fn show(title: &str, body: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        let payload = serde_json::json!({
            "title": title,
            "body": body
        });
        let payload_str = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

        let ps_script = r#"
            $raw = [Console]::In.ReadToEnd()
            if (-not $raw) { exit 0 }
            $data = $raw | ConvertFrom-Json
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
            $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
            $textNodes = $template.GetElementsByTagName("text")
            $textNodes.Item(0).AppendChild($template.CreateTextNode($data.title)) > $null
            $textNodes.Item(1).AppendChild($template.CreateTextNode($data.body)) > $null
            $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
            $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Axion Mind")
            $notifier.Show($toast)
        "#;

        let mut cmd = Command::new("powershell.exe");
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.arg("-NoProfile")
           .arg("-NonInteractive")
           .arg("-Command")
           .arg(ps_script)
           .stdin(Stdio::piped())
           .stdout(Stdio::null())
           .stderr(Stdio::null());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn notification process: {}", e))?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(payload_str.as_bytes());
        }
        let _ = child.wait();
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (title, body);
        Ok(())
    }
}
