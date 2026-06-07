# iOS Quick Start Guide

## ⚡ TL;DR - Just the essentials

### Install on iOS
1. Open app in Safari
2. Tap **Share** (arrow ↗)
3. Tap **Add to Home Screen**
4. Done!

### Enable Microphone
1. Use any feature that needs microphone
2. Tap **Allow** when iOS prompts
3. Done!

### It's Not Working?

| Issue | Fix |
|-------|-----|
| Can't find "Add to Home Screen" | Make sure using Safari, not another browser |
| "Install App" button doesn't show | iOS doesn't use that button - use Share menu |
| Microphone permission denied | Go to Settings → Safari → Microphone → Allow |
| Microphone says "not supported" | Make sure using **HTTPS** (not HTTP) |
| Still broken? | Clear Safari cache: Settings → Safari → Clear History |

---

## 🔗 Full Guides
- **[iOS_SETUP.md](./iOS_SETUP.md)** - Detailed setup & troubleshooting
- **[iOS_FIX_SUMMARY.md](./iOS_FIX_SUMMARY.md)** - Technical details of what was fixed

---

## ✅ What Should Work Now

✅ Add Cohortix POS to iOS home screen  
✅ Open as full-screen app  
✅ Use microphone features (voice assistant, etc.)  
✅ Receive notifications  
✅ Work offline  
✅ Save settings locally  

---

## 📱 Requirements

- iOS 12+ 
- HTTPS connection (https://... not http://...)
- Safari or installed web app
- Working device microphone

---

## 🆘 Common Mistakes

### ❌ "Install App button isn't showing"
**Why**: iOS doesn't have an install button like Android  
**Fix**: Use Share → Add to Home Screen instead

### ❌ "Microphone says 'Denied'"  
**Why**: You tapped "Deny" previously  
**Fix**: Settings → Privacy → Microphone → Safari → Enable

### ❌ "Microphone says 'Not supported'"  
**Why**: Using HTTP instead of HTTPS  
**Fix**: Check URL starts with https://

### ❌ "Works in browser but not as app"  
**Why**: iOS web apps have different permissions than browser  
**Fix**: Make sure properly installed (See green location bar)

---

## ℹ️ More Help?
See **iOS_SETUP.md** for detailed troubleshooting and browser recommendations.
