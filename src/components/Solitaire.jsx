import { useState, useEffect, useCallback, useRef } from 'react';
import { CARD_BACK_DESIGNS, getDesignById } from '../data/cardBackDesigns';
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

const Solitaire = () => {
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
  const [showSettings, setShowSettings] = useState(false);
  const [dealingCards, setDealingCards] = useState(false);
  const [dealtCardCount, setDealtCardCount] = useState(0);

  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationFrameRef = useRef(null);

  const currentDesign = getDesignById(cardBackDesign);

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

  const initGame = useCallback(() => {
    setDealingCards(true);
    setDealtCardCount(0);
    const deck = shuffleDeck(createDeck());

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
    particlesRef.current = [];

    // Update games played
    setStats(prev => {
      const newStats = { ...prev, gamesPlayed: prev.gamesPlayed + 1 };
      localStorage.setItem('solitaire_stats', JSON.stringify(newStats));
      return newStats;
    });

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
  }, []);

  useEffect(() => {
    initGame();
  }, []);

  // Check for win
  useEffect(() => {
    const totalInFoundations = foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalInFoundations === 52 && !gameWon) {
      setGameWon(true);

      setStats(prev => {
        const newStats = {
          ...prev,
          gamesWon: prev.gamesWon + 1,
          bestMoves: prev.bestMoves === null ? moves : Math.min(prev.bestMoves, moves),
          bestTime: prev.bestTime === null ? timer : Math.min(prev.bestTime, timer),
        };
        localStorage.setItem('solitaire_stats', JSON.stringify(newStats));
        return newStats;
      });
    }
  }, [foundations, moves, timer, gameWon]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setTableau(previousState.tableau);
    setFoundations(previousState.foundations);
    setStock(previousState.stock);
    setWaste(previousState.waste);
    setHistory(prev => prev.slice(0, -1));
    setMoves(m => Math.max(0, m - 1));
    setSelectedCard(null);
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

  // Double-click to auto-move: first try foundation, then tableau
  const handleDoubleClick = (source, pileIndex, cardIndex) => {
    let card;
    let sourcePileIndex = pileIndex;

    if (source === 'waste') {
      card = waste[waste.length - 1];
    } else if (source === 'tableau') {
      if (cardIndex !== tableau[pileIndex].length - 1) return;
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

    // First, try to place on foundation
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

    // If no foundation move, try to find a valid tableau move
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
          newTableau[pileIndex] = tableau[pileIndex].slice(0, -1);
          newTableau[i] = [...tableau[i], card];
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
    if (!card.faceUp) {
      return (
        <div onClick={onClick}>
          {renderCardBack()}
        </div>
      );
    }

    const isFaceCard = ['J', 'Q', 'K'].includes(card.rank);

    return (
      <div
        className={`card card-face ${card.color} ${isSelected ? 'selected' : ''} ${isFaceCard ? 'face-card' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
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

  return (
    <div className={`solitaire ${dealingCards ? 'dealing' : ''}`}>
      {/* Fireworks Canvas */}
      {gameWon && (
        <canvas
          ref={canvasRef}
          className="fireworks-canvas"
        />
      )}

      {/* Header */}
      <div className="game-header">
        <div className="header-left">
          <h1 className="game-title">Solitaire</h1>
          <span className="game-subtitle">Deluxe</span>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-icon">🎯</span>
            <span className="stat-value">{moves}</span>
          </div>
          <div className="stat">
            <span className="stat-icon">⏱️</span>
            <span className="stat-value">{formatTime(timer)}</span>
          </div>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
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
                  className={`card-back-option ${cardBackDesign === design.id ? 'selected' : ''}`}
                  onClick={() => setCardBackDesign(design.id)}
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
          <button className="close-settings" onClick={() => setShowSettings(false)}>
            Done
          </button>
        </div>
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
                pile.map((card, cardIndex) => (
                  <div
                    key={card.id}
                    className={`tableau-card ${dealingCards ? 'dealing-card' : ''}`}
                    style={{
                      top: `${getCardOffset(cardIndex, pile)}px`,
                      zIndex: cardIndex,
                      animationDelay: dealingCards ? `${getDealDelay(pileIndex, cardIndex)}ms` : '0ms'
                    }}
                  >
                    {renderCard(
                      card,
                      selectedCard?.source === 'tableau' &&
                      selectedCard?.pileIndex === pileIndex &&
                      cardIndex >= selectedCard?.cardIndex,
                      () => handleCardClick('tableau', pileIndex, cardIndex),
                      () => handleDoubleClick('tableau', pileIndex, cardIndex)
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="game-controls">
        <button className="btn btn-undo" onClick={handleUndo} disabled={history.length === 0}>
          ↩ Undo
        </button>
        <button className="btn btn-new" onClick={initGame}>
          New Game
        </button>
      </div>

      {/* Win Modal */}
      {gameWon && (
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
            <button className="btn btn-play-again" onClick={initGame}>
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="stats-bar">
        <span>Games: {stats.gamesPlayed}</span>
        <span>Wins: {stats.gamesWon}</span>
        <span>Win Rate: {stats.gamesPlayed > 0 ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0}%</span>
        {stats.bestMoves && <span>Best: {stats.bestMoves} moves</span>}
      </div>
    </div>
  );
};

export default Solitaire;
