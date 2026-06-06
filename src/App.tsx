import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const GEMS = ['💎', '💠', '🔴', '🟢', '🟡', '🟣'];
const COLS = 8;
const ROWS = 8;
const START_MOVES = 30;
const STORAGE_KEY = 'crystal-crush-highscore';

type Grid = string[][];
type Position = [number, number];
type Move = { from: Position; to: Position };

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function makeGrid(): Grid {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => GEMS[Math.floor(Math.random() * GEMS.length)])
  );
}

function hasAnyMatches(grid: Grid): boolean {
  return findMatches(grid).some((row) => row.some(Boolean));
}

function findMatches(grid: Grid): boolean[][] {
  const matched = Array.from({ length: ROWS }, () => Array(COLS).fill(false));

  for (let r = 0; r < ROWS; r++) {
    let count = 1;
    for (let c = 1; c <= COLS; c++) {
      if (c < COLS && grid[r][c] && grid[r][c] === grid[r][c - 1]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) {
            matched[r][c - 1 - k] = true;
          }
        }
        count = 1;
      }
    }
  }

  for (let c = 0; c < COLS; c++) {
    let count = 1;
    for (let r = 1; r <= ROWS; r++) {
      if (r < ROWS && grid[r][c] && grid[r][c] === grid[r - 1][c]) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = 0; k < count; k++) {
            matched[r - 1 - k][c] = true;
          }
        }
        count = 1;
      }
    }
  }

  return matched;
}

function clearMatches(grid: Grid, matched: boolean[][]): { grid: Grid; cleared: number } {
  let cleared = 0;
  const nextGrid = grid.map((row, r) =>
    row.map((cell, c) => {
      if (matched[r][c]) {
        cleared++;
        return '';
      }
      return cell;
    })
  );

  return { grid: nextGrid, cleared };
}

function applyGravity(grid: Grid): Grid {
  const nextGrid = grid.map((row) => [...row]);

  for (let c = 0; c < COLS; c++) {
    const column: string[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (nextGrid[r][c]) {
        column.push(nextGrid[r][c]);
      }
    }

    while (column.length < ROWS) {
      column.push(GEMS[Math.floor(Math.random() * GEMS.length)]);
    }

    for (let r = 0; r < ROWS; r++) {
      nextGrid[ROWS - 1 - r][c] = column[r];
    }
  }

  return nextGrid;
}

function swap(grid: Grid, r1: number, c1: number, r2: number, c2: number): Grid {
  const nextGrid = grid.map((row) => [...row]);
  [nextGrid[r1][c1], nextGrid[r2][c2]] = [nextGrid[r2][c2], nextGrid[r1][c1]];
  return nextGrid;
}

function adjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function wouldMatch(grid: Grid, r1: number, c1: number, r2: number, c2: number): boolean {
  return hasAnyMatches(swap(grid, r1, c1, r2, c2));
}

function findPossibleMoves(grid: Grid): Move[] {
  const moves: Move[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS && wouldMatch(grid, r, c, r, c + 1)) {
        moves.push({ from: [r, c], to: [r, c + 1] });
      }

      if (r + 1 < ROWS && wouldMatch(grid, r, c, r + 1, c)) {
        moves.push({ from: [r, c], to: [r + 1, c] });
      }
    }
  }

  return moves;
}

function generatePlayableGrid(): Grid {
  for (let attempt = 0; attempt < 500; attempt++) {
    const grid = makeGrid();
    if (!hasAnyMatches(grid) && findPossibleMoves(grid).length > 0) {
      return grid;
    }
  }

  return makeGrid();
}

async function runHaptic(type: 'light' | 'medium' | 'success' | 'warning' | 'error') {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    if (type === 'success' || type === 'warning' || type === 'error') {
      const map = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      } as const;
      await Haptics.notification({ type: map[type] });
      return;
    }

    const style = type === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    return;
  }
}

