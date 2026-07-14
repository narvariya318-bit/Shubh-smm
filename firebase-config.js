// Firebase configuration and initialization using CDN SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Aapka naya Firebase Project (subah-smm) direct config
const firebaseConfig = {
  apiKey: "AIzaSyD3QSJSam3nHYFNq4trgR2PuSbs_zOU7ps",
  authDomain: "subah-smm.firebaseapp.com",
  databaseURL: "https://subah-smm-default-rtdb.firebaseio.com",
  projectId: "subah-smm",
  storageBucket: "subah-smm.firebasestorage.app",
  messagingSenderId: "514238514443",
  appId: "1:514238514443:web:9c0e940b60ae1376fd0e0e"
};

let auth = null;
let db = null;
let isInitialized = false;

export async function initFirebase() {
  if (isInitialized) return { auth, db };

  try {
    // Ab direct load hoga bina kisi external JSON file ke
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app, "(default)");
    
    isInitialized = true;
    console.log("Firebase CDN initialized successfully.");
    return { auth, db };
  } catch (err) {
    console.error("Firebase CDN init failed, falling back to local simulation mode:", err);
    return { auth: null, db: null };
  }
}

export { auth, db };
