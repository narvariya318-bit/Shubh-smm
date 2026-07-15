// Main SMM Panel Application Controller
import { initFirebase } from './firebase-config.js';
import { 
  DEFAULT_SETTINGS, 
  DEFAULT_CATEGORIES, 
  DEFAULT_SERVICES, 
  DEFAULT_FAQS 
} from './fallback-data.js';

// Firebase imports (loaded via CDN)
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Safe Console Interceptor & Global Error Handling to prevent Circular Structure JSON errors in iframe environments
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

function makeSafeArg(arg) {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack}`;
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      JSON.stringify(arg);
      return arg;
    } catch (e) {
      return `[Circular Object: ${arg.constructor ? arg.constructor.name : 'Unknown'}]`;
    }
  }
  return arg;
}

console.error = function (...args) {
  originalConsoleError.apply(console, args.map(makeSafeArg));
};

console.warn = function (...args) {
  originalConsoleWarn.apply(console, args.map(makeSafeArg));
};

console.log = function (...args) {
  originalConsoleLog.apply(console, args.map(makeSafeArg));
};

window.addEventListener('error', (event) => {
  const msg = event.error ? (event.error.message || event.error.toString()) : event.message;
  originalConsoleError("[Global captured error]:", msg);
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason ? (event.reason.message || event.reason.toString()) : String(event);
  originalConsoleError("[Global captured promise rejection]:", msg);
  event.preventDefault();
});

// App State
let guestId = localStorage.getItem('smm_guest_id');
if (!guestId) {
  guestId = 'guest-' + Math.floor(100000 + Math.random() * 900000);
  localStorage.setItem('smm_guest_id', guestId);
}

let state = {
  auth: null,
  db: null,
  settings: { ...DEFAULT_SETTINGS },
  categories: [ ...DEFAULT_CATEGORIES ],
  services: [ ...DEFAULT_SERVICES ],
  orders: [],
  paymentRequests: [],
  reviews: [],
  submitReviewRating: 5,
  currentUser: null,
  currentView: 'home', // 'home', 'services', 'order', 'track', 'faq', 'contact', 'admin-login', 'admin', 'add-money'
  selectedCategoryId: '',
  selectedServiceId: '',
  theme: 'light', 
  walletBalance: 0,
  guestId: guestId,
  userIp: '',
  scratchCardsScratchStates: JSON.parse(localStorage.getItem('smm_scratch_states') || '[false, false, false, false]'),
  depositAmount: 30, // Default to 30
  orderWizardStep: 1 // SMM Sequential Ordering Wizard Step
};

// Global Exports
export let auth = null;
export let db = null;
export let categories = [ ...DEFAULT_CATEGORIES ];
export let services = [ ...DEFAULT_SERVICES ];
export let settings = { ...DEFAULT_SETTINGS };

// Listeners
let unsubscribeSettings = null;
let unsubscribeCategories = null;
let unsubscribeServices = null;
let unsubscribeOrders = null;
let unsubscribeWallet = null;
let unsubscribePayments = null;

// Initialize SMM Panel
async function initApp() {
  document.documentElement.classList.remove('dark');
  setupNavigation();
  
  // Try to load Firebase
  const fb = await initFirebase();
  state.auth = fb.auth;
  state.db = fb.db;
  auth = fb.auth;
  db = fb.db;
  
  if (state.db) {
    syncSettings();
    syncCategories();
    syncServices();
    syncReviews();
    
    onAuthStateChanged(state.auth, (user) => {
      state.currentUser = user;
      updateAdminUI();
      
      if (unsubscribeWallet) {
        unsubscribeWallet();
        unsubscribeWallet = null;
      }
      unsubscribeWallet = syncWallet();
      
      if (user) {
        // Exclude admin's session visit from database if it exists
        const currentVisitId = sessionStorage.getItem('smm_current_visit_id') || localStorage.getItem('smm_current_visit_id');
        if (currentVisitId && state.db) {
          deleteDoc(doc(state.db, 'visits', currentVisitId)).catch(() => {});
          sessionStorage.removeItem('smm_current_visit_id');
          localStorage.removeItem('smm_current_visit_id');
          localStorage.removeItem('smm_visit_logged_time');
        }
        if (unsubscribeOrders) {
          unsubscribeOrders();
          unsubscribeOrders = null;
        }
        syncOrders();
        
        if (unsubscribePayments) {
          unsubscribePayments();
          unsubscribePayments = null;
        }
        unsubscribePayments = syncPayments();
        
        silentlySeedDefaultServices();
      } else {
        if (unsubscribeOrders) {
          unsubscribeOrders();
          unsubscribeOrders = null;
        }
        state.orders = [];
        if (unsubscribePayments) {
          unsubscribePayments();
          unsubscribePayments = null;
        }
        state.paymentRequests = [];
      }
    });
  } else {
    console.warn("Using local simulation mode.");
    syncWallet();
    renderAll();
  }

  startFlashSaleTimer();
  setupUIHandlers();
  renderAll();
  trackVisit();

  // Support direct admin navigation via URL parameters or hash on mobile devices
  if (window.location.search.includes('admin') || window.location.hash.includes('admin')) {
    setTimeout(() => {
      navigateTo('admin-login');
    }, 200);
  }
  
  console.log("%c🔑 SMM GATEWAY: Admin Console can be accessed by running: navigateTo('admin-login')", "color: #818cf8; font-weight: bold; font-size: 12px;");
}

// -------------------------------------------------------------
// Database Syncing Logic
// -------------------------------------------------------------
function syncSettings() {
  const settingsRef = doc(state.db, 'settings', 'website');
  unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
    if (docSnap.exists()) {
      state.settings = { ...DEFAULT_SETTINGS, ...docSnap.data() };
    } else {
      state.settings = { ...DEFAULT_SETTINGS };
    }
    settings = state.settings;
    renderAnnouncement();
    renderHeaderFooter();
    renderHomeView();
    renderOrderPage();
  }, (error) => {
    console.error("Settings listener failed:", error?.message || error?.toString());
  });
}

function syncCategories() {
  const catCol = collection(state.db, 'categories');
  unsubscribeCategories = onSnapshot(catCol, (snap) => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data());
      });
      state.categories = list.sort((a, b) => a.sortOrder - b.sortOrder);
    } else {
      state.categories = [ ...DEFAULT_CATEGORIES ];
    }
    categories = state.categories;
    renderHomeView();
    renderOrderPage();
    renderServicesList();
  }, (error) => {
    console.error("Categories listener failed:", error?.message || error?.toString());
  });
}

function syncServices() {
  const srvCol = collection(state.db, 'services');
  unsubscribeServices = onSnapshot(srvCol, (snap) => {
    if (!snap.empty) {
      const list = [];
      snap.forEach(docSnap => {
        list.push(docSnap.data());
      });
      state.services = list;
    } else {
      state.services = [ ...DEFAULT_SERVICES ];
    }
    services = state.services;
    renderOrderPage();
    renderServicesList();
  }, (error) => {
    console.error("Services listener failed:", error?.message || error?.toString());
  });
}

let unsubscribeReviews = null;
function syncReviews() {
  if (!state.db) return;
  const reviewsCol = collection(state.db, 'reviews');
  unsubscribeReviews = onSnapshot(reviewsCol, (snap) => {
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    state.reviews = list;
    if (state.currentView === 'faq') {
      renderReviewsList();
    }
    if (state.currentView === 'home') {
      renderHomeReviewsSlider();
    }
    if (activeAdminTab === 'admin-reviews' && state.currentView === 'admin') {
      renderAdminDashboard();
    }
  }, (error) => {
    console.error("Reviews listener failed:", error?.message || error?.toString());
  });
}

function syncOrders() {
  if (!state.db || !state.currentUser) return;
  const ordCol = collection(state.db, 'orders');
  unsubscribeOrders = onSnapshot(ordCol, (snap) => {
    const list = [];
    snap.forEach(docSnap => {
      list.push(docSnap.data());
    });
    state.orders = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderAdminDashboard();
  }, (error) => {
    console.error("Orders listener failed:", error?.message || error?.toString());
  });
}

async function seedDatabaseDefaults() {
  if (!state.db || !state.currentUser) {
    alert("Please login as Admin to seed database.");
    return false;
  }
  try {
    const batch = writeBatch(state.db);
    
    const settingsRef = doc(state.db, 'settings', 'website');
    batch.set(settingsRef, DEFAULT_SETTINGS);

    for (const cat of DEFAULT_CATEGORIES) {
      const catRef = doc(state.db, 'categories', cat.id);
      batch.set(catRef, cat);
    }

    for (const srv of DEFAULT_SERVICES) {
      const srvRef = doc(state.db, 'services', srv.id);
      batch.set(srvRef, srv);
    }

    await batch.commit();
    return true;
  } catch (err) {
    console.error("Seeding failed:", err?.message || err?.toString());
    throw err;
  }
}

async function silentlySeedDefaultServices() {
  if (!state.db || !state.currentUser) return;
  try {
    const batch = writeBatch(state.db);
    for (const cat of DEFAULT_CATEGORIES) {
      const catRef = doc(state.db, 'categories', cat.id);
      batch.set(catRef, cat, { merge: true });
    }
    for (const srv of DEFAULT_SERVICES) {
      const srvRef = doc(state.db, 'services', srv.id);
      batch.set(srvRef, srv, { merge: true });
    }
    await batch.commit();
    console.log("Quietly verified and seeded default SMM services successfully!");
  } catch (error) {
    console.error("Silent seeding failed:", error?.message || error?.toString());
  }
}

// -------------------------------------------------------------
// Navigation / Routing
// -------------------------------------------------------------
function setupNavigation() {
  const navLinks = document.querySelectorAll('[data-route]');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.getAttribute('data-route');
      navigateTo(targetView);
    });
  });

  const logos = document.querySelectorAll('.logo-click');
  logos.forEach(logo => {
    logo.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo('home');
    });
  });
}

function navigateTo(viewName) {
  state.currentView = viewName;
  
  // Log the navigation action
  const pageMap = {
    'home': 'Visited Home Page',
    'services': 'Viewed Services List',
    'order': 'Opened SMM Order Page',
    'track': 'Opened Track Orders Page',
    'faq': 'Visited FAQ & Reviews',
    'contact': 'Viewed Support Contact',
    'admin-login': 'Visited Admin Login',
    'add-money': 'Visited Add Money Page',
    'select-upi': 'Selected UPI Deposit Option',
    'scan-pay': 'Opened UPI QR Code Scanner'
  };
  const pageAction = pageMap[viewName];
  if (pageAction) {
    logUserAction(pageAction);
  }

  if (state.settings.isMaintenanceMode && viewName !== 'admin' && viewName !== 'admin-login') {
    document.getElementById('maintenance-overlay').classList.remove('hidden');
    document.getElementById('main-content').classList.add('hidden');
    return;
  } else {
    document.getElementById('maintenance-overlay').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');
  }

  // Navbar link highlights
  document.querySelectorAll('[data-route]').forEach(link => {
    const route = link.getAttribute('data-route');
    if (route === viewName) {
      link.classList.add('text-indigo-400', 'border-b-2', 'border-indigo-500');
      link.classList.remove('text-slate-300');
    } else {
      link.classList.remove('text-indigo-400', 'border-b-2', 'border-indigo-500');
      link.classList.add('text-slate-300');
    }
  });

  const screens = ['view-home', 'view-services', 'view-order', 'view-track', 'view-faq', 'view-contact', 'view-admin-login', 'view-admin', 'view-add-money', 'view-select-upi', 'view-scan-pay'];
  screens.forEach(screenId => {
    const el = document.getElementById(screenId);
    if (el) {
      if (screenId === `view-${viewName}`) {
        el.classList.remove('hidden');
        el.classList.add('fade-in');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  if (viewName === 'home') renderHomeView();
  else if (viewName === 'services') renderServicesList();
  else if (viewName === 'order') {
    state.orderWizardStep = 1;
    renderOrderPage();
  }
  else if (viewName === 'track') renderTrackPage();
  else if (viewName === 'faq') renderFAQPage();
  else if (viewName === 'contact') renderContactPage();
  else if (viewName === 'admin-login') renderAdminLoginPage();
  else if (viewName === 'add-money') renderAddMoneyView();
  else if (viewName === 'select-upi') renderSelectUpiView();
  else if (viewName === 'scan-pay') renderScanPayView();
  else if (viewName === 'admin') {
    if (!state.currentUser) {
      navigateTo('admin-login');
    } else {
      renderAdminDashboard();
    }
  }

  document.getElementById('mobile-menu').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigateTo = navigateTo;

// -------------------------------------------------------------
// UI Renderers & Helper Logic
// -------------------------------------------------------------
function renderAll() {
  renderAnnouncement();
  renderHeaderFooter();
  renderHomeView();
  renderFAQPage();
}

function renderAnnouncement() {
  const annEl = document.getElementById('announcement-banner');
  if (!annEl) return;
  if (state.settings.showAnnouncement && state.settings.announcement) {
    annEl.innerHTML = `
      <div class="bg-gradient-to-r from-indigo-600 via-blue-600 to-emerald-500 text-white text-center py-1.5 px-3 text-[10px] sm:text-xs font-semibold tracking-wide flex justify-center items-center gap-1.5 shadow-sm">
        <span class="flex h-1.5 w-1.5 relative">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-100"></span>
        </span>
        <p>${state.settings.announcement}</p>
      </div>
    `;
    annEl.classList.remove('hidden');
  } else {
    annEl.classList.add('hidden');
  }
}

function renderHeaderFooter() {
  const logoTextEls = document.querySelectorAll('.site-title');
  logoTextEls.forEach(el => {
    const rawTitle = state.settings.title || "HEMANT SMM";
    el.textContent = rawTitle.toUpperCase();
  });

  // Dynamic Custom Website Logo
  const headerLogoContainer = document.getElementById('header-logo-container');
  if (headerLogoContainer) {
    if (state.settings.logoUrl && state.settings.logoUrl.trim() !== '') {
      headerLogoContainer.innerHTML = `<img src="${state.settings.logoUrl}" alt="SMM Logo" class="w-10 h-10 object-contain rounded-[1.1rem] shadow-sm mr-2">`;
    } else {
      headerLogoContainer.innerHTML = '';
    }
  }

  const footerDesc = document.getElementById('footer-desc');
  if (footerDesc) footerDesc.textContent = state.settings.description || DEFAULT_SETTINGS.description;

  const waLinks = document.querySelectorAll('.wa-link');
  const tgLinks = document.querySelectorAll('.tg-link');
  
  const waNumber = String(state.settings.whatsappNumber || '');
  waLinks.forEach(el => {
    el.setAttribute('href', `https://wa.me/${waNumber.replace(/[^0-9]/g, '')}`);
  });
  tgLinks.forEach(el => {
    el.setAttribute('href', state.settings.telegramLink || '#');
  });
}

function renderHomeView() {
  renderWalletDisplays();

  const newsDisplay = document.getElementById('platform-news-display');
  if (newsDisplay) newsDisplay.textContent = state.settings.platformNews || 'No updates.';

  const activeUsersDisplay = document.getElementById('active-users-display');
  if (activeUsersDisplay) activeUsersDisplay.textContent = state.settings.activeUsersCount || '245,000+';

  const totalOrdersDisplay = document.getElementById('total-orders-display');
  if (totalOrdersDisplay) totalOrdersDisplay.textContent = state.settings.totalOrdersCount || '220,500+';

  const flashTitle = document.getElementById('flash-sale-title-home');
  if (flashTitle) flashTitle.textContent = state.settings.flashSaleTitle || '⚡ FLASH SALE ENDING IN';

  const flashDesc = document.getElementById('flash-sale-desc-home');
  if (flashDesc) flashDesc.textContent = state.settings.flashSaleDesc || 'Lowest prices for next 30 minutes only. Grab the deal before prices hike up!';

  const flashHindi = document.getElementById('flash-sale-hindi-home');
  if (flashHindi) flashHindi.textContent = state.settings.flashSaleHindi || 'सिर्फ आपके 30 मिनट के लिए सबसे कम दाम। जल्दी ऑर्डर करें!';

  // Populate dynamic Top Services with Customized Logo (or fallback icon)
  const topServicesList = document.getElementById('home-top-services-list');
  if (topServicesList) {
    const activeServices = state.services.filter(s => s.active).slice(0, 15);
    topServicesList.innerHTML = activeServices.map(srv => {
      const cat = state.categories.find(c => c.id === srv.categoryId);
      return getServiceCardHtml(srv, cat);
    }).join('');
  }

  // Scratch cards
  for (let i = 0; i < 4; i++) {
    const front = document.getElementById(`scratch-front-${i}`);
    const prize = document.getElementById(`scratch-prize-${i}`);
    let winText = "Try Again!";
    if (i === 0) winText = state.settings.scratchCard1Win || "₹5 Extra Bonus";
    else if (i === 1) winText = state.settings.scratchCard2Win || "₹10 Extra Bonus";
    else if (i === 2) winText = state.settings.scratchCard3Win || "20% Extra Bonus";
    else if (i === 3) winText = state.settings.scratchCard4Win || "Try Again!";

    if (prize) prize.textContent = winText;

    if (front) {
      if (state.scratchCardsScratchStates[i]) {
        front.classList.add('scale-0');
        setTimeout(() => { front.classList.add('hidden'); }, 300);
      } else {
        front.classList.remove('hidden', 'scale-0');
      }
    }
  }

  renderHomeReviewsSlider();
}

