import { useState, useEffect, useCallback, useRef } from 'react';
import { getDesignById } from '../data/cardBackDesigns';
import './SpiderSolitaire.css';

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Sound effects
let audioContext = null;
const getAudioContext = () => {
  if (!audioContext && typeof window !== 'undefined') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

const playCardSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(150, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05);
  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.08);
};

const playCompleteSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, i) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    const startTime = ctx.currentTime + i * 0.08;
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.18);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.23);
  });
};

const playWinSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const melody = [
    { freq: 523.25, time: 0, dur: 0.15 },
    { freq: 659.25, time: 0.15, dur: 0.15 },
    { freq: 783.99, time: 0.3, dur: 0.15 },
    { freq: 1046.50, time: 0.45, dur: 0.3 },
    { freq: 783.99, time: 0.8, dur: 0.1 },
    { freq: 1046.50, time: 0.95, dur: 0.5 },
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

// Create deck based on suit count (1, 2, or 4 suits)
const createSpiderDeck = (suitCount) => {
  const deck = [];
  let suitsToUse;

  if (suitCount === 1) {
    suitsToUse = ['♠', '♠', '♠', '♠']; // All spades
  } else if (suitCount === 2) {
    suitsToUse = ['♠', '♥', '♠', '♥']; // Spades and hearts
  } else {
    suitsToUse = ['♠', '♥', '♦', '♣']; // All suits
  }

  // Create 2 decks (8 complete suits)
  for (let d = 0; d < 2; d++) {
    for (const suit of suitsToUse) {
      for (let i = 0; i < RANKS.length; i++) {
        deck.push({
          suit,
          rank: RANKS[i],
          value: i + 1,
          color: SUIT_COLORS[suit],
          id: `${suit}-${RANKS[i]}-${d}-${deck.length}`
        });
      }
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
  stock: state.stock.map(card => ({ ...card })),
  completedSuits: state.completedSuits,
});

// Firework particle
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
    this.vy += 0.1;
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

const SpiderSolitaire = ({ onSwitchGame }) => {
  const [tableau, setTableau] = useState([[], [], [], [], [], [], [], [], [], []]);
  const [stock, setStock] = useState([]);
  const [completedSuits, setCompletedSuits] = useState(0);
  const [selectedCard, setSelectedCard] = useState(null);
  const [moves, setMoves] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [history, setHistory] = useState([]);
  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [suitCount, setSuitCount] = useState(() => {
    const saved = localStorage.getItem('spider_suitCount');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [dealingCards, setDealingCards] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('solitaire_sound') !== 'false';
  });
  const [cardBackDesign, setCardBackDesign] = useState(() => {
    return localStorage.getItem('solitaire_cardBack') || 'classic-navy';
  });
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('spider_stats');
    return saved ? JSON.parse(saved) : { gamesPlayed: 0, gamesWon: 0, bestMoves: null, bestTime: null };
  });
  const [showSuitSelector, setShowSuitSelector] = useState(false);

  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationFrameRef = useRef(null);

  const currentDesign = getDesignById(cardBackDesign);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Timer
  useEffect(() => {
    let interval;
    if (isPlaying && !gameWon) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameWon]);

  // Save stats
  useEffect(() => {
    localStorage.setItem('spider_stats', JSON.stringify(stats));
  }, [stats]);

  // Check if a sequence of cards is valid (same suit, descending)
  const isValidSequence = (cards) => {
    if (cards.length === 0) return true;
    for (let i = 0; i < cards.length - 1; i++) {
      if (cards[i].suit !== cards[i + 1].suit) return false;
      if (cards[i].value !== cards[i + 1].value + 1) return false;
    }
    return true;
  };

  // Check if we can move cards to a pile
  const canMoveToTableau = (cards, targetPile) => {
    if (targetPile.length === 0) return true;
    const topCard = targetPile[targetPile.length - 1];
    return topCard.faceUp && topCard.value === cards[0].value + 1;
  };

  // Check for completed suit (K to A of same suit)
  const checkForCompletedSuit = useCallback((pile) => {
    if (pile.length < 13) return null;

    const last13 = pile.slice(-13);
    if (!last13.every(c => c.faceUp)) return null;

    const suit = last13[0].suit;
    if (!last13.every(c => c.suit === suit)) return null;

    // Check if it's K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2, A
    for (let i = 0; i < 13; i++) {
      if (last13[i].value !== 13 - i) return null;
    }

    return 13; // Return how many cards to remove
  }, []);

  // Fireworks
  const launchFirework = useCallback((x, y) => {
    const colors = ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffa500'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 30; i++) {
      particlesRef.current.push(new Particle(x, y, color));
    }
  }, []);

  const animateFireworks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particlesRef.current = particlesRef.current.filter(p => {
      p.draw(ctx);
      return p.update();
    });

    if (particlesRef.current.length > 0 || gameWon) {
      animationFrameRef.current = requestAnimationFrame(animateFireworks);
    }
  }, [gameWon]);

  useEffect(() => {
    if (gameWon) {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      if (soundEnabled) playWinSound();

      const launchInterval = setInterval(() => {
        launchFirework(
          Math.random() * window.innerWidth,
          Math.random() * window.innerHeight * 0.5
        );
      }, 300);

      animateFireworks();

      return () => {
        clearInterval(launchInterval);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [gameWon, animateFireworks, launchFirework, soundEnabled]);

  const saveToHistory = useCallback(() => {
    const currentState = cloneGameState({ tableau, stock, completedSuits });
    setHistory(prev => [...prev, currentState]);
  }, [tableau, stock, completedSuits]);

  const initGame = useCallback((suits = suitCount) => {
    setDealingCards(true);

    const deck = shuffleDeck(createSpiderDeck(suits));

    // Deal: first 4 piles get 6 cards, last 6 piles get 5 cards (54 total)
    const newTableau = [[], [], [], [], [], [], [], [], [], []];
    let deckIndex = 0;

    for (let pile = 0; pile < 10; pile++) {
      const cardCount = pile < 4 ? 6 : 5;
      for (let i = 0; i < cardCount; i++) {
        const isLast = i === cardCount - 1;
        newTableau[pile].push({ ...deck[deckIndex], faceUp: isLast });
        deckIndex++;
      }
    }

    // Remaining 50 cards go to stock
    const newStock = deck.slice(deckIndex).map(c => ({ ...c, faceUp: false }));

    setTableau(newTableau);
    setStock(newStock);
    setCompletedSuits(0);
    setSelectedCard(null);
    setMoves(0);
    setGameWon(false);
    setHistory([]);
    setTimer(0);
    setIsPlaying(true);
    particlesRef.current = [];

    setStats(prev => {
      const newStats = { ...prev, gamesPlayed: prev.gamesPlayed + 1 };
      localStorage.setItem('spider_stats', JSON.stringify(newStats));
      return newStats;
    });

    setTimeout(() => setDealingCards(false), 500);
  }, [suitCount]);

  useEffect(() => {
    initGame();
  }, []);

  // Check for win
  useEffect(() => {
    if (completedSuits === 8 && !gameWon) {
      setGameWon(true);
      setStats(prev => {
        const newStats = {
          ...prev,
          gamesWon: prev.gamesWon + 1,
          bestMoves: prev.bestMoves === null ? moves : Math.min(prev.bestMoves, moves),
          bestTime: prev.bestTime === null ? timer : Math.min(prev.bestTime, timer),
        };
        localStorage.setItem('spider_stats', JSON.stringify(newStats));
        return newStats;
      });
    }
  }, [completedSuits, gameWon, moves, timer]);

  const handleCardClick = (pileIndex, cardIndex) => {
    if (dealingCards || gameWon) return;

    const pile = tableau[pileIndex];
    const card = pile[cardIndex];

    if (!card.faceUp) return;

    // Get the cards from clicked card to end
    const cardsToMove = pile.slice(cardIndex);

    // Check if this is a valid sequence to pick up
    if (!isValidSequence(cardsToMove)) return;

    if (selectedCard === null) {
      // Select the cards
      setSelectedCard({ pileIndex, cardIndex, cards: cardsToMove });
      if (soundEnabled) playCardSound();
    } else if (selectedCard.pileIndex === pileIndex) {
      // Deselect
      setSelectedCard(null);
    } else {
      // Try to move
      if (canMoveToTableau(selectedCard.cards, pile)) {
        saveToHistory();

        const newTableau = [...tableau];
        // Remove cards from source
        newTableau[selectedCard.pileIndex] = tableau[selectedCard.pileIndex].slice(0, selectedCard.cardIndex);
        // Flip top card if needed
        if (newTableau[selectedCard.pileIndex].length > 0) {
          const topCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
          if (!topCard.faceUp) {
            newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...topCard, faceUp: true };
          }
        }
        // Add cards to target
        newTableau[pileIndex] = [...pile, ...selectedCard.cards];

        // Check for completed suit
        const completedCount = checkForCompletedSuit(newTableau[pileIndex]);
        if (completedCount) {
          newTableau[pileIndex] = newTableau[pileIndex].slice(0, -completedCount);
          // Flip new top card if needed
          if (newTableau[pileIndex].length > 0) {
            const newTop = newTableau[pileIndex][newTableau[pileIndex].length - 1];
            if (!newTop.faceUp) {
              newTableau[pileIndex][newTableau[pileIndex].length - 1] = { ...newTop, faceUp: true };
            }
          }
          setCompletedSuits(prev => prev + 1);
          if (soundEnabled) playCompleteSound();
        } else {
          if (soundEnabled) playCardSound();
        }

        setTableau(newTableau);
        setMoves(m => m + 1);
      }
      setSelectedCard(null);
    }
  };

  const handleEmptyPileClick = (pileIndex) => {
    if (!selectedCard || dealingCards || gameWon) return;

    saveToHistory();

    const newTableau = [...tableau];
    newTableau[selectedCard.pileIndex] = tableau[selectedCard.pileIndex].slice(0, selectedCard.cardIndex);
    // Flip top card if needed
    if (newTableau[selectedCard.pileIndex].length > 0) {
      const topCard = newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1];
      if (!topCard.faceUp) {
        newTableau[selectedCard.pileIndex][newTableau[selectedCard.pileIndex].length - 1] = { ...topCard, faceUp: true };
      }
    }
    newTableau[pileIndex] = [...selectedCard.cards];

    setTableau(newTableau);
    setMoves(m => m + 1);
    setSelectedCard(null);
    if (soundEnabled) playCardSound();
  };

  const handleStockClick = () => {
    if (stock.length === 0 || dealingCards || gameWon) return;

    // Check if there are any empty piles - can't deal if there are
    const hasEmptyPile = tableau.some(pile => pile.length === 0);
    if (hasEmptyPile) {
      // Show feedback that you can't deal with empty piles
      return;
    }

    saveToHistory();

    const newTableau = [...tableau];
    const newStock = [...stock];

    // Deal one card to each pile
    for (let i = 0; i < 10 && newStock.length > 0; i++) {
      const card = { ...newStock.pop(), faceUp: true };
      newTableau[i] = [...newTableau[i], card];
    }

    // Check each pile for completed suits
    let newCompletedSuits = completedSuits;
    for (let i = 0; i < 10; i++) {
      const completedCount = checkForCompletedSuit(newTableau[i]);
      if (completedCount) {
        newTableau[i] = newTableau[i].slice(0, -completedCount);
        if (newTableau[i].length > 0) {
          const newTop = newTableau[i][newTableau[i].length - 1];
          if (!newTop.faceUp) {
            newTableau[i][newTableau[i].length - 1] = { ...newTop, faceUp: true };
          }
        }
        newCompletedSuits++;
        if (soundEnabled) playCompleteSound();
      }
    }

    setTableau(newTableau);
    setStock(newStock);
    setCompletedSuits(newCompletedSuits);
    setMoves(m => m + 1);
    setSelectedCard(null);
    if (soundEnabled) playCardSound();
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setTableau(previousState.tableau);
    setStock(previousState.stock);
    setCompletedSuits(previousState.completedSuits);
    setHistory(prev => prev.slice(0, -1));
    setSelectedCard(null);
    setMoves(m => m + 1);
  };

  const handleSuitChange = (suits) => {
    setSuitCount(suits);
    localStorage.setItem('spider_suitCount', suits.toString());
    setShowSuitSelector(false);
    initGame(suits);
  };

  const getSuitLabel = () => {
    if (suitCount === 1) return '1 Suit (Easy)';
    if (suitCount === 2) return '2 Suits (Medium)';
    return '4 Suits (Hard)';
  };

  const renderCard = (card, pileIndex, cardIndex, isTop = false) => {
    const isSelected = selectedCard &&
      selectedCard.pileIndex === pileIndex &&
      cardIndex >= selectedCard.cardIndex;

    return (
      <div
        key={card.id}
        className={`spider-card ${card.faceUp ? 'face-up' : 'face-down'} ${card.color} ${isSelected ? 'selected' : ''} ${isTop ? 'top-card' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => card.faceUp && handleCardClick(pileIndex, cardIndex)}
      >
        {card.faceUp ? (
          <>
            <div className="card-corner top-left">
              <span className="card-rank">{card.rank}</span>
              <span className="card-suit">{card.suit}</span>
            </div>
            <div className="card-center">{card.suit}</div>
            <div className="card-corner bottom-right">
              <span className="card-rank">{card.rank}</span>
              <span className="card-suit">{card.suit}</span>
            </div>
          </>
        ) : (
          <div
            className="card-back"
            style={{ background: currentDesign?.gradient || 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}
          >
            <div className="card-back-pattern" style={{ borderColor: currentDesign?.accent || '#ffd700' }}></div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="spider-solitaire">
      <canvas ref={canvasRef} className="fireworks-canvas" />

      {/* Header */}
      <div className="spider-header">
        <div className="header-left">
          <h1 className="game-title">Spider</h1>
          <span className="game-subtitle">{getSuitLabel()}</span>
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
          <div className="stat completed-stat">
            <span className="stat-icon">✓</span>
            <span className="stat-value">{completedSuits}/8</span>
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
          <h3>Settings</h3>
          <div className="setting-row">
            <span>Sound</span>
            <button
              className={`toggle-btn ${soundEnabled ? 'active' : ''}`}
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                localStorage.setItem('solitaire_sound', (!soundEnabled).toString());
              }}
            >
              {soundEnabled ? '🔊 On' : '🔇 Off'}
            </button>
          </div>
          <div className="setting-row">
            <span>Difficulty</span>
            <button
              className="toggle-btn"
              onClick={() => setShowSuitSelector(true)}
            >
              {getSuitLabel()}
            </button>
          </div>
          <hr />
          <button
            className="switch-game-btn"
            onClick={() => onSwitchGame('klondike')}
          >
            🃏 Switch to Klondike
          </button>
        </div>
      )}

      {/* Suit Selector Modal */}
      {showSuitSelector && (
        <div className="modal-overlay" onClick={() => setShowSuitSelector(false)}>
          <div className="suit-selector-modal" onClick={e => e.stopPropagation()}>
            <h3>Select Difficulty</h3>
            <p>More suits = harder game</p>
            <div className="suit-options">
              <button
                className={`suit-option ${suitCount === 1 ? 'selected' : ''}`}
                onClick={() => handleSuitChange(1)}
              >
                <span className="suit-icons">♠</span>
                <span className="suit-label">1 Suit</span>
                <span className="suit-difficulty">Easy</span>
              </button>
              <button
                className={`suit-option ${suitCount === 2 ? 'selected' : ''}`}
                onClick={() => handleSuitChange(2)}
              >
                <span className="suit-icons">♠ ♥</span>
                <span className="suit-label">2 Suits</span>
                <span className="suit-difficulty">Medium</span>
              </button>
              <button
                className={`suit-option ${suitCount === 4 ? 'selected' : ''}`}
                onClick={() => handleSuitChange(4)}
              >
                <span className="suit-icons">♠ ♥ ♦ ♣</span>
                <span className="suit-label">4 Suits</span>
                <span className="suit-difficulty">Hard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Area */}
      <div className="spider-game-area">
        {/* Tableau */}
        <div className="spider-tableau">
          {tableau.map((pile, pileIndex) => (
            <div
              key={pileIndex}
              className={`spider-pile ${pile.length === 0 ? 'empty' : ''}`}
              onClick={() => pile.length === 0 && handleEmptyPileClick(pileIndex)}
            >
              {pile.length === 0 ? (
                <div className="empty-pile-slot"></div>
              ) : (
                pile.map((card, cardIndex) =>
                  renderCard(card, pileIndex, cardIndex, cardIndex === pile.length - 1)
                )
              )}
            </div>
          ))}
        </div>

        {/* Stock */}
        <div className="spider-stock-area">
          <div
            className={`spider-stock ${stock.length === 0 ? 'empty' : ''} ${tableau.some(p => p.length === 0) ? 'disabled' : ''}`}
            onClick={handleStockClick}
            title={tableau.some(p => p.length === 0) ? "Fill all empty piles before dealing" : `${Math.ceil(stock.length / 10)} deals left`}
          >
            {stock.length > 0 ? (
              <>
                {[...Array(Math.min(5, Math.ceil(stock.length / 10)))].map((_, i) => (
                  <div
                    key={i}
                    className="stock-card"
                    style={{
                      '--stack-index': i,
                      background: currentDesign?.gradient || 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
                    }}
                  >
                    <div className="card-back-pattern" style={{ borderColor: currentDesign?.accent || '#ffd700' }}></div>
                  </div>
                ))}
                <span className="stock-count">{Math.ceil(stock.length / 10)}</span>
              </>
            ) : (
              <span className="empty-stock">Empty</span>
            )}
          </div>

          {/* Completed suits display */}
          <div className="completed-suits">
            {[...Array(completedSuits)].map((_, i) => (
              <div key={i} className="completed-suit-icon">♠</div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="spider-controls">
        <button
          className="btn btn-undo"
          onClick={handleUndo}
          disabled={history.length === 0}
        >
          ↶ Undo
        </button>
        <button
          className="btn btn-new"
          onClick={() => initGame()}
        >
          New Game
        </button>
      </div>

      {/* Win Modal */}
      {gameWon && (
        <div className="win-overlay">
          <div className="win-modal">
            <div className="win-stars">🎆 🏆 🎆</div>
            <h2 className="win-title">Victory!</h2>
            <p className="win-subtitle">Spider Solitaire - {getSuitLabel()}</p>
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
            <div className="win-buttons">
              <button className="btn btn-play-again" onClick={() => initGame()}>
                Play Again
              </button>
              <button className="btn btn-switch" onClick={() => onSwitchGame('klondike')}>
                Play Klondike
              </button>
            </div>
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

export default SpiderSolitaire;
