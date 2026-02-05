import { useState } from 'react'
import Solitaire from './components/Solitaire'
import SpiderSolitaire from './components/SpiderSolitaire'
import './App.css'

function App() {
  const [gameType, setGameType] = useState(() => {
    return localStorage.getItem('solitaire_gameType') || 'klondike'
  });

  const handleGameTypeChange = (type) => {
    setGameType(type);
    localStorage.setItem('solitaire_gameType', type);
  };

  return (
    <div className="app">
      {gameType === 'klondike' ? (
        <Solitaire onSwitchGame={handleGameTypeChange} />
      ) : (
        <SpiderSolitaire onSwitchGame={handleGameTypeChange} />
      )}
    </div>
  )
}

export default App