function getCategoryIconSVG(iconName) {
  const norm = (iconName || '').toLowerCase();
  if (norm.includes('instagram')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" stroke-width="2"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" stroke-width="2"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" stroke-width="2"></line></svg>`;
  } else if (norm.includes('youtube')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" stroke-width="2"></path><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="currentColor"></polygon></svg>`;
  } else if (norm.includes('facebook')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>`;
  } else if (norm.includes('telegram')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`;
  } else if (norm.includes('tiktok')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>`;
  } else if (norm.includes('twitter') || norm === 'x') {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4l11.733 16h4.267l-11.733 -16z"></path><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path></svg>`;
  } else if (norm.includes('spotify')) {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M8 11.5c2.5-1.5 5.5-1.5 8 0"></path><path d="M7 9c3.5-2 6.5-2 10 0"></path><path d="M9 14c2-1 4-1 6 0"></path></svg>`;
  } else {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="2" x2="22" y1="12" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
  }
}

function getServiceCardHtml(srv, cat) {
  const srvNameLower = srv.name.toLowerCase();
  const packagePrice = Math.round((srv.minQuantity * srv.pricePer1000) / 1000);
  const qtyLabel = srv.description ? `Quantity: ${srv.description}` : `Quantity: ${srv.minQuantity.toLocaleString()}+`;
  
  let themeBorderColor = 'border-indigo-600 dark:border-indigo-500';
  let themeButtonBg = 'from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-indigo-500/20';
  
  if (srvNameLower.includes('youtube') || srvNameLower.includes('subs') || srvNameLower.includes('subscribers') || srv.categoryId.includes('youtube')) {
    themeBorderColor = 'border-red-600 dark:border-red-500';
    themeButtonBg = 'from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-500/20';
  } else if (srvNameLower.includes('instagram') || srvNameLower.includes('followers') || srvNameLower.includes('likes') || srv.categoryId.includes('instagram')) {
    themeBorderColor = 'border-purple-600 dark:border-pink-500';
    themeButtonBg = 'from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-purple-500/20';
  } else if (srvNameLower.includes('blue tick') || srvNameLower.includes('verified') || srv.id.includes('blue-tick') || srvNameLower.includes('blue_tick')) {
    themeBorderColor = 'border-sky-500 dark:border-sky-400';
    themeButtonBg = 'from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-sky-500/20';
  }
  
  let serviceLogoHtml = '';
  // Match the exact double-circle layout from the image
  if (srv.logoUrl && srv.logoUrl.trim() !== '') {
    serviceLogoHtml = `
      <div class="w-14 h-14 rounded-full border-2 ${themeBorderColor} p-0.5 flex items-center justify-center shrink-0 bg-white dark:bg-slate-950 shadow-md">
        <img src="${srv.logoUrl}" alt="${srv.name}" class="w-full h-full rounded-full object-cover shrink-0">
      </div>
    `;
  } else if (srvNameLower.includes('blue tick') || srvNameLower.includes('verified') || srv.id.includes('blue-tick') || srvNameLower.includes('blue_tick')) {
    // Blue Tick badge
    serviceLogoHtml = `
      <div class="w-14 h-14 rounded-full border-2 ${themeBorderColor} p-0.5 flex items-center justify-center shrink-0 bg-white dark:bg-slate-950 shadow-md">
        <div class="w-full h-full rounded-full bg-[#1da1f2] flex items-center justify-center text-white shrink-0 shadow-sm p-1.5">
          <svg class="w-full h-full text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
          </svg>
        </div>
      </div>
    `;
  } else if (srvNameLower.includes('youtube') || srvNameLower.includes('subs') || srvNameLower.includes('subscribers') || srv.categoryId.includes('youtube')) {
    // Red Play Button circle
    serviceLogoHtml = `
      <div class="w-14 h-14 rounded-full border-2 ${themeBorderColor} p-0.5 flex items-center justify-center shrink-0 bg-white dark:bg-slate-950 shadow-md">
        <div class="w-full h-full rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 shadow-sm p-2.5">
          <svg class="w-full h-full text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21.582 6.186a2.69 2.69 0 0 0-1.887-1.893C18.03 3.96 12 3.96 12 3.96s-6.03 0-7.695.333a2.69 2.69 0 0 0-1.888 1.893C2.08 7.848 2.08 11.23 2.08 11.23s0 3.38.337 5.044a2.69 2.69 0 0 0 1.888 1.893c1.665.333 7.695.333 7.695.333s6.03 0 7.696-.333a2.69 2.69 0 0 0 1.887-1.893c.337-1.664.337-5.044.337-5.044s0-3.381-.337-5.044zM8.32 14.885V7.575L14.773 11.23z"/>
          </svg>
        </div>
      </div>
    `;
  } else {
    // Instagram or default gradient circle with logo
    serviceLogoHtml = `
      <div class="w-14 h-14 rounded-full border-2 ${themeBorderColor} p-0.5 flex items-center justify-center shrink-0 bg-white dark:bg-slate-950 shadow-md">
        <div class="w-full h-full rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm p-2.5">
          <svg class="w-full h-full text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
          </svg>
        </div>
      </div>
    `;
  }

  // 10k Followers special offer tag
  let lastOfferBadge = '';
  if (srvNameLower.includes('10k') && srvNameLower.includes('followers')) {
    lastOfferBadge = `
      <div class="mt-1">
        <span class="inline-block text-[8px] sm:text-[9px] bg-rose-600 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse border border-white/20">
          "last offer" 30min
        </span>
      </div>
    `;
  }

  return `
    <div onclick="window.selectServiceAndNavigate('${srv.categoryId}', '${srv.id}')" class="bg-white dark:bg-slate-900 border-2 ${themeBorderColor} rounded-full p-2.5 flex items-center justify-between shadow-md hover:scale-[1.02] hover:shadow-lg transition-all duration-200 cursor-pointer select-none group">
      <div class="flex items-center gap-3.5 max-w-[65%]">
        ${serviceLogoHtml}
        <div class="min-w-0">
          <h4 class="text-[12px] sm:text-[13px] font-black text-slate-950 dark:text-white uppercase tracking-wider leading-tight truncate">${srv.name}</h4>
          ${lastOfferBadge}
          <p class="text-[9.5px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5 leading-none">${qtyLabel}</p>
          <p class="text-[9.5px] text-slate-500 dark:text-slate-400 font-bold uppercase mt-1 leading-none flex items-center gap-0.5">
            ⏳ Offer: <span class="font-black text-rose-600 dark:text-rose-400">₹${packagePrice}</span>
          </p>
        </div>
      </div>
      <div class="flex items-center">
        <!-- Buy button with price dynamic -->
        <button onclick="event.stopPropagation(); window.selectServiceAndNavigate('${srv.categoryId}', '${srv.id}')" class="px-5 py-2.5 bg-gradient-to-r ${themeButtonBg} text-white rounded-full text-xs font-black tracking-wide shrink-0 transition-all duration-300 shadow-md hover:shadow-lg active:scale-95 flex items-center gap-2 border border-white/15 hover:brightness-105">
          <span>₹${packagePrice}</span>
          <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </button>
      </div>
    </div>
  `;
}

window.selectServiceAndNavigate = function(catId, srvId) {
  const srv = state.services.find(s => s.id === srvId);
  if (srv) {
    const packagePrice = Math.round((srv.minQuantity * srv.pricePer1000) / 1000);
    if (state.walletBalance < packagePrice) {
      const modal = document.getElementById('check-balance-modal');
      if (modal) modal.classList.remove('hidden');
      return;
    }
  }
  state.selectedCategoryId = catId;
  state.selectedServiceId = srvId;
  navigateTo('order');
};

window.navigateToAddMoney = function() {
  navigateTo('add-money');
};

window.showAddFundsModal = function() {
  const modal = document.getElementById('add-funds-modal');
  const upiIdText = document.getElementById('add-funds-upi-text');
  if (upiIdText) {
    upiIdText.textContent = state.settings.upiId || DEFAULT_SETTINGS.upiId;
  }
  if (modal) modal.classList.remove('hidden');
};

window.closeAddFundsModal = function() {
  const modal = document.getElementById('add-funds-modal');
  if (modal) modal.classList.add('hidden');
};

// Services list catalog
function renderServicesList() {
  const container = document.getElementById('services-list-container');
  if (!container) return;

  const searchQuery = (document.getElementById('services-search-input')?.value || '').toLowerCase();
  const activeCategories = state.categories.filter(c => c.active);

  if (activeCategories.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 text-xs">No categories available at the moment.</p>`;
    return;
  }

  container.innerHTML = activeCategories.map(cat => {
    const catServices = state.services.filter(s => s.categoryId === cat.id && s.active && s.name.toLowerCase().includes(searchQuery));
    if (catServices.length === 0) return '';

    return `
      <div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            ${getCategoryIconSVG(cat.icon)}
          </div>
          <h2 class="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-widest">${cat.name}</h2>
        </div>
        <div class="space-y-3">
          ${catServices.map(srv => getServiceCardHtml(srv, cat)).join('')}
        </div>
      </div>
    `;
  }).join('');
}
window.renderServicesList = renderServicesList;

// -------------------------------------------------------------
// SMM Wizard Flow Implementation (पहले service select फिर quantity...)
// -------------------------------------------------------------
function renderOrderPage() {
  const catSelect = document.getElementById('order-category-select');
  if (!catSelect) return;

  const activeCategories = state.categories.filter(c => c.active);
  catSelect.innerHTML = activeCategories.map(cat => `
    <option value="${cat.id}" ${state.selectedCategoryId === cat.id ? 'selected' : ''}>${cat.name.toUpperCase()}</option>
  `).join('');

  if (!state.selectedCategoryId && activeCategories.length > 0) {
    state.selectedCategoryId = activeCategories[0].id;
  }

  // Populate visual list of services with images in Step 1
  renderVisualServicesList();
  goToWizardStep(state.orderWizardStep || 1);
}

function renderVisualServicesList() {
  const container = document.getElementById('order-visual-services-list');
  if (!container) return;

  const categoryId = document.getElementById('order-category-select')?.value || state.selectedCategoryId;
  const catServices = state.services.filter(s => s.categoryId === categoryId && s.active);

  if (catServices.length === 0) {
    container.innerHTML = `<p class="p-4 text-center text-slate-400 text-[10px] font-black uppercase">-- No active pipeline packages --</p>`;
    document.getElementById('order-service-select-value').value = '';
    return;
  }

  const currentSelectedId = document.getElementById('order-service-select-value').value || state.selectedServiceId || catServices[0].id;

  container.innerHTML = catServices.map(srv => {
    // Service custom logo image
    let serviceLogoHtml = '';
    if (srv.logoUrl && srv.logoUrl.trim() !== '') {
      serviceLogoHtml = `<img src="${srv.logoUrl}" alt="${srv.name}" class="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-800 shrink-0">`;
    } else {
      const cat = state.categories.find(c => c.id === srv.categoryId);
      const icon = cat ? cat.icon : 'globe';
      if (icon === 'youtube') {
        serviceLogoHtml = `
          <div class="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 shadow-sm border border-red-500/20">
            ${getCategoryIconSVG('youtube')}
          </div>
        `;
      } else if (icon === 'instagram') {
        serviceLogoHtml = `
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm border border-purple-500/20">
            ${getCategoryIconSVG('instagram')}
          </div>
        `;
      } else {
        serviceLogoHtml = `
          <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0 border border-slate-200 dark:border-slate-700">
            ${getCategoryIconSVG(icon)}
          </div>
        `;
      }
    }

    const isSelected = srv.id === currentSelectedId;
    const borderClass = isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900';

    const packagePrice = Math.round((srv.minQuantity * srv.pricePer1000) / 1000);
    const qtyLabel = srv.description ? `Quantity: ${srv.description}` : `Quantity: ${srv.minQuantity.toLocaleString()}+`;
    const srvNameLower = srv.name.toLowerCase();

    let lastOfferBadge = '';
    if (srvNameLower.includes('10k') && srvNameLower.includes('followers')) {
      lastOfferBadge = `
        <span class="inline-block text-[7.5px] bg-rose-600 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse border border-white/20 ml-1">
          "last offer" 30min
        </span>
      `;
    }

    return `
      <div onclick="window.selectWizardService('${srv.id}')" class="p-3 border rounded-full flex items-center justify-between gap-3 cursor-pointer transition-all ${borderClass}">
        <div class="flex items-center gap-2.5 max-w-[75%]">
          ${serviceLogoHtml}
          <div>
            <span class="block text-[10px] sm:text-[11px] font-black text-slate-950 dark:text-white uppercase leading-tight flex items-center flex-wrap">
              ${srv.name} ${lastOfferBadge}
            </span>
            <span class="block text-[8px] text-slate-400 font-bold uppercase mt-0.5">${qtyLabel}</span>
          </div>
        </div>
        <span class="px-5 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-full text-xs font-black tracking-wide shrink-0 shadow-md flex items-center gap-1.5 border border-white/10">
          <span>₹${packagePrice}</span>
          <div class="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
            <svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
            </svg>
          </div>
        </span>
      </div>
    `;
  }).join('');

  // Automatically select the active one in the hidden field
  if (catServices.some(s => s.id === currentSelectedId)) {
    window.selectWizardService(currentSelectedId, false); // Don't trigger renderVisualServicesList recursively
  } else if (catServices.length > 0) {
    window.selectWizardService(catServices[0].id, false);
  }
}

window.selectWizardService = function(srvId, shouldRender = true) {
  if (shouldRender) {
    const srv = state.services.find(s => s.id === srvId);
    if (srv) {
      const packagePrice = Math.round((srv.minQuantity * srv.pricePer1000) / 1000);
      if (state.walletBalance < packagePrice) {
        const modal = document.getElementById('check-balance-modal');
        if (modal) modal.classList.remove('hidden');
        return;
      }
    }
  }
  state.selectedServiceId = srvId;
  const inputEl = document.getElementById('order-service-select-value');
  if (inputEl) inputEl.value = srvId;

  // Render Service Details Box
  const srv = state.services.find(s => s.id === srvId);
  const detailsBox = document.getElementById('order-service-details-box');
  const detailsText = document.getElementById('order-details-text');

  if (srv && detailsBox && detailsText) {
    detailsBox.classList.remove('hidden');
    detailsText.innerHTML = `
      <p class="text-slate-800 dark:text-white font-bold uppercase text-[10px] tracking-wide mb-0.5">Pipeline Specs</p>
      <p class="text-slate-600 dark:text-slate-300">${srv.description}</p>
    `;
  } else if (detailsBox) {
    detailsBox.classList.add('hidden');
  }

  if (shouldRender) {
    renderVisualServicesList();
  }
};

