import { useState, useEffect, useCallback, useRef } from 'react';

const GEMS = ['💎', '💠', '🔴', '🟢', '🟡', '🟣'];
const COLS = 8;
const ROWS = 8;
const STORAGE_KEY = 'crystal-crush-highscore';

type Grid = string[][];

function makeGrid(): Grid {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => GEMS[Math.floor(Math.random() * GEMS.length)])
  );
}

function findMatches(grid: Grid): boolean[][] {
  const matched = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    let count = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && grid[r][c] && grid[r][c] === grid[r][c - 1]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) matched[r][c - 1 - k] = true;
        }
        count = 1;
      }
    }
  }
  // Vertical
  for (let c = 0; c < COLS; c++) {
    let count = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && grid[r][c] && grid[r][c] === grid[r - 1][c]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) matched[r - 1 - k][c] = true;
        }
        count = 1;
      }
    }
  }
  return matched;
}

function clearMatches(grid: Grid, matched: boolean[][]): { grid: Grid; cleared: number } {
  let cleared = 0;
  const newGrid = grid.map((row, r) =>
    row.map((cell, c) => {
      if (matched[r][c]) { cleared++; return ''; }
      return cell;
    })
  );
  return { grid: newGrid, cleared };
}

function applyGravity(grid: Grid): Grid {
  const newGrid = grid.map(row => [...row]);
  for (let c = 0; c < COLS; c++) {
    const col: string[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newGrid[r][c]) col.push(newGrid[r][c]);
    }
    while (col.length < ROWS) col.push(GEMS[Math.floor(Math.random() * GEMS.length)]);
    for (let r = 0; r < ROWS; r++) newGrid[ROWS - 1 - r][c] = col[r];
  }
  return newGrid;
}

function swap(grid: Grid, r1: number, c1: number, r2: number, c2: number): Grid {
  const newGrid = grid.map(row => [...row]);
  [newGrid[r1][c1], newGrid[r2][c2]] = [newGrid[r2][c2], newGrid[r1][c1]];
  return newGrid;
}

function adjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

export default function App() {
  const [grid, setGrid] = useState<Grid>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [moves, setMoves] = useState(30);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [combo, setCombo] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [matchedCells, setMatchedCells] = useState<boolean[][]>([]);
  const comboRef = useRef(0);

  const resolveBoard = useCallback(async (startGrid: Grid) => {
    setAnimating(true);
    let current = startGrid;
    let comboCount = 0;
    while (true) {
      const matched = findMatches(current);
      const hasMatches = matched.flat().some(Boolean);
      if (!hasMatches) break;
      comboCount++;
      setMatchedCells(matched);
      await new Promise(r => setTimeout(r, 300));
      const { grid: cleared, cleared: count } = clearMatches(current, matched);
      setGrid(cleared);
      setScore(s => s + count * 10 * comboCount);
      await new Promise(r => setTimeout(r, 150));
      current = applyGravity(cleared);
      setGrid(current);
      setMatchedCells([]);
      await new Promise(r => setTimeout(r, 200));
    }
    setCombo(comboCount);
    comboRef.current = comboCount;
    setAnimating(false);
    setTimeout(() => setCombo(0), 1500);
    return current;
  }, []);

  const init = useCallback(async () => {
    let g = makeGrid();
    // Pre-resolve initial matches without scoring
    while (findMatches(g).flat().some(Boolean)) {
      const matched = findMatches(g);
      const { grid: cleared } = clearMatches(g, matched);
      g = applyGravity(cleared);
    }
    setGrid(g);
    setScore(0);
    setMoves(30);
    setSelected(null);
    setGameOver(false);
    setMatchedCells([]);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setHighScore(parseInt(saved, 10) || 0);
    init();
  }, [init]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem(STORAGE_KEY, String(score));
    }
  }, [score, highScore]);

  useEffect(() => {
    if (moves <= 0 && !animating) setGameOver(true);
  }, [moves, animating]);

  const handleClick = async (r: number, c: number) => {
    if (animating || gameOver) return;
    if (!selected) { setSelected([r, c]); return; }
    const [pr, pc] = selected;
    if (pr === r && pc === c) { setSelected(null); return; }
    if (!adjacent(pr, pc, r, c)) { setSelected([r, c]); return; }

    const swapped = swap(grid, pr, pc, r, c);
    const matched = findMatches(swapped);
    if (matched.flat().some(Boolean)) {
      setGrid(swapped);
      setSelected(null);
      setMoves(m => m - 1);
      await resolveBoard(swapped);
    } else {
      // Invalid swap - shake feedback
      setGrid(swapped);
      await new Promise(r => setTimeout(r, 200));
      setGrid(grid);
      setSelected(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-black flex flex-col items-center justify-center p-4 select-none">
      <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">💎 Crystal Crush</h1>
      <div className="flex gap-6 mb-4 text-white">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-blue-300">Score</div>
          <div className="text-2xl font-bold">{score}</div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-blue-300">Best</div>
          <div className="text-2xl font-bold text-yellow-300">{highScore}</div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wider text-blue-300">Moves</div>
          <div className={'text-2xl font-bold ' + (moves <= 5 ? 'text-red-400' : '')}>{moves}</div>
        </div>
      </div>

      {combo >= 2 && (
        <div className="text-3xl font-bold text-yellow-400 animate-bounce mb-2 drop-shadow-glow">
          {combo}x COMBO!
        </div>
      )}

      <div className="grid gap-1 p-2 bg-slate-800/50 rounded-2xl shadow-2xl" style={{ gridTemplateColumns: 'repeat(' + COLS + ', 1fr)' }}>
        {grid.map((row, r) => row.map((gem, c) => {
          const isSelected = selected && selected[0] === r && selected[1] === c;
          const isMatched = matchedCells[r] && matchedCells[r][c];
          return (
            <button
              key={r + '-' + c}
              onClick={() => handleClick(r, c)}
              disabled={animating || gameOver}
              aria-label={'Gem ' + gem + ' at row ' + (r + 1) + ' column ' + (c + 1)}
              className={
                'w-9 h-9 sm:w-11 sm:h-11 rounded-lg text-2xl flex items-center justify-center transition-all duration-200 ' +
                (gem ? 'bg-slate-700 hover:bg-slate-600 active:scale-90 ' : 'bg-slate-900/40 ') +
                (isSelected ? 'ring-4 ring-yellow-400 scale-110 ' : '') +
                (isMatched ? 'scale-125 animate-pulse bg-yellow-400 ' : '')
              }
            >
              {gem}
            </button>
          );
        }))}
      </div>

      <button
        onClick={init}
        className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold shadow-lg"
        aria-label="Start a new game"
      >
        🔄 New Game
      </button>

      <p className="text-slate-400 text-sm mt-3 max-w-xs text-center">
        Swap adjacent gems to make rows/columns of 3+. Chain matches for combo bonuses!
      </p>

      {gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl border border-blue-500/30">
            <h2 className="text-3xl font-bold text-white mb-2">Game Over!</h2>
            <p className="text-blue-300 mb-1">Final Score</p>
            <p className="text-5xl font-bold text-yellow-400 mb-4">{score}</p>
            {score === highScore && score > 0 && (
              <p className="text-yellow-300 mb-4">🏆 New High Score!</p>
            )}
            <button
              onClick={init}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg w-full"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
