# 🏝️ Peek-a-boo: YouTube Desktop Dynamic Island

An always-on-top, frosted-glass desktop notch for Windows that sits directly under your laptop camera and smoothly unfolds into your currently playing YouTube video whenever you hover your cursor over it.

---

## 🚀 How to Use (Quick 2-Step Setup)

### Step 1: Load the Chrome Extension (One-time, takes 15 seconds)
1. Open Google Chrome.
2. In the URL bar, go to: `chrome://extensions/`
3. In the top right corner, toggle on **Developer mode**.
4. Click **Load unpacked** (top left).
5. Select the folder:
   ```
   C:\Users\srima\Desktop\peek-a-boo\chrome-bridge
   ```
6. That's it! Now whenever you open YouTube or a playlist in Chrome, it will automatically connect to your desktop notch.

---

### Step 2: Running Peek-a-boo
Your desktop app is already running right now at the top of your screen!

For future launches:
* **Double-click** `Start Peek-a-boo (Silent).vbs` to launch it without any terminal window.
* It lives in your **Windows System Tray** (near the clock/battery). Right-click the icon to:
  * Enable **Start on Windows Boot** (so it's always ready in the background).
  * Re-center under your camera if you move monitors.
  * Quit the app.

---

## ✨ Features
* **Zero Double-Audio**: The desktop notch is muted by default so your music plays cleanly through Chrome into your headphones.
* **Apple Spring Hover Physics**: Expands smoothly when your cursor touches the camera notch; collapses when your cursor leaves.
* **Grace Period**: 350ms margin prevents accidental collapse if your cursor slips briefly.
* **Live Soundwave Visualizer**: Subtle animated equalizer in the notch indicates music is playing.
* **Zero Invisible Blocking**: Collapses window bounds so you can click freely across your entire IDE and desktop.