window.goToWizardStep = function(stepNum) {
  state.orderWizardStep = stepNum;

  // Toggle dynamic step headers
  const totalSteps = 2;
  const percent = Math.round((stepNum / totalSteps) * 100);

  const stepLabel = document.getElementById('order-wizard-step-label');
  const percentLabel = document.getElementById('order-wizard-percentage');
  const progressBar = document.getElementById('order-wizard-progress-bar');
  const stepTitle = document.getElementById('order-wizard-title');

  if (stepLabel) stepLabel.textContent = `STEP ${stepNum} OF ${totalSteps}`;
  if (percentLabel) percentLabel.textContent = `${percent}% COMPLETED`;
  if (progressBar) progressBar.style.width = `${percent}%`;

  // Step names
  let titleStr = "Select SMM Service";
  if (stepNum === 2) titleStr = "Target Profile URL & Quantity";

  if (stepTitle) stepTitle.textContent = titleStr;

  // Hide/show dynamic divs
  for (let i = 1; i <= totalSteps; i++) {
    const el = document.getElementById(`order-wizard-step-${i}`);
    if (el) {
      if (i === stepNum) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  }

  // Pre-load data calculations based on active steps
  const srvId = document.getElementById('order-service-select-value')?.value || state.selectedServiceId;
  const srv = state.services.find(s => s.id === srvId);

  if (stepNum === 2 && srv) {
    const boundsLabel = document.getElementById('wizard-quantity-bounds');
    if (boundsLabel) boundsLabel.textContent = `Min Limits: ${srv.minQuantity.toLocaleString()} | Max Limits: ${srv.maxQuantity.toLocaleString()}`;
    
    const srvNameEl = document.getElementById('wizard-selected-srv-name');
    const srvPriceEl = document.getElementById('wizard-selected-srv-price');
    if (srvNameEl) srvNameEl.textContent = srv.name;
    if (srvPriceEl) {
      const packagePrice = Math.round((srv.minQuantity * srv.pricePer1000) / 1000);
      srvPriceEl.textContent = `Package Cost: ₹${packagePrice} (for ${srv.minQuantity.toLocaleString()} items)`;
    }

    // Preset quantity placeholder
    const qtyInput = document.getElementById('order-quantity-input');
    if (qtyInput) {
      qtyInput.setAttribute('min', srv.minQuantity);
      qtyInput.setAttribute('max', srv.maxQuantity);
      if (!qtyInput.value) {
        qtyInput.value = srv.minQuantity;
      }
    }
    calculateCharge();
  }
};

window.nextWizardStep = function() {
  const step = state.orderWizardStep;
  const srvId = document.getElementById('order-service-select-value')?.value || state.selectedServiceId;
  const srv = state.services.find(s => s.id === srvId);

  if (step === 1) {
    if (!srv) {
      alert("Please choose an SMM service package to proceed!");
      return;
    }
    goToWizardStep(2);
  }
};

window.prevWizardStep = function() {
  if (state.orderWizardStep > 1) {
    goToWizardStep(state.orderWizardStep - 1);
  }
};

function updatePaymentQRCode(charge) {
  const qrImg = document.getElementById('order-payment-qr');
  if (!qrImg) return;

  const upiId = state.settings.upiId || DEFAULT_SETTINGS.upiId;
  const qrCodeType = state.settings.qrCodeType || 'dynamic';

  if (qrCodeType === 'static' && state.settings.qrCodeUrl && state.settings.qrCodeUrl.trim() !== "") {
    qrImg.src = state.settings.qrCodeUrl;
  } else if (upiId) {
    // Generate secure dynamic QR Code auto-filled with SMM price value!
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(state.settings.title || 'LENS RA SMM')}&cu=INR${charge > 0 ? `&am=${charge.toFixed(2)}` : ''}`;
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
  } else {
    qrImg.src = state.settings.qrCodeUrl || DEFAULT_SETTINGS.qrCodeUrl;
  }

  // UPI instructions copy updates
  const copyUpiSpan = document.getElementById('order-payment-upi');
  if (copyUpiSpan) copyUpiSpan.textContent = upiId;
}

function calculateCharge() {
  const srvId = document.getElementById('order-service-select-value')?.value || state.selectedServiceId;
  const qtyInput = document.getElementById('order-quantity-input');
  const costDisplay = document.getElementById('order-cost-display');

  if (!srvId || !qtyInput) return;

  const srv = state.services.find(s => s.id === srvId);
  if (!srv) return;

  const qty = parseInt(qtyInput.value) || 0;
  const charge = (qty / 1000) * srv.pricePer1000;

  if (costDisplay) {
    costDisplay.textContent = `₹${charge.toFixed(2)}`;
  }

  // Also update submit button text with price
  const submitBtn = document.getElementById('order-submit-btn');
  if (submitBtn) {
    if (charge > 0) {
      submitBtn.textContent = `SUBMIT SMM ORDER - ₹${charge.toFixed(2)}`;
    } else {
      submitBtn.textContent = `SUBMIT SMM ORDER`;
    }
  }
}

// SMM Wizard Submission
window.submitWizardOrder = async function() {
  const srvId = document.getElementById('order-service-select-value')?.value || state.selectedServiceId;
  const qtyInput = document.getElementById('order-quantity-input');
  const linkInput = document.getElementById('order-link-input');

  if (!srvId || !qtyInput || !linkInput) return;

  const srv = state.services.find(s => s.id === srvId);
  if (!srv) return;

  const qty = parseInt(qtyInput.value) || 0;
  if (isNaN(qty) || qty < srv.minQuantity || qty > srv.maxQuantity) {
    alert(`Invalid quantity! SMM package bounds: ${srv.minQuantity.toLocaleString()} to ${srv.maxQuantity.toLocaleString()}`);
    return;
  }

  const link = linkInput.value.trim();
  if (!link || link.length < 5) {
    alert("Please enter a valid target link/URL!");
    return;
  }

  const charge = parseFloat(((qty / 1000) * srv.pricePer1000).toFixed(2));
  
  // Double check balance!
  if (state.walletBalance < charge) {
    document.getElementById('check-balance-modal').classList.remove('hidden');
    return;
  }
  
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const cat = state.categories.find(c => c.id === srv.categoryId);

  const orderData = {
    id: orderId,
    clientName: state.currentUser ? (state.currentUser.email || state.currentUser.uid) : state.guestId,
    serviceId: srv.id,
    serviceName: srv.name,
    categoryId: srv.categoryId,
    categoryName: cat ? cat.name : "Social Services",
    link: link,
    quantity: qty,
    charge: charge,
    paymentReference: 'WALLET-PAYMENT',
    status: 'Processing',
    createdAt: new Date().toISOString(),
    remarks: 'Sufficient wallet balance deducted. Growth delivery processing.',
    userIp: state.userIp || 'Unknown'
  };

  const submitBtn = document.getElementById('order-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering order...';
  }

  try {
    const walletId = state.currentUser ? state.currentUser.uid : state.guestId;
    const newBalance = parseFloat((state.walletBalance - charge).toFixed(2));

    if (state.db) {
      await setDoc(doc(state.db, 'wallets', walletId), { balance: newBalance, id: walletId, updatedAt: new Date().toISOString() });
      await setDoc(doc(state.db, 'orders', orderId), orderData);
    } else {
      localStorage.setItem('local_wallet_balance', newBalance.toString());
      state.walletBalance = newBalance;
      renderWalletDisplays();

      const saved = JSON.parse(localStorage.getItem('local_orders') || '[]');
      saved.push(orderData);
      localStorage.setItem('local_orders', JSON.stringify(saved));
    }

    // Reset fields
    qtyInput.value = '';
    linkInput.value = '';

    showOrderSuccessModal(orderData);
    logUserAction(`Placed Order: ${orderData.serviceName} (Qty: ${orderData.quantity})`);
  } catch (err) {
    console.error("Order submit failed:", err?.message || err?.toString());
    alert("Error registering transaction. Message support via WhatsApp!");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'SUBMIT SMM ORDER';
    }
  }
};

function showOrderSuccessModal(order) {
  const modal = document.getElementById('order-success-modal');
  if (!modal) return;

  document.getElementById('success-order-id').textContent = order.id;
  document.getElementById('success-service-name').textContent = order.serviceName;
  document.getElementById('success-charge').textContent = `₹${order.charge}`;
  document.getElementById('success-ref-id').textContent = order.paymentReference;

  modal.classList.remove('hidden');
}

// -------------------------------------------------------------
// Track Order Rendering
// -------------------------------------------------------------
async function handleTrackSearch(e) {
  e.preventDefault();
  const searchInput = document.getElementById('track-search-input')?.value.trim();
  const resultBox = document.getElementById('track-results');
  if (!searchInput || !resultBox) return;

  resultBox.innerHTML = `
    <div class="flex flex-col items-center justify-center py-8">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
      <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Scanning blockchain database nodes...</p>
    </div>
  `;

  let foundOrder = null;

  try {
    if (state.db) {
      const docSnap = await getDoc(doc(state.db, 'orders', searchInput));
      if (docSnap.exists()) {
        foundOrder = docSnap.data();
      } else {
        const q = query(collection(state.db, 'orders'), where('paymentReference', '==', searchInput));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          foundOrder = qSnap.docs[0].data();
        }
      }
    } else {
      const saved = JSON.parse(localStorage.getItem('local_orders') || '[]');
      foundOrder = saved.find(o => o.id === searchInput || o.paymentReference === searchInput);
    }

    if (!foundOrder) {
      resultBox.innerHTML = `
        <div class="bg-red-950/20 border border-red-900/30 text-red-300 p-4 rounded-xl text-center text-xs space-y-1">
          <h4 class="font-black uppercase">Ref index not found</h4>
          <p class="text-[10px] text-slate-400 leading-normal">Double-check Order Code or 12-digit payment code. New payments require 1-5 minutes for node indexing.</p>
        </div>
      `;
      return;
    }

    let statusClass = 'bg-slate-800 text-slate-300 border-slate-700';
    if (foundOrder.status === 'Pending') statusClass = 'bg-amber-950/40 text-amber-300 border-amber-900/40';
    else if (foundOrder.status === 'Processing') statusClass = 'bg-blue-950/40 text-blue-300 border-blue-900/40';
    else if (foundOrder.status === 'Completed') statusClass = 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40';
    else if (foundOrder.status === 'Cancelled') statusClass = 'bg-rose-950/40 text-rose-300 border-rose-900/40';

    resultBox.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <span class="text-[8px] text-slate-500 font-bold uppercase block">INDEXED SMM BATCH</span>
            <span class="text-sm font-black text-white">${foundOrder.id}</span>
          </div>
          <span class="px-2.5 py-1 rounded-full text-[10px] font-black border ${statusClass}">${foundOrder.status}</span>
        </div>

        <div class="space-y-2 text-[11px] leading-tight">
          <div><span class="text-slate-500 block">Link/Url:</span><a href="${foundOrder.link}" target="_blank" class="text-indigo-400 font-bold break-all">${foundOrder.link}</a></div>
          <div><span class="text-slate-500 block">Social Automation Parameter:</span><span class="text-slate-200 font-bold uppercase">${foundOrder.serviceName}</span></div>
          <div class="grid grid-cols-2 gap-2 pt-1">
            <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg"><span class="text-slate-500 block text-[9px] mb-0.5">Quantity</span><span class="text-white font-extrabold text-sm">${foundOrder.quantity.toLocaleString()}</span></div>
            <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg"><span class="text-slate-500 block text-[9px] mb-0.5">Settle Price</span><span class="text-emerald-400 font-black text-sm">₹${foundOrder.charge}</span></div>
          </div>
        </div>

        <div class="border-t border-slate-800 pt-3 text-[10px] space-y-2 leading-relaxed">
          <div class="flex justify-between"><span class="text-slate-500">UTR Refer:</span><span class="font-mono text-slate-300 font-bold select-all uppercase">${foundOrder.paymentReference}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Time:</span><span class="text-slate-300">${new Date(foundOrder.createdAt).toLocaleString()}</span></div>
          <div class="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
            <span class="text-indigo-400 font-bold block mb-0.5 uppercase text-[9px]">Automation Feed</span>
            <p class="text-slate-300 leading-normal font-medium text-justify">${foundOrder.remarks || 'Queued securely.'}</p>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Order track search failed:", err?.message || err?.toString());
  }
}

// -------------------------------------------------------------
// Accordions & Guide Pages
// -------------------------------------------------------------
function renderFAQPage() {
  const container = document.getElementById('faq-container');
  if (container) {
    container.innerHTML = DEFAULT_FAQS.map((faq, idx) => `
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-all duration-200">
        <button class="w-full text-left px-4 py-3 flex justify-between items-center text-white hover:text-indigo-400 font-bold text-xs uppercase" onclick="document.getElementById('faq-ans-${idx}').classList.toggle('hidden');">
          <span>${faq.q}</span>
          <span>👇</span>
        </button>
        <div id="faq-ans-${idx}" class="hidden px-4 pb-4 text-xs text-slate-300 leading-normal border-t border-slate-800 pt-2 text-justify">
          ${faq.a}
        </div>
      </div>
    `).join('');
  }

  renderReviewsList();
}

function getReviews() {
  const defaultReviews = [
    { id: 'rev-1', name: 'Rajesh Lodhi', rating: 5, comment: 'Best SMM panel ever! Followers non-drop hain aur 2 min me start ho gye. Service aur fast response support ne dil jeet liya. Thank you Shubh SMM! 🔥', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), ip: '103.88.22.14' },
    { id: 'rev-2', name: 'Karan_Yadav', rating: 5, comment: 'Bhai ekdam real panel hai! Pehle me darta tha but ₹30 add karke test kiya, views instant aa gye. Phir bada order lagaya, perfectly complete hua. ⭐⭐⭐⭐⭐', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), ip: '2409:4063:2d9d:9e9a::1' },
    { id: 'rev-3', name: 'Priya Sharma', rating: 5, comment: 'I bought Reels likes and YouTube views. Speed is extremely fast! Very clean interface and easy payment process.', timestamp: new Date(Date.now() - 3600000 * 12).toISOString(), ip: '157.34.12.90' },
    { id: 'rev-4', name: 'Sandeep Saini', rating: 4, comment: 'YouTube Subscribers build hone me thoda 10 min laga, par full refill guarantee ke sath high-quality real profiles mili hain. Support team is very helpful.', timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), ip: '45.112.115.8' },
    { id: 'rev-5', name: 'Technical_Ankit', rating: 5, comment: 'Best service for resellers! Prices are super cheap and APIs are ultra-fast. UPI auto add balance option is very smooth.', timestamp: new Date(Date.now() - 3600000 * 48).toISOString(), ip: '103.44.52.201' }
  ];

  let localReviews = [];
  try {
    localReviews = JSON.parse(localStorage.getItem('smm_local_reviews') || '[]');
  } catch (e) {
    localReviews = [];
  }

  const customReviews = state.db ? state.reviews : localReviews;
  return [...customReviews, ...defaultReviews];
}

function renderReviewsList() {
  const container = document.getElementById('reviews-section');
  if (!container) return;

  const reviews = getReviews();
  
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = reviews.length > 0 ? (totalRating / reviews.length).toFixed(1) : '5.0';

  const submitRating = state.submitReviewRating || 5;

  container.innerHTML = `
    <!-- Review Summary Banner -->
    <div class="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div class="space-y-1">
        <h3 class="text-xs font-black uppercase text-slate-200 tracking-wider">Customer Experience & Reviews</h3>
        <p class="text-[9px] text-slate-400 font-bold uppercase">Real-time feedback from our automated growth network</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-2xl font-black text-indigo-400 font-mono leading-none">${avgRating}</span>
          <div class="flex text-amber-400 text-sm leading-none">
            ${'★'.repeat(Math.round(parseFloat(avgRating)))}${'☆'.repeat(5 - Math.round(parseFloat(avgRating)))}
          </div>
          <span class="text-[8px] text-slate-500 font-mono">(${reviews.length} total verified logs)</span>
        </div>
      </div>
      <button onclick="window.toggleReviewForm()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition shadow-md active:scale-95 shrink-0">
        ✍️ Write a Review / Comment
      </button>
    </div>

    <!-- Review Form (Collapsible) -->
    <div id="review-write-form-container" class="hidden bg-slate-900/50 border border-slate-850 rounded-2xl p-5 space-y-4 fade-in">
      <h4 class="text-[10px] font-black text-indigo-400 uppercase tracking-widest border-b border-slate-850 pb-2">Share Your Honest Experience</h4>
      
      <div class="space-y-3 text-xs">
        <!-- Star Selection -->
        <div class="space-y-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Your Rating</label>
          <div class="flex gap-1.5 text-xl">
            ${[1, 2, 3, 4, 5].map(starNum => `
              <button onclick="window.setReviewSubmitRating(${starNum})" class="focus:outline-none transition-transform hover:scale-125 ${starNum <= submitRating ? 'text-amber-400' : 'text-slate-600'}">
                ★
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Name Input -->
        <div class="space-y-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Your Display Name</label>
          <input type="text" id="review-input-name" placeholder="Enter your name or handle (e.g., Mohit_SMM)" class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-850 text-white text-xs rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition font-semibold">
        </div>

        <!-- Comment Textarea -->
        <div class="space-y-1">
          <label class="block text-[9px] font-bold text-slate-500 uppercase tracking-widest">Your Comment / Feedback</label>
          <textarea id="review-input-comment" rows="3" placeholder="Tell other users how quickly your service got delivered..." class="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-850 text-white text-xs rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition resize-none"></textarea>
        </div>

        <!-- Submit Button -->
        <button onclick="window.submitUserReview()" id="review-submit-btn" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 active:scale-95 shadow-md">
          🚀 Post Live Feedback
        </button>
      </div>
    </div>

    <!-- Feedbacks List -->
    <div class="space-y-3.5 pt-2">
      ${reviews.map(r => {
        const dateStr = new Date(r.timestamp).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const starsText = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        
        return `
          <div class="p-4 bg-slate-900 border border-slate-850 rounded-2xl space-y-2 relative overflow-hidden transition-all hover:border-slate-800">
            <!-- Left border accent for high-rating reviews -->
            ${r.rating >= 4 ? `<div class="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>` : `<div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>`}
            
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full ${r.rating >= 4 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400 animate-pulse'}"></span>
                <span class="font-extrabold text-[11px] text-slate-200">${r.name}</span>
                <span class="px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/30 text-[7px] text-emerald-400 rounded-md font-bold uppercase tracking-widest">✓ Verified Client</span>
              </div>
              <span class="text-[8px] text-slate-500 font-mono">${dateStr}</span>
            </div>

            <!-- Rating Stars -->
            <div class="text-[10px] text-amber-400 leading-none">${starsText}</div>

            <!-- Comment Body -->
            <p class="text-xs text-slate-300 leading-relaxed text-justify break-words">${r.comment}</p>

            <!-- Visitor metadata details for ultra-realism -->
            ${r.ip ? `
              <div class="flex items-center gap-2 text-[8px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-850/40">
                <span>UTR/Node: Verified Auto-Gate</span>
                <span>•</span>
                <span>IP: <span class="text-slate-400 select-all">${r.ip}</span></span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.toggleReviewForm = function() {
  const el = document.getElementById('review-write-form-container');
  if (el) el.classList.toggle('hidden');
};

window.setReviewSubmitRating = function(rating) {
  state.submitReviewRating = rating;
  renderReviewsList();
};

window.submitUserReview = async function() {
  const nameInput = document.getElementById('review-input-name');
  const commentInput = document.getElementById('review-input-comment');
  if (!nameInput || !commentInput) return;

  const name = nameInput.value.trim() || 'Anonymous_Buyer';
  const comment = commentInput.value.trim();
  const rating = state.submitReviewRating || 5;

  if (!comment) {
    alert("Please enter your comment!");
    return;
  }

  const submitBtn = document.getElementById('review-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block mr-1"></span> Posting...`;
  }

  const reviewId = 'rev-' + Date.now();
  const newReview = {
    id: reviewId,
    name: name,
    rating: rating,
    comment: comment,
    timestamp: new Date().toISOString(),
    ip: state.userIp || 'Unknown'
  };

  if (state.db) {
    try {
      await setDoc(doc(state.db, 'reviews', reviewId), newReview);
    } catch (err) {
      console.error("Failed to save review in database:", err?.message || err?.toString());
      alert("Database error. Review posted locally!");
    }
  } else {
    let localReviews = [];
    try {
      localReviews = JSON.parse(localStorage.getItem('smm_local_reviews') || '[]');
    } catch (e) {
      localReviews = [];
    }
    localReviews.unshift(newReview);
    localStorage.setItem('smm_local_reviews', JSON.stringify(localReviews));
  }

  state.submitReviewRating = 5;
  nameInput.value = '';
  commentInput.value = '';

  logUserAction(`Posted ${rating}-Star Review`);
  renderReviewsList();
  alert("Review posted successfully! Your live feedback is now visible to all SMM clients. ❤️");
};

let currentReviewIdx = 0;
let reviewRotationInterval = null;

function renderHomeReviewsSlider() {
  const container = document.getElementById('home-reviews-slider');
  const dotsContainer = document.getElementById('home-reviews-dots');
  if (!container) return;

  const reviews = getReviews().filter(r => r.rating >= 4); // Show high-rating reviews on home page
  if (reviews.length === 0) {
    container.innerHTML = `
      <p class="text-center text-slate-400 text-[10px] uppercase font-bold py-4">No reviews yet</p>
    `;
    if (dotsContainer) dotsContainer.innerHTML = '';
    return;
  }

  // Handle index boundaries if elements deleted
  if (currentReviewIdx >= reviews.length) {
    currentReviewIdx = 0;
  }

  // Render slides
  container.innerHTML = reviews.map((r, idx) => {
    const starsText = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const dateStr = new Date(r.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
    return `
      <div class="home-review-slide w-full transition-all duration-300 flex-col justify-between h-full ${idx === currentReviewIdx ? 'flex fade-in' : 'hidden'}" data-slide-idx="${idx}">
        <div class="space-y-1.5">
          <!-- Header (Rating stars & Verified Label) -->
          <div class="flex items-center justify-between">
            <div class="text-[10px] text-amber-400 leading-none">${starsText}</div>
            <span class="px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/30 text-[7px] text-emerald-400 rounded-md font-bold uppercase tracking-widest leading-none">✓ Verified Client</span>
          </div>
          <!-- Comment text -->
          <p class="text-[11px] text-slate-100 font-medium leading-relaxed italic text-justify line-clamp-3">
            "${r.comment}"
          </p>
        </div>
        <!-- Footer / Meta -->
        <div class="flex items-center justify-between mt-3 text-[9px] text-slate-400 font-bold border-t border-slate-800/20 pt-2">
          <div class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-slate-200">${r.name}</span>
          </div>
          <span class="text-slate-500 font-mono text-[8px]">${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');

  // Render dots
  if (dotsContainer) {
    dotsContainer.innerHTML = reviews.map((_, idx) => `
      <button onclick="window.changeReviewSlide(${idx})" class="home-review-dot w-2 h-2 rounded-full transition-all duration-300 ${idx === currentReviewIdx ? 'bg-indigo-500 w-4' : 'bg-slate-600'}" data-dot-idx="${idx}"></button>
    `).join('');
  }

  // Set up auto rotation if not already active
  if (!reviewRotationInterval) {
    reviewRotationInterval = setInterval(() => {
      window.nextReviewSlide();
    }, 5000);
  }
}
window.renderHomeReviewsSlider = renderHomeReviewsSlider;

window.changeReviewSlide = function(idx) {
  const slides = document.querySelectorAll('.home-review-slide');
  const dots = document.querySelectorAll('.home-review-dot');
  if (!slides.length) return;

  // Wrap around index
  const numSlides = slides.length;
  currentReviewIdx = (idx + numSlides) % numSlides;

  slides.forEach((slide, i) => {
    if (i === currentReviewIdx) {
      slide.classList.remove('hidden');
      slide.classList.add('flex', 'fade-in');
    } else {
      slide.classList.remove('flex', 'fade-in');
      slide.classList.add('hidden');
    }
  });

  dots.forEach((dot, i) => {
    if (i === currentReviewIdx) {
      dot.classList.remove('bg-slate-600', 'w-2');
      dot.classList.add('bg-indigo-500', 'w-4');
    } else {
      dot.classList.remove('bg-indigo-500', 'w-4');
      dot.classList.add('bg-slate-600', 'w-2');
    }
  });
};

window.nextReviewSlide = function() {
  const slides = document.querySelectorAll('.home-review-slide');
  if (!slides.length) return;
  window.changeReviewSlide(currentReviewIdx + 1);
};

window.prevReviewSlide = function() {
  const slides = document.querySelectorAll('.home-review-slide');
  if (!slides.length) return;
  window.changeReviewSlide(currentReviewIdx - 1);
};

function renderContactPage() {
  const upiIdSpan = document.getElementById('contact-upi');
  if (upiIdSpan) upiIdSpan.textContent = state.settings.upiId || DEFAULT_SETTINGS.upiId;
}

function renderTrackPage() {
  const trackResults = document.getElementById('track-results');
  if (trackResults) trackResults.innerHTML = '';
  const trackInput = document.getElementById('track-search-input');
  if (trackInput) trackInput.value = '';
}

// -------------------------------------------------------------
// Admin Controls (Admin login, admin dashboard tabs, order modifier, category editor, service editor, settings modifier)
// -------------------------------------------------------------
function renderAdminLoginPage() {
  if (state.currentUser) navigateTo('admin');
}

window.toggleAdminAuthMode = function() {
  const modeInput = document.getElementById('admin-auth-mode');
  const toggleBtn = document.getElementById('toggle-auth-mode-btn');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!modeInput || !toggleBtn || !submitBtn) return;

  if (modeInput.value === 'login') {
    modeInput.value = 'register';
    toggleBtn.textContent = 'Already have an account? Log In';
    submitBtn.textContent = 'Register Admin Account';
  } else {
    modeInput.value = 'login';
    toggleBtn.textContent = 'First time? Register new administrator account';
    submitBtn.textContent = 'Decrypt Control Panel';
  }
};

function disconnectFirebase() {
  if (unsubscribeSettings) { unsubscribeSettings(); unsubscribeSettings = null; }
  if (unsubscribeCategories) { unsubscribeCategories(); unsubscribeCategories = null; }
  if (unsubscribeServices) { unsubscribeServices(); unsubscribeServices = null; }
  if (unsubscribeOrders) { unsubscribeOrders(); unsubscribeOrders = null; }
  if (unsubscribeWallet) { unsubscribeWallet(); unsubscribeWallet = null; }
  if (unsubscribePayments) { unsubscribePayments(); unsubscribePayments = null; }
  state.auth = null;
  state.db = null;
  auth = null;
  db = null;
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const email = document.getElementById('admin-email')?.value.trim();
  const password = document.getElementById('admin-password')?.value;
  const mode = document.getElementById('admin-auth-mode')?.value || 'login';

  if (!email || !password) return;
  if (!state.auth) {
    alert("Firebase Auth offline. Bypass active for testing.");
    state.currentUser = { email };
    navigateTo('admin');
    return;
  }

  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Decrypting...';

  try {
    if (mode === 'login') {
      await signInWithEmailAndPassword(state.auth, email, password);
      navigateTo('admin');
    } else {
      await createUserWithEmailAndPassword(state.auth, email, password);
      alert("Admin registered! Logged in successfully.");
      navigateTo('admin');
    }
  } catch (err) {
    console.error("Auth action failed:", err?.message || err?.toString());
    
    if (err.code === 'auth/operation-not-allowed') {
      const wantBypass = confirm(
        "⚠️ FIREBASE AUTH ERROR:\n" +
        "Email/Password authentication provider is not enabled in your Firebase Console.\n\n" +
        "HOW TO ENABLE (Mobile/Desktop):\n" +
        "1. Open your Firebase Console (firebase.google.com)\n" +
        "2. Go to 'Build' -> 'Authentication' -> 'Sign-in method'\n" +
        "3. Select 'Email/Password' and enable it, then click Save.\n\n" +
        "Would you like to temporarily bypass Firebase and log in using Local Sandbox Mode (stored in LocalStorage on this device)?"
      );
      if (wantBypass) {
        disconnectFirebase();
        state.currentUser = { email };
        updateAdminUI();
        syncWallet();
        alert("Switched to Local Sandbox Mode. Panel database operations (Categories, Services, Orders) will now run offline in localStorage.");
        navigateTo('admin');
        return;
      }
    } else {
      alert(err.message || "Invalid Security passcode.");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'login' ? 'Decrypt Control Panel' : 'Register Admin Account';
  }
}

async function handleAdminLogout() {
  if (state.auth) {
    await signOut(state.auth);
  } else {
    state.currentUser = null;
  }
  navigateTo('home');
}

function updateAdminUI() {
  const loginNavs = document.querySelectorAll('.nav-admin-login');
  const dashNavs = document.querySelectorAll('.nav-admin-dashboard');

  if (state.currentUser) {
    loginNavs.forEach(el => el.classList.add('hidden'));
    dashNavs.forEach(el => el.classList.remove('hidden'));
  } else {
    loginNavs.forEach(el => el.classList.remove('hidden'));
    dashNavs.forEach(el => el.classList.add('hidden'));
  }
}

let activeAdminTab = 'admin-analytics'; 

function renderAdminDashboard() {
  const container = document.getElementById('admin-dashboard-container');
  if (!container) return;

  container.innerHTML = `
    <!-- Inner navigation tabs -->
    <div class="flex border-b border-slate-800 mb-4 overflow-x-auto gap-1 text-[10px] font-black uppercase scrollbar-none">
      <button onclick="window.switchAdminTab('admin-analytics')" class="px-4 py-2.5 border-b-2 transition shrink-0 ${activeAdminTab === 'admin-analytics' ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-200'}">
        📈 Live Visits & Analytics
      </button>
      <button onclick="window.switchAdminTab('admin-settings')" class="px-4 py-2.5 border-b-2 transition shrink-0 ${activeAdminTab === 'admin-settings' ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20 font-extrabold' : 'border-transparent text-slate-400 hover:text-slate-200'}">
        ⚙️ Settings
      </button>
    </div>

    <div id="admin-tab-content" class="space-y-4">
      <!-- Loaded dynamically -->
    </div>
  `;

  renderAdminTabContent();
}
window.switchAdminTab = function(tabName) {
  activeAdminTab = tabName;
  renderAdminDashboard();
};

function renderAdminTabContent() {
  const tabContent = document.getElementById('admin-tab-content');
  if (!tabContent) return;

  if (activeAdminTab === 'admin-services') {
    renderAdminServices(tabContent);
  } else if (activeAdminTab === 'admin-orders') {
    renderAdminOrders(tabContent);
  } else if (activeAdminTab === 'admin-payments') {
    renderAdminPayments(tabContent);
  } else if (activeAdminTab === 'admin-analytics') {
    renderAdminAnalytics(tabContent);
  } else if (activeAdminTab === 'admin-reviews') {
    renderAdminReviews(tabContent);
  } else if (activeAdminTab === 'admin-settings') {
    renderAdminSettings(tabContent);
  }
}

function renderAdminOrders(target) {
  target.innerHTML = `
    <div class="flex gap-2 text-xs">
      <input type="text" id="admin-orders-search" placeholder="Search orders..." class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 text-white rounded-lg focus:border-indigo-500 outline-none text-[11px]" oninput="window.filterAdminOrders()">
      <select id="admin-orders-filter" class="bg-slate-900 border border-slate-800 text-white px-2 py-1.5 rounded-lg text-[11px]" onchange="window.filterAdminOrders()">
        <option value="All">All</option>
        <option value="Pending">Pending</option>
        <option value="Processing">Processing</option>
        <option value="Completed">Completed</option>
        <option value="Cancelled">Cancelled</option>
      </select>
    </div>
    
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden text-[11px]">
      <div id="admin-orders-list-box" class="divide-y divide-slate-800 max-h-96 overflow-y-auto p-1 space-y-1">
        <!-- Renders list of orders -->
      </div>
    </div>
  `;

  window.filterAdminOrders();
}

window.filterAdminOrders = function() {
  const searchQuery = (document.getElementById('admin-orders-search')?.value || '').toLowerCase();
  const filterVal = document.getElementById('admin-orders-filter')?.value || 'All';
  const container = document.getElementById('admin-orders-list-box');
  if (!container) return;

  const filtered = state.orders.filter(ord => {
    const matchSearch = ord.id.toLowerCase().includes(searchQuery) || 
                        ord.clientName.toLowerCase().includes(searchQuery) || 
                        ord.paymentReference.toLowerCase().includes(searchQuery) ||
                        ord.serviceName.toLowerCase().includes(searchQuery);
    
    const matchFilter = filterVal === 'All' || ord.status === filterVal;
    return matchSearch && matchFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="p-4 text-center text-slate-400 text-[10px] font-black uppercase">No matching orders</p>`;
    return;
  }

  container.innerHTML = filtered.map(ord => {
    let stClass = 'text-slate-400 bg-slate-950 border-slate-850';
    if (ord.status === 'Pending') stClass = 'text-amber-400 bg-amber-950/40 border-amber-900/40';
    else if (ord.status === 'Processing') stClass = 'text-blue-400 bg-blue-950/40 border-blue-900/40';
    else if (ord.status === 'Completed') stClass = 'text-emerald-400 bg-emerald-950/40 border-emerald-900/40';
    else if (ord.status === 'Cancelled') stClass = 'text-rose-400 bg-rose-950/40 border-rose-900/40';

    return `
      <div class="p-2.5 bg-slate-900/40 border border-slate-850 rounded-lg flex items-center justify-between gap-3">
        <div class="space-y-1 max-w-[70%]">
          <div class="font-extrabold text-white flex items-center gap-1.5">
            <span>${ord.id}</span>
            <span class="text-[9px] text-slate-500 font-mono">${ord.clientName}</span>
          </div>
          <p class="text-slate-400 text-[9px] leading-tight font-medium uppercase truncate">${ord.serviceName}</p>
          <div class="text-slate-400 text-[9px] leading-tight font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Link: <a href="${ord.link}" target="_blank" class="text-indigo-400 hover:underline font-bold">VISIT</a></span>
            <span class="text-slate-500">| UTR: ${ord.paymentReference}</span>
            ${ord.userIp ? `<span class="text-slate-500">| IP: <span class="text-amber-400 select-all font-mono font-bold">${ord.userIp}</span></span>` : ''}
          </div>
        </div>
        <div class="text-right flex flex-col items-end gap-1.5 shrink-0">
          <span class="text-emerald-500 font-black">₹${ord.charge}</span>
          <div class="flex gap-1">
            <span class="px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${stClass}">${ord.status}</span>
            <button onclick="window.openOrderEditor('${ord.id}')" class="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[9px] font-black uppercase">
              Edit
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

window.openOrderEditor = function(orderId) {
  const ord = state.orders.find(o => o.id === orderId);
  if (!ord) return;

  const modal = document.getElementById('admin-order-modal');
  if (!modal) return;

  document.getElementById('edit-ord-id').textContent = ord.id;
  document.getElementById('edit-ord-client').textContent = ord.clientName;
  document.getElementById('edit-ord-service').textContent = ord.serviceName;
  document.getElementById('edit-ord-charge').textContent = `₹${ord.charge}`;
  document.getElementById('edit-ord-utr').textContent = ord.paymentReference;
  document.getElementById('edit-ord-status').value = ord.status;
  document.getElementById('edit-ord-remarks').value = ord.remarks || '';

  modal.classList.remove('hidden');
};

window.saveOrderChanges = async function() {
  const orderId = document.getElementById('edit-ord-id').textContent;
  const status = document.getElementById('edit-ord-status').value;
  const remarks = document.getElementById('edit-ord-remarks').value.trim();

  try {
    if (state.db) {
      await updateDoc(doc(state.db, 'orders', orderId), { status, remarks });
    } else {
      const saved = JSON.parse(localStorage.getItem('local_orders') || '[]');
      const idx = saved.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        saved[idx].status = status;
        saved[idx].remarks = remarks;
        localStorage.setItem('local_orders', JSON.stringify(saved));
      }
    }
    document.getElementById('admin-order-modal').classList.add('hidden');
    alert("SMM order indexes saved successfully.");
    renderAdminDashboard();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error saving.");
  }
};

function renderAdminCategories(target) {
  target.innerHTML = `
    <div class="flex items-center justify-between text-xs mb-2">
      <span class="font-bold text-slate-400">Categories</span>
      <button onclick="window.openCategoryEditor('')" class="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black uppercase">+ New Cat</button>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-1 space-y-1 max-h-96 overflow-y-auto">
      ${state.categories.map(cat => `
        <div class="p-2 bg-slate-900/60 border border-slate-850 rounded-lg flex items-center justify-between text-[11px]">
          <div>
            <span class="font-extrabold text-white uppercase">${cat.name}</span>
            <span class="block text-[9px] text-slate-500 font-mono">Icon: ${cat.icon} | Sort: ${cat.sortOrder}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${cat.active ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}">${cat.active ? 'Active' : 'Disabled'}</span>
            <button onclick="window.openCategoryEditor('${cat.id}')" class="text-indigo-400 hover:text-indigo-300 font-black uppercase text-[10px]">Edit</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.openCategoryEditor = function(catId) {
  const cat = state.categories.find(c => c.id === catId);
  const modal = document.getElementById('admin-cat-modal');
  if (!modal) return;

  if (cat) {
    document.getElementById('edit-cat-mode').textContent = 'Modify Category';
    document.getElementById('edit-cat-id').value = cat.id;
    document.getElementById('edit-cat-name').value = cat.name;
    document.getElementById('edit-cat-icon').value = cat.icon;
    document.getElementById('edit-cat-sort').value = cat.sortOrder;
    document.getElementById('edit-cat-active').value = cat.active ? 'true' : 'false';
  } else {
    document.getElementById('edit-cat-mode').textContent = 'Create New Category';
    document.getElementById('edit-cat-id').value = '';
    document.getElementById('edit-cat-name').value = '';
    document.getElementById('edit-cat-icon').value = 'instagram';
    document.getElementById('edit-cat-sort').value = state.categories.length + 1;
    document.getElementById('edit-cat-active').value = 'true';
  }

  modal.classList.remove('hidden');
};

window.saveCategoryChanges = async function() {
  const id = document.getElementById('edit-cat-id').value;
  const name = document.getElementById('edit-cat-name').value.trim();
  const icon = document.getElementById('edit-cat-icon').value.trim();
  const sortOrder = parseInt(document.getElementById('edit-cat-sort').value) || 1;
  const active = document.getElementById('edit-cat-active').value === 'true';

  if (!name) {
    alert("Category name required");
    return;
  }

  const catId = id || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const catData = { id: catId, name, icon, sortOrder, active };

  try {
    if (state.db) {
      await setDoc(doc(state.db, 'categories', catId), catData);
    } else {
      const idx = state.categories.findIndex(c => c.id === catId);
      if (idx !== -1) state.categories[idx] = catData;
      else state.categories.push(catData);
    }
    document.getElementById('admin-cat-modal').classList.add('hidden');
    alert("Category data updated.");
    renderAdminDashboard();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error updating.");
  }
};

function renderAdminServices(target) {
  target.innerHTML = `
    <div class="flex gap-2 text-xs">
      <input type="text" id="admin-srv-search" placeholder="Search services..." class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 text-white rounded-lg focus:border-indigo-500 outline-none text-[11px]" oninput="window.filterAdminServices()">
      <button onclick="window.openServiceEditor('')" class="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black uppercase shrink-0">+ New SMM Service</button>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto p-1 space-y-1 text-[11px]" id="admin-services-table">
      <!-- Dyn list of services -->
    </div>
  `;

  window.filterAdminServices();
}

window.filterAdminServices = function() {
  const searchQuery = (document.getElementById('admin-srv-search')?.value || '').toLowerCase();
  const container = document.getElementById('admin-services-table');
  if (!container) return;

  const filtered = state.services.filter(s => s.name.toLowerCase().includes(searchQuery));

  if (filtered.length === 0) {
    container.innerHTML = `<p class="p-4 text-center text-slate-400 text-[10px] font-black uppercase">No active SMM services found</p>`;
    return;
  }

  container.innerHTML = filtered.map(srv => {
    // service custom image logo
    let serviceLogoHtml = '';
    if (srv.logoUrl && srv.logoUrl.trim() !== '') {
      serviceLogoHtml = `<img src="${srv.logoUrl}" alt="${srv.name}" class="w-6 h-7 rounded object-cover border border-slate-700">`;
    } else {
      const cat = state.categories.find(c => c.id === srv.categoryId);
      serviceLogoHtml = `
        <div class="w-6 h-7 rounded bg-slate-850 flex items-center justify-center text-indigo-400 text-xs">
          ${getCategoryIconSVG(cat ? cat.icon : 'globe')}
        </div>
      `;
    }

    return `
      <div class="p-2.5 bg-slate-900/60 border border-slate-850 rounded-lg flex items-center justify-between gap-3 text-[11px]">
        <div class="flex items-center gap-2.5 max-w-[70%]">
          ${serviceLogoHtml}
          <div>
            <div class="font-extrabold text-white uppercase leading-tight">${srv.name}</div>
            <div class="text-[9px] text-slate-500 font-mono mt-0.5">${srv.id} | Cat: ${srv.categoryId}</div>
          </div>
        </div>
        <div class="text-right flex flex-col items-end gap-1 shrink-0 font-bold">
          <span class="text-emerald-400">₹${Math.round((srv.minQuantity * srv.pricePer1000) / 1000)} (Pkg)</span>
          <div class="flex gap-1.5">
            <span class="px-1 py-0.5 rounded text-[8px] font-black uppercase ${srv.active ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}">${srv.active ? 'Active' : 'Disabled'}</span>
            <button onclick="window.openServiceEditor('${srv.id}')" class="text-indigo-400 hover:text-indigo-300 font-black uppercase text-[10px]">Edit</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

window.openServiceEditor = function(srvId) {
  const srv = state.services.find(s => s.id === srvId);
  const modal = document.getElementById('admin-srv-modal');
  if (!modal) return;

  const catDrop = document.getElementById('edit-srv-cat');
  catDrop.innerHTML = state.categories.map(c => `
    <option value="${c.id}">${c.name.toUpperCase()}</option>
  `).join('');

  if (srv) {
    document.getElementById('edit-srv-mode').textContent = 'Modify SMM Service';
    document.getElementById('edit-srv-id').value = srv.id;
    document.getElementById('edit-srv-cat').value = srv.categoryId;
    document.getElementById('edit-srv-name').value = srv.name;
    document.getElementById('edit-srv-logo').value = srv.logoUrl || ''; // Load service logo!
    document.getElementById('edit-srv-price').value = (srv.pricePer1000 * 10).toFixed(2);
    document.getElementById('edit-srv-min').value = srv.minQuantity;
    document.getElementById('edit-srv-max').value = srv.maxQuantity;
    document.getElementById('edit-srv-desc').value = srv.description;
    document.getElementById('edit-srv-active').value = srv.active ? 'true' : 'false';
  } else {
    document.getElementById('edit-srv-mode').textContent = 'Create SMM Service';
    document.getElementById('edit-srv-id').value = '';
    document.getElementById('edit-srv-name').value = '';
    document.getElementById('edit-srv-logo').value = ''; // Custom Logo empty by default
    document.getElementById('edit-srv-price').value = '100';
    document.getElementById('edit-srv-min').value = '100';
    document.getElementById('edit-srv-max').value = '10000';
    document.getElementById('edit-srv-desc').value = '';
    document.getElementById('edit-srv-active').value = 'true';
  }

  modal.classList.remove('hidden');
};

window.saveServiceChanges = async function() {
  const id = document.getElementById('edit-srv-id').value;
  const categoryId = document.getElementById('edit-srv-cat').value;
  const name = document.getElementById('edit-srv-name').value.trim();
  const logoUrl = document.getElementById('edit-srv-logo').value.trim(); // Get service custom logo!
  const pricePer10k = parseFloat(document.getElementById('edit-srv-price').value) || 0;
  const pricePer1000 = parseFloat((pricePer10k / 10).toFixed(6));
  const minQuantity = parseInt(document.getElementById('edit-srv-min').value) || 100;
  const maxQuantity = parseInt(document.getElementById('edit-srv-max').value) || 10000;
  const description = document.getElementById('edit-srv-desc').value.trim();
  const active = document.getElementById('edit-srv-active').value === 'true';

  if (!name) {
    alert("Service name required");
    return;
  }

  const srvId = id || 'srv-' + Math.floor(1000 + Math.random() * 9000);
  const srvData = { id: srvId, categoryId, name, logoUrl, pricePer1000, minQuantity, maxQuantity, description, active };

  try {
    if (state.db) {
      await setDoc(doc(state.db, 'services', srvId), srvData);
    } else {
      const idx = state.services.findIndex(s => s.id === srvId);
      if (idx !== -1) state.services[idx] = srvData;
      else state.services.push(srvData);
    }
    document.getElementById('admin-srv-modal').classList.add('hidden');
    alert("Service catalogs updated successfully!");
    renderAdminDashboard();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error updating SMM service.");
  }
};

function renderAdminSettings(target) {
  target.innerHTML = `
    <form id="admin-settings-form" class="space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs" onsubmit="window.saveGeneralSettings(event)">
      <h3 class="text-xs font-black uppercase text-indigo-400 border-b border-slate-800 pb-2">Global Settings Configurations</h3>
      
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Site Title</label>
          <input type="text" id="set-site-title" value="${state.settings.title || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Brand Banner Overlay Text</label>
          <input type="text" id="set-site-banner" value="${state.settings.homepageBanner || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
        </div>
      </div>

      <!-- WEBSITE LOGO URL (admin logo bhi change kar sake) -->
      <div>
        <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Brand Logo Image URL</label>
        <input type="text" id="set-site-logo" value="${state.settings.logoUrl || ''}" placeholder="https://image-link.png" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-indigo-400 rounded-lg outline-none font-mono">
        <span class="text-[8px] text-slate-500 block mt-0.5">Supports online JPG, PNG, and SVG links. SMM Panel header automatically updates with this.</span>
      </div>

      <div>
        <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Panel Corporate Description</label>
        <textarea id="set-site-desc" rows="2" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">${state.settings.description || ''}</textarea>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Minimum Deposit (₹)</label>
          <input type="number" id="set-min-deposit" value="${state.settings.minDeposit || 30}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-emerald-400 font-extrabold rounded-lg outline-none">
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Users</label>
          <input type="text" id="set-stat-users" value="${state.settings.activeUsersCount || '245,000+'}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-bold">
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Orders</label>
          <input type="text" id="set-stat-orders" value="${state.settings.totalOrdersCount || '220,500+'}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-bold">
        </div>
      </div>

      <div>
        <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Latest Platform News & Updates</label>
        <textarea id="set-platform-news" rows="2" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">${state.settings.platformNews || 'No updates.'}</textarea>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Support WhatsApp (with country code)</label>
          <input type="text" id="set-support-wa" value="${state.settings.whatsappNumber || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-mono">
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Support Telegram Link</label>
          <input type="text" id="set-support-tg" value="${state.settings.telegramLink || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-mono">
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Corporate UPI Recipient ID</label>
          <input type="text" id="set-pay-upi" value="${state.settings.upiId || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-mono" placeholder="smmgrowth@paytm">
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">UPI QR Code Mode</label>
          <select id="set-pay-qr-type" class="w-full px-1.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-bold">
            <option value="dynamic" ${ (state.settings.qrCodeType || 'dynamic') === 'dynamic' ? 'selected' : '' }>Dynamic (Automated)</option>
            <option value="static" ${ (state.settings.qrCodeType || 'dynamic') === 'static' ? 'selected' : '' }>Static QR (Custom)</option>
          </select>
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Static QR URL (Optional)</label>
          <input type="text" id="set-pay-qr" value="${state.settings.qrCodeUrl || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none font-mono">
        </div>
      </div>

      <div>
        <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Detailed Payment Instructions</label>
        <textarea id="set-pay-instr" rows="3" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none leading-relaxed">${state.settings.paymentInstructions || ''}</textarea>
      </div>

      <!-- FLASH SALE CONTROLS -->
      <div class="border-t border-slate-800 pt-3 space-y-3">
        <span class="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">⚡ Flash Sale Controls</span>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Flash Sale Duration (Min)</label>
            <input type="number" id="set-flash-duration" value="${state.settings.flashSaleDuration || 30}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
          </div>
          <div>
            <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Header Title</label>
            <input type="text" id="set-flash-title" value="${state.settings.flashSaleTitle || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
            <input type="text" id="set-flash-desc" value="${state.settings.flashSaleDesc || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
          </div>
          <div>
            <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Subtitle (Hindi Alert)</label>
            <input type="text" id="set-flash-hindi" value="${state.settings.flashSaleHindi || ''}" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-850 text-white rounded-lg outline-none">
          </div>
        </div>
      </div>

      <!-- BONUS OFFERS -->
      <div class="border-t border-slate-800 pt-3 space-y-2">
        <span class="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">🎁 Deposit Bonus Offers</span>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg space-y-1">
            <span class="block text-[8px] font-black text-slate-400">Offer 1 (Deposit / Extra)</span>
            <input type="number" id="set-bonus-1-amt" value="${state.settings.bonusOffer1Amt || 100}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-white">
            <input type="number" id="set-bonus-1-extra" value="${state.settings.bonusOffer1Extra || 30}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-emerald-400 font-bold">
          </div>
          <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg space-y-1">
            <span class="block text-[8px] font-black text-slate-400">Offer 2 (Deposit / Extra)</span>
            <input type="number" id="set-bonus-2-amt" value="${state.settings.bonusOffer2Amt || 30}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-white">
            <input type="number" id="set-bonus-2-extra" value="${state.settings.bonusOffer2Extra || 5}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-emerald-400 font-bold">
          </div>
          <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg space-y-1">
            <span class="block text-[8px] font-black text-slate-400">Offer 3 (Deposit / Extra)</span>
            <input type="number" id="set-bonus-3-amt" value="${state.settings.bonusOffer3Amt || 70}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-white">
            <input type="number" id="set-bonus-3-extra" value="${state.settings.bonusOffer3Extra || 20}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-emerald-400 font-bold">
          </div>
          <div class="bg-slate-950 border border-slate-850 p-2 rounded-lg space-y-1">
            <span class="block text-[8px] font-black text-slate-400">Offer 4 (Deposit / Extra)</span>
            <input type="number" id="set-bonus-4-amt" value="${state.settings.bonusOffer4Amt || 50}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-white">
            <input type="number" id="set-bonus-4-extra" value="${state.settings.bonusOffer4Extra || 10}" class="w-full px-1.5 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] text-emerald-400 font-bold">
          </div>
        </div>
      </div>

      <!-- SCRATCH REWARDS -->
      <div class="border-t border-slate-800 pt-3 space-y-2">
        <span class="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">⭐ Scratch Cards Winning Rewards</span>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-[8px] font-bold text-slate-500 mb-0.5">Card 1 Reward</label><input type="text" id="set-scratch-1" value="${state.settings.scratchCard1Win || ''}" class="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs"></div>
          <div><label class="block text-[8px] font-bold text-slate-500 mb-0.5">Card 2 Reward</label><input type="text" id="set-scratch-2" value="${state.settings.scratchCard2Win || ''}" class="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs"></div>
          <div><label class="block text-[8px] font-bold text-slate-500 mb-0.5">Card 3 Reward</label><input type="text" id="set-scratch-3" value="${state.settings.scratchCard3Win || ''}" class="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs"></div>
          <div><label class="block text-[8px] font-bold text-slate-500 mb-0.5">Card 4 Reward</label><input type="text" id="set-scratch-4" value="${state.settings.scratchCard4Win || ''}" class="w-full px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs"></div>
        </div>
      </div>

      <div class="border-t border-slate-800 pt-3 flex gap-2">
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Show Promo Ticker</label>
          <select id="set-show-ann" class="px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs">
            <option value="true" ${state.settings.showAnnouncement ? 'selected' : ''}>Active</option>
            <option value="false" ${!state.settings.showAnnouncement ? 'selected' : ''}>Hidden</option>
          </select>
        </div>
        <div>
          <label class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Maintenance Mode</label>
          <select id="set-maintenance" class="px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs">
            <option value="false" ${!state.settings.isMaintenanceMode ? 'selected' : ''}>Offline Mode: OFF</option>
            <option value="true" ${state.settings.isMaintenanceMode ? 'selected' : ''}>Offline Mode: ON</option>
          </select>
        </div>
      </div>

      <div class="border-t border-slate-800 pt-3 flex items-center justify-between gap-4">
        <button type="button" onclick="window.triggerDbSeeding()" class="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-900/50 rounded-lg text-[10px] font-black uppercase tracking-wide">
          Seed Database Defaults
        </button>
        <button type="submit" id="save-settings-btn" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wide">
          Save Configuration Matrix
        </button>
      </div>
    </form>
  `;
}

window.saveGeneralSettings = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('save-settings-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const title = document.getElementById('set-site-title').value.trim();
  const homepageBanner = document.getElementById('set-site-banner').value.trim();
  const logoUrl = document.getElementById('set-site-logo').value.trim(); // Get customized logo URL!
  const description = document.getElementById('set-site-desc').value.trim();
  const whatsappNumber = document.getElementById('set-support-wa').value.trim();
  const telegramLink = document.getElementById('set-support-tg').value.trim();
  const upiId = document.getElementById('set-pay-upi').value.trim();
  const qrCodeType = document.getElementById('set-pay-qr-type')?.value || 'dynamic';
  const qrCodeUrl = document.getElementById('set-pay-qr').value.trim();
  const paymentInstructions = document.getElementById('set-pay-instr').value.trim();
  const announcement = document.getElementById('set-announcement')?.value?.trim() || state.settings.announcement;
  const showAnnouncement = document.getElementById('set-show-ann').value === 'true';
  const isMaintenanceMode = document.getElementById('set-maintenance').value === 'true';

  const minDeposit = parseFloat(document.getElementById('set-min-deposit').value) || 30; // Changed default minimum deposit to 30
  const activeUsersCount = document.getElementById('set-stat-users').value.trim();
  const totalOrdersCount = document.getElementById('set-stat-orders').value.trim();
  const platformNews = document.getElementById('set-platform-news').value.trim();
  
  const flashSaleDuration = parseInt(document.getElementById('set-flash-duration').value) || 30;
  const flashSaleTitle = document.getElementById('set-flash-title').value.trim();
  const flashSaleDesc = document.getElementById('set-flash-desc').value.trim();
  const flashSaleHindi = document.getElementById('set-flash-hindi').value.trim();

  const bonusOffer1Amt = parseFloat(document.getElementById('set-bonus-1-amt').value) || 100;
  const bonusOffer1Extra = parseFloat(document.getElementById('set-bonus-1-extra').value) || 30;
  const bonusOffer2Amt = parseFloat(document.getElementById('set-bonus-2-amt').value) || 30;
  const bonusOffer2Extra = parseFloat(document.getElementById('set-bonus-2-extra').value) || 5;
  const bonusOffer3Amt = parseFloat(document.getElementById('set-bonus-3-amt').value) || 70;
  const bonusOffer3Extra = parseFloat(document.getElementById('set-bonus-3-extra').value) || 20;
  const bonusOffer4Amt = parseFloat(document.getElementById('set-bonus-4-amt').value) || 50;
  const bonusOffer4Extra = parseFloat(document.getElementById('set-bonus-4-extra').value) || 10;

  const scratchCard1Win = document.getElementById('set-scratch-1').value.trim();
  const scratchCard2Win = document.getElementById('set-scratch-2').value.trim();
  const scratchCard3Win = document.getElementById('set-scratch-3').value.trim();
  const scratchCard4Win = document.getElementById('set-scratch-4').value.trim();

  const updated = {
    title, homepageBanner, logoUrl, description, whatsappNumber, telegramLink,
    upiId, qrCodeType, qrCodeUrl, paymentInstructions, announcement, showAnnouncement, isMaintenanceMode,
    minDeposit, activeUsersCount, totalOrdersCount, platformNews,
    flashSaleDuration, flashSaleTitle, flashSaleDesc, flashSaleHindi,
    bonusOffer1Amt, bonusOffer1Extra, bonusOffer2Amt, bonusOffer2Extra,
    bonusOffer3Amt, bonusOffer3Extra, bonusOffer4Amt, bonusOffer4Extra,
    scratchCard1Win, scratchCard2Win, scratchCard3Win, scratchCard4Win
  };

  try {
    if (state.db) {
      await setDoc(doc(state.db, 'settings', 'website'), updated);
    } else {
      state.settings = { ...state.settings, ...updated };
      renderAll();
    }
    alert("Website SMM configuration matrix saved securely!");
    renderAll();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error saving settings to cloud Firestore.");
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Configuration Matrix';
  }
};

window.triggerDbSeeding = async function() {
  if (confirm("Are you sure you want to seed default SMM Categories & Services to your Firestore database? This will overwrite or initialize the data.")) {
    try {
      const success = await seedDatabaseDefaults();
      if (success) {
        alert("Firestore cloud database successfully seeded with all premium defaults!");
      }
    } catch (err) {
      alert("Error seeding database: " + err.message);
    }
  }
};

// -------------------------------------------------------------
// SMM Wallet, Payment & Extra Rewards Handlers (Premium Automated Gateway)
// -------------------------------------------------------------
function renderWalletDisplays() {
  const valStr = `₹${state.walletBalance.toFixed(2)}`;
  const homeBal = document.getElementById('wallet-balance-display-home');
  const headerBal = document.getElementById('wallet-balance-display-header');
  if (homeBal) homeBal.textContent = valStr;
  if (headerBal) headerBal.textContent = valStr;
}
window.renderWalletDisplays = renderWalletDisplays;

function renderAddMoneyView() {
  const minVal = state.settings.minDeposit || 30; // Changed default minimum deposit to 30
  const minLabel = document.getElementById('min-deposit-label');
  if (minLabel) minLabel.textContent = `Min Deposit: ₹${minVal}`;
  
  const offer1Amt = state.settings.bonusOffer1Amt || 100;
  const offer1Extra = state.settings.bonusOffer1Extra || 30;
  const offer2Amt = state.settings.bonusOffer2Amt || 30;
  const offer2Extra = state.settings.bonusOffer2Extra || 5;
  const offer3Amt = state.settings.bonusOffer3Amt || 70;
  const offer3Extra = state.settings.bonusOffer3Extra || 20;
  const offer4Amt = state.settings.bonusOffer4Amt || 50;
  const offer4Extra = state.settings.bonusOffer4Extra || 10;

  const amt1 = document.getElementById('offer-amt-1');
  const bon1 = document.getElementById('offer-bonus-1');
  if (amt1) amt1.textContent = `₹${offer1Amt}`;
  if (bon1) bon1.textContent = `+₹${offer1Extra} Extra`;

  const amt2 = document.getElementById('offer-amt-2');
  const bon2 = document.getElementById('offer-bonus-2');
  if (amt2) amt2.textContent = `₹${offer2Amt}`;
  if (bon2) bon2.textContent = `+₹${offer2Extra} Extra`;

  const amt3 = document.getElementById('offer-amt-3');
  const bon3 = document.getElementById('offer-bonus-3');
  if (amt3) amt3.textContent = `₹${offer3Amt}`;
  if (bon3) bon3.textContent = `+₹${offer3Extra} Extra`;

  const amt4 = document.getElementById('offer-amt-4');
  const bon4 = document.getElementById('offer-bonus-4');
  if (amt4) amt4.textContent = `₹${offer4Amt}`;
  if (bon4) bon4.textContent = `+₹${offer4Extra} Extra`;
}
window.renderAddMoneyView = renderAddMoneyView;

window.selectAddMoneyOffer = function(offerIdx) {
  let amt = 0;
  if (offerIdx === 1) amt = state.settings.bonusOffer1Amt || 100;
  else if (offerIdx === 2) amt = state.settings.bonusOffer2Amt || 30;
  else if (offerIdx === 3) amt = state.settings.bonusOffer3Amt || 70;
  else if (offerIdx === 4) amt = state.settings.bonusOffer4Amt || 50;
  
  const input = document.getElementById('add-money-amount');
  if (input) input.value = amt;
};

window.handleAddMoneyContinue = function() {
  const input = document.getElementById('add-money-amount');
  const val = parseFloat(input?.value || '0');
  const minVal = state.settings.minDeposit || 30; // Changed default minimum deposit to 30
  if (isNaN(val) || val < minVal) {
    alert(`Please enter a minimum deposit amount of ₹${minVal}`);
    return;
  }
  state.depositAmount = val;
  navigateTo('select-upi');
};

let gatewayTimerInterval = null;
let currentGatewayTxnId = '';

function renderSelectUpiView() {
  // Clear any existing timer
  if (gatewayTimerInterval) {
    clearInterval(gatewayTimerInterval);
    gatewayTimerInterval = null;
  }

  // Generate unique transaction ID in FMPIB style matching the design mockup screenshot
  currentGatewayTxnId = 'FMPIB' + Math.floor(1000000000 + Math.random() * 9000000000);

  // Set reference code display
  const refCodeEl = document.getElementById('gateway-ref-code');
  if (refCodeEl) {
    refCodeEl.textContent = currentGatewayTxnId;
  }

  // Set timeout countdown
  let secondsRemaining = 599; // 9 min 59 sec
  const timerEl = document.getElementById('gateway-timeout-timer');
  if (timerEl) {
    timerEl.textContent = '09:59';
  }

  gatewayTimerInterval = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining <= 0) {
      clearInterval(gatewayTimerInterval);
      alert('Secure transaction session timed out. Please try again.');
      navigateTo('add-money');
      return;
    }
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    if (timerEl) {
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
  }, 1000);

  // Set amount displays
  const amtStr = `₹${state.depositAmount.toFixed(2)}`;
  const amtDisplay = document.getElementById('gateway-amount-display');
  const btnAmt = document.getElementById('gateway-btn-amount');
  if (amtDisplay) amtDisplay.textContent = amtStr;
  if (btnAmt) btnAmt.textContent = amtStr;

  // Set merchant title
  const merchantEl = document.getElementById('gateway-merchant-name');
  if (merchantEl) {
    merchantEl.textContent = (state.settings.title || 'SHUBH SMM PANEL').toUpperCase();
  }

  // Set official SMM UPI ID display
  const upiIdDisplay = document.getElementById('gateway-upi-id-display');
  if (upiIdDisplay) {
    upiIdDisplay.textContent = state.settings.upiId || 'smmgrowth@paytm';
  }

  // Reset UTR input
  const utrInput = document.getElementById('gateway-utr-input');
  if (utrInput) {
    utrInput.value = '';
  }

  // Render QR Code
  const qrImg = document.getElementById('gateway-qr-img');
  if (qrImg) {
    const upiId = state.settings.upiId || 'smmgrowth@paytm';
    const title = encodeURIComponent(state.settings.title || 'SHUBH SMM PANEL');
    const amt = state.depositAmount.toFixed(2);
    const upiUrl = `upi://pay?pa=${upiId}&pn=${title}&am=${amt}&tn=SMM%20Growth%20Deposit&cu=INR`;
    const mode = state.settings.qrCodeType || 'dynamic';
    if (mode === 'dynamic') {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiUrl)}`;
    } else {
      qrImg.src = state.settings.qrCodeUrl || DEFAULT_SETTINGS.qrCodeUrl;
    }
  }

  // Reset any overlays
  const procOverlay = document.getElementById('gateway-processing-overlay');
  const succOverlay = document.getElementById('gateway-success-overlay');
  if (procOverlay) procOverlay.classList.add('hidden');
  if (succOverlay) succOverlay.classList.add('hidden');
}
window.renderSelectUpiView = renderSelectUpiView;

window.copyGatewayUpiId = function() {
  const upiId = state.settings.upiId || 'smmgrowth@paytm';
  navigator.clipboard.writeText(upiId).then(() => {
    alert('Official SMM UPI ID copied to clipboard!\n(' + upiId + ' क्लिपबोर्ड पर कॉपी हो गया है)');
  }).catch(() => {
    alert('Failed to copy. UPI ID is: ' + upiId);
  });
};

window.setGatewayTab = function(tabId) {
  const tabs = ['upi-app', 'upi-qr'];
  tabs.forEach(t => {
    const btn = document.getElementById(`gate-tab-${t}`);
    const content = document.getElementById(`gate-content-${t}`);
    if (t === tabId) {
      if (btn) {
        btn.classList.add('bg-indigo-500/10', 'border-indigo-500', 'text-indigo-500');
        btn.classList.remove('border-slate-200', 'dark:border-slate-800', 'text-slate-400');
      }
      if (content) content.classList.remove('hidden');
    } else {
      if (btn) {
        btn.classList.remove('bg-indigo-500/10', 'border-indigo-500', 'text-indigo-500');
        btn.classList.add('border-slate-200', 'dark:border-slate-800', 'text-slate-400');
      }
      if (content) content.classList.add('hidden');
    }
  });
};

window.selectGatewayUpiApp = function(appName) {
  const upiId = state.settings.upiId || 'smmgrowth@paytm';
  const title = encodeURIComponent(state.settings.title || 'SHUBH SMM PANEL');
  const amt = state.depositAmount.toFixed(2);
  const upiUrl = `upi://pay?pa=${upiId}&pn=${title}&am=${amt}&tn=SMM%20Growth%20Deposit&cu=INR`;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile) {
    let deepLink = upiUrl;
    if (appName === 'PhonePe') {
      deepLink = `phonepe://pay?pa=${upiId}&pn=${title}&am=${amt}&tn=SMM%20Growth%20Deposit&cu=INR`;
    } else if (appName === 'GooglePay') {
      deepLink = `intent://pay?pa=${upiId}&pn=${title}&am=${amt}&cu=INR#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
    } else if (appName === 'Paytm') {
      deepLink = `paytmmp://pay?pa=${upiId}&pn=${title}&am=${amt}&tn=SMM%20Growth%20Deposit&cu=INR`;
    }
    
    window.location.href = deepLink;

    setTimeout(() => {
      alert(`Redirecting to ${appName}...\n\nIf it didn't open automatically, please scan the QR code displayed on the "Scan QR" tab. After payment, enter your 12-digit UTR below.`);
    }, 600);
  } else {
    alert(`Please scan the QR code displayed on the screen with your UPI App (like ${appName}) to transfer ₹${amt}.\n\nAfter transaction, copy the 12-digit UTR/Ref No. from the receipt, paste it here, and submit.`);
  }
};

window.triggerGatewaySecurePayment = function() {
  const utrInput = document.getElementById('gateway-utr-input');
  const utrVal = utrInput ? utrInput.value.trim() : '';

  if (!/^\d{12}$/.test(utrVal)) {
    alert('Please enter a valid 12-digit numeric UPI UTR / Transaction ID.\n(कृपया भुगतान करने के बाद 12 अंकों का सही UTR / Ref No. यहाँ दर्ज करें)');
    return;
  }

  const procOverlay = document.getElementById('gateway-processing-overlay');
  if (procOverlay) procOverlay.classList.remove('hidden');

  const step1 = document.getElementById('proc-step-1');
  const step2 = document.getElementById('proc-step-2');
  const step3 = document.getElementById('proc-step-3');

  if (step1) {
    step1.className = 'flex items-center gap-2 text-amber-500 font-bold';
    step1.innerHTML = `<span class="animate-pulse">●</span> <span>Submitting payment verification token...</span>`;
  }
  if (step2) {
    step2.className = 'flex items-center gap-2 opacity-40';
    step2.innerHTML = `<span>●</span> <span>Awaiting bank UTR node lookup...</span>`;
  }
  if (step3) {
    step3.className = 'flex items-center gap-2 opacity-40';
    step3.innerHTML = `<span>●</span> <span>Creating pending ledger request...</span>`;
  }

  setTimeout(() => {
    if (step1) {
      step1.className = 'flex items-center gap-2 text-emerald-400 font-bold';
      step1.innerHTML = `<span>✓</span> <span>Verification token generated successfully</span>`;
    }
    if (step2) {
      step2.className = 'flex items-center gap-2 text-amber-500 font-bold';
      step2.innerHTML = `<span class="animate-pulse">●</span> <span>Validating 12-digit transaction ledger...</span>`;
    }

    setTimeout(() => {
      if (step2) {
        step2.className = 'flex items-center gap-2 text-emerald-400 font-bold';
        step2.innerHTML = `<span>✓</span> <span>Transaction ID logged in queue</span>`;
      }
      if (step3) {
        step3.className = 'flex items-center gap-2 text-amber-500 font-bold';
        step3.innerHTML = `<span class="animate-pulse">●</span> <span>Broadcasting state to admin queue...</span>`;
      }

      setTimeout(() => {
        if (step3) {
          step3.className = 'flex items-center gap-2 text-emerald-400 font-bold';
          step3.innerHTML = `<span>✓</span> <span>Broadcasting completed successfully</span>`;
        }

        setTimeout(() => {
          if (procOverlay) procOverlay.classList.add('hidden');
          
          if (gatewayTimerInterval) {
            clearInterval(gatewayTimerInterval);
            gatewayTimerInterval = null;
          }

          const succOverlay = document.getElementById('gateway-success-overlay');
          if (succOverlay) {
            const succAmt = document.getElementById('gateway-success-amount');
            if (succAmt) succAmt.textContent = `₹${state.depositAmount.toFixed(2)}`;
            
            const receiptMerchant = document.getElementById('receipt-merchant');
            if (receiptMerchant) receiptMerchant.textContent = (state.settings.title || 'SHUBH SMM PANEL').toUpperCase();

            const receiptTxnId = document.getElementById('receipt-txn-id');
            if (receiptTxnId) receiptTxnId.textContent = utrVal;

            const offer1Amt = parseFloat(state.settings.bonusOffer1Amt) || 100;
            const offer1Extra = parseFloat(state.settings.bonusOffer1Extra) || 30;
            const offer2Amt = parseFloat(state.settings.bonusOffer2Amt) || 30;
            const offer2Extra = parseFloat(state.settings.bonusOffer2Extra) || 5;
            const offer3Amt = parseFloat(state.settings.bonusOffer3Amt) || 70;
            const offer3Extra = parseFloat(state.settings.bonusOffer3Extra) || 20;
            const offer4Amt = parseFloat(state.settings.bonusOffer4Amt) || 50;
            const offer4Extra = parseFloat(state.settings.bonusOffer4Extra) || 10;

            const amt = state.depositAmount;
            let bonus = 0;
            if (amt === offer1Amt) bonus = offer1Extra;
            else if (amt === offer2Amt) bonus = offer2Extra;
            else if (amt === offer3Amt) bonus = offer3Extra;
            else if (amt === offer4Amt) bonus = offer4Extra;

            const bonusRow = document.getElementById('receipt-bonus-row');
            const receiptBonusAmount = document.getElementById('receipt-bonus-amount');
            if (bonus > 0) {
              if (bonusRow) bonusRow.classList.remove('hidden');
              if (receiptBonusAmount) receiptBonusAmount.textContent = `+₹${bonus.toFixed(2)}`;
            } else {
              if (bonusRow) bonusRow.classList.add('hidden');
            }

            succOverlay.classList.remove('hidden');
          }
        }, 500);

      }, 1100);
    }, 1100);
  }, 1100);
};

window.confirmAndClaimDeposit = async function() {
  const amt = state.depositAmount;
  const utrInput = document.getElementById('gateway-utr-input');
  const utrVal = utrInput ? utrInput.value.trim() : '';

  if (!/^\d{12}$/.test(utrVal)) {
    alert('Please enter a valid 12-digit numeric UPI UTR / Transaction ID.');
    return;
  }

  const walletId = state.currentUser ? state.currentUser.uid : state.guestId;
  const clientName = state.currentUser ? (state.currentUser.displayName || state.currentUser.email) : 'Guest Session';
  
  const payload = {
    id: currentGatewayTxnId,
    userId: walletId,
    clientName: clientName,
    amount: amt,
    utr: utrVal,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    userIp: state.userIp || 'Unknown'
  };

  try {
    if (state.db) {
      await setDoc(doc(state.db, 'payment_requests', payload.id), payload);
    } else {
      const payments = JSON.parse(localStorage.getItem('local_payment_requests') || '[]');
      payments.push(payload);
      localStorage.setItem('local_payment_requests', JSON.stringify(payments));
    }

    logUserAction(`Submitted Manual Deposit Request: ₹${amt} with UTR ${utrVal}`);
    alert(`Request Submitted!\n\nYour deposit request of ₹${amt.toFixed(2)} has been submitted successfully.\n\nSMM Admin will verify the UTR reference (${utrVal}) and credit your balance shortly.`);
    navigateTo('home');
  } catch (err) {
    console.error("Failed to submit manual payment:", err?.message || err?.toString());
    alert("Error submitting your deposit request. Please contact support.");
    navigateTo('home');
  }
};

window.handleScratchCardClick = async function(cardIdx) {
  if (state.scratchCardsScratchStates[cardIdx]) {
    alert("You have already scratched this card!");
    return;
  }

  state.scratchCardsScratchStates[cardIdx] = true;
  localStorage.setItem('smm_scratch_states', JSON.stringify(state.scratchCardsScratchStates));

  let winText = "Try Again!";
  if (cardIdx === 0) winText = state.settings.scratchCard1Win || "₹5 Extra Bonus";
  else if (cardIdx === 1) winText = state.settings.scratchCard2Win || "₹10 Extra Bonus";
  else if (cardIdx === 2) winText = state.settings.scratchCard3Win || "20% Extra Bonus";
  else if (cardIdx === 3) winText = state.settings.scratchCard4Win || "Try Again!";

  logUserAction(`Scratched Card Offer ${cardIdx + 1} (Result: ${winText})`);

  const front = document.getElementById(`scratch-front-${cardIdx}`);
  if (front) {
    front.classList.add('scale-0');
    setTimeout(() => { front.classList.add('hidden'); }, 300);
  }

  const prize = document.getElementById(`scratch-prize-${cardIdx}`);
  if (prize) prize.textContent = winText;

  if (winText.includes('₹')) {
    const numPart = winText.replace(/[^0-9]/g, '');
    const extraBonus = parseFloat(numPart);
    if (!isNaN(extraBonus) && extraBonus > 0) {
      const walletId = state.currentUser ? state.currentUser.uid : state.guestId;
      try {
        if (state.db) {
          const walletRef = doc(state.db, 'wallets', walletId);
          const snap = await getDoc(walletRef);
          let currentBal = 0;
          if (snap.exists()) {
            currentBal = snap.data().balance || 0;
          }
          await setDoc(walletRef, { balance: currentBal + extraBonus, id: walletId, updatedAt: new Date().toISOString() });
        } else {
          const newBal = state.walletBalance + extraBonus;
          localStorage.setItem('local_wallet_balance', newBal.toString());
          state.walletBalance = newBal;
          renderWalletDisplays();
        }
        alert(`Congratulations! You scratched and won ₹${extraBonus} instant credit!`);
      } catch (e) {
        console.error(e?.message || e?.toString());
      }
    }
  } else {
    alert(`Revealed: ${winText}`);
  }
};

function startFlashSaleTimer() {
  let secondsLeft = parseInt(localStorage.getItem('smm_flash_sale_seconds_left'));
  if (isNaN(secondsLeft) || secondsLeft <= 0) {
    secondsLeft = (state.settings.flashSaleDuration || 30) * 60;
  }

  setInterval(() => {
    if (secondsLeft <= 0) {
      secondsLeft = (state.settings.flashSaleDuration || 30) * 60;
    }
    secondsLeft--;
    localStorage.setItem('smm_flash_sale_seconds_left', secondsLeft.toString());

    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;

    const pad = (num) => String(num).padStart(2, '0');

    const timerEl = document.getElementById('flash-sale-timer');
    if (timerEl) {
      timerEl.textContent = `${pad(minutes)}:${pad(seconds)}`;
    }
  }, 1000);
}

function syncWallet() {
  const walletId = state.currentUser ? state.currentUser.uid : state.guestId;
  
  if (state.db) {
    const unsub = onSnapshot(doc(state.db, 'wallets', walletId), (snap) => {
      if (snap.exists()) {
        state.walletBalance = snap.data().balance || 0;
      } else {
        state.walletBalance = 0;
      }
      renderWalletDisplays();
    }, (err) => {
      console.error("Wallet snapshot failed:", err?.message || err?.toString());
    });
    return unsub;
  } else {
    const localBal = parseFloat(localStorage.getItem('local_wallet_balance') || '0');
    state.walletBalance = localBal;
    renderWalletDisplays();
    return null;
  }
}

function syncPayments() {
  if (state.db) {
    const unsub = onSnapshot(collection(state.db, 'payment_requests'), (snap) => {
      const items = [];
      snap.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      state.paymentRequests = items;
      
      if (activeAdminTab === 'admin-payments' || activeAdminTab === 'admin-analytics') {
        renderAdminTabContent();
      }
    }, (err) => {
      console.error("Failed payments snapshot:", err?.message || err?.toString());
    });
    return unsub;
  } else {
    const localPayments = JSON.parse(localStorage.getItem('local_payment_requests') || '[]');
    localPayments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    state.paymentRequests = localPayments;
    return null;
  }
}

function renderAdminPayments(target) {
  target.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-bold text-slate-400">Payment Verification</h3>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto p-1 space-y-1">
      ${state.paymentRequests.length === 0 ? `
        <p class="p-4 text-center text-slate-500 font-bold uppercase text-[10px]">No deposits pending</p>
      ` : state.paymentRequests.map(req => `
        <div class="p-2.5 bg-slate-900/60 border border-slate-850 rounded-lg flex items-center justify-between gap-3 text-[11px]">
          <div>
            <div class="font-extrabold text-white flex items-center gap-1.5">
              <span>${req.clientName || 'Guest'}</span>
              <span class="text-[9px] text-slate-500 font-mono">${req.id}</span>
            </div>
            <div class="text-slate-400 text-[9px] leading-tight font-medium uppercase mt-0.5">
              UTR ID: <span class="text-indigo-400 select-all font-bold">${req.utr}</span>
              ${req.userIp ? `• IP: <span class="text-amber-400 select-all font-mono font-bold">${req.userIp}</span>` : ''}
            </div>
            <span class="block text-[8px] text-slate-500 font-mono mt-0.5">${new Date(req.createdAt).toLocaleString()}</span>
          </div>
          <div class="text-right flex flex-col items-end gap-1.5 shrink-0">
            <span class="text-emerald-400 font-black text-sm">₹${req.amount}</span>
            <div class="flex gap-1">
              <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${req.status === 'Approved' ? 'bg-emerald-950 text-emerald-400' : req.status === 'Rejected' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'}">${req.status}</span>
              ${req.status === 'Pending' ? `
                <button onclick="window.approvePaymentRequest('${req.id}')" class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[9px] font-black uppercase">Approve</button>
                <button onclick="window.rejectPaymentRequest('${req.id}')" class="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[9px] font-black uppercase">Reject</button>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
window.renderAdminPayments = renderAdminPayments;

function renderAdminReviews(target) {
  const reviews = getReviews();

  target.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-bold text-slate-400">User Comments & Reviews Moderation</h3>
      <span class="text-[8px] text-slate-500 font-mono">Total visible: ${reviews.length}</span>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto p-1 space-y-1">
      ${reviews.length === 0 ? `
        <p class="p-4 text-center text-slate-500 font-bold uppercase text-[10px]">No reviews found</p>
      ` : reviews.map(r => `
        <div class="p-3 bg-slate-900/60 border border-slate-850 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px]">
          <div class="space-y-1">
            <div class="font-extrabold text-white flex items-center gap-1.5 flex-wrap">
              <span>${r.name}</span>
              <span class="text-[8px] text-amber-400 font-mono">${'★'.repeat(r.rating)}</span>
              <span class="text-[8px] text-slate-500 font-mono select-all">ID: ${r.id}</span>
            </div>
            <p class="text-slate-300 italic font-medium">"${r.comment}"</p>
            <div class="text-[8px] text-slate-500 font-mono leading-none">
              IP Address: <span class="text-indigo-400 font-bold">${r.ip || 'Pre-loaded / Verified'}</span> • Timestamp: ${new Date(r.timestamp).toLocaleString()}
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <button onclick="window.deleteAdminReview('${r.id}')" class="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-black text-[9px] uppercase tracking-wide rounded transition">
              Delete Comment
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
window.renderAdminReviews = renderAdminReviews;

window.deleteAdminReview = async function(reviewId) {
  if (!confirm("Are you sure you want to delete this review comment forever?")) return;

  try {
    if (state.db) {
      await deleteDoc(doc(state.db, 'reviews', reviewId));
    } else {
      let localReviews = JSON.parse(localStorage.getItem('smm_local_reviews') || '[]');
      localReviews = localReviews.filter(r => r.id !== reviewId);
      localStorage.setItem('smm_local_reviews', JSON.stringify(localReviews));
    }
    alert("Review comment has been successfully removed.");
    renderAdminDashboard();
  } catch (err) {
    console.error("Failed to delete review:", err?.message || err?.toString());
    alert("Database deletion failed. Make sure you are authorized!");
  }
};

function getDeviceDetails(ua) {
  if (!ua) return 'Unknown Device';
  
  let os = '';
  let browser = '';
  
  // OS Detection
  if (ua.includes('Android')) {
    const match = ua.match(/Android\s([0-9\.]+)/);
    os = match ? `Android ${match[1]}` : 'Android';
    if (ua.includes('Samsung') || ua.includes('SAMSUNG')) os += ' (Samsung)';
    else if (ua.includes('Redmi') || ua.includes('Xiaomi')) os += ' (Xiaomi)';
    else if (ua.includes('Oppo') || ua.includes('OPPO')) os += ' (OPPO)';
    else if (ua.includes('Vivo') || ua.includes('VIVO')) os += ' (Vivo)';
    else if (ua.includes('OnePlus')) os += ' (OnePlus)';
    else if (ua.includes('Motorola') || ua.includes('Moto')) os += ' (Moto)';
  } else if (ua.includes('iPhone')) {
    const match = ua.match(/OS\s([0-9_]+)/);
    os = match ? `iPhone (iOS ${match[1].replace(/_/g, '.')})` : 'iPhone (iOS)';
  } else if (ua.includes('iPad')) {
    const match = ua.match(/OS\s([0-9_]+)/);
    os = match ? `iPad (iOS ${match[1].replace(/_/g, '.')})` : 'iPad';
  } else if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT\s([0-9\.]+)/);
    let winVer = '';
    if (match) {
      if (match[1] === '10.0') winVer = '10/11';
      else if (match[1] === '6.3') winVer = '8.1';
      else if (match[1] === '6.2') winVer = '8';
      else if (match[1] === '6.1') winVer = '7';
      else winVer = match[1];
    }
    os = `Windows ${winVer || ''}`.trim();
  } else if (ua.includes('Macintosh')) {
    const match = ua.match(/Mac OS X\s([0-9_]+)/);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (ua.includes('Linux')) {
    os = 'Linux PC';
  } else {
    os = 'Unknown OS';
  }

  // Browser Detection
  if (ua.includes('FBAN') || ua.includes('FBAV')) {
    browser = 'Facebook App';
  } else if (ua.includes('Instagram')) {
    browser = 'Instagram App';
  } else if (ua.includes('Edg')) {
    browser = 'Edge';
  } else if (ua.includes('OPR') || ua.includes('Opera')) {
    browser = 'Opera';
  } else if (ua.includes('Chrome') && !ua.includes('Safari')) {
    browser = 'Chrome';
  } else if (ua.includes('Chrome') && ua.includes('Safari')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
  } else {
    browser = 'Browser';
  }
  
  return `${os} • ${browser}`;
}

async function renderAdminAnalytics(target) {
  target.innerHTML = `
    <div class="flex items-center justify-center py-8">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  `;

  let visitsCount = 0;
  let visitsList = [];
  
  if (state.db) {
    try {
      const q = query(collection(state.db, 'visits'));
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const isFromAdmin = (state.currentUser && d.visitorId === state.currentUser.uid) || 
                            (d.pages && d.pages.some(p => p.toLowerCase().includes('admin')));
        if (!isFromAdmin) {
          visitsList.push(d);
        }
      });
      visitsList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      visitsCount = visitsList.length;
    } catch (err) {
      console.error("Failed to load visits:", err?.message || err?.toString());
    }
  } else {
    visitsCount = parseInt(localStorage.getItem('local_visits_count') || '12');
    visitsList = [
      { id: 'visit-1', visitorId: 'guest-832101', ip: '103.88.22.14', timestamp: new Date(Date.now() - 360000).toISOString(), userAgent: navigator.userAgent, duration: 215, pages: ['Visited Home Page', 'Opened SMM Order Page', 'Placed Order'] },
      { id: 'visit-2', visitorId: 'guest-230912', ip: '2409:4063:2d9d:9e9a::1', timestamp: new Date(Date.now() - 1200000).toISOString(), userAgent: navigator.userAgent, duration: 42, pages: ['Visited Home Page', 'Viewed Services List'] }
    ];
  }

  // Calculate statistics
  const totalApprovedDeposits = state.paymentRequests
    .filter(p => p.status === 'Approved')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  const pendingDepositsCount = state.paymentRequests
    .filter(p => p.status === 'Pending').length;

  const totalOrdersCount = state.orders.length;
  const totalOrdersCharge = state.orders.reduce((sum, o) => sum + parseFloat(o.charge || 0), 0);

  target.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-400">Traffic & Financial Analytics</h3>
        <button onclick="window.switchAdminTab('admin-analytics')" class="text-[9px] font-black uppercase text-indigo-400 hover:underline">Refresh Stats</button>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-1">
          <span class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Visits</span>
          <span class="block text-lg font-black text-white">${visitsCount}</span>
          <span class="block text-[8px] text-emerald-400 font-semibold">● Active sessions</span>
        </div>
        <div class="p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-1">
          <span class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Approved Deposits</span>
          <span class="block text-lg font-black text-emerald-400 font-mono">₹${totalApprovedDeposits.toFixed(2)}</span>
          <span class="block text-[8px] text-slate-400 font-semibold">${state.paymentRequests.filter(p => p.status === 'Approved').length} approved requests</span>
        </div>
        <div class="p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-1">
          <span class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Pending Verification</span>
          <span class="block text-lg font-black text-amber-400 font-mono">${pendingDepositsCount}</span>
          <span class="block text-[8px] text-slate-400 font-semibold">Requires action</span>
        </div>
        <div class="p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-1">
          <span class="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Orders Revenue</span>
          <span class="block text-lg font-black text-indigo-400 font-mono">₹${totalOrdersCharge.toFixed(2)}</span>
          <span class="block text-[8px] text-slate-400 font-semibold">${totalOrdersCount} orders placed</span>
        </div>
      </div>

      <!-- Visitor Activity Log -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-3 space-y-2">
        <span class="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Recent Live Visitors</span>
        
        <div class="divide-y divide-slate-850 max-h-60 overflow-y-auto pr-1">
          ${visitsList.length === 0 ? `
            <p class="text-center py-4 text-slate-500 text-[10px] font-bold uppercase">No recent visitor logs</p>
          ` : visitsList.slice(0, 30).map(v => {
            const parsedBrowser = v.deviceName || getDeviceDetails(v.userAgent);
            const displayId = v.ip && v.ip !== 'Unknown' ? v.ip : v.visitorId;
            const extraInfo = v.ip && v.ip !== 'Unknown' ? `(${v.visitorId})` : '';
            const durationText = formatDuration(v.duration || 0);
            const pagePath = v.pages && Array.isArray(v.pages) ? v.pages.join(' → ') : 'Visited Home Page';

            return `
              <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-400 border-b border-slate-850/50 hover:bg-slate-850/10 px-1 transition rounded-lg">
                <div class="space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span class="font-extrabold text-slate-200 font-mono select-all">${displayId}</span>
                    ${extraInfo ? `<span class="text-[8px] text-slate-500 font-mono">${extraInfo}</span>` : ''}
                    <span class="px-1.5 py-0.5 bg-slate-800 text-[7px] text-slate-400 font-mono rounded font-bold uppercase leading-none">Stay: ${durationText}</span>
                  </div>
                  <div class="flex flex-col gap-0.5">
                    <span class="block text-[8.5px] text-slate-400 font-mono leading-none">Browser: <span class="text-indigo-400">${parsedBrowser}</span></span>
                    <span class="block text-[8.5px] text-slate-400 font-semibold mt-1 bg-slate-950/40 p-1.5 rounded-lg border border-slate-850 leading-relaxed font-mono">
                      🗺️ Activity Flow: <span class="text-amber-400/90 font-bold select-all">${pagePath}</span>
                    </span>
                  </div>
                </div>
                <div class="text-right shrink-0 font-mono text-[8.5px] text-slate-500 flex flex-col sm:items-end">
                  <span>${new Date(v.timestamp).toLocaleString()}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}
window.renderAdminAnalytics = renderAdminAnalytics;

async function trackVisit() {
  if (state.currentUser) return; // Completely exclude admin visits from logging

  let clientIp = 'Unknown';
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    if (data && data.ip) {
      clientIp = data.ip;
      state.userIp = clientIp;
    }
  } catch (err) {
    console.warn("Could not retrieve client IP:", err?.message || err?.toString());
  }

  const now = Date.now();
  const lastLoggedTime = parseInt(localStorage.getItem('smm_visit_logged_time') || '0');
  const isWithin24Hours = (now - lastLoggedTime) < 24 * 60 * 60 * 1000; // 24 hours window

  if (!state.db) {
    let localVisits = parseInt(localStorage.getItem('local_visits_count') || '12');
    if (!isWithin24Hours) {
      localVisits++;
      localStorage.setItem('local_visits_count', localVisits.toString());
      localStorage.setItem('smm_visit_logged_time', now.toString());
    }
    return;
  }
  try {
    if (!isWithin24Hours) {
      const visitId = 'visit-' + now + '-' + Math.floor(Math.random() * 1000);
      const visitorId = state.guestId;
      
      // Store in sessionStorage for runtime lifecycle compatibility
      sessionStorage.setItem('smm_visit_logged', 'true');
      sessionStorage.setItem('smm_current_visit_id', visitId);
      sessionStorage.setItem('smm_visit_start_time', now.toString());
      sessionStorage.setItem('smm_visit_pages', JSON.stringify(['Visited Home Page']));

      // Store persistently in localStorage to survive restarts/closes/new tabs
      localStorage.setItem('smm_visit_logged_time', now.toString());
      localStorage.setItem('smm_current_visit_id', visitId);
      localStorage.setItem('smm_visit_start_time', now.toString());
      localStorage.setItem('smm_visit_pages', JSON.stringify(['Visited Home Page']));

      await setDoc(doc(state.db, 'visits', visitId), {
        id: visitId,
        visitorId: visitorId,
        ip: clientIp,
        deviceName: getDeviceDetails(navigator.userAgent),
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        duration: 0,
        pages: ['Visited Home Page'],
        lastActive: new Date().toISOString()
      });
    } else {
      // Re-use the existing visitId to append duration/actions, rather than creating a new document!
      const existingVisitId = localStorage.getItem('smm_current_visit_id');
      if (existingVisitId) {
        sessionStorage.setItem('smm_visit_logged', 'true');
        sessionStorage.setItem('smm_current_visit_id', existingVisitId);
        
        const savedStart = localStorage.getItem('smm_visit_start_time') || now.toString();
        sessionStorage.setItem('smm_visit_start_time', savedStart);

        const savedPages = localStorage.getItem('smm_visit_pages') || JSON.stringify(['Visited Home Page']);
        sessionStorage.setItem('smm_visit_pages', savedPages);
      }
    }
  } catch (err) {
    console.error("Failed to track visit:", err?.message || err?.toString());
  }
}
window.trackVisit = trackVisit;

function formatDuration(seconds) {
  if (seconds === undefined || seconds === null) return '0s';
  const sec = parseInt(seconds);
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSecs = sec % 60;
  if (mins < 60) return `${mins}m ${remainingSecs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m ${remainingSecs}s`;
}

async function logUserAction(actionName) {
  if (state.currentUser) return; // Completely exclude admin actions from visitor logs

  const visitId = sessionStorage.getItem('smm_current_visit_id');
  if (!visitId) return;

  try {
    let pages = [];
    try {
      pages = JSON.parse(sessionStorage.getItem('smm_visit_pages') || '[]');
    } catch (e) {}

    // Avoid duplicating identical sequential actions
    if (pages[pages.length - 1] !== actionName) {
      pages.push(actionName);
      sessionStorage.setItem('smm_visit_pages', JSON.stringify(pages));
      localStorage.setItem('smm_visit_pages', JSON.stringify(pages)); // Keep persistent backup synchronized
    }

    const startTime = parseInt(sessionStorage.getItem('smm_visit_start_time') || Date.now());
    const durationSec = Math.round((Date.now() - startTime) / 1000);

    if (state.db) {
      await updateDoc(doc(state.db, 'visits', visitId), {
        pages: pages,
        duration: durationSec,
        lastActive: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn("Failed to log user action:", err);
  }
}
window.logUserAction = logUserAction;

// Stay duration update heartbeat (every 10 seconds)
setInterval(() => {
  if (state.currentUser) return; // Skip admin
  const visitId = sessionStorage.getItem('smm_current_visit_id');
  if (!visitId) return;

  const startTime = parseInt(sessionStorage.getItem('smm_visit_start_time') || Date.now());
  const durationSec = Math.round((Date.now() - startTime) / 1000);

  if (state.db) {
    updateDoc(doc(state.db, 'visits', visitId), {
      duration: durationSec,
      lastActive: new Date().toISOString()
    }).catch(() => {});
  }
}, 10000);

window.approvePaymentRequest = async function(requestId) {
  const req = state.paymentRequests.find(r => r.id === requestId);
  if (!req) return;

  const offer1Amt = parseFloat(state.settings.bonusOffer1Amt) || 100;
  const offer1Extra = parseFloat(state.settings.bonusOffer1Extra) || 30;
  const offer2Amt = parseFloat(state.settings.bonusOffer2Amt) || 30;
  const offer2Extra = parseFloat(state.settings.bonusOffer2Extra) || 5;
  const offer3Amt = parseFloat(state.settings.bonusOffer3Amt) || 70;
  const offer3Extra = parseFloat(state.settings.bonusOffer3Extra) || 20;
  const offer4Amt = parseFloat(state.settings.bonusOffer4Amt) || 50;
  const offer4Extra = parseFloat(state.settings.bonusOffer4Extra) || 10;

  const amt = req.amount;
  let bonus = 0;
  if (amt === offer1Amt) bonus = offer1Extra;
  else if (amt === offer2Amt) bonus = offer2Extra;
  else if (amt === offer3Amt) bonus = offer3Extra;
  else if (amt === offer4Amt) bonus = offer4Extra;

  const creditedAmount = amt + bonus;

  try {
    if (state.db) {
      await updateDoc(doc(state.db, 'payment_requests', requestId), { status: 'Approved' });
      const walletRef = doc(state.db, 'wallets', req.userId);
      const walletSnap = await getDoc(walletRef);
      let currentBal = 0;
      if (walletSnap.exists()) {
        currentBal = walletSnap.data().balance || 0;
      }
      await setDoc(walletRef, { balance: parseFloat((currentBal + creditedAmount).toFixed(2)), id: req.userId, updatedAt: new Date().toISOString() });
    } else {
      const list = JSON.parse(localStorage.getItem('local_payment_requests') || '[]');
      const idx = list.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        list[idx].status = 'Approved';
        localStorage.setItem('local_payment_requests', JSON.stringify(list));
      }
      const walletId = state.currentUser ? state.currentUser.uid : state.guestId;
      if (req.userId === walletId) {
        const currentBal = parseFloat(localStorage.getItem('local_wallet_balance') || '0');
        const newBal = parseFloat((currentBal + creditedAmount).toFixed(2));
        localStorage.setItem('local_wallet_balance', newBal.toString());
        state.walletBalance = newBal;
        renderWalletDisplays();
      }
    }
    alert(`Payment approved! ₹${creditedAmount.toFixed(2)} credited user balance.`);
    renderAdminDashboard();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error completing approval.");
  }
};

window.rejectPaymentRequest = async function(requestId) {
  try {
    if (state.db) {
      await updateDoc(doc(state.db, 'payment_requests', requestId), { status: 'Rejected' });
    } else {
      const list = JSON.parse(localStorage.getItem('local_payment_requests') || '[]');
      const idx = list.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        list[idx].status = 'Rejected';
        localStorage.setItem('local_payment_requests', JSON.stringify(list));
      }
    }
    alert("Rejected successfully.");
    renderAdminDashboard();
  } catch (err) {
    console.error(err?.message || err?.toString());
    alert("Error rejecting.");
  }
};

// -------------------------------------------------------------
// Interactive UI Global Handlers Setup
// -------------------------------------------------------------
function setupUIHandlers() {
  const mobBtn = document.getElementById('mobile-menu-btn');
  const mobMenu = document.getElementById('mobile-menu');
  if (mobBtn && mobMenu) {
    mobBtn.addEventListener('click', () => {
      mobMenu.classList.toggle('hidden');
    });
  }

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        state.theme = 'light';
        themeBtn.innerHTML = `<svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.364 17.636l-.707.707m12.728 0l-.707-.707M6.364 6.364l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path></svg>`;
      } else {
        document.documentElement.classList.add('dark');
        state.theme = 'dark';
        themeBtn.innerHTML = `<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg>`;
      }
    });
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      const el = document.getElementById(modalId);
      if (el) el.classList.add('hidden');
    });
  });

  // Link Category changes to select the visual service pack in step 1
  const catSel = document.getElementById('order-category-select');
  if (catSel) {
    catSel.addEventListener('change', () => {
      state.selectedCategoryId = catSel.value;
      state.selectedServiceId = '';
      renderVisualServicesList();
    });
  }

  const qtyInput = document.getElementById('order-quantity-input');
  if (qtyInput) {
    qtyInput.addEventListener('input', calculateCharge);
  }

  const copyUpiBtn = document.getElementById('copy-upi-btn');
  if (copyUpiBtn) {
    copyUpiBtn.addEventListener('click', () => {
      const upiText = document.getElementById('order-payment-upi')?.textContent || '';
      navigator.clipboard.writeText(upiText);
      alert('SMM UPI ID Copied!');
    });
  }

  const trackForm = document.getElementById('track-form');
  if (trackForm) {
    trackForm.addEventListener('submit', handleTrackSearch);
  }

  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleAdminLogin);
  }

  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleAdminLogout);
  }

  // Secret admin trigger by clicking 5 times on the logo or the footer copyright text
  let secretClicks = 0;
  let lastClickTime = 0;
  const triggerSecretAdmin = () => {
    const now = Date.now();
    if (now - lastClickTime > 3000) {
      secretClicks = 1;
    } else {
      secretClicks++;
    }
    lastClickTime = now;
    if (secretClicks >= 5) {
      secretClicks = 0;
      navigateTo('admin-login');
      alert("🔒 Administrative key gate triggered. Welcome.");
    }
  };

  const footerCopyright = document.getElementById('footer-copyright-trigger');
  if (footerCopyright) {
    footerCopyright.addEventListener('click', triggerSecretAdmin);
  }

  const logoContainer = document.getElementById('header-logo-container');
  if (logoContainer) {
    logoContainer.addEventListener('click', triggerSecretAdmin);
  }
}

// -------------------------------------------------------------
// Promotional Banner Slider & Countdown Timer Logic
// -------------------------------------------------------------
let currentBannerIdx = 0;
window.changeBannerSlide = function(idx) {
  const slides = document.querySelectorAll('.banner-slide');
  const dots = document.querySelectorAll('.banner-dot');
  if (!slides.length) return;
  
  currentBannerIdx = idx;
  slides.forEach((slide, i) => {
    if (i === idx) {
      slide.classList.remove('hidden');
      slide.classList.add('flex');
    } else {
      slide.classList.add('hidden');
      slide.classList.remove('flex');
    }
  });

  dots.forEach((dot, i) => {
    if (i === idx) {
      dot.classList.add('bg-red-500', 'w-4');
      dot.classList.remove('bg-slate-300', 'w-2');
    } else {
      dot.classList.add('bg-slate-300', 'w-2');
      dot.classList.remove('bg-red-500', 'w-4');
    }
  });
};

// Start automatic rotation of banners
setInterval(() => {
  const slides = document.querySelectorAll('.banner-slide');
  if (!slides.length) return;
  let nextIdx = (currentBannerIdx + 1) % slides.length;
  window.changeBannerSlide(nextIdx);
}, 4500);

// Live synchronized deal timers (counts down 30 minutes repeatedly)
let dealSecondsLeft = 1754; // Starts ~29:14
setInterval(() => {
  dealSecondsLeft--;
  if (dealSecondsLeft <= 0) {
    dealSecondsLeft = 1800; // Reset to 30 minutes
  }
  const m = Math.floor(dealSecondsLeft / 60);
  const s = dealSecondsLeft % 60;
  const timeText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  
  // Update all instances of deal-timer on the screen
  document.querySelectorAll('.deal-timer').forEach(el => {
    el.textContent = timeText;
  });
}, 1000);

document.addEventListener('DOMContentLoaded', initApp);
