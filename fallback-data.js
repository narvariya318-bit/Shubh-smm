// Default seed/fallback data for the SMM Panel when database is offline or not yet initialized
export const DEFAULT_SETTINGS = {
  title: "Shubh SMM",
  description: "⚡ Fast Delivery • 💎 High Quality • 📞 24/7 Support • 🛡️ Secure Payments. Grow your social media presence with top-tier premium SMM services instantly.",
  logoUrl: "", 
  homepageBanner: "Shubh SMM Panel - Elite Social Media Growth",
  upiId: "smmgrowth@paytm",
  qrCodeUrl: "https://images.unsplash.com/photo-1543269865-cbf427effbad?w=400&q=80&fit=crop&q=60", 
  whatsappNumber: "+919876543210",
  telegramLink: "https://t.me/smmpanel_support",
  paymentInstructions: "1. Settle the payment using any UPI App (Paytm, GPay, PhonePe).\n2. Alternatively, scan the QR code to pay directly.\n3. Enter the 12-digit UPI reference ID (UTR) in the final step to submit your order.\n4. SMM automation initiates your services within minutes!",
  announcement: "🔥 Shubh SMM Panel LIVE! Get instant deliveries on Followers, Likes, Views, and Subscribers!",
  showAnnouncement: false,
  isMaintenanceMode: false,
  minDeposit: 30, // Changed default minimum deposit to 30
  flashSaleDuration: 30,
  flashSaleTitle: "⚡ FLASH SALE ENDING IN",
  flashSaleDesc: "Lowest prices for next 30 minutes only. Grab the deal before prices hike up!",
  flashSaleHindi: "सिर्फ आपके 30 मिनट के लिए सबसे कम दाम। जल्दी ऑर्डर करें!",
  platformNews: "No updates.",
  activeUsersCount: "245,000+",
  totalOrdersCount: "220,500+",
  bonusOffer1Amt: 100,
  bonusOffer1Extra: 30,
  bonusOffer2Amt: 30,
  bonusOffer2Extra: 5,
  bonusOffer3Amt: 70,
  bonusOffer3Extra: 20,
  bonusOffer4Amt: 50,
  bonusOffer4Extra: 10,
  scratchCard1Win: "₹5 Extra Bonus",
  scratchCard2Win: "₹10 Extra Bonus",
  scratchCard3Win: "20% Extra Bonus",
  scratchCard4Win: "Try Again!"
};

export const DEFAULT_CATEGORIES = [
  { id: "followers-pack", name: "Followers & Verification", icon: "instagram", sortOrder: 1, active: true },
  { id: "likes-pack", name: "Reels Likes & Post Boost", icon: "instagram", sortOrder: 2, active: true },
  { id: "views-pack", name: "Reels Views & Virality", icon: "instagram", sortOrder: 3, active: true },
  { id: "subscribers-pack", name: "YouTube Channel Growth", icon: "youtube", sortOrder: 4, active: true },
  { id: "shorts-pack", name: "YouTube Shorts Boost", icon: "youtube", sortOrder: 5, active: true },
  { id: "video-views-pack", name: "YouTube Video Views & Watch Time", icon: "youtube", sortOrder: 6, active: true }
];

