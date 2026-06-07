# iOS Setup Guide for Cohortix POS

This guide explains how to install and use Cohortix POS on iOS devices and enable microphone access.

## 🔧 Installation on iOS

### Method 1: Add to Home Screen (Recommended for iOS)

Since iOS doesn't support the Web App Install Prompt (used on Android), you need to add the app manually:

1. **Open the app in Safari**
   - Navigate to your Cohortix POS URL in Safari browser

2. **Share & Add to Home Screen**
   - Tap the **Share** button (arrow pointing out of a box)
   - Scroll down and tap **Add to Home Screen**
   - Choose a name for the app (or keep "Cohortix POS")
   - Tap **Add**

3. **Launch as an App**
   - The app now appears as an icon on your home screen
   - Tap it to launch in full-screen "app mode"
   - Once installed as a web app, you'll get access to enhanced features

### What You Get When Installed
- ✅ Full-screen experience (no address bar)
- ✅ App icon on home screen
- ✅ Persistent storage between sessions
- ✅ Local notifications support
- ✅ Microphone access capabilities

---

## 🎤 Microphone Access on iOS

### Why Microphone Might Not Work

iOS Safari has strict requirements for microphone access:

1. **HTTPS Required** ⚠️
   - Microphone access only works on `https://` URLs
   - `http://` URLs are blocked by iOS for security
   - Ensure your app is deployed with HTTPS

2. **iOS Safari Limitations**
   - Must be added to home screen as a web app (see installation steps above)
   - Permissions must be granted per-session
   - Some third-party browser apps don't fully support microphone access

3. **Permission Grant**
   - When you first try to use microphone features, iOS will prompt you
   - You must tap **Allow** to grant permission
   - If you previously denied, go to Settings → Safari → Microphone to re-enable

### Troubleshooting Microphone Access

#### ❌ "Microphone access is not supported"
- **Check**: Is the app using HTTPS?
- **Fix**: Make sure the URL starts with `https://` not `http://`

#### ❌ "Microphone access was denied"
- **Check**: Did you tap Deny when prompted?
- **Fix**: Go to Settings → Safari (or app name) → Microphone → Allow

#### ❌ "No microphone device found"
- **Check**: Does your iOS device have a working microphone?
- **Fix**: Test the microphone with another app (Voice Memos, FaceTime)

#### ❌ Still not working after installation?
- **Try**: Reload the page (pull down to refresh)
- **Try**: Close Safari and open the web app again
- **Try**: Restart your iOS device
- **Last resort**: Use a different browser (Chrome, Firefox) or re-add to home screen

---

## 📋 Using Voice Features (When Microphone is Enabled)

Once microphone access is granted:

1. **Voice Assistant** - Click the Sparkles icon to open the AI assistant
2. **Voice Orders** - Use voice features in the New Order tab
3. **Audio Notifications** - Receive order alerts with sound

### iOS Settings to Check

If microphone stops working, verify these settings:

```
Settings → Privacy → Microphone
  └─ Safari: Enabled
  └─ Your app name: Enabled

Settings → Safari (or your browser)
  └─ Microphone: Allow
  └─ Camera: Allow (if needed)
```

---

## 🐛 Browser Recommendations for iOS

### Best Options (in order)
1. **Safari** (Native browser - best PWA support when added to home screen)
2. **Brave** (Privacy-focused, good microphone support)
3. **Chrome** (Good compatibility, may have limitations with some features)

### Avoid (Limited microphone support)
- Internet Explorer (Outdated)
- Some third-party browsers may have restrictions

---

## 📱 Full-Screen Mode Tips

Once added to home screen, you can:

- **Pull down** to refresh the page
- **Long-press** the home screen icon to remove the app
- **Swipe back** from the left edge to go back (standard iOS gesture)
- **Swipe up** from the bottom to access control center

---

## 🔐 Privacy & Security

The microphone permission system:
- ✅ Permissions are requested only when needed
- ✅ You can revoke access anytime in Settings
- ✅ The app cannot access microphone without explicit permission
- ✅ iOS shows a visual indicator when microphone is in use

---

## 📞 Still Having Issues?

1. **Clear Safari Cache**
   - Settings → Safari → Clear History and Website Data

2. **Update iOS**
   - Settings → General → Software Update

3. **Check Device** 
   - Ensure microphone works with other apps (Voice Memos, FaceTime)

4. **Contact Support**
   - Reach out to your system administrator if problems persist

---

## 💡 Technical Details

The app uses:
- **WebRTC** for microphone access (industry standard)
- **Service Workers** for offline capability
- **Web App Manifest** for home screen installation
- **Permissions API** for checking permission status

For developers integrating microphone features, see `src/lib/ios-microphone.ts`.
