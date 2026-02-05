import { useState, useEffect, useCallback, useRef } from 'react';
import { CARD_BACK_DESIGNS, getDesignById } from '../data/cardBackDesigns';
import { submitRating, getAllRatings, trackUser, updateUserStats, getUserStats, isAdminDevice, getCurrentDeviceId } from '../firebase';
import './Solitaire.css';

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Sound effects using Web Audio API
const createAudioContext = () => {
  if (typeof window !== 'undefined') {
    return new (window.AudioContext || window.webkitAudioContext)();
  }
  return null;
};

let audioContext = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = createAudioContext();
  }
  return audioContext;
};

// Card place sound (soft click/flop)
const playCardPlaceSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Short percussive sound like a card hitting the table
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(150, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05);

  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.08);
};

// Foundation jingle sound (casino-style)
const playFoundationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Play a quick ascending arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  const duration = 0.08;

  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

    const startTime = ctx.currentTime + i * duration;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration + 0.1);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.15);
  });
};

// Win fanfare sound
const playWinSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  // Celebratory fanfare
  const melody = [
    { freq: 523.25, time: 0, dur: 0.15 },      // C5
    { freq: 659.25, time: 0.15, dur: 0.15 },   // E5
    { freq: 783.99, time: 0.3, dur: 0.15 },    // G5
    { freq: 1046.50, time: 0.45, dur: 0.3 },   // C6
    { freq: 783.99, time: 0.8, dur: 0.1 },     // G5
    { freq: 1046.50, time: 0.95, dur: 0.5 },   // C6
  ];

  melody.forEach(({ freq, time, dur }) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

    const startTime = ctx.currentTime + time;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
    gainNode.gain.setValueAtTime(0.25, startTime + dur - 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + dur);

    oscillator.start(startTime);
    oscillator.stop(startTime + dur + 0.1);
  });
};

const createDeck = () => {
  const deck = [];
  for (const suit of SUITS) {
    for (let i = 0; i < RANKS.length; i++) {
      deck.push({
        suit,
        rank: RANKS[i],
        value: i + 1,
        color: SUIT_COLORS[suit],
        id: `${suit}-${RANKS[i]}`
      });
    }
  }
  return deck;
};

const shuffleDeck = (deck) => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const cloneGameState = (state) => ({
  tableau: state.tableau.map(pile => pile.map(card => ({ ...card }))),
  foundations: state.foundations.map(pile => pile.map(card => ({ ...card }))),
  stock: state.stock.map(card => ({ ...card })),
  waste: state.waste.map(card => ({ ...card })),
});

// Firework particle class
class Particle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.alpha = 1;
    this.decay = Math.random() * 0.02 + 0.015;
    this.size = Math.random() * 3 + 1;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1; // gravity
    this.alpha -= this.decay;
    return this.alpha > 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Data version for migrations (outside component for stability)
const DATA_VERSION = 2;