export default function App() {
  const [grid, setGrid] = useState<Grid>([]);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [moves, setMoves] = useState(START_MOVES);
  const [selected, setSelected] = useState<Position | null>(null);
  const [combo, setCombo] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [matchedCells, setMatchedCells] = useState<boolean[][]>([]);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [statusMessage, setStatusMessage] = useState('Find a match to start scoring.');
  const comboResetRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearComboTimer = useCallback(() => {
    if (comboResetRef.current) {
      window.clearTimeout(comboResetRef.current);
      comboResetRef.current = null;
    }
  }, []);

  const showCombo = useCallback(
    (comboCount: number, message: string) => {
      setCombo(comboCount);
      setStatusMessage(message);
      clearComboTimer();
      comboResetRef.current = window.setTimeout(() => setCombo(0), 1500);
    },
    [clearComboTimer]
  );

  const resolveBoard = useCallback(
    async (startGrid: Grid) => {
      setAnimating(true);
      setHintMove(null);
      let current = startGrid;
      let comboCount = 0;

      while (true) {
        const matched = findMatches(current);
        if (!matched.some((row) => row.some(Boolean))) {
          break;
        }

        comboCount++;
        setMatchedCells(matched);
        setStatusMessage(comboCount === 1 ? 'Nice match!' : `${comboCount}x combo!`);
        await delay(220);

        const { grid: cleared, cleared: clearedCount } = clearMatches(current, matched);
        current = cleared;
        setGrid(cleared);
        setScore((currentScore) => currentScore + clearedCount * 10 * comboCount);
        await runHaptic(comboCount > 1 ? 'success' : 'medium');
        await delay(120);

        current = applyGravity(current);
        setGrid(current);
        setMatchedCells([]);
        await delay(150);
      }

      if (findPossibleMoves(current).length === 0) {
        const reshuffled = generatePlayableGrid();
        setStatusMessage('Board reshuffled — no moves were left.');
        await delay(200);
        current = reshuffled;
        setGrid(current);
        setHintMove(null);
        setMatchedCells([]);
        await runHaptic('warning');
        await delay(120);
      } else if (comboCount > 0) {
        setStatusMessage(comboCount === 1 ? 'Great swap!' : `${comboCount} combo chain!`);
      }

      showCombo(comboCount, comboCount > 0 ? 'Combo chain complete.' : 'Ready for your next move.');
      setAnimating(false);
      return current;
    },
    [showCombo]
  );

  const init = useCallback(() => {
    clearComboTimer();
    const nextGrid = generatePlayableGrid();
    setGrid(nextGrid);
    setScore(0);
    setMoves(START_MOVES);
    setSelected(null);
    setCombo(0);
    setAnimating(false);
    setGameOver(false);
    setMatchedCells([]);
    setHintMove(null);
    setStatusMessage('Find a match to start scoring.');
  }, [clearComboTimer]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setHighScore(parseInt(saved, 10) || 0);
    }
    init();
  }, [init]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem(STORAGE_KEY, String(score));
    }
  }, [score, highScore]);

  useEffect(() => {
    if (moves <= 0 && !animating) {
      setGameOver(true);
      setStatusMessage('Out of moves. Start a new game to try again.');
    }
  }, [moves, animating]);

  useEffect(() => () => clearComboTimer(), [clearComboTimer]);

  const handleHint = useCallback(async () => {
    if (animating || gameOver || grid.length === 0) {
      return;
    }

    const movesAvailable = findPossibleMoves(grid);
    if (!movesAvailable.length) {
      setStatusMessage('Board had no moves — reshuffling now.');
      const nextGrid = generatePlayableGrid();
      setGrid(nextGrid);
      setHintMove(null);
      await runHaptic('warning');
      return;
    }

    const move = movesAvailable[Math.floor(Math.random() * movesAvailable.length)];
    setHintMove(move);
    setSelected(null);
    setStatusMessage(
      `Hint: swap row ${move.from[0] + 1}, col ${move.from[1] + 1} with row ${move.to[0] + 1}, col ${move.to[1] + 1}.`
    );
    await runHaptic('light');
  }, [animating, gameOver, grid]);

  const handleClick = useCallback(
    async (r: number, c: number) => {
      if (animating || gameOver) {
        return;
      }

      if (!selected) {
        setSelected([r, c]);
        setHintMove(null);
        setStatusMessage('Select an adjacent gem to swap.');
        return;
      }

      const [selectedRow, selectedCol] = selected;

      if (selectedRow === r && selectedCol === c) {
        setSelected(null);
        return;
      }

      if (!adjacent(selectedRow, selectedCol, r, c)) {
        setSelected([r, c]);
        setHintMove(null);
        setStatusMessage('Selected gem updated. Pick an adjacent gem next.');
        return;
      }

      const swapped = swap(grid, selectedRow, selectedCol, r, c);
      if (hasAnyMatches(swapped)) {
        setGrid(swapped);
        setSelected(null);
        setHintMove(null);
        setMoves((currentMoves) => currentMoves - 1);
        setStatusMessage('Match found!');
        await runHaptic('medium');
        await resolveBoard(swapped);
      } else {
        setGrid(swapped);
        await delay(150);
        setGrid(grid);
        setSelected(null);
        setHintMove(null);
        setStatusMessage('That swap does not make a match.');
        await runHaptic('light');
      }
    },
    [animating, gameOver, grid, resolveBoard, selected]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-blue-950 to-black flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] select-none text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/70 p-4 sm:p-6 shadow-2xl backdrop-blur">
        <div className="text-center mb-4">
          <h1 className="text-4xl font-black tracking-tight drop-shadow-lg">💎 Crystal Crush</h1>
          <p className="text-sm text-blue-200/90 mt-2">Match gems, build combos, and keep the board moving.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-[0.25em] text-blue-200/70">Score</div>
            <div className="text-2xl font-bold">{score}</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-[0.25em] text-blue-200/70">Best</div>
            <div className="text-2xl font-bold text-yellow-300">{highScore}</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-[0.25em] text-blue-200/70">Moves</div>
            <div className={`text-2xl font-bold ${moves <= 5 ? 'text-red-300' : ''}`}>{moves}</div>
          </div>
        </div>

        <div
          className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 min-h-[3rem] flex items-center justify-center text-center"
          aria-live="polite"
        >
          {statusMessage}
        </div>

        {combo >= 2 && (
          <div className="text-center text-3xl font-black text-yellow-300 animate-bounce mb-3 drop-shadow-lg">
            {combo}x COMBO!
          </div>
        )}

        <div
          className="grid gap-1.5 p-2 rounded-3xl bg-slate-950/50 shadow-inner border border-white/10"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {grid.map((row, r) =>
            row.map((gem, c) => {
              const isSelected = selected && selected[0] === r && selected[1] === c;
              const isHintCell =
                hintMove &&
                ((hintMove.from[0] === r && hintMove.from[1] === c) ||
                  (hintMove.to[0] === r && hintMove.to[1] === c));
              const isMatched = matchedCells[r] && matchedCells[r][c];

              return (
                <button
                  key={`${r}-${c}`}
                  onClick={() => handleClick(r, c)}
                  disabled={animating || gameOver}
                  aria-label={`Gem ${gem} at row ${r + 1} column ${c + 1}`}
                  className={
                    'aspect-square rounded-xl text-2xl sm:text-3xl flex items-center justify-center transition-all duration-200 ' +
                    'bg-slate-800/80 hover:bg-slate-700 active:scale-90 shadow-lg border border-white/5 ' +
                    (isSelected ? 'ring-4 ring-yellow-300 scale-105 ' : '') +
                    (isHintCell ? 'ring-4 ring-cyan-300 scale-105 ' : '') +
                    (isMatched ? 'scale-110 bg-yellow-400/80 ' : '')
                  }
                >
                  {gem}
                </button>
              );
            })
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={handleHint}
            disabled={animating || gameOver}
            className="px-4 py-3 rounded-2xl font-semibold bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✨ Hint
          </button>
          <button
            onClick={init}
            disabled={animating}
            className="px-4 py-3 rounded-2xl font-semibold bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Start a new game"
          >
            🔄 New Game
          </button>
        </div>

        <p className="text-slate-300 text-xs mt-4 text-center leading-relaxed">
          Tap one gem, then an adjacent gem. Build rows or columns of 3+ and chain combos for bonus points.
        </p>
      </div>

      {gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-white mb-2">Game Over</h2>
            <p className="text-blue-200 mb-1">Final Score</p>
            <p className="text-5xl font-black text-yellow-300 mb-4">{score}</p>
            {score === highScore && score > 0 && <p className="text-yellow-200 mb-4">🏆 New high score!</p>}
            <button
              onClick={init}
              className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold shadow-lg"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
