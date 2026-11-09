FULFILLING LIFE — INSTALLATION

The index.html file is a standalone web app. The full folder is a Progressive Web App (PWA).

To install it as an app icon on iPhone or Android reliably:
1. Upload the files in this ZIP to a static HTTPS host, preserving the folder structure.
   Example: GitHub Pages (free). No backend or account is needed to use the app once hosted.
2. Visit the resulting HTTPS address on your phone.
3. iPhone: Safari > Share > Add to Home Screen > Add.
   Android: Chrome > menu > Install app or Add to Home screen.
4. Open the installed icon once while online so the offline cache can initialize.
5. Subsequent use works offline on that device.

Important: Merely downloading an HTML file and opening file:// in a phone browser may not allow
Add to Home Screen and may have inconsistent local storage. The HTML file can be used for testing,
but a one-time HTTPS installation is the reliable route.

Your goal data stays in the browser on your phone. Hosting serves the application files only.
Progress does not sync across devices. Use Settings > Export backup regularly, especially before
clearing browser data, changing phones, or changing where the app is hosted.

Files: index.html, manifest.webmanifest, sw.js, icon-192.png, icon-512.png.
