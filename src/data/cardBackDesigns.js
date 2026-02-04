// 15 unique card back designs with different patterns, colors, and themes
export const CARD_BACK_DESIGNS = [
  {
    id: 'classic-navy',
    name: 'Classic Navy',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1f33 100%)',
    borderColor: '#2d5a87',
    pattern: 'diagonal-gold',
    accentColor: 'rgba(255, 215, 0, 0.4)',
    patternColor: 'rgba(255, 215, 0, 0.1)',
    symbol: '♠'
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    background: 'linear-gradient(135deg, #4a1e6b 0%, #2d1040 100%)',
    borderColor: '#6b3a8f',
    pattern: 'diagonal-silver',
    accentColor: 'rgba(192, 192, 255, 0.5)',
    patternColor: 'rgba(192, 192, 255, 0.12)',
    symbol: '♛'
  },
  {
    id: 'emerald-green',
    name: 'Emerald',
    background: 'linear-gradient(135deg, #1a4d3e 0%, #0d2920 100%)',
    borderColor: '#2d7a5f',
    pattern: 'diamonds',
    accentColor: 'rgba(80, 255, 180, 0.5)',
    patternColor: 'rgba(80, 255, 180, 0.1)',
    symbol: '♦'
  },
  {
    id: 'crimson-red',
    name: 'Crimson',
    background: 'linear-gradient(135deg, #6b1a1a 0%, #3d0d0d 100%)',
    borderColor: '#8f3a3a',
    pattern: 'hearts',
    accentColor: 'rgba(255, 150, 150, 0.5)',
    patternColor: 'rgba(255, 100, 100, 0.12)',
    symbol: '♥'
  },
  {
    id: 'ocean-blue',
    name: 'Ocean Wave',
    background: 'linear-gradient(135deg, #0077b6 0%, #023e8a 100%)',
    borderColor: '#00b4d8',
    pattern: 'waves',
    accentColor: 'rgba(144, 224, 239, 0.5)',
    patternColor: 'rgba(144, 224, 239, 0.15)',
    symbol: '≈'
  },
  {
    id: 'sunset-orange',
    name: 'Sunset',
    background: 'linear-gradient(135deg, #d35400 0%, #8e3200 100%)',
    borderColor: '#e67e22',
    pattern: 'sunburst',
    accentColor: 'rgba(255, 220, 100, 0.5)',
    patternColor: 'rgba(255, 200, 50, 0.15)',
    symbol: '☀'
  },
  {
    id: 'midnight-black',
    name: 'Midnight',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #0a0a15 100%)',
    borderColor: '#333366',
    pattern: 'stars',
    accentColor: 'rgba(255, 255, 255, 0.6)',
    patternColor: 'rgba(255, 255, 255, 0.08)',
    symbol: '★'
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    background: 'linear-gradient(135deg, #b76e79 0%, #704550 100%)',
    borderColor: '#d4a5ad',
    pattern: 'floral',
    accentColor: 'rgba(255, 230, 220, 0.5)',
    patternColor: 'rgba(255, 220, 210, 0.15)',
    symbol: '✿'
  },
  {
    id: 'forest-camo',
    name: 'Forest',
    background: 'linear-gradient(135deg, #2d5016 0%, #1a3009 100%)',
    borderColor: '#4a8028',
    pattern: 'leaves',
    accentColor: 'rgba(150, 220, 100, 0.5)',
    patternColor: 'rgba(120, 200, 80, 0.12)',
    symbol: '♣'
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    background: 'linear-gradient(135deg, #4a6fa5 0%, #2d4a6f 100%)',
    borderColor: '#7eb5d6',
    pattern: 'snowflakes',
    accentColor: 'rgba(220, 240, 255, 0.6)',
    patternColor: 'rgba(200, 230, 255, 0.15)',
    symbol: '❄'
  },
  {
    id: 'volcanic',
    name: 'Volcanic',
    background: 'linear-gradient(135deg, #4a1c1c 0%, #2d0a0a 100%)',
    borderColor: '#ff4500',
    pattern: 'lava',
    accentColor: 'rgba(255, 100, 0, 0.6)',
    patternColor: 'rgba(255, 69, 0, 0.2)',
    symbol: '▲'
  },
  {
    id: 'velvet',
    name: 'Velvet',
    background: 'linear-gradient(135deg, #5c1a4d 0%, #320d2a 100%)',
    borderColor: '#8f3a75',
    pattern: 'swirl',
    accentColor: 'rgba(255, 150, 220, 0.5)',
    patternColor: 'rgba(220, 100, 180, 0.12)',
    symbol: '♠'
  },
  {
    id: 'bamboo',
    name: 'Bamboo',
    background: 'linear-gradient(135deg, #5a6e3a 0%, #3a4a25 100%)',
    borderColor: '#8fa858',
    pattern: 'bamboo',
    accentColor: 'rgba(200, 230, 150, 0.5)',
    patternColor: 'rgba(180, 210, 130, 0.15)',
    symbol: '|'
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    background: 'linear-gradient(135deg, #1a0a30 0%, #0d0520 50%, #1a0a30 100%)',
    borderColor: '#6b3fa0',
    pattern: 'nebula',
    accentColor: 'rgba(200, 150, 255, 0.5)',
    patternColor: 'rgba(150, 100, 255, 0.15)',
    symbol: '✦'
  },
  {
    id: 'casino',
    name: 'Casino',
    background: 'linear-gradient(135deg, #1a472a 0%, #0d2415 100%)',
    borderColor: '#d4af37',
    pattern: 'checker',
    accentColor: 'rgba(212, 175, 55, 0.6)',
    patternColor: 'rgba(212, 175, 55, 0.15)',
    symbol: '$'
  }
];

export const getDesignById = (id) => {
  return CARD_BACK_DESIGNS.find(d => d.id === id) || CARD_BACK_DESIGNS[0];
};
