import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, getDoc, query, orderBy, updateDoc, increment } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAd_tngqV5suv1JIU8FTA8v3eBu5Gftv3g",
  authDomain: "solitaire-plus-5aff9.firebaseapp.com",
  projectId: "solitaire-plus-5aff9",
  storageBucket: "solitaire-plus-5aff9.firebasestorage.app",
  messagingSenderId: "469029484830",
  appId: "1:469029484830:web:70a7e146445023c1ff310f",
  measurementId: "G-ERLY61FZBL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Analytics (only in browser)
let analytics = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Admin device IDs - add your device IDs here to auto-enable admin mode
const ADMIN_DEVICE_IDS = [
  'device_1770229306370_uker91d40',   // Zach's PC
  'device_1770230566740_dmf2f69zj'    // Zach's Pixel
];

// Generate or retrieve unique device ID
const getDeviceId = () => {
  let deviceId = localStorage.getItem('solitaire_deviceId');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('solitaire_deviceId', deviceId);
  }
  return deviceId;
};

// Check if current device is an admin
export const isAdminDevice = () => {
  const deviceId = getDeviceId();
  return ADMIN_DEVICE_IDS.includes(deviceId);
};

// Get current device ID (for adding to admin list)
export const getCurrentDeviceId = () => {
  return getDeviceId();
};

// Get device/browser info
const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  let platform = 'Unknown';
  let browser = 'Unknown';

  // Detect platform
  if (/iPhone|iPad|iPod/.test(ua)) platform = 'iOS';
  else if (/Android/.test(ua)) platform = 'Android';
  else if (/Windows/.test(ua)) platform = 'Windows';
  else if (/Mac/.test(ua)) platform = 'Mac';
  else if (/Linux/.test(ua)) platform = 'Linux';

  // Detect browser
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Edg/.test(ua)) browser = 'Edge';

  // Check if PWA
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true;

  return {
    platform,
    browser,
    isPWA,
    screenSize: `${window.screen.width}x${window.screen.height}`,
    userAgent: ua.substring(0, 200) // Truncate for storage
  };
};

// Track user/device on app load
export const trackUser = async (stats = {}) => {
  const deviceId = getDeviceId();
  const deviceInfo = getDeviceInfo();
  const userRef = doc(db, 'users', deviceId);

  try {
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Update existing user
      await updateDoc(userRef, {
        lastSeen: new Date().toISOString(),
        visits: increment(1),
        gamesPlayed: stats.gamesPlayed || 0,
        gamesWon: stats.gamesWon || 0,
        ...deviceInfo
      });
    } else {
      // New user
      await setDoc(userRef, {
        deviceId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        visits: 1,
        gamesPlayed: stats.gamesPlayed || 0,
        gamesWon: stats.gamesWon || 0,
        ...deviceInfo
      });
    }
    return { success: true, deviceId };
  } catch (error) {
    console.warn('Failed to track user:', error);
    return { success: false, error };
  }
};

// Update user stats periodically
export const updateUserStats = async (stats) => {
  const deviceId = getDeviceId();
  const userRef = doc(db, 'users', deviceId);

  try {
    await updateDoc(userRef, {
      lastSeen: new Date().toISOString(),
      gamesPlayed: stats.gamesPlayed || 0,
      gamesWon: stats.gamesWon || 0
    });
    return { success: true };
  } catch (error) {
    console.warn('Failed to update user stats:', error);
    return { success: false };
  }
};

// Submit a rating
export const submitRating = async (rating, message, playerName = '') => {
  const deviceId = getDeviceId();
  const deviceInfo = getDeviceInfo();

  const ratingData = {
    deviceId,
    playerName: playerName || 'Anonymous',
    rating,
    message: message || '',
    timestamp: new Date().toISOString(),
    ...deviceInfo
  };

  try {
    await addDoc(collection(db, 'ratings'), ratingData);
    return { success: true, source: 'firebase' };
  } catch (error) {
    console.warn('Failed to submit rating:', error);
    // Fallback to local storage
    const localRatings = JSON.parse(localStorage.getItem('solitaire_ratings') || '[]');
    localRatings.push(ratingData);
    localStorage.setItem('solitaire_ratings', JSON.stringify(localRatings));
    return { success: true, source: 'local' };
  }
};

// Get all ratings (admin only)
export const getAllRatings = async () => {
  try {
    const q = query(collection(db, 'ratings'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    const ratings = [];
    snapshot.forEach(doc => {
      ratings.push({ id: doc.id, ...doc.data() });
    });
    return ratings;
  } catch (error) {
    console.warn('Failed to fetch ratings:', error);
    // Fallback to local storage
    return JSON.parse(localStorage.getItem('solitaire_ratings') || '[]');
  }
};

// Get all users (admin only)
export const getAllUsers = async () => {
  try {
    const q = query(collection(db, 'users'), orderBy('lastSeen', 'desc'));
    const snapshot = await getDocs(q);
    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    return users;
  } catch (error) {
    console.warn('Failed to fetch users:', error);
    return [];
  }
};

// Get user stats summary (admin only)
export const getUserStats = async () => {
  try {
    const users = await getAllUsers();
    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    return {
      totalUsers: users.length,
      activeToday: users.filter(u => new Date(u.lastSeen) > dayAgo).length,
      activeThisWeek: users.filter(u => new Date(u.lastSeen) > weekAgo).length,
      pwaUsers: users.filter(u => u.isPWA).length,
      platforms: {
        iOS: users.filter(u => u.platform === 'iOS').length,
        Android: users.filter(u => u.platform === 'Android').length,
        Windows: users.filter(u => u.platform === 'Windows').length,
        Mac: users.filter(u => u.platform === 'Mac').length,
        Other: users.filter(u => !['iOS', 'Android', 'Windows', 'Mac'].includes(u.platform)).length
      },
      totalGamesPlayed: users.reduce((sum, u) => sum + (u.gamesPlayed || 0), 0),
      totalGamesWon: users.reduce((sum, u) => sum + (u.gamesWon || 0), 0)
    };
  } catch (error) {
    console.warn('Failed to get user stats:', error);
    return null;
  }
};

// Check if Firebase is properly configured
export const isFirebaseConfigured = () => {
  return db !== null;
};

export { db, analytics };