export const DEFAULT_SERVICES = [
  // Followers & Verification
  {
    id: "hemant-followers-10k",
    categoryId: "followers-pack",
    name: "10K FOLLOWERS",
    pricePer1000: 2.0,
    minQuantity: 10000,
    maxQuantity: 10000,
    description: "10K - NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-blue-tick",
    categoryId: "followers-pack",
    name: "BLUE TICK",
    pricePer1000: 199.0,
    minQuantity: 1000,
    maxQuantity: 1000,
    description: "PERMANENT",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-followers-30k",
    categoryId: "followers-pack",
    name: "30K FOLLOWERS",
    pricePer1000: 1.333333,
    minQuantity: 30000,
    maxQuantity: 30000,
    description: "30k NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-followers-40k",
    categoryId: "followers-pack",
    name: "40K FOLLOWERS",
    pricePer1000: 1.125,
    minQuantity: 40000,
    maxQuantity: 40000,
    description: "40k NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-followers-50k",
    categoryId: "followers-pack",
    name: "50K FOLLOWERS",
    pricePer1000: 1.10,
    minQuantity: 50000,
    maxQuantity: 50000,
    description: "50k NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-followers-100k",
    categoryId: "followers-pack",
    name: "100K FOLLOWERS",
    pricePer1000: 0.90,
    minQuantity: 100000,
    maxQuantity: 100000,
    description: "100k NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-followers-1m",
    categoryId: "followers-pack",
    name: "1 MILLION FOLLOWERS",
    pricePer1000: 0.299,
    minQuantity: 1000000,
    maxQuantity: 1000000,
    description: "1 MILLION",
    active: true,
    logoUrl: ""
  },

  // Reels Likes & Post Boost
  {
    id: "hemant-likes-10k",
    categoryId: "likes-pack",
    name: "10K LIKES ON REELS POST",
    pricePer1000: 0.90,
    minQuantity: 10000,
    maxQuantity: 10000,
    description: "10K NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-likes-20k",
    categoryId: "likes-pack",
    name: "20K LIKES ON REELS POST",
    pricePer1000: 0.70,
    minQuantity: 20000,
    maxQuantity: 20000,
    description: "20K NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-likes-50k",
    categoryId: "likes-pack",
    name: "50K LIKES ON REELS POST",
    pricePer1000: 0.52,
    minQuantity: 50000,
    maxQuantity: 50000,
    description: "50K NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-likes-100k",
    categoryId: "likes-pack",
    name: "100K LIKE ON REELS POST",
    pricePer1000: 0.45,
    minQuantity: 100000,
    maxQuantity: 100000,
    description: "100k NON DROP",
    active: true,
    logoUrl: ""
  },

  // Reels Views & Virality
  {
    id: "hemant-views-10k",
    categoryId: "views-pack",
    name: "10K REELS VIEWS",
    pricePer1000: 0.50,
    minQuantity: 10000,
    maxQuantity: 10000,
    description: "10K NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-views-50k",
    categoryId: "views-pack",
    name: "50K REELS VIEWS",
    pricePer1000: 0.30,
    minQuantity: 50000,
    maxQuantity: 50000,
    description: "50k NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-views-100k",
    categoryId: "views-pack",
    name: "100K REELS VIEWS",
    pricePer1000: 0.23,
    minQuantity: 100000,
    maxQuantity: 100000,
    description: "100K NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-views-1m",
    categoryId: "views-pack",
    name: "1 MILLION REELS VIEWS",
    pricePer1000: 0.069,
    minQuantity: 1000000,
    maxQuantity: 1000000,
    description: "1 MILLIONS",
    active: true,
    logoUrl: ""
  },

  // YouTube Channel Growth
  {
    id: "hemant-subs-1k",
    categoryId: "subscribers-pack",
    name: "1K SUBSCRIBERS - NON DROP",
    pricePer1000: 30.0,
    minQuantity: 1000,
    maxQuantity: 1000,
    description: "1k - REAL NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-subs-2k",
    categoryId: "subscribers-pack",
    name: "2K SUBSCRIBERS - NON DROP",
    pricePer1000: 23.0,
    minQuantity: 2000,
    maxQuantity: 2000,
    description: "2K - REAL NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-subs-5k",
    categoryId: "subscribers-pack",
    name: "5K SUBSCRIBERS - NON DROP",
    pricePer1000: 11.0,
    minQuantity: 5000,
    maxQuantity: 5000,
    description: "5K REAL NON DROP",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-subs-10k",
    categoryId: "subscribers-pack",
    name: "10K SUBSCRIBERS - NON DROP",
    pricePer1000: 7.0,
    minQuantity: 10000,
    maxQuantity: 10000,
    description: "10K REAL NON DROP",
    active: true,
    logoUrl: ""
  },

  // YouTube Shorts Boost
  {
    id: "hemant-shorts-100k",
    categoryId: "shorts-pack",
    name: "100K SHORTS VIEWS",
    pricePer1000: 0.15,
    minQuantity: 100000,
    maxQuantity: 100000,
    description: "100K VIEWS ( SHORTS)",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-shorts-1m",
    categoryId: "shorts-pack",
    name: "1 MILLION SHORTS VIEWS",
    pricePer1000: 0.05,
    minQuantity: 1000000,
    maxQuantity: 1000000,
    description: "1 MILLIONS VIEWS ( SHORTS)",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-shorts-3m",
    categoryId: "shorts-pack",
    name: "3 MILLION SHORTS VIEWS",
    pricePer1000: 0.0333333,
    minQuantity: 3000000,
    maxQuantity: 3000000,
    description: "3 MILLIONS ( SHORTS)",
    active: true,
    logoUrl: ""
  },

  // YouTube Video Views & Watch Time
  {
    id: "hemant-video-10k",
    categoryId: "video-views-pack",
    name: "10K LONG VIDEO VIEWS",
    pricePer1000: 10.0,
    minQuantity: 10000,
    maxQuantity: 10000,
    description: "VIEWS + WATCH TIME",
    active: true,
    logoUrl: ""
  },
  {
    id: "hemant-video-100k",
    categoryId: "video-views-pack",
    name: "100K LONG VIDEO VIEWS",
    pricePer1000: 1.99,
    minQuantity: 100000,
    maxQuantity: 100000,
    description: "VIEWS + WATCH TIME",
    active: true,
    logoUrl: ""
  }
];

export const DEFAULT_FAQS = [
  { q: "What is an SMM Panel?", a: "SMM Panel stands for Social Media Marketing Panel. It is an online automated platform that allows clients to buy real active social media services like followers, likes, views, subscribers, and web traffic at extremely affordable prices." },
  { q: "How long does it take for my order to start?", a: "Most orders begin processing automatically within 1 to 15 minutes of payment submission. Some high-volume or premium manual orders may take up to 1-2 hours depending on current queue load." },
  { q: "Is it safe to buy these services for my social accounts?", a: "Absolutely! We only use organic, natural-looking delivery mechanisms that comply completely with platform terms of service. Your accounts are 100% safe, and we never ask for your passwords or confidential details." },
  { q: "What is UPI Transaction ID/UTR and why is it needed?", a: "The Transaction ID or UTR is a unique 12-digit number generated by UPI apps (Google Pay, Paytm, PhonePe) after a successful transfer. We use this to verify your payment and automatically unlock your order in our system." },
  { q: "What should I do if my order is delayed?", a: "If your order doesn't start within the estimated timeframe, simply visit our Contact section and message us on WhatsApp or Telegram with your Order ID. Our customer support is available 24/7 to resolve any issues instantly." }
];
