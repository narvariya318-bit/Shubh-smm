// Firebase configuration and initialization using CDN SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let auth = null;
let db = null;
let isInitialized = false;

export async function initFirebase() {
  if (isInitialized) return { auth, db };

  try {
    const configRes = await fetch('./firebase-applet-config.json');
    if (!configRes.ok) {
      throw new Error('Failed to load firebase-applet-config.json');
    }
    const config = await configRes.json();
    
    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app, config.firestoreDatabaseId || "(default)");
    isInitialized = true;
    console.log("Firebase CDN initialized successfully.");
    return { auth, db };
  } catch (err) {
    console.error("Firebase CDN init failed, falling back to local simulation mode:", err?.message || err?.toString());
    return { auth: null, db: null };
  }
}

export { auth, db };