const Solitaire = ({ onSwitchGame }) => {
  const [tableau, setTableau] = useState([[], [], [], [], [], [], []]);
  const [foundations, setFoundations] = useState([[], [], [], []]);
  const [stock, setStock] = useState([]);
  const [waste, setWaste] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [moves, setMoves] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [history, setHistory] = useState([]);
  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('solitaire_stats');
    return saved ? JSON.parse(saved) : { gamesPlayed: 0, gamesWon: 0, bestMoves: null, bestTime: null };
  });
  const [drawCount, setDrawCount] = useState(() => {
    const saved = localStorage.getItem('solitaire_drawCount');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [cardBackDesign, setCardBackDesign] = useState(() => {
    const saved = localStorage.getItem('solitaire_cardBack');
    return saved || 'classic-navy';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('solitaire_sound');
    return saved !== 'false';
  });
  const [customBackImage, setCustomBackImage] = useState(() => {
    return localStorage.getItem('solitaire_customBack') || null;
  });
  const [customFaceImage, setCustomFaceImage] = useState(() => {
    return localStorage.getItem('solitaire_customFace') || null;
  });
  const [useCustomBack, setUseCustomBack] = useState(() => {
    return localStorage.getItem('solitaire_useCustomBack') === 'true';
  });
  const [useCustomFace, setUseCustomFace] = useState(() => {
    return localStorage.getItem('solitaire_useCustomFace') === 'true';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [dealingCards, setDealingCards] = useState(false);
  const [dealtCardCount, setDealtCardCount] = useState(0);

  // New feature states
  const [autoFoundation, setAutoFoundation] = useState(() => {
    return localStorage.getItem('solitaire_autoFoundation') === 'true';
  });
  const [largePrintMode, setLargePrintMode] = useState(() => {
    const saved = localStorage.getItem('solitaire_largePrint');
    return saved === null ? true : saved === 'true'; // Default to true
  });
  const [vegasMode, setVegasMode] = useState(() => {
    return localStorage.getItem('solitaire_vegasMode') === 'true';
  });
  const [score, setScore] = useState(-52); // Vegas mode: -$52 to start
  const [nostalgiaMode, setNostalgiaMode] = useState(() => {
    return localStorage.getItem('solitaire_nostalgia') === 'true';
  });
  const [zenMode, setZenMode] = useState(() => {
    return localStorage.getItem('solitaire_zenMode') === 'true';
  });
  const [timeBasedBacks, setTimeBasedBacks] = useState(() => {
    return localStorage.getItem('solitaire_timeBacks') === 'true';
  });
  const [winStreak, setWinStreak] = useState(() => {
    const saved = localStorage.getItem('solitaire_winStreak');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lastMoveInfo, setLastMoveInfo] = useState(null); // For undo visualization
  const [showHint, setShowHint] = useState(false);
  const [hintCard, setHintCard] = useState(null);
  const [achievements, setAchievements] = useState(() => {
    const saved = localStorage.getItem('solitaire_achievements');
    return saved ? JSON.parse(saved) : {
      firstWin: false,
      speedDemon: false,      // Win under 3 minutes
      perfectGame: false,     // Win with < 100 moves
      centurion: false,       // Play 100 games
      streakMaster: false,    // 5 win streak
      veteran: false,         // Play 500 games
      marathoner: false,      // Win 50 games
      grandmaster: false,     // Win 100 games
    };
  });
  const [showAchievement, setShowAchievement] = useState(null);
  const [isDailyChallenge, setIsDailyChallenge] = useState(false);
  const [dailySeed, setDailySeed] = useState(null);
  const [showDailyBanner, setShowDailyBanner] = useState(false);
  const [hasSeenDailyExplanation, setHasSeenDailyExplanation] = useState(() => {
    return localStorage.getItem('solitaire_seenDailyExplanation') === 'true';
  });

  // Optimization & Stability states
  const [showSplash, setShowSplash] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showRatings, setShowRatings] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingMessage, setRatingMessage] = useState('');
  const [allRatings, setAllRatings] = useState([]);
  const [allUserStats, setAllUserStats] = useState(null);
  const [hasRated, setHasRated] = useState(() => {
    return localStorage.getItem('solitaire_hasRated') === 'true';
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [lastWinningCard, setLastWinningCard] = useState(null);
  const [streakAnimating, setStreakAnimating] = useState(false);
  const [timeMilestones, setTimeMilestones] = useState({ 1: false, 5: false, 10: false });
  const [gameId, setGameId] = useState(() => Date.now()); // Unique ID per game for save/resume
  const [tooltip, setTooltip] = useState(null); // { text, x, y }

  // Install prompt for mobile users
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [devicePlatform, setDevicePlatform] = useState('unknown');

  // Challenge/Share Stats feature
  const [showChallengeCard, setShowChallengeCard] = useState(false);
  const [challengeStats, setChallengeStats] = useState(null);
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('solitaire_playerName') || '';
  });

  // Tooltip content for buttons, options, and achievements
  const TOOLTIPS = {
    // Buttons
    undo: "Undo your last move. No limit on undos!",
    hint: "Highlights a valid move. Prioritizes foundation moves over tableau moves.",
    daily: "Daily Challenge: Same card shuffle for everyone worldwide today! Compare scores with friends.",
    newGame: "Start a fresh game with a new random shuffle. Your current progress will be lost.",
    // Game Options
    vegas: "Vegas Mode: Start at -$52 (deck cost). Earn $5 per card moved to foundation. Try to finish with profit!",
    autoFoundation: "Auto-Foundation: Automatically moves obvious cards to foundation piles when safe.",
    largePrint: "Large Print: Makes cards and text bigger for easier reading.",
    timeBacks: "Time-of-Day Backs: Card backs change color based on the time of day.",
    nostalgia: "Nostalgia Mode: Adds a subtle vintage texture to cards for a classic feel.",
    zen: "Zen Mode: Pure relaxation! No timer, no move counter, no stats tracking. Just you and the cards.",
    // Achievements
    firstWin: "First Victory: Win your very first game of Solitaire Plus!",
    speedDemon: "Speed Demon: Win a game in under 3 minutes. Fast fingers!",
    perfectGame: "Perfect Game: Win with fewer than 100 moves. Pure efficiency!",
    centurion: "Centurion: Play 100 games. You're dedicated!",
    streakMaster: "Streak Master: Win 5 games in a row. On fire!",
    veteran: "Veteran: Play 500 games. A true solitaire fan!",
    marathoner: "Marathoner: Win 50 games total. Persistent winner!",
    grandmaster: "Grandmaster: Win 100 games. The ultimate achievement!"
  };

  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationFrameRef = useRef(null);
  const backImageInputRef = useRef(null);
  const faceImageInputRef = useRef(null);
  const gameContainerRef = useRef(null);
  const lastGameWonRef = useRef(true); // Track if last game was won (default true to not reset on first load)

  const currentDesign = getDesignById(cardBackDesign);
  const adminTapRef = useRef({ count: 0, lastTap: 0 });

  // Admin mode check - activated by URL param, whitelisted device, or tapping version 7 times
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'solitaireplus') {
      setIsAdmin(true);
      localStorage.setItem('solitaire_admin', 'true');
    } else if (localStorage.getItem('solitaire_admin') === 'true') {
      setIsAdmin(true);
    } else if (isAdminDevice()) {
      setIsAdmin(true);
      localStorage.setItem('solitaire_admin', 'true');
    }
  }, []);

  // Check if mobile user should see install prompt
  useEffect(() => {
    // Skip if already seen or already in PWA mode
    const hasSeenPrompt = localStorage.getItem('solitaire_seenInstallPrompt') === 'true';
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.navigator.standalone === true;

    if (hasSeenPrompt || isPWA) return;

    // Detect mobile platform
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    if (isIOS || isAndroid) {
      setDevicePlatform(isIOS ? 'ios' : 'android');
      // Show prompt after splash screen (3 second delay)
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    }
  }, []);

  // Check for shared challenge stats in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const challengeData = params.get('challenge');
    if (challengeData) {
      try {
        const decoded = JSON.parse(atob(challengeData));
        setChallengeStats(decoded);
        setShowChallengeCard(true);
        // Clean up URL without reloading
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {
        console.warn('Invalid challenge data');
      }
    }
  }, []);

  // Generate shareable challenge link
  const generateChallengeLink = () => {
    const data = {
      name: playerName || 'A friend',
      gamesPlayed: stats.gamesPlayed,
      gamesWon: stats.gamesWon,
      winRate: stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0,
      bestTime: stats.bestTime,
      bestMoves: stats.bestMoves,
      streak: winStreak,
      timestamp: Date.now()
    };
    const encoded = btoa(JSON.stringify(data));
    return `${window.location.origin}?challenge=${encoded}`;
  };

  // Share stats
  const handleShareStats = async () => {
    const link = generateChallengeLink();
    const name = playerName || 'I';
    const message = `🎴 ${name} ${name === 'I' ? 'have' : 'has'} won ${stats.gamesWon} games on Solitaire Plus! Can you beat ${name === 'I' ? 'me' : 'them'}?\n\n${link}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Solitaire Plus Challenge',
          text: message,
          url: link
        });
      } else {
        await navigator.clipboard.writeText(message);
        alert('Challenge link copied to clipboard!');
      }
    } catch (err) {
      // User cancelled or error
      console.log('Share cancelled');
    }
  };

  // Save player name
  const handleSavePlayerName = (name) => {
    setPlayerName(name);
    localStorage.setItem('solitaire_playerName', name);
  };

  // Handle admin tap (tap version 7 times to toggle admin)
  const handleVersionTap = () => {
    const now = Date.now();
    if (now - adminTapRef.current.lastTap < 500) {
      adminTapRef.current.count++;
      if (adminTapRef.current.count >= 7) {
        const newAdmin = !isAdmin;
        setIsAdmin(newAdmin);
        localStorage.setItem('solitaire_admin', newAdmin.toString());
        adminTapRef.current.count = 0;
        // Show confirmation
        alert(newAdmin ? '🔓 Admin mode enabled!' : '🔒 Admin mode disabled');
      }
    } else {
      adminTapRef.current.count = 1;
    }
    adminTapRef.current.lastTap = now;
  };

  // Share app functionality
  const handleShare = async () => {
    const shareData = {
      title: 'Solitaire Plus',
      text: 'Check out this beautiful Solitaire game!',
      url: window.location.origin
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(window.location.origin);
        alert('Link copied to clipboard!');
      }
    } catch (err) {
      console.log('Share failed:', err);
    }
  };

  // Submit rating
  const [showThankYou, setShowThankYou] = useState(false);

  const handleSubmitRating = async () => {
    if (ratingValue === 0) return;

    await submitRating(ratingValue, ratingMessage, playerName);
    setHasRated(true);
    localStorage.setItem('solitaire_hasRated', 'true');
    setShowRateModal(false);
    setRatingValue(0);
    setRatingMessage('');

    // Show thank you message
    setShowThankYou(true);
    setTimeout(() => setShowThankYou(false), 3000);
  };

  // Load all ratings and user stats (admin)
  const loadRatings = async () => {
    const ratings = await getAllRatings();
    const userStats = await getUserStats();
    setAllRatings(ratings);
    setAllUserStats(userStats);
    setShowRatings(true);
  };

  // Save preferences
  useEffect(() => {
    localStorage.setItem('solitaire_drawCount', drawCount.toString());
  }, [drawCount]);

  useEffect(() => {
    localStorage.setItem('solitaire_cardBack', cardBackDesign);
  }, [cardBackDesign]);

  useEffect(() => {
    localStorage.setItem('solitaire_sound', soundEnabled.toString());
  }, [soundEnabled]);

  useEffect(() => {
    if (customBackImage) {
      localStorage.setItem('solitaire_customBack', customBackImage);
    } else {
      localStorage.removeItem('solitaire_customBack');
    }
  }, [customBackImage]);

  useEffect(() => {
    if (customFaceImage) {
      localStorage.setItem('solitaire_customFace', customFaceImage);
    } else {
      localStorage.removeItem('solitaire_customFace');
    }
  }, [customFaceImage]);

  useEffect(() => {
    localStorage.setItem('solitaire_useCustomBack', useCustomBack.toString());
  }, [useCustomBack]);

  useEffect(() => {
    localStorage.setItem('solitaire_useCustomFace', useCustomFace.toString());
  }, [useCustomFace]);

  useEffect(() => {
    localStorage.setItem('solitaire_autoFoundation', autoFoundation.toString());
  }, [autoFoundation]);

  useEffect(() => {
    localStorage.setItem('solitaire_largePrint', largePrintMode.toString());
  }, [largePrintMode]);

  useEffect(() => {
    localStorage.setItem('solitaire_vegasMode', vegasMode.toString());
  }, [vegasMode]);

  useEffect(() => {
    localStorage.setItem('solitaire_nostalgia', nostalgiaMode.toString());
  }, [nostalgiaMode]);

  useEffect(() => {
    localStorage.setItem('solitaire_zenMode', zenMode.toString());
  }, [zenMode]);

  useEffect(() => {
    localStorage.setItem('solitaire_timeBacks', timeBasedBacks.toString());
  }, [timeBasedBacks]);

  useEffect(() => {
    localStorage.setItem('solitaire_winStreak', winStreak.toString());
  }, [winStreak]);

  useEffect(() => {
    localStorage.setItem('solitaire_achievements', JSON.stringify(achievements));
  }, [achievements]);

  // Detect reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Splash screen timeout
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), reducedMotion ? 500 : 1500);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  // Win streak animation trigger
  useEffect(() => {
    if (winStreak > 1) {
      setStreakAnimating(true);
      const timer = setTimeout(() => setStreakAnimating(false), 600);
      return () => clearTimeout(timer);
    }
  }, [winStreak]);

  // Get time-based card back design
  const getTimeBasedDesign = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'sunset-orange';      // Dawn
    if (hour >= 8 && hour < 12) return 'ocean-blue';        // Morning
    if (hour >= 12 && hour < 17) return 'emerald-green';    // Afternoon
    if (hour >= 17 && hour < 20) return 'rose-gold';        // Evening
    if (hour >= 20 && hour < 23) return 'royal-purple';     // Night
    return 'midnight-black';                                 // Late night
  };

  // Seeded random for daily challenge
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const shuffleDeckWithSeed = (deck, seed) => {
    const shuffled = [...deck];
    let currentSeed = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      const j = Math.floor((currentSeed / 233280) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Get today's seed for daily challenge
  const getTodaySeed = () => {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  };

  // Find a hint (valid move)
  const findHint = useCallback(() => {
    // Check waste pile first
    if (waste.length > 0) {
      const card = waste[waste.length - 1];
      // Check foundations
      for (let i = 0; i < 4; i++) {
        if (canPlaceOnFoundation(card, foundations[i])) {
          return { source: 'waste', card, target: 'foundation', targetIndex: i };
        }
      }
      // Check tableau
      for (let i = 0; i < 7; i++) {
        if (canPlaceOnTableau(card, tableau[i])) {
          return { source: 'waste', card, target: 'tableau', targetIndex: i };
        }
      }
    }

    // Check tableau piles
    for (let pileIdx = 0; pileIdx < 7; pileIdx++) {
      const pile = tableau[pileIdx];
      if (pile.length === 0) continue;

      // Check top card for foundation
      const topCard = pile[pile.length - 1];
      if (topCard.faceUp) {
        for (let i = 0; i < 4; i++) {
          if (canPlaceOnFoundation(topCard, foundations[i])) {
            return { source: 'tableau', pileIndex: pileIdx, cardIndex: pile.length - 1, card: topCard, target: 'foundation', targetIndex: i };
          }
        }
      }

      // Check face-up cards for tableau moves
      for (let cardIdx = 0; cardIdx < pile.length; cardIdx++) {
        const card = pile[cardIdx];
        if (!card.faceUp) continue;

        for (let targetPile = 0; targetPile < 7; targetPile++) {
          if (targetPile === pileIdx) continue;
          if (canPlaceOnTableau(card, tableau[targetPile])) {
            // Don't suggest moving a King to an empty pile from another pile unless it reveals a card
            if (card.rank === 'K' && tableau[targetPile].length === 0 && cardIdx === 0) continue;
            return { source: 'tableau', pileIndex: pileIdx, cardIndex: cardIdx, card, target: 'tableau', targetIndex: targetPile };
          }
        }
      }
    }

    return null;
  }, [waste, tableau, foundations]);

  // Auto-foundation: move obvious cards up
  const autoMoveToFoundation = useCallback(() => {
    if (!autoFoundation) return false;

    // Find the minimum value in foundations (to avoid moving cards that might be needed)
    const minFoundationValue = Math.min(...foundations.map(f => f.length > 0 ? f[f.length - 1].value : 0));

    // Only auto-move if card value is at most minFoundationValue + 2
    const canAutoMove = (card) => {
      return card.value <= minFoundationValue + 2;
    };

    // Check waste
    if (waste.length > 0) {
      const card = waste[waste.length - 1];
      if (canAutoMove(card) || card.rank === 'A') {
        for (let i = 0; i < 4; i++) {
          if (canPlaceOnFoundation(card, foundations[i])) {
            return { source: 'waste', foundationIndex: i, card };
          }
        }
      }
    }

    // Check tableau
    for (let pileIdx = 0; pileIdx < 7; pileIdx++) {
      const pile = tableau[pileIdx];
      if (pile.length === 0) continue;
      const card = pile[pile.length - 1];
      if (!card.faceUp) continue;

      if (canAutoMove(card) || card.rank === 'A') {
        for (let i = 0; i < 4; i++) {
          if (canPlaceOnFoundation(card, foundations[i])) {
            return { source: 'tableau', pileIndex: pileIdx, foundationIndex: i, card };
          }
        }
      }
    }

    return null;
  }, [autoFoundation, waste, tableau, foundations]);

  // Check and unlock achievements
  // isWin: true when player just won, false when just tracking games played
  const checkAchievements = useCallback((newStats, newStreak, gameTime, gameMoves, isWin = false) => {
    const newAchievements = { ...achievements };
    let unlocked = null;

    // Win-based achievements (only check when player actually won a real game)
    // Require minimum thresholds to prevent false triggers
    const isRealGame = gameTime >= 30 && gameMoves >= 20; // Must have played at least 30 seconds and 20 moves

    if (isWin && isRealGame) {
      if (!achievements.firstWin && newStats.gamesWon >= 1) {
        newAchievements.firstWin = true;
        unlocked = { id: 'firstWin', name: 'First Victory', icon: '🏆' };
      }
      // Speed Demon: Win in under 3 minutes (180 seconds) but at least 30 seconds (real game)
      if (!achievements.speedDemon && gameTime >= 30 && gameTime < 180) {
        newAchievements.speedDemon = true;
        unlocked = { id: 'speedDemon', name: 'Speed Demon', icon: '⚡' };
      }
      // Perfect Game: Win with fewer than 100 moves but at least 20 (real game)
      if (!achievements.perfectGame && gameMoves >= 20 && gameMoves < 100) {
        newAchievements.perfectGame = true;
        unlocked = { id: 'perfectGame', name: 'Perfect Game', icon: '💎' };
      }
      // Streak Master: 5 wins in a row
      if (!achievements.streakMaster && newStreak >= 5) {
        newAchievements.streakMaster = true;
        unlocked = { id: 'streakMaster', name: 'Streak Master', icon: '🔥' };
      }
      // Marathoner: Win 50 games total
      if (!achievements.marathoner && newStats.gamesWon >= 50) {
        newAchievements.marathoner = true;
        unlocked = { id: 'marathoner', name: 'Marathoner', icon: '🏃' };
      }
      // Grandmaster: Win 100 games total
      if (!achievements.grandmaster && newStats.gamesWon >= 100) {
        newAchievements.grandmaster = true;
        unlocked = { id: 'grandmaster', name: 'Grandmaster', icon: '👑' };
      }
    }

    // Games played achievements (check anytime)
    if (!achievements.centurion && newStats.gamesPlayed >= 100) {
      newAchievements.centurion = true;
      unlocked = { id: 'centurion', name: 'Centurion', icon: '💯' };
    }
    if (!achievements.veteran && newStats.gamesPlayed >= 500) {
      newAchievements.veteran = true;
      unlocked = { id: 'veteran', name: 'Veteran', icon: '⭐' };
    }

    if (JSON.stringify(newAchievements) !== JSON.stringify(achievements)) {
      setAchievements(newAchievements);
    }

    return unlocked;
  }, [achievements]);

  // Victory screenshot
  const takeScreenshot = useCallback(async () => {
    if (!gameContainerRef.current) return;

    try {
      // Create a canvas from the game container
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const container = gameContainerRef.current;

      canvas.width = container.offsetWidth * 2;
      canvas.height = container.offsetHeight * 2;
      ctx.scale(2, 2);

      // Draw background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, container.offsetWidth, container.offsetHeight);

      // Draw victory text
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🏆 SOLITAIRE VICTORY! 🏆', container.offsetWidth / 2, 60);

      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.fillText(`Moves: ${moves}  •  Time: ${formatTime(timer)}`, container.offsetWidth / 2, 100);

      if (winStreak > 1) {
        ctx.fillStyle = '#ff6600';
        ctx.fillText(`🔥 ${winStreak} Win Streak! 🔥`, container.offsetWidth / 2, 140);
      }

      ctx.fillStyle = '#a855f7';
      ctx.font = '16px Arial';
      ctx.fillText('Solitaire Plus', container.offsetWidth / 2, container.offsetHeight - 20);

      // Convert to blob and share/download
      canvas.toBlob((blob) => {
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], 'solitaire-victory.png', { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({
              files: [file],
              title: 'Solitaire Victory!',
              text: `I won Solitaire in ${moves} moves and ${formatTime(timer)}!`
            }).catch(() => {
              // Fallback to download
              downloadScreenshot(blob);
            });
            return;
          }
        }
        downloadScreenshot(blob);
      }, 'image/png');
    } catch (err) {
      console.error('Screenshot failed:', err);
    }
  }, [moves, timer, winStreak]);

  const downloadScreenshot = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solitaire-victory-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-save game state (compressed format)
  const saveGameState = useCallback(() => {
    if (gameWon || !isPlaying) return;

    const gameState = {
      v: DATA_VERSION,
      id: gameId,
      t: tableau.map(p => p.map(c => ({ s: c.suit, r: c.rank, f: c.faceUp ? 1 : 0 }))),
      f: foundations.map(p => p.map(c => ({ s: c.suit, r: c.rank }))),
      st: stock.map(c => ({ s: c.suit, r: c.rank })),
      w: waste.map(c => ({ s: c.suit, r: c.rank })),
      m: moves,
      tm: timer,
      sc: score,
      dc: drawCount,
      daily: isDailyChallenge ? dailySeed : null
    };
    localStorage.setItem('solitaire_savedGame', JSON.stringify(gameState));
  }, [gameWon, isPlaying, gameId, tableau, foundations, stock, waste, moves, timer, score, drawCount, isDailyChallenge, dailySeed, DATA_VERSION]);

  // Restore card from compressed format
  const restoreCard = (c, faceUp = true) => ({
    suit: c.s,
    rank: c.r,
    value: RANKS.indexOf(c.r) + 1,
    color: SUIT_COLORS[c.s],
    id: `${c.s}-${c.r}`,
    faceUp: c.f !== undefined ? c.f === 1 : faceUp
  });

  // Resume saved game
  const resumeSavedGame = useCallback(() => {
    const saved = localStorage.getItem('solitaire_savedGame');
    if (!saved) return false;

    try {
      const gs = JSON.parse(saved);
      if (gs.v !== DATA_VERSION) {
        localStorage.removeItem('solitaire_savedGame');
        return false;
      }

      setTableau(gs.t.map(p => p.map(c => restoreCard(c, c.f === 1))));
      setFoundations(gs.f.map(p => p.map(c => restoreCard(c, true))));
      setStock(gs.st.map(c => restoreCard(c, false)));
      setWaste(gs.w.map(c => restoreCard(c, true)));
      setMoves(gs.m);
      setTimer(gs.tm);
      setScore(gs.sc || -52);
      setDrawCount(gs.dc);
      setGameId(gs.id);
      setIsDailyChallenge(!!gs.daily);
      setDailySeed(gs.daily);
      setIsPlaying(true);
      setGameWon(false);

      return true;
    } catch (e) {
      console.error('Failed to resume game:', e);
      localStorage.removeItem('solitaire_savedGame');
      return false;
    }
  }, [DATA_VERSION]);

  // Clear saved game
  const clearSavedGame = () => {
    localStorage.removeItem('solitaire_savedGame');
  };

  // Long-press handler for tooltips (buttons)
  const longPressTimerRef = useRef(null);

  const handleLongPressStart = (tooltipKey, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    longPressTimerRef.current = setTimeout(() => {
      setTooltip({
        text: TOOLTIPS[tooltipKey],
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      });
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setTooltip(null);
  };

  // Show info tooltip when clicking the info button
  const showOptionInfo = (tooltipKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      text: TOOLTIPS[tooltipKey],
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setTimeout(() => setTooltip(null), 5000);
  };

  // Export all data as JSON
  const exportData = () => {
    const data = {
      version: DATA_VERSION,
      exportDate: new Date().toISOString(),
      stats: stats,
      achievements: achievements,
      winStreak: winStreak,
      preferences: {
        drawCount,
        cardBackDesign,
        soundEnabled,
        autoFoundation,
        largePrintMode,
        vegasMode,
        nostalgiaMode,
        timeBasedBacks
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solitaire-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import data from JSON file
  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result);
        if (data.stats) {
          setStats(data.stats);
          localStorage.setItem('solitaire_stats', JSON.stringify(data.stats));
        }
        if (data.achievements) {
          setAchievements(data.achievements);
          localStorage.setItem('solitaire_achievements', JSON.stringify(data.achievements));
        }
        if (data.winStreak !== undefined) {
          setWinStreak(data.winStreak);
        }
        if (data.preferences) {
          const p = data.preferences;
          if (p.drawCount) setDrawCount(p.drawCount);
          if (p.cardBackDesign) setCardBackDesign(p.cardBackDesign);
          if (p.soundEnabled !== undefined) setSoundEnabled(p.soundEnabled);
          if (p.autoFoundation !== undefined) setAutoFoundation(p.autoFoundation);
          if (p.largePrintMode !== undefined) setLargePrintMode(p.largePrintMode);
          if (p.vegasMode !== undefined) setVegasMode(p.vegasMode);
          if (p.nostalgiaMode !== undefined) setNostalgiaMode(p.nostalgiaMode);
          if (p.timeBasedBacks !== undefined) setTimeBasedBacks(p.timeBasedBacks);
        }
        alert('Data imported successfully!');
      } catch (err) {
        alert('Failed to import data. Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

  // Time milestone sound (gentle ping)
  const playMilestoneSound = useCallback(() => {
    if (!soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }, [soundEnabled]);

  // Auto-save game state on every significant change (placed after saveGameState is defined)
  useEffect(() => {
    if (!isPlaying || gameWon || dealingCards) return;
    const timeout = setTimeout(() => saveGameState(), 500);
    return () => clearTimeout(timeout);
  }, [tableau, foundations, stock, waste, moves, isPlaying, gameWon, dealingCards, saveGameState]);

  // Time milestone pings (placed after playMilestoneSound is defined)
  useEffect(() => {
    if (!isPlaying || gameWon) return;

    const minutes = Math.floor(timer / 60);
    if (minutes === 1 && !timeMilestones[1]) {
      setTimeMilestones(prev => ({ ...prev, 1: true }));
      playMilestoneSound();
    } else if (minutes === 5 && !timeMilestones[5]) {
      setTimeMilestones(prev => ({ ...prev, 5: true }));
      playMilestoneSound();
    } else if (minutes === 10 && !timeMilestones[10]) {
      setTimeMilestones(prev => ({ ...prev, 10: true }));
      playMilestoneSound();
    }
  }, [timer, isPlaying, gameWon, timeMilestones, playMilestoneSound]);

  // Handle image upload for card back
  const handleBackImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setCustomBackImage(base64);
        setUseCustomBack(true);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle image upload for card face
  const handleFaceImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setCustomFaceImage(base64);
        setUseCustomFace(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeCustomBack = () => {
    setCustomBackImage(null);
    setUseCustomBack(false);
    if (backImageInputRef.current) {
      backImageInputRef.current.value = '';
    }
  };

  const removeCustomFace = () => {
    setCustomFaceImage(null);
    setUseCustomFace(false);
    if (faceImageInputRef.current) {
      faceImageInputRef.current.value = '';
    }
  };

  // Timer effect
  useEffect(() => {
    let interval;
    if (isPlaying && !gameWon) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameWon]);

  // Fireworks animation
  const launchFirework = useCallback((canvas) => {
    const colors = ['#ff0000', '#ffd700', '#00ff00', '#00ffff', '#ff00ff', '#ff6600', '#ffffff'];
    const x = Math.random() * canvas.width;
    const y = Math.random() * (canvas.height * 0.5) + 50;
    const color = colors[Math.floor(Math.random() * colors.length)];

    for (let i = 0; i < 50; i++) {
      particlesRef.current.push(new Particle(x, y, color));
    }
  }, []);

  const animateFireworks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particlesRef.current = particlesRef.current.filter(p => {
      p.draw(ctx);
      return p.update();
    });

    if (gameWon) {
      if (Math.random() < 0.08) {
        launchFirework(canvas);
      }
      animationFrameRef.current = requestAnimationFrame(animateFireworks);
    }
  }, [gameWon, launchFirework]);

  useEffect(() => {
    if (gameWon && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particlesRef.current = [];

      // Play win sound
      if (soundEnabled) {
        playWinSound();
      }

      // Initial burst
      for (let i = 0; i < 5; i++) {
        setTimeout(() => launchFirework(canvas), i * 200);
      }

      animateFireworks();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameWon, animateFireworks, launchFirework, soundEnabled]);

  const saveToHistory = useCallback(() => {
    const currentState = cloneGameState({ tableau, foundations, stock, waste });
    setHistory(prev => [...prev, currentState]);
  }, [tableau, foundations, stock, waste]);

  const initGame = useCallback((daily = false) => {
    // Clear any saved game state
    clearSavedGame();
    setGameId(Date.now());
    setTimeMilestones({ 1: false, 5: false, 10: false });
    setLastWinningCard(null);

    setDealingCards(true);
    setDealtCardCount(0);
    setIsDailyChallenge(daily);
    setLastMoveInfo(null);
    setShowHint(false);
    setHintCard(null);

    // Show daily challenge banner
    if (daily) {
      setShowDailyBanner(true);
      setTimeout(() => setShowDailyBanner(false), hasSeenDailyExplanation ? 2000 : 5000);
      if (!hasSeenDailyExplanation) {
        setHasSeenDailyExplanation(true);
        localStorage.setItem('solitaire_seenDailyExplanation', 'true');
      }
    }

    // Use seeded random for daily challenge, regular shuffle otherwise
    let deck;
    if (daily) {
      const seed = getTodaySeed();
      setDailySeed(seed);
      deck = shuffleDeckWithSeed(createDeck(), seed);
    } else {
      setDailySeed(null);
      deck = shuffleDeck(createDeck());
    }

    // Start with empty tableau - we'll animate cards in
    const emptyTableau = [[], [], [], [], [], [], []];

    setTableau(emptyTableau);
    setFoundations([[], [], [], []]);
    setStock([]);
    setWaste([]);
    setSelectedCard(null);
    setMoves(0);
    setGameWon(false);
    setHistory([]);
    setTimer(0);
    setIsPlaying(true);
    setScore(-52); // Vegas mode reset
    particlesRef.current = [];

    // Reset streak if last game was not won (only in non-Zen mode)
    if (!zenMode && !lastGameWonRef.current) {
      setWinStreak(0);
      localStorage.setItem('solitaire_winStreak', '0');
    }
    // Mark new game as not won yet
    lastGameWonRef.current = false;

    // Update games played (skip in Zen mode)
    if (!zenMode) {
      setStats(prev => {
        const newStats = { ...prev, gamesPlayed: prev.gamesPlayed + 1 };
        localStorage.setItem('solitaire_stats', JSON.stringify(newStats));
        // Check centurion/veteran achievements
        checkAchievements(newStats, winStreak, 0, 0);
        return newStats;
      });
    }

    // Animate dealing - deal cards one at a time like real dealing
    const dealOrder = [];
    for (let round = 0; round < 7; round++) {
      for (let col = round; col < 7; col++) {
        dealOrder.push({ col, isLastInCol: col === round });
      }
    }

    let currentIndex = 0;
    const newTableau = [[], [], [], [], [], [], []];
    let deckIndex = 0;

    const dealNextCard = () => {
      if (currentIndex >= dealOrder.length) {
        // Dealing complete, set up stock
        const newStock = deck.slice(deckIndex).map(card => ({ ...card, faceUp: false }));
        setStock(newStock);
        setDealingCards(false);
        return;
      }

      const { col, isLastInCol } = dealOrder[currentIndex];
      const card = { ...deck[deckIndex], faceUp: isLastInCol };
      newTableau[col] = [...newTableau[col], card];

      setTableau([...newTableau.map(pile => [...pile])]);
      setDealtCardCount(currentIndex + 1);

      deckIndex++;
      currentIndex++;

      setTimeout(dealNextCard, 40); // 40ms between cards for quick realistic dealing
    };

    setTimeout(dealNextCard, 100);
  }, [checkAchievements, winStreak]);

  // Nuclear reset - clear everything (defined after initGame to avoid reference error)
  const resetAllData = () => {
    const keys = [
      'solitaire_stats', 'solitaire_achievements', 'solitaire_winStreak',
      'solitaire_drawCount', 'solitaire_cardBack', 'solitaire_sound',
      'solitaire_customBack', 'solitaire_customFace', 'solitaire_useCustomBack',
      'solitaire_useCustomFace', 'solitaire_autoFoundation', 'solitaire_largePrint',
      'solitaire_vegasMode', 'solitaire_nostalgia', 'solitaire_timeBacks',
      'solitaire_savedGame', 'solitaire_zenMode'
    ];
    keys.forEach(key => localStorage.removeItem(key));

    // Reset all state
    setStats({ gamesPlayed: 0, gamesWon: 0, bestMoves: null, bestTime: null });
    setAchievements({
      firstWin: false, speedDemon: false, perfectGame: false, centurion: false,
      streakMaster: false, veteran: false, marathoner: false, grandmaster: false
    });
    setWinStreak(0);
    setDrawCount(1);
    setCardBackDesign('classic-navy');
    setSoundEnabled(true);
    setCustomBackImage(null);
    setCustomFaceImage(null);
    setUseCustomBack(false);
    setUseCustomFace(false);
    setAutoFoundation(false);
    setLargePrintMode(false);
    setVegasMode(false);
    setNostalgiaMode(false);
    setZenMode(false);
    setTimeBasedBacks(false);
    setShowResetConfirm(false);

    // Start fresh game
    initGame(false);
  };

  // Resume saved game or start new on mount
  useEffect(() => {
    const resumed = resumeSavedGame();
    if (!resumed) {
      initGame();
    }
  }, []);

  // Track user on app load
  useEffect(() => {
    trackUser(stats);
  }, []);

  // Update user stats when games change
  useEffect(() => {
    if (stats.gamesPlayed > 0) {
      updateUserStats(stats);
    }
  }, [stats.gamesPlayed, stats.gamesWon]);

  // Check for win
  useEffect(() => {
    const totalInFoundations = foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalInFoundations === 52 && !gameWon) {
      setGameWon(true);
      clearSavedGame();

      // Find and set the last winning card (any King)
      for (const f of foundations) {
        if (f.length === 13) {
          setLastWinningCard(f[12].id);
          break;
        }
      }

      // Mark this game as won (for streak tracking)
      lastGameWonRef.current = true;

      // Update win streak and stats (skip in Zen mode)
      if (!zenMode) {
        const newStreak = winStreak + 1;
        setWinStreak(newStreak);

        setStats(prev => {
          const newStats = {
            ...prev,
            gamesWon: prev.gamesWon + 1,
            bestMoves: prev.bestMoves === null ? moves : Math.min(prev.bestMoves, moves),
            bestTime: prev.bestTime === null ? timer : Math.min(prev.bestTime, timer),
          };
          localStorage.setItem('solitaire_stats', JSON.stringify(newStats));

          // Check achievements (isWin=true since player just won)
          const unlocked = checkAchievements(newStats, newStreak, timer, moves, true);
          if (unlocked) {
            setTimeout(() => setShowAchievement(unlocked), 1500);
            setTimeout(() => setShowAchievement(null), 5000);
          }

          return newStats;
        });
      }
    }
  }, [foundations, moves, timer, gameWon, winStreak, zenMode, checkAchievements]);


  // Auto-foundation effect
  useEffect(() => {
    if (!autoFoundation || dealingCards || gameWon) return;

    const autoMove = autoMoveToFoundation();
    if (autoMove) {
      const timeout = setTimeout(() => {
        saveToHistory();
        const newFoundations = [...foundations];
        newFoundations[autoMove.foundationIndex] = [...foundations[autoMove.foundationIndex], autoMove.card];
        setFoundations(newFoundations);

        if (autoMove.source === 'waste') {
          setWaste(waste.slice(0, -1));
        } else {
          const newTableau = [...tableau];
          newTableau[autoMove.pileIndex] = tableau[autoMove.pileIndex].slice(0, -1);
          // Flip card if needed
          if (newTableau[autoMove.pileIndex].length > 0) {
            const lastCard = newTableau[autoMove.pileIndex][newTableau[autoMove.pileIndex].length - 1];
            if (!lastCard.faceUp) {
              newTableau[autoMove.pileIndex][newTableau[autoMove.pileIndex].length - 1] = { ...lastCard, faceUp: true };
            }
          }
          setTableau(newTableau);
        }

        setMoves(m => m + 1);
        if (vegasMode) setScore(s => s + 5);
        if (soundEnabled) playFoundationSound();
      }, 300);

      return () => clearTimeout(timeout);
    }
  }, [autoFoundation, autoMoveToFoundation, dealingCards, gameWon, foundations, waste, tableau, vegasMode, soundEnabled, saveToHistory]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];

    // Store info for undo visualization (show ghost of where card was)
    setLastMoveInfo({
      tableau: tableau,
      foundations: foundations,
      timestamp: Date.now()
    });

    // Clear after 2 seconds
    setTimeout(() => setLastMoveInfo(null), 2000);

    setTableau(previousState.tableau);
    setFoundations(previousState.foundations);
    setStock(previousState.stock);
    setWaste(previousState.waste);
    setHistory(prev => prev.slice(0, -1));
    setMoves(m => Math.max(0, m - 1));
    setSelectedCard(null);
  };

  // Handle hint request
  const handleHint = () => {
    const hint = findHint();
    if (hint) {
      setHintCard(hint);
      setShowHint(true);
      setTimeout(() => {
        setShowHint(false);
        setHintCard(null);
      }, 3000);
    }
  };

  const drawFromStock = () => {
    saveToHistory();
    if (stock.length === 0) {
      if (waste.length > 0) {
        setStock(waste.map(card => ({ ...card, faceUp: false })).reverse());
        setWaste([]);
        setMoves(m => m + 1);
      }
      return;
    }

    // Draw 1 or 3 cards based on setting
    const cardsToDraw = Math.min(drawCount, stock.length);
    const drawnCards = stock.slice(-cardsToDraw).map(card => ({ ...card, faceUp: true }));

    setStock(stock.slice(0, -cardsToDraw));
    setWaste([...waste, ...drawnCards]);
    setSelectedCard(null);
    setMoves(m => m + 1);

    if (soundEnabled) playCardPlaceSound();
  };

  const canPlaceOnTableau = (card, targetPile) => {
    if (targetPile.length === 0) return card.rank === 'K';
    const topCard = targetPile[targetPile.length - 1];
    if (!topCard.faceUp) return false;
    return card.color !== topCard.color && card.value === topCard.value - 1;
  };

  const canPlaceOnFoundation = (card, foundationPile) => {
    if (foundationPile.length === 0) return card.rank === 'A';
    const topCard = foundationPile[foundationPile.length - 1];
    return card.suit === topCard.suit && card.value === topCard.value + 1;
  };

  const handleCardClick = (source, pileIndex, cardIndex) => {
    if (selectedCard && selectedCard.source === source &&
        selectedCard.pileIndex === pileIndex && selectedCard.cardIndex === cardIndex) {
      setSelectedCard(null);
      return;
    }

    if (selectedCard) {
      let moved = false;
      let toFoundation = false;

      if (source === 'tableau') {
        const targetPile = tableau[pileIndex];
        if (selectedCard.source === 'waste') {
          const card = waste[waste.length - 1];
          if (canPlaceOnTableau(card, targetPile)) {
            saveToHistory();
            const newTableau = [...tableau];
            newTableau[pileIndex] = [...targetPile, card];
            setTableau(newTableau);
            setWaste(waste.slice(0, -1));
            moved = true;
          }
        } else if (selectedCard.source === 'tableau') {
          const sourcePile = tableau[selectedCard.pileIndex];
          const cardsToMove = sourcePile.slice(selectedCard.cardIndex);
          if (canPlaceOnTableau(cardsToMove[0], targetPile)) {
            saveToHistory();
            const newTableau = [...tableau];
            newTableau[selectedCard.pileIndex] = sourcePile.slice(0, selectedCard.cardIndex);
            newTableau[pileIndex] = [...targetPile, ...cardsToMove];
            if (newTableau[selectedCard.pileIndex].length > 0) {
              const lastCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
              if (!lastCard.faceUp) {
                newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...lastCard, faceUp: true };
              }
            }
            setTableau(newTableau);
            moved = true;
          }
        } else if (selectedCard.source === 'foundation') {
          const sourceFoundation = foundations[selectedCard.pileIndex];
          const card = sourceFoundation[sourceFoundation.length - 1];
          if (canPlaceOnTableau(card, targetPile)) {
            saveToHistory();
            const newFoundations = [...foundations];
            newFoundations[selectedCard.pileIndex] = sourceFoundation.slice(0, -1);
            const newTableau = [...tableau];
            newTableau[pileIndex] = [...targetPile, card];
            setFoundations(newFoundations);
            setTableau(newTableau);
            moved = true;
          }
        }
      } else if (source === 'foundation') {
        const targetFoundation = foundations[pileIndex];
        if (selectedCard.source === 'waste') {
          const card = waste[waste.length - 1];
          if (canPlaceOnFoundation(card, targetFoundation)) {
            saveToHistory();
            const newFoundations = [...foundations];
            newFoundations[pileIndex] = [...targetFoundation, card];
            setFoundations(newFoundations);
            setWaste(waste.slice(0, -1));
            moved = true;
            toFoundation = true;
          }
        } else if (selectedCard.source === 'tableau' &&
                   selectedCard.cardIndex === tableau[selectedCard.pileIndex].length - 1) {
          const card = tableau[selectedCard.pileIndex][selectedCard.cardIndex];
          if (canPlaceOnFoundation(card, targetFoundation)) {
            saveToHistory();
            const newFoundations = [...foundations];
            newFoundations[pileIndex] = [...targetFoundation, card];
            setFoundations(newFoundations);
            const newTableau = [...tableau];
            newTableau[selectedCard.pileIndex] = tableau[selectedCard.pileIndex].slice(0, -1);
            if (newTableau[selectedCard.pileIndex].length > 0) {
              const lastCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
              if (!lastCard.faceUp) {
                newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...lastCard, faceUp: true };
              }
            }
            setTableau(newTableau);
            moved = true;
            toFoundation = true;
          }
        }
      }

      if (moved) {
        setMoves(m => m + 1);
        if (soundEnabled) {
          if (toFoundation) {
            playFoundationSound();
          } else {
            playCardPlaceSound();
          }
        }
      }
      setSelectedCard(null);
      return;
    }

    // Select card
    if (source === 'waste' && waste.length > 0) {
      setSelectedCard({ source: 'waste', pileIndex: null, cardIndex: waste.length - 1 });
    } else if (source === 'tableau') {
      const pile = tableau[pileIndex];
      if (cardIndex >= 0 && pile[cardIndex]?.faceUp) {
        setSelectedCard({ source: 'tableau', pileIndex, cardIndex });
      }
    } else if (source === 'foundation') {
      const pile = foundations[pileIndex];
      if (pile.length > 0) {
        setSelectedCard({ source: 'foundation', pileIndex, cardIndex: pile.length - 1 });
      }
    }
  };

  const handleEmptyClick = (type, index) => {
    if (!selectedCard) return;

    let moved = false;
    let toFoundation = false;

    if (type === 'tableau') {
      let card, isValid = false;
      if (selectedCard.source === 'waste') {
        card = waste[waste.length - 1];
        isValid = card.rank === 'K';
      } else if (selectedCard.source === 'tableau') {
        card = tableau[selectedCard.pileIndex][selectedCard.cardIndex];
        isValid = card.rank === 'K';
      }

      if (isValid) {
        saveToHistory();
        const newTableau = [...tableau];
        if (selectedCard.source === 'waste') {
          newTableau[index] = [card];
          setWaste(waste.slice(0, -1));
        } else {
          const cardsToMove = tableau[selectedCard.pileIndex].slice(selectedCard.cardIndex);
          newTableau[selectedCard.pileIndex] = tableau[selectedCard.pileIndex].slice(0, selectedCard.cardIndex);
          newTableau[index] = cardsToMove;
          if (newTableau[selectedCard.pileIndex].length > 0) {
            const lastCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
            if (!lastCard.faceUp) {
              newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...lastCard, faceUp: true };
            }
          }
        }
        setTableau(newTableau);
        setMoves(m => m + 1);
        moved = true;
      }
    } else if (type === 'foundation') {
      let card;
      if (selectedCard.source === 'waste') {
        card = waste[waste.length - 1];
      } else if (selectedCard.source === 'tableau' &&
                 selectedCard.cardIndex === tableau[selectedCard.pileIndex].length - 1) {
        card = tableau[selectedCard.pileIndex][selectedCard.cardIndex];
      }

      if (card && card.rank === 'A') {
        saveToHistory();
        const newFoundations = [...foundations];
        newFoundations[index] = [card];
        setFoundations(newFoundations);
        if (selectedCard.source === 'waste') {
          setWaste(waste.slice(0, -1));
        } else {
          const newTableau = [...tableau];
          newTableau[selectedCard.pileIndex] = tableau[selectedCard.pileIndex].slice(0, -1);
          if (newTableau[selectedCard.pileIndex].length > 0) {
            const lastCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
            if (!lastCard.faceUp) {
              newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...lastCard, faceUp: true };
            }
          }
          setTableau(newTableau);
        }
        setMoves(m => m + 1);
        moved = true;
        toFoundation = true;
      }
    }

    if (moved && soundEnabled) {
      if (toFoundation) {
        playFoundationSound();
      } else {
        playCardPlaceSound();
      }
    }

    setSelectedCard(null);
  };

  // Double-click to auto-move: first try foundation (single card), then tableau (can move stack)
  const handleDoubleClick = (source, pileIndex, cardIndex) => {
    let card;

    if (source === 'waste') {
      card = waste[waste.length - 1];
    } else if (source === 'tableau') {
      // Must be a face-up card
      if (!tableau[pileIndex][cardIndex]?.faceUp) return;
      card = tableau[pileIndex][cardIndex];
    } else {
      return;
    }

    // Helper to flip the revealed card in a tableau pile
    const flipLastCard = (newTableau, pileIdx) => {
      if (newTableau[pileIdx].length > 0) {
        const lastCard = newTableau[pileIdx][newTableau[pileIdx].length - 1];
        if (!lastCard.faceUp) {
          newTableau[pileIdx][newTableau[pileIdx].length - 1] = { ...lastCard, faceUp: true };
        }
      }
    };

    // For single cards (waste or top card of tableau), try foundation first
    const isTopCard = source === 'waste' || cardIndex === tableau[pileIndex].length - 1;

    if (isTopCard) {
      for (let i = 0; i < 4; i++) {
        if (canPlaceOnFoundation(card, foundations[i])) {
          saveToHistory();
          const newFoundations = [...foundations];
          newFoundations[i] = [...foundations[i], card];
          setFoundations(newFoundations);

          if (source === 'waste') {
            setWaste(waste.slice(0, -1));
          } else {
            const newTableau = [...tableau];
            newTableau[pileIndex] = tableau[pileIndex].slice(0, -1);
            flipLastCard(newTableau, pileIndex);
            setTableau(newTableau);
          }
          setMoves(m => m + 1);
          setSelectedCard(null);
          if (soundEnabled) playFoundationSound();
          return;
        }
      }
    }

    // Try to find a valid tableau move - can move stack if from tableau
    for (let i = 0; i < 7; i++) {
      // Skip the pile the card is already in
      if (source === 'tableau' && i === pileIndex) continue;

      if (canPlaceOnTableau(card, tableau[i])) {
        saveToHistory();
        const newTableau = [...tableau];

        if (source === 'waste') {
          newTableau[i] = [...tableau[i], card];
          setWaste(waste.slice(0, -1));
        } else {
          // Move entire stack from cardIndex to end
          const cardsToMove = tableau[pileIndex].slice(cardIndex);
          newTableau[pileIndex] = tableau[pileIndex].slice(0, cardIndex);
          newTableau[i] = [...tableau[i], ...cardsToMove];
          flipLastCard(newTableau, pileIndex);
        }

        setTableau(newTableau);
        setMoves(m => m + 1);
        setSelectedCard(null);
        if (soundEnabled) playCardPlaceSound();
        return;
      }
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCardOffset = (cardIndex, pile) => {
    let offset = 0;
    for (let i = 0; i < cardIndex; i++) {
      offset += pile[i].faceUp ? 24 : 10;
    }
    return offset;
  };

  // Calculate which card in the deal sequence this is (for animation delay)
  const getDealDelay = (pileIndex, cardIndex) => {
    let count = 0;
    for (let round = 0; round < 7; round++) {
      for (let col = round; col < 7; col++) {
        if (col === pileIndex && round === cardIndex) {
          return count * 40;
        }
        count++;
      }
    }
    return 0;
  };

  const renderCardBack = (showCount = false, count = 0) => {
    const design = currentDesign;

    const getPatternStyle = () => {
      switch (design.pattern) {
        case 'diagonal-gold':
        case 'diagonal-silver':
          return `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 3px,
              ${design.patternColor} 3px,
              ${design.patternColor} 6px
            ),
            repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 3px,
              ${design.patternColor} 3px,
              ${design.patternColor} 6px
            )
          `;
        case 'diamonds':
          return `
            repeating-linear-gradient(
              45deg,
              transparent 0px,
              transparent 8px,
              ${design.patternColor} 8px,
              ${design.patternColor} 10px
            ),
            repeating-linear-gradient(
              -45deg,
              transparent 0px,
              transparent 8px,
              ${design.patternColor} 8px,
              ${design.patternColor} 10px
            )
          `;
        case 'hearts':
        case 'floral':
          return `
            radial-gradient(circle at 30% 30%, ${design.patternColor} 2px, transparent 2px),
            radial-gradient(circle at 70% 70%, ${design.patternColor} 2px, transparent 2px),
            radial-gradient(circle at 50% 50%, ${design.patternColor} 3px, transparent 3px)
          `;
        case 'waves':
          return `
            repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 4px,
              ${design.patternColor} 4px,
              ${design.patternColor} 6px
            )
          `;
        case 'sunburst':
          return `
            repeating-conic-gradient(
              from 0deg,
              transparent 0deg,
              transparent 10deg,
              ${design.patternColor} 10deg,
              ${design.patternColor} 20deg
            )
          `;
        case 'stars':
        case 'nebula':
          return `
            radial-gradient(circle at 20% 20%, ${design.patternColor} 1px, transparent 1px),
            radial-gradient(circle at 80% 30%, ${design.patternColor} 1px, transparent 1px),
            radial-gradient(circle at 40% 70%, ${design.patternColor} 2px, transparent 2px),
            radial-gradient(circle at 60% 50%, ${design.patternColor} 1px, transparent 1px),
            radial-gradient(circle at 30% 90%, ${design.patternColor} 1px, transparent 1px)
          `;
        case 'snowflakes':
          return `
            radial-gradient(circle at 25% 25%, ${design.patternColor} 3px, transparent 3px),
            radial-gradient(circle at 75% 75%, ${design.patternColor} 3px, transparent 3px),
            radial-gradient(circle at 50% 50%, ${design.patternColor} 4px, transparent 4px)
          `;
        case 'lava':
          return `
            radial-gradient(ellipse at 30% 40%, ${design.patternColor} 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, ${design.patternColor} 0%, transparent 40%)
          `;
        case 'swirl':
          return `
            repeating-conic-gradient(
              from 0deg at 50% 50%,
              transparent 0deg,
              ${design.patternColor} 30deg,
              transparent 60deg
            )
          `;
        case 'bamboo':
          return `
            repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 6px,
              ${design.patternColor} 6px,
              ${design.patternColor} 8px
            )
          `;
        case 'checker':
          return `
            repeating-conic-gradient(
              ${design.patternColor} 0% 25%,
              transparent 0% 50%
            )
          `;
        case 'leaves':
          return `
            radial-gradient(ellipse at 30% 30%, ${design.patternColor} 0%, transparent 30%),
            radial-gradient(ellipse at 70% 70%, ${design.patternColor} 0%, transparent 30%)
          `;
        default:
          return `
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 3px,
              ${design.patternColor} 3px,
              ${design.patternColor} 6px
            )
          `;
      }
    };

    // If custom back image is set and enabled, use it
    if (useCustomBack && customBackImage) {
      return (
        <div
          className="card card-back card-back-custom"
          style={{
            backgroundImage: `url(${customBackImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px solid #333'
          }}
        >
          {showCount && <span className="stock-count">{count}</span>}
        </div>
      );
    }

    return (
      <div
        className="card card-back"
        style={{
          background: design.background,
          borderColor: design.borderColor
        }}
      >
        <div
          className="card-back-pattern"
          style={{
            background: getPatternStyle(),
            backgroundSize: design.pattern === 'checker' ? '10px 10px' : undefined,
            borderColor: design.borderColor
          }}
        >
          <span
            className="card-back-symbol"
            style={{ color: design.accentColor }}
          >
            {design.symbol}
          </span>
        </div>
        {showCount && <span className="stock-count">{count}</span>}
      </div>
    );
  };

  // Render face card illustration
  const renderFaceCardContent = (card) => {
    const isRed = card.color === 'red';
    const color = isRed ? '#dc2626' : '#1a1a2e';

    if (card.rank === 'K') {
      return (
        <div className="face-card-illustration king">
          <div className="face-card-figure" style={{ color }}>
            <div className="crown">👑</div>
            <div className="face">🤴</div>
          </div>
          <span className="face-card-suit" style={{ color }}>{card.suit}</span>
        </div>
      );
    }

    if (card.rank === 'Q') {
      return (
        <div className="face-card-illustration queen">
          <div className="face-card-figure" style={{ color }}>
            <div className="crown">👑</div>
            <div className="face">👸</div>
          </div>
          <span className="face-card-suit" style={{ color }}>{card.suit}</span>
        </div>
      );
    }

    if (card.rank === 'J') {
      return (
        <div className="face-card-illustration jack">
          <div className="face-card-figure" style={{ color }}>
            <div className="hat">🎩</div>
            <div className="face">🤵</div>
          </div>
          <span className="face-card-suit" style={{ color }}>{card.suit}</span>
        </div>
      );
    }

    return null;
  };

  const renderCard = (card, isSelected, onClick, onDoubleClick) => {
    const isHinted = showHint && hintCard && hintCard.card && hintCard.card.id === card.id;

    if (!card.faceUp) {
      return (
        <div onClick={onClick}>
          {renderCardBack()}
        </div>
      );
    }

    const isFaceCard = ['J', 'Q', 'K'].includes(card.rank);
    const hasCustomFace = useCustomFace && customFaceImage;

    const cardStyle = hasCustomFace ? {
      backgroundImage: `linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url(${customFaceImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    } : {};

    return (
      <div
        className={`card card-face ${card.color} ${isSelected ? 'selected' : ''} ${isFaceCard ? 'face-card' : ''} ${hasCustomFace ? 'custom-face' : ''} ${isHinted ? 'hint-glow' : ''} ${lastWinningCard === card.id ? 'winning-glow' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        style={cardStyle}
      >
        <div className="card-corner top-left">
          <span className="card-rank">{card.rank}</span>
          <span className="card-suit">{card.suit}</span>
        </div>
        <div className="card-center">
          {isFaceCard ? (
            renderFaceCardContent(card)
          ) : (
            <span className="card-suit-large">{card.suit}</span>
          )}
        </div>
        <div className="card-corner bottom-right">
          <span className="card-rank">{card.rank}</span>
          <span className="card-suit">{card.suit}</span>
        </div>
      </div>
    );
  };

  // Determine effective card back (time-based or selected)
  const effectiveCardBack = timeBasedBacks && !useCustomBack ? getTimeBasedDesign() : cardBackDesign;

  return (
    <div
      ref={gameContainerRef}
      className={`solitaire ${dealingCards ? 'dealing' : ''} ${largePrintMode ? 'large-print' : ''} ${nostalgiaMode && stats.gamesPlayed >= 100 ? 'nostalgia' : ''} ${reducedMotion ? 'reduced-motion' : ''}`}
    >
      {/* Splash Screen */}
      {showSplash && (
        <div className="splash-screen">
          <div className="splash-cards">
            <span className="splash-card" style={{ animationDelay: '0s' }}>♠</span>
            <span className="splash-card" style={{ animationDelay: '0.1s' }}>♥</span>
            <span className="splash-card" style={{ animationDelay: '0.2s' }}>♦</span>
            <span className="splash-card" style={{ animationDelay: '0.3s' }}>♣</span>
          </div>
          <h1 className="splash-title">Solitaire Plus</h1>
        </div>
      )}

      {/* Challenge Card Modal */}
      {showChallengeCard && challengeStats && (
        <div className="modal-overlay" onClick={() => setShowChallengeCard(false)}>
          <div className="challenge-card" onClick={(e) => e.stopPropagation()}>
            <div className="challenge-header">
              <span className="challenge-icon">🎴</span>
              <h2>Challenge!</h2>
            </div>
            <p className="challenge-intro">
              <strong>{challengeStats.name}</strong> wants to see if you can beat their score!
            </p>
            <div className="challenge-stats">
              <div className="challenge-stat">
                <span className="challenge-stat-value">{challengeStats.gamesWon}</span>
                <span className="challenge-stat-label">Games Won</span>
              </div>
              <div className="challenge-stat">
                <span className="challenge-stat-value">{challengeStats.winRate}%</span>
                <span className="challenge-stat-label">Win Rate</span>
              </div>
              <div className="challenge-stat">
                <span className="challenge-stat-value">{challengeStats.streak || 0}</span>
                <span className="challenge-stat-label">Win Streak</span>
              </div>
            </div>
            {challengeStats.bestTime && (
              <p className="challenge-best">
                Best Time: <strong>{formatTime(challengeStats.bestTime)}</strong>
              </p>
            )}
            <div className="challenge-actions">
              <button className="btn btn-play-again" onClick={() => setShowChallengeCard(false)}>
                Accept Challenge!
              </button>
            </div>
            <p className="challenge-footer">
              Play and share your stats to challenge them back!
            </p>
          </div>
        </div>
      )}

      {/* Fireworks Canvas */}
      {gameWon && (
        <canvas
          ref={canvasRef}
          className="fireworks-canvas"
        />
      )}

      {/* Achievement Popup */}
      {showAchievement && (
        <div className="achievement-popup">
          <span className="achievement-icon">{showAchievement.icon}</span>
          <div className="achievement-text">
            <span className="achievement-label">Achievement Unlocked!</span>
            <span className="achievement-name">{showAchievement.name}</span>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="tooltip"
          style={{
            left: `${Math.min(Math.max(tooltip.x, 100), window.innerWidth - 100)}px`,
            top: `${tooltip.y}px`
          }}
        >
          {tooltip.text.split('\n').map((line, i) => (
            <span key={i}>{line}<br /></span>
          ))}
        </div>
      )}

      {/* Thank You Toast */}
      {showThankYou && (
        <div className="thank-you-toast">
          Thank you for your feedback!
        </div>
      )}

      {/* Daily Challenge Banner */}
      {showDailyBanner && (
        <div className="daily-banner" onClick={() => setShowDailyBanner(false)}>
          <div className="daily-banner-icon">📅</div>
          <div className="daily-banner-content">
            <div className="daily-banner-title">Daily Challenge Started!</div>
            {!hasSeenDailyExplanation && (
              <div className="daily-banner-desc">
                Same card shuffle for everyone worldwide today! Compare your score with friends and family.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Install to Home Screen Prompt */}
      {showInstallPrompt && (
        <div className="modal-overlay" onClick={() => {
          setShowInstallPrompt(false);
          localStorage.setItem('solitaire_seenInstallPrompt', 'true');
        }}>
          <div className="install-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="install-prompt-header">
              <span className="install-prompt-icon">📲</span>
              <h2>Install Solitaire Plus</h2>
            </div>
            <p className="install-prompt-desc">
              Add this app to your home screen for the best experience - play offline, faster loading, and no browser bars!
            </p>

            {devicePlatform === 'ios' ? (
              <div className="install-steps">
                <div className="install-step">
                  <span className="step-number">1</span>
                  <span className="step-text">Tap the <strong>Share</strong> button <span className="ios-share-icon">⎋</span> at the bottom of Safari</span>
                </div>
                <div className="install-step">
                  <span className="step-number">2</span>
                  <span className="step-text">Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                  <span className="step-icon">➕</span>
                </div>
                <div className="install-step">
                  <span className="step-number">3</span>
                  <span className="step-text">Tap <strong>"Add"</strong> in the top right</span>
                  <span className="step-icon">✓</span>
                </div>
              </div>
            ) : (
              <div className="install-steps">
                <div className="install-step">
                  <span className="step-number">1</span>
                  <span className="step-text">Tap the <strong>menu</strong> button</span>
                  <span className="step-icon">⋮</span>
                </div>
                <div className="install-step">
                  <span className="step-number">2</span>
                  <span className="step-text">Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></span>
                  <span className="step-icon">➕</span>
                </div>
                <div className="install-step">
                  <span className="step-number">3</span>
                  <span className="step-text">Tap <strong>"Install"</strong> to confirm</span>
                  <span className="step-icon">✓</span>
                </div>
              </div>
            )}

            <button
              className="btn btn-play-again"
              onClick={() => {
                setShowInstallPrompt(false);
                localStorage.setItem('solitaire_seenInstallPrompt', 'true');
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="game-header">
        <div className="header-left">
          <h1 className="game-title">Solitaire</h1>
          <span className="game-subtitle">{isDailyChallenge ? 'Daily' : 'Plus'}</span>
        </div>
        <div className="header-stats">
          {zenMode && (
            <div className="stat zen-indicator">
              <span className="stat-icon">🧘</span>
              <span className="stat-value">Zen</span>
            </div>
          )}
          {!zenMode && vegasMode && (
            <div className={`stat vegas-score ${score >= 0 ? 'positive' : 'negative'}`}>
              <span className="stat-icon">💰</span>
              <span className="stat-value">${score}</span>
            </div>
          )}
          {!zenMode && (
            <>
              <div className="stat">
                <span className="stat-icon">🎯</span>
                <span className="stat-value">{moves}</span>
              </div>
              <div
                className={`stat timer-stat ${!isPlaying && timer > 0 ? 'paused' : ''}`}
                onClick={() => !gameWon && timer > 0 && setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Click to pause' : 'Click to resume'}
              >
                <span className="stat-icon">{!isPlaying && timer > 0 ? '⏸️' : '⏱️'}</span>
                <span className="stat-value">{formatTime(timer)}</span>
              </div>
            </>
          )}
          <button
            className="settings-btn"
            onClick={() => { setShowStats(!showStats); setShowSettings(false); }}
            title="Stats & Data"
          >
            📊
          </button>
          <button
            className="settings-btn"
            onClick={() => { setShowSettings(!showSettings); setShowStats(false); }}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStats && (
        <>
        <div className="panel-overlay" onClick={() => setShowStats(false)} />
        <div className="stats-panel">
          <h3 className="stats-title">Your Statistics</h3>
          <div className="stats-grid">
            <div className="stats-item">
              <span className="stats-value">{stats.gamesPlayed}</span>
              <span className="stats-label">Games Played</span>
            </div>
            <div className="stats-item">
              <span className="stats-value">{stats.gamesWon}</span>
              <span className="stats-label">Games Won</span>
            </div>
            <div className="stats-item">
              <span className="stats-value">{stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%</span>
              <span className="stats-label">Win Rate</span>
            </div>
            <div className="stats-item">
              <span className="stats-value">{winStreak}</span>
              <span className="stats-label">Current Streak</span>
            </div>
            <div className="stats-item">
              <span className="stats-value">{stats.bestMoves || '-'}</span>
              <span className="stats-label">Best Moves</span>
            </div>
            <div className="stats-item">
              <span className="stats-value">{stats.bestTime ? formatTime(stats.bestTime) : '-'}</span>
              <span className="stats-label">Best Time</span>
            </div>
          </div>
          <h4 className="stats-subtitle">Achievements <span className="hint-text">(tap to learn more)</span></h4>
          <div className="achievements-grid">
            {[
              { id: 'firstWin', name: 'First Victory', icon: '🏆' },
              { id: 'speedDemon', name: 'Speed Demon', icon: '⚡' },
              { id: 'perfectGame', name: 'Perfect Game', icon: '💎' },
              { id: 'centurion', name: 'Centurion', icon: '💯' },
              { id: 'streakMaster', name: 'Streak Master', icon: '🔥' },
              { id: 'veteran', name: 'Veteran', icon: '⭐' },
              { id: 'marathoner', name: 'Marathoner', icon: '🏃' },
              { id: 'grandmaster', name: 'Grandmaster', icon: '👑' },
            ].map(a => (
              <div
                key={a.id}
                className={`achievement-badge ${achievements[a.id] ? 'unlocked' : 'locked'}`}
                title={a.name}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: TOOLTIPS[a.id],
                    x: rect.left + rect.width / 2,
                    y: rect.top - 10
                  });
                  setTimeout(() => setTooltip(null), 5000);
                }}
              >
                <span className="badge-icon">{a.icon}</span>
              </div>
            ))}
          </div>
          <div className="share-stats-section">
            <h4 className="stats-subtitle">Challenge Friends</h4>
            <div className="player-name-input">
              <input
                type="text"
                placeholder="Your name (optional)"
                value={playerName}
                onChange={(e) => handleSavePlayerName(e.target.value)}
                maxLength={20}
              />
            </div>
            <button className="share-stats-btn" onClick={handleShareStats}>
              🏆 Share My Stats
            </button>
          </div>
          <button className="rules-btn" onClick={() => setShowRules(true)}>
            📖 How to Play
          </button>
          <div className="data-actions">
            <button className="data-btn" onClick={exportData}>📤 Export</button>
            <label className="data-btn">
              📥 Import
              <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
            </label>
            <button className="data-btn danger" onClick={() => setShowResetConfirm(true)}>🗑️ Reset</button>
          </div>
          <button className="close-settings" onClick={() => setShowStats(false)}>Done</button>
        </div>
        </>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="reset-modal">
            <h3>⚠️ Reset All Data?</h3>
            <p>This will permanently delete:</p>
            <ul>
              <li>All game statistics</li>
              <li>All achievements</li>
              <li>All preferences</li>
              <li>Custom images</li>
            </ul>
            <p className="warning-text">This cannot be undone!</p>
            <div className="modal-buttons">
              <button className="btn btn-cancel" onClick={() => setShowResetConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={resetAllData}>Delete Everything</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <h2>📖 How to Play Solitaire</h2>

            <div className="rules-section">
              <h3>🎯 Goal</h3>
              <p>Move all 52 cards to the four foundation piles at the top right. Each pile starts with an Ace and goes up to King, all in the same suit (hearts, diamonds, clubs, or spades).</p>
            </div>

            <div className="rules-section">
              <h3>🃏 The Cards</h3>
              <ul>
                <li><strong>Stock pile</strong> (top left): Click to draw new cards</li>
                <li><strong>Waste pile</strong>: Cards drawn from stock go here</li>
                <li><strong>Foundation piles</strong> (top right): Build up from Ace to King by suit</li>
                <li><strong>Tableau</strong> (7 columns below): Build down, alternating colors</li>
              </ul>
            </div>

            <div className="rules-section">
              <h3>📋 Rules</h3>
              <ul>
                <li>In the tableau, place cards in descending order (King, Queen, Jack, 10...)</li>
                <li>Colors must alternate (red on black, black on red)</li>
                <li>Only Kings can go in empty tableau spaces</li>
                <li>You can move stacks of cards together</li>
                <li>Double-tap a card to auto-move it to the best spot</li>
              </ul>
            </div>

            <div className="rules-section">
              <h3>🎮 Controls</h3>
              <ul>
                <li><strong>Tap</strong>: Select a card</li>
                <li><strong>Double-tap</strong>: Auto-move card (or whole stack)</li>
                <li><strong>Undo</strong>: Take back your last move</li>
                <li><strong>Hint</strong>: Shows a valid move</li>
              </ul>
            </div>

            <div className="rules-section">
              <h3>✨ Special Features</h3>
              <ul>
                <li><strong>Daily Challenge</strong>: Same shuffle worldwide - compete with friends!</li>
                <li><strong>Vegas Mode</strong>: Start at -$52, earn $5 per foundation card</li>
                <li><strong>Achievements</strong>: Unlock badges for special accomplishments</li>
                <li><strong>Auto-Foundation</strong>: Automatically moves safe cards up</li>
              </ul>
            </div>

            <button className="btn btn-play-again" onClick={() => setShowRules(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRateModal && (
        <div className="modal-overlay" onClick={() => setShowRateModal(false)}>
          <div className="rating-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rate Solitaire Plus</h2>
            <p>How are you enjoying the game?</p>

            <div className="star-rating">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  className={`star-btn ${ratingValue >= star ? 'active' : ''}`}
                  onClick={() => setRatingValue(star)}
                >
                  ★
                </button>
              ))}
            </div>

            <textarea
              className="rating-message"
              placeholder="Tell us what you think (optional)..."
              value={ratingMessage}
              onChange={(e) => setRatingMessage(e.target.value)}
              rows={3}
            />

            <div className="modal-buttons">
              <button className="btn btn-cancel" onClick={() => setShowRateModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-play-again"
                onClick={handleSubmitRating}
                disabled={ratingValue === 0}
              >
                Submit Rating
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Ratings View */}
      {showRatings && isAdmin && (
        <div className="modal-overlay" onClick={() => setShowRatings(false)}>
          <div className="ratings-admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Admin Dashboard</h2>

            {/* Summary Header - Key Stats at a Glance */}
            <div className="admin-summary-header">
              <div className="admin-summary-stat">
                <span className="admin-summary-value">{allUserStats?.totalUsers || 0}</span>
                <span className="admin-summary-label">Total Users</span>
              </div>
              <div className="admin-summary-stat">
                <span className="admin-summary-value">{allRatings.length}</span>
                <span className="admin-summary-label">Ratings</span>
              </div>
              <div className="admin-summary-stat">
                <span className="admin-summary-value">
                  {allRatings.length > 0
                    ? (allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(1) + '★'
                    : '—'}
                </span>
                <span className="admin-summary-label">Avg Rating</span>
              </div>
            </div>

            {/* Device ID for Whitelisting */}
            <div className="admin-device-id">
              <span className="admin-device-id-label">📱 Your Device ID (for whitelisting)</span>
              <div
                className="admin-device-id-value"
                onClick={() => {
                  navigator.clipboard.writeText(getCurrentDeviceId());
                  alert('Device ID copied to clipboard!');
                }}
                title="Click to copy"
              >
                {getCurrentDeviceId()}
              </div>
              <div className="admin-device-id-hint">
                Click to copy. Add this ID to ADMIN_DEVICE_IDS in firebase.js
              </div>
            </div>

            {/* User Stats Section */}
            {allUserStats && (
              <div className="admin-stats-section">
                <h3>User Analytics</h3>
                <div className="admin-stats-grid">
                  <div className="admin-stat">
                    <span className="admin-stat-value">{allUserStats.totalUsers}</span>
                    <span className="admin-stat-label">Total Users</span>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-value">{allUserStats.activeToday}</span>
                    <span className="admin-stat-label">Active Today</span>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-value">{allUserStats.activeThisWeek}</span>
                    <span className="admin-stat-label">This Week</span>
                  </div>
                  <div className="admin-stat">
                    <span className="admin-stat-value">{allUserStats.pwaUsers}</span>
                    <span className="admin-stat-label">PWA Installs</span>
                  </div>
                </div>
                <div className="admin-platforms">
                  <span>📱 iOS: {allUserStats.platforms.iOS}</span>
                  <span>🤖 Android: {allUserStats.platforms.Android}</span>
                  <span>🖥️ Windows: {allUserStats.platforms.Windows}</span>
                  <span>🍎 Mac: {allUserStats.platforms.Mac}</span>
                </div>
                <div className="admin-games-total">
                  Total Games: {allUserStats.totalGamesPlayed} played, {allUserStats.totalGamesWon} won
                </div>
              </div>
            )}

            {/* Ratings Section */}
            <h3>Ratings ({allRatings.length})</h3>
            {allRatings.length === 0 ? (
              <p className="no-ratings">No ratings yet</p>
            ) : (
              <>
                <div className="ratings-summary">
                  <span className="avg-rating">
                    Avg: {(allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(1)} ★
                  </span>
                </div>
                <div className="ratings-list">
                  {allRatings.map((rating, i) => (
                    <div key={i} className="rating-item">
                      <div className="rating-header">
                        <span className="rating-stars">
                          {'★'.repeat(rating.rating)}{'☆'.repeat(5 - rating.rating)}
                        </span>
                        <span className="rating-date">
                          {new Date(rating.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {rating.playerName && rating.playerName !== 'Anonymous' && (
                        <p className="rating-name">— {rating.playerName}</p>
                      )}
                      {rating.message && (
                        <p className="rating-text">{rating.message}</p>
                      )}
                      <p className="rating-meta">
                        {rating.platform} • {rating.browser} {rating.isPWA ? '(PWA)' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button className="btn btn-play-again" onClick={() => setShowRatings(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <>
        <div className="panel-overlay" onClick={() => setShowSettings(false)} />
        <div className="settings-panel">
          <div className="settings-section">
            <label className="settings-label">Draw Mode</label>
            <div className="draw-toggle">
              <button
                className={`toggle-btn ${drawCount === 1 ? 'active' : ''}`}
                onClick={() => setDrawCount(1)}
              >
                Draw 1
              </button>
              <button
                className={`toggle-btn ${drawCount === 3 ? 'active' : ''}`}
                onClick={() => setDrawCount(3)}
              >
                Draw 3
              </button>
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Sound</label>
            <div className="draw-toggle">
              <button
                className={`toggle-btn ${soundEnabled ? 'active' : ''}`}
                onClick={() => setSoundEnabled(true)}
              >
                On
              </button>
              <button
                className={`toggle-btn ${!soundEnabled ? 'active' : ''}`}
                onClick={() => setSoundEnabled(false)}
              >
                Off
              </button>
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Card Back Design</label>
            <div className="card-back-grid">
              {CARD_BACK_DESIGNS.map(design => (
                <button
                  key={design.id}
                  className={`card-back-option ${cardBackDesign === design.id && !useCustomBack ? 'selected' : ''}`}
                  onClick={() => { setCardBackDesign(design.id); setUseCustomBack(false); }}
                  title={design.name}
                  style={{
                    background: design.background,
                    borderColor: design.borderColor
                  }}
                >
                  <span style={{ color: design.accentColor }}>{design.symbol}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Custom Card Back Photo</label>
            <div className="custom-image-section">
              <input
                ref={backImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackImageUpload}
                className="image-input"
                id="back-image-input"
              />
              <label htmlFor="back-image-input" className="upload-btn">
                📷 {customBackImage ? 'Change Photo' : 'Add Photo'}
              </label>
              {customBackImage && (
                <>
                  <div className={`custom-preview ${useCustomBack ? 'active' : ''}`} onClick={() => setUseCustomBack(true)}>
                    <img src={customBackImage} alt="Custom back" />
                    {useCustomBack && <span className="preview-check">✓</span>}
                  </div>
                  <button className="remove-btn" onClick={removeCustomBack}>✕</button>
                </>
              )}
            </div>
          </div>
          <div className="settings-section">
            <label className="settings-label">Custom Card Face Photo</label>
            <div className="custom-image-section">
              <input
                ref={faceImageInputRef}
                type="file"
                accept="image/*"
                onChange={handleFaceImageUpload}
                className="image-input"
                id="face-image-input"
              />
              <label htmlFor="face-image-input" className="upload-btn">
                📷 {customFaceImage ? 'Change Photo' : 'Add Photo'}
              </label>
              {customFaceImage && (
                <>
                  <div className={`custom-preview ${useCustomFace ? 'active' : ''}`} onClick={() => setUseCustomFace(!useCustomFace)}>
                    <img src={customFaceImage} alt="Custom face" />
                    {useCustomFace && <span className="preview-check">✓</span>}
                  </div>
                  <button className="remove-btn" onClick={removeCustomFace}>✕</button>
                </>
              )}
            </div>
            {customFaceImage && (
              <p className="custom-hint">Tap preview to toggle on/off</p>
            )}
          </div>
          <div className="settings-section">
            <label className="settings-label">Game Options</label>
            <div className="settings-toggles">
              <div className="toggle-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={zenMode}
                    onChange={(e) => setZenMode(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">Zen Mode 🧘</span>
                </label>
                <button className="info-btn" onClick={(e) => showOptionInfo('zen', e)}>ℹ️</button>
              </div>
              <div className="toggle-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoFoundation}
                    onChange={(e) => setAutoFoundation(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">Auto-Foundation</span>
                </label>
                <button className="info-btn" onClick={(e) => showOptionInfo('autoFoundation', e)}>ℹ️</button>
              </div>
              <div className="toggle-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={largePrintMode}
                    onChange={(e) => setLargePrintMode(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">Large Print Mode</span>
                </label>
                <button className="info-btn" onClick={(e) => showOptionInfo('largePrint', e)}>ℹ️</button>
              </div>
              <div className="toggle-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={vegasMode}
                    onChange={(e) => setVegasMode(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">Vegas Mode ($)</span>
                </label>
                <button className="info-btn" onClick={(e) => showOptionInfo('vegas', e)}>ℹ️</button>
              </div>
              <div className="toggle-row">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={timeBasedBacks}
                    onChange={(e) => setTimeBasedBacks(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">Time-of-Day Backs</span>
                </label>
                <button className="info-btn" onClick={(e) => showOptionInfo('timeBacks', e)}>ℹ️</button>
              </div>
              {stats.gamesPlayed >= 100 && (
                <div className="toggle-row">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={nostalgiaMode}
                      onChange={(e) => setNostalgiaMode(e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">Nostalgia Mode</span>
                  </label>
                  <button className="info-btn" onClick={(e) => showOptionInfo('nostalgia', e)}>ℹ️</button>
                </div>
              )}
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-buttons-row">
              <button className="settings-action-btn" onClick={handleShare}>
                📤 Share App
              </button>
              <button className="settings-action-btn" onClick={() => {
                if (isAdmin) {
                  // Admin sees dashboard
                  setShowRatings(true);
                  setShowSettings(false);
                } else {
                  // Regular user sees rating form
                  setShowRateModal(true);
                }
              }}>
                ⭐ {isAdmin ? 'Admin Dashboard' : (hasRated ? 'Update Rating' : 'Rate App')}
              </button>
            </div>
            <button
              className="settings-action-btn install-instructions-btn"
              onClick={() => {
                // Detect platform or default to iOS for instructions
                const ua = navigator.userAgent;
                const isIOS = /iPhone|iPad|iPod/.test(ua);
                const isAndroid = /Android/.test(ua);
                setDevicePlatform(isIOS ? 'ios' : isAndroid ? 'android' : 'ios');
                setShowInstallPrompt(true);
                setShowSettings(false);
              }}
            >
              📲 Install as App Instructions
            </button>
            {onSwitchGame && (
              <button
                className="settings-action-btn switch-game-btn"
                onClick={() => onSwitchGame('spider')}
              >
                🕷️ Play Spider Solitaire
              </button>
            )}
          </div>
          <p className="version-text" onClick={handleVersionTap}>v1.0.0</p>
          <button className="close-settings" onClick={() => setShowSettings(false)}>
            Done
          </button>
        </div>
        </>
      )}

      {/* Game Board */}
      <div className="game-board">
        {/* Top Row */}
        <div className="top-row">
          <div className="stock-waste">
            <div className={`card-slot stock ${stock.length === 0 ? 'empty' : ''}`} onClick={drawFromStock}>
              {stock.length > 0 ? (
                renderCardBack(true, stock.length)
              ) : (
                <span className="empty-icon">↻</span>
              )}
            </div>
            <div className="card-slot waste">
              {waste.length > 0 ? (
                drawCount === 3 && waste.length >= 2 ? (
                  <div className="waste-fan">
                    {waste.slice(-Math.min(3, waste.length)).map((card, i, arr) => (
                      <div
                        key={card.id}
                        className="waste-card"
                        style={{
                          left: `${i * 12}px`,
                          zIndex: i
                        }}
                      >
                        {i === arr.length - 1 ? (
                          renderCard(
                            card,
                            selectedCard?.source === 'waste',
                            () => handleCardClick('waste', null, waste.length - 1),
                            () => handleDoubleClick('waste', null, waste.length - 1)
                          )
                        ) : (
                          <div className={`card card-face ${card.color}`}>
                            <div className="card-corner top-left">
                              <span className="card-rank">{card.rank}</span>
                              <span className="card-suit">{card.suit}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  renderCard(
                    waste[waste.length - 1],
                    selectedCard?.source === 'waste',
                    () => handleCardClick('waste', null, waste.length - 1),
                    () => handleDoubleClick('waste', null, waste.length - 1)
                  )
                )
              ) : null}
            </div>
          </div>

          <div className="foundations">
            {foundations.map((foundation, i) => (
              <div
                key={i}
                className={`card-slot foundation ${foundation.length === 13 ? 'complete' : ''}`}
                onClick={() => foundation.length === 0
                  ? handleEmptyClick('foundation', i)
                  : handleCardClick('foundation', i, foundation.length - 1)}
              >
                {foundation.length > 0 ? (
                  renderCard(
                    foundation[foundation.length - 1],
                    selectedCard?.source === 'foundation' && selectedCard?.pileIndex === i,
                    () => {},
                    () => {}
                  )
                ) : (
                  <span className="empty-icon foundation-suit">{SUITS[i]}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tableau */}
        <div className="tableau">
          {tableau.map((pile, pileIndex) => (
            <div
              key={pileIndex}
              className="tableau-pile"
              onClick={() => pile.length === 0 && handleEmptyClick('tableau', pileIndex)}
            >
              {pile.length === 0 ? (
                <div className="card-slot empty">
                  <span className="empty-icon">K</span>
                </div>
              ) : (
                pile.map((card, cardIndex) => {
                  const isCardSelected = selectedCard?.source === 'tableau' &&
                    selectedCard?.pileIndex === pileIndex &&
                    cardIndex >= selectedCard?.cardIndex;
                  return (
                    <div
                      key={card.id}
                      className={`tableau-card ${dealingCards ? 'dealing-card' : ''} ${isCardSelected ? 'stack-selected' : ''}`}
                      style={{
                        top: `${getCardOffset(cardIndex, pile)}px`,
                        zIndex: isCardSelected ? 100 + cardIndex : cardIndex,
                        animationDelay: dealingCards ? `${getDealDelay(pileIndex, cardIndex)}ms` : '0ms'
                      }}
                    >
                      {renderCard(
                        card,
                        isCardSelected,
                        () => handleCardClick('tableau', pileIndex, cardIndex),
                        () => handleDoubleClick('tableau', pileIndex, cardIndex)
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="game-controls">
        <button
          className="btn btn-undo"
          onClick={handleUndo}
          disabled={history.length === 0}
          onMouseDown={(e) => handleLongPressStart('undo', e)}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={(e) => handleLongPressStart('undo', e)}
          onTouchEnd={handleLongPressEnd}
        >
          ↩ Undo
        </button>
        <button
          className="btn btn-hint"
          onClick={() => {
            const hint = findHint();
            if (hint) {
              setHintCard(hint);
              setShowHint(true);
              setTimeout(() => setShowHint(false), 2000);
            }
          }}
          onMouseDown={(e) => handleLongPressStart('hint', e)}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={(e) => handleLongPressStart('hint', e)}
          onTouchEnd={handleLongPressEnd}
        >
          💡 Hint
        </button>
        <button
          className="btn btn-daily"
          onClick={() => initGame(true)}
          onMouseDown={(e) => handleLongPressStart('daily', e)}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={(e) => handleLongPressStart('daily', e)}
          onTouchEnd={handleLongPressEnd}
        >
          📅 Daily
        </button>
        <button
          className="btn btn-new"
          onClick={() => initGame(false)}
          onMouseDown={(e) => handleLongPressStart('newGame', e)}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={(e) => handleLongPressStart('newGame', e)}
          onTouchEnd={handleLongPressEnd}
        >
          New Game
        </button>
      </div>

      {/* Win Modal - Regular */}
      {gameWon && !isDailyChallenge && (
        <div className="win-overlay">
          <div className="win-modal">
            <div className="win-stars">🎆 🏆 🎆</div>
            <h2 className="win-title">Victory!</h2>
            <div className="win-stats">
              <div className="win-stat">
                <span className="win-stat-label">Moves</span>
                <span className="win-stat-value">{moves}</span>
              </div>
              <div className="win-stat">
                <span className="win-stat-label">Time</span>
                <span className="win-stat-value">{formatTime(timer)}</span>
              </div>
            </div>
            <div className="win-record">
              {moves === stats.bestMoves && <span className="new-record">🎉 New Best!</span>}
            </div>
            {winStreak > 1 && (
              <div className="win-streak-display">
                {'🔥'.repeat(Math.min(winStreak, 5))} {winStreak} Win Streak!
              </div>
            )}
            <div className="win-buttons">
              <button className="btn btn-screenshot" onClick={takeScreenshot}>
                📸 Share Victory
              </button>
              <button className="btn btn-play-again" onClick={() => initGame(false)}>
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Win Modal - Daily Challenge Special */}
      {gameWon && isDailyChallenge && (
        <div className="win-overlay daily-win-overlay">
          <div className="win-modal daily-win-modal">
            <div className="daily-crown-container">
              <span className="daily-crown">👑</span>
              <div className="daily-sparkles">✨</div>
            </div>
            <h2 className="daily-win-title">Daily Champion!</h2>
            <p className="daily-win-subtitle">You conquered today's challenge!</p>
            <div className="daily-date-badge">
              📅 {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <div className="win-stats daily-win-stats">
              <div className="win-stat">
                <span className="win-stat-label">Moves</span>
                <span className="win-stat-value">{moves}</span>
              </div>
              <div className="win-stat">
                <span className="win-stat-label">Time</span>
                <span className="win-stat-value">{formatTime(timer)}</span>
              </div>
            </div>
            {moves === stats.bestMoves && (
              <div className="win-record">
                <span className="new-record">🎉 New Personal Best!</span>
              </div>
            )}
            {winStreak > 1 && (
              <div className="win-streak-display daily-streak">
                {'🔥'.repeat(Math.min(winStreak, 5))} {winStreak} Day Streak!
              </div>
            )}
            <div className="daily-motivational">
              {timer < 180 ? "Lightning fast! ⚡" : timer < 300 ? "Impressive speed! 🚀" : "Well played! 🎯"}
            </div>
            <div className="win-buttons">
              <button className="btn btn-screenshot daily-share-btn" onClick={takeScreenshot}>
                📸 Share Your Victory
              </button>
              <button className="btn btn-play-again" onClick={() => initGame(false)}>
                Play Free Game
              </button>
            </div>
            <p className="daily-comeback">Come back tomorrow for a new challenge!</p>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="stats-bar">
        <span>Games: {stats.gamesPlayed}</span>
        <span>Wins: {stats.gamesWon}</span>
        <span>Win Rate: {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%</span>
        {stats.bestMoves && <span>Best: {stats.bestMoves} moves</span>}
        {winStreak > 1 && (
          <span className={`win-streak-bottom ${streakAnimating ? 'streak-animating' : ''}`}>{'🔥'.repeat(Math.min(winStreak, 5))} {winStreak} streak</span>
        )}
      </div>
    </div>
  );
};

export default Solitaire;
