import { useState, useEffect, useCallback, useRef } from 'react';
import './Solitaire.css';

const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
  const [showConfetti, setShowConfetti] = useState(false);
  const [dealingCards, setDealingCards] = useState(false);
  const confettiRef = useRef(null);

  // Timer effect
  useEffect(() => {
    let interval;
    if (isPlaying && !gameWon) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameWon]);

  const saveToHistory = useCallback(() => {
    const currentState = cloneGameState({ tableau, foundations, stock, waste });
    setHistory(prev => [...prev, currentState]);
  }, [tableau, foundations, stock, waste]);

  const initGame = useCallback(() => {
    setDealingCards(true);
    const deck = shuffleDeck(createDeck());
    const newTableau = [[], [], [], [], [], [], []];
    let cardIndex = 0;

    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = { ...deck[cardIndex], faceUp: row === col };
        newTableau[col].push(card);
        cardIndex++;
      }
    }

    const newStock = deck.slice(cardIndex).map(card => ({ ...card, faceUp: false }));

    setTableau(newTableau);
    setFoundations([[], [], [], []]);
    setStock(newStock);
    setWaste([]);
    setSelectedCard(null);
    setMoves(0);
    setGameWon(false);
    setHistory([]);
    setTimer(0);
    setIsPlaying(true);
    setShowConfetti(false);

    // Update games played
    setStats(prev => {
      const newStats = { ...prev, gamesPlayed: prev.gamesPlayed + 1 };
      localStorage.setItem('solitaire_stats', JSON.stringify(newStats));
      return newStats;
    });

    setTimeout(() => setDealingCards(false), 800);
  }, []);

  useEffect(() => {
    initGame();
  }, []);

  // Check for win
  useEffect(() => {
    const totalInFoundations = foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalInFoundations === 52 && !gameWon) {
      setGameWon(true);
      setShowConfetti(true);

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
    const card = { ...stock[stock.length - 1], faceUp: true };
    setStock(stock.slice(0, -1));
    setWaste([...waste, card]);
    setSelectedCard(null);
    setMoves(m => m + 1);
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
          }
        }
      }

      if (moved) setMoves(m => m + 1);
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
      }
    }
    setSelectedCard(null);
  };

  // Double-click to auto-move to foundation
  const handleDoubleClick = (source, pileIndex, cardIndex) => {
    let card;
    if (source === 'waste') {
      card = waste[waste.length - 1];
    } else if (source === 'tableau') {
      if (cardIndex !== tableau[pileIndex].length - 1) return;
      card = tableau[pileIndex][cardIndex];
    } else {
      return;
    }

    // Try to place on foundation
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
          if (newTableau[pileIndex].length > 0) {
            const lastCard = newTableau[pileIndex][newTableau[pileIndex].length - 1];
            if (!lastCard.faceUp) {
              newTableau[pileIndex][newTableau[pileIndex].length - 1] = { ...lastCard, faceUp: true };
            }
          }
          setTableau(newTableau);
        }
        setMoves(m => m + 1);
        setSelectedCard(null);
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

  const renderCard = (card, isSelected, onClick, onDoubleClick) => {
    if (!card.faceUp) {
      return (
        <div className="card card-back" onClick={onClick}>
          <div className="card-back-pattern"></div>
        </div>
      );
    }

    return (
      <div
        className={`card card-face ${card.color} ${isSelected ? 'selected' : ''}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="card-corner top-left">
          <span className="card-rank">{card.rank}</span>
          <span className="card-suit">{card.suit}</span>
        </div>
        <div className="card-center">
          <span className="card-suit-large">{card.suit}</span>
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
        </div>
      </div>

      {/* Game Board */}
      <div className="game-board">
        {/* Top Row */}
        <div className="top-row">
          <div className="stock-waste">
            <div className={`card-slot stock ${stock.length === 0 ? 'empty' : ''}`} onClick={drawFromStock}>
              {stock.length > 0 ? (
                <div className="card card-back">
                  <div className="card-back-pattern"></div>
                  <span className="stock-count">{stock.length}</span>
                </div>
              ) : (
                <span className="empty-icon">↻</span>
              )}
            </div>
            <div className="card-slot waste">
              {waste.length > 0 ? (
                renderCard(
                  waste[waste.length - 1],
                  selectedCard?.source === 'waste',
                  () => handleCardClick('waste', null, waste.length - 1),
                  () => handleDoubleClick('waste', null, waste.length - 1)
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
                    className="tableau-card"
                    style={{
                      top: `${getCardOffset(cardIndex, pile)}px`,
                      zIndex: cardIndex,
                      animationDelay: dealingCards ? `${(pileIndex * 7 + cardIndex) * 30}ms` : '0ms'
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
            <div className="win-stars">✨ 🏆 ✨</div>
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
