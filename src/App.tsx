import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, COLORS, Direction, MAZE_BLUEPRINT } from './constants';
import { GameEngine } from './lib/GameEngine';
import { Trophy, Flag, Heart, Play, Pause, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from './lib/firebase';
import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine] = useState(() => new GameEngine());
  const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('IDLE');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [aiComment, setAiComment] = useState("");

  // Firebase Auth & Data
  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const userDocRef = doc(db, 'users', u.uid);
        getDoc(userDocRef).then((docSnap) => {
          if (docSnap.exists()) {
            setHighScore(docSnap.data().highScore || 0);
          } else {
            setDoc(userDocRef, { userId: u.uid, highScore: 0 });
          }
        });
      } else {
        signInAnonymously(auth).catch((error) => {
          console.error("Firebase Anonymous Auth Error:", error.code, error.message);
          if (error.code === 'auth/admin-restricted-operation') {
            console.warn("Anonymous auth is likely disabled in Firebase Console. Please enable it under Auth -> Sign-in method.");
          }
        });
      }
    });

    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeaderboard(snapshot.docs.map(d => d.data()));
    });
    return () => unsubscribe();
  }, []);

  // AI Commentary - reduced frequency
  const lastAiScore = useRef(0);
  useEffect(() => {
    if (gameState === 'PLAYING' && score > 0 && (score - lastAiScore.current) >= 1000) {
      lastAiScore.current = score;
      fetch('/api/ghost-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, gameState: engine.isEnergized > 0 ? 'ENERGIZED' : 'NORMAL' })
      })
      .then(res => res.json())
      .then(data => {
        setAiComment(data.comment);
        setTimeout(() => setAiComment(""), 5000);
      })
      .catch(() => {});
    }
  }, [score, gameState]);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    let frameId: number;
    const loop = () => {
      engine.update();
      setScore(Math.floor(engine.score));
      setLives(engine.lives);
      
      if (engine.isGameOver) {
        setGameState('GAMEOVER');
        if (engine.score > highScore) {
          setHighScore(Math.floor(engine.score));
          if (user) {
            setDoc(doc(db, 'users', user.uid), { highScore: Math.floor(engine.score) }, { merge: true });
            addDoc(collection(db, 'leaderboard'), {
              userId: user.uid,
              userName: user.isAnonymous ? "Guest" : user.displayName || "Unknown",
              score: Math.floor(engine.score),
              timestamp: serverTimestamp()
            });
          }
        }
      }

      draw();
      frameId = requestAnimationFrame(loop);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Maze
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const type = MAZE_BLUEPRINT[y][x];
          if (type === 1) {
            ctx.strokeStyle = COLORS.WALL;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          } else if (engine.dots[y][x]) {
            ctx.fillStyle = COLORS.DOT;
            ctx.beginPath();
            ctx.arc(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 2, 0, Math.PI * 2);
            ctx.fill();
          } else if (engine.powerPellets[y][x]) {
            ctx.fillStyle = COLORS.POWER_PELLET;
            ctx.beginPath();
            ctx.arc(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Draw Pacman
      ctx.fillStyle = COLORS.PACMAN;
      ctx.shadowBlur = 10;
      ctx.shadowColor = COLORS.PACMAN;
      ctx.beginPath();
      const mouth = Math.abs(Math.sin(engine.pacman.mouthOpen / 3)) * 0.2;
      let startAngle = 0;
      let endAngle = Math.PI * 2;
      
      if (engine.pacman.direction === Direction.RIGHT) { startAngle = mouth * Math.PI; endAngle = (2 - mouth) * Math.PI; }
      else if (engine.pacman.direction === Direction.LEFT) { startAngle = (1 + mouth) * Math.PI; endAngle = (3 - mouth) * Math.PI; }
      else if (engine.pacman.direction === Direction.UP) { startAngle = (1.5 + mouth) * Math.PI; endAngle = (3.5 - mouth) * Math.PI; }
      else if (engine.pacman.direction === Direction.DOWN) { startAngle = (0.5 + mouth) * Math.PI; endAngle = (2.5 - mouth) * Math.PI; }

      ctx.arc(engine.pacman.x * TILE_SIZE + TILE_SIZE / 2, engine.pacman.y * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE / 2 - 2, startAngle, endAngle);
      ctx.lineTo(engine.pacman.x * TILE_SIZE + TILE_SIZE / 2, engine.pacman.y * TILE_SIZE + TILE_SIZE / 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Ghosts
      engine.ghosts.forEach(ghost => {
        ctx.fillStyle = engine.isEnergized > 0 ? (engine.isEnergized < 120 && Math.floor(engine.isEnergized / 10) % 2 === 0 ? '#fff' : '#0000ff') : ghost.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle as string;
        
        ctx.beginPath();
        const gx = ghost.x * TILE_SIZE + TILE_SIZE / 2;
        const gy = ghost.y * TILE_SIZE + TILE_SIZE / 2;
        ctx.arc(gx, gy, TILE_SIZE / 2 - 2, Math.PI, 0);
        ctx.lineTo(gx + TILE_SIZE / 2 - 2, gy + TILE_SIZE / 2 - 2);
        ctx.lineTo(gx - TILE_SIZE / 2 + 2, gy + TILE_SIZE / 2 - 2);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(gx - 3, gy - 2, 2, 0, Math.PI * 2);
        ctx.arc(gx + 3, gy - 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [gameState, engine]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') engine.pacman.nextDirection = Direction.UP;
      if (e.key === 'ArrowDown') engine.pacman.nextDirection = Direction.DOWN;
      if (e.key === 'ArrowLeft') engine.pacman.nextDirection = Direction.LEFT;
      if (e.key === 'ArrowRight') engine.pacman.nextDirection = Direction.RIGHT;
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);

  const resetGame = () => {
    engine.isGameOver = false;
    engine.score = 0;
    engine.lives = 3;
    engine.dots = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 0));
    engine.powerPellets = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 3));
    engine.resetPositions();
    setScore(0);
    setLives(3);
    setGameState('PLAYING');
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface select-none relative overflow-hidden font-sans antialiased">
      <div className="fixed inset-0 pointer-events-none z-[100] scanlines opacity-5"></div>
      
      {/* Header */}
      <header className="fixed top-0 left-0 w-full bg-surface/80 backdrop-blur-xl border-b border-outline/10 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl md:text-4xl font-black text-primary-container tracking-tighter drop-shadow-[0_0_8px_rgba(234,234,0,0.6)]">
            PAC-MAN: CLASSIC ARCADE
          </h1>
          <div className="flex gap-4 text-on-surface-variant">
            <Flag className="w-6 h-6 hover:text-primary transition-colors cursor-pointer" />
            <Trophy className="w-6 h-6 hover:text-primary transition-colors cursor-pointer" />
            <Heart className="w-6 h-6 hover:text-primary transition-colors cursor-pointer" />
          </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="pt-24 pb-32 px-4 md:px-12 flex flex-col md:flex-row items-center justify-center gap-12 min-h-screen">
        
        {/* Left HUD */}
        <div className="hidden md:flex flex-col gap-6 w-56">
          <div className="bg-surface-container/40 backdrop-blur-xl border border-outline/10 p-6 rounded-2xl">
            <label className="text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-2 block">1UP</label>
            <div className="text-4xl font-black text-primary-container drop-shadow-[0_0_10px_rgba(234,234,0,0.4)]">{score}</div>
          </div>
          <div className="bg-surface-container/40 backdrop-blur-xl border border-outline/10 p-6 rounded-2xl">
            <label className="text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-2 block">HIGH SCORE</label>
            <div className="text-3xl font-black">{highScore}</div>
          </div>
        </div>

        {/* Canvas / Maze */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-secondary-container/20 blur-3xl rounded-full opacity-50 group-hover:opacity-75 transition-opacity"></div>
          <div className="relative bg-[#0e0e0e] rounded-xl border-4 border-secondary-container/30 overflow-hidden shadow-[0_0_50px_rgba(7,67,255,0.2)]">
            <canvas 
              ref={canvasRef} 
              width={MAP_WIDTH * TILE_SIZE} 
              height={MAP_HEIGHT * TILE_SIZE} 
              className="image-render-pixel"
            />
            
            <AnimatePresence>
              {(gameState === 'IDLE' || gameState === 'GAMEOVER') && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center"
                >
                  <h2 className="text-5xl font-black text-primary-container mb-4 neon-text-yellow">
                    {gameState === 'GAMEOVER' ? 'GAME OVER' : 'READY?'}
                  </h2>
                  <p className="text-on-surface-variant mb-8 max-w-[250px]">
                    Use Arrow Keys to move Pac-Man. Collect all dots to win!
                  </p>
                  <button 
                    onClick={resetGame}
                    className="flex items-center gap-3 bg-primary-container text-black px-8 py-4 rounded-full font-black hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(234,234,0,0.4)]"
                  >
                    <Play className="fill-current w-5 h-5" /> 
                    {gameState === 'GAMEOVER' ? 'RESTART' : 'START GAME'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Comment Bubble */}
            <AnimatePresence>
                {aiComment && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        key={aiComment}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface-container/90 backdrop-blur border border-outline/20 px-4 py-2 rounded-xl text-xs font-bold text-primary max-w-[80%]"
                    >
                        {aiComment}
                    </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right HUD */}
        <div className="hidden lg:flex flex-col gap-6 w-64">
          <div className="bg-surface-container/40 backdrop-blur-xl border border-outline/10 p-6 rounded-2xl">
            <label className="text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4 block">LIVES</label>
            <div className="flex gap-3">
              {[...Array(lives)].map((_, i) => (
                <div key={i} className="w-8 h-8 relative">
                   <div 
                     className="absolute inset-0 bg-primary-container rounded-full" 
                     style={{ clipPath: 'polygon(100% 74%, 44% 48%, 100% 21%, 100% 0, 0 0, 0 100%, 100% 100%)' }}
                   ></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-surface-container/40 backdrop-blur-xl border border-outline/10 p-6 rounded-2xl flex-grow">
             <label className="text-[10px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4 block">LEADERBOARD</label>
             <div className="space-y-4">
                {leaderboard.map((entry, i) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 p-2 rounded-lg">
                        <span className="text-xs font-bold text-on-surface-variant">{entry.userName}</span>
                        <span className="text-sm font-black text-primary">{entry.score}</span>
                    </div>
                ))}
             </div>
          </div>
        </div>
      </main>

      {/* Mobile Controls */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface/90 backdrop-blur-lg border-t border-outline/10 p-6 flex justify-center gap-8 items-center z-50">
         <button onClick={() => setGameState(prev => prev === 'PLAYING' ? 'PAUSED' : 'PLAYING')} className="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            {gameState === 'PLAYING' ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            <span className="text-[10px] font-bold uppercase tracking-widest">{gameState === 'PLAYING' ? 'PAUSE' : 'START'}</span>
         </button>
         <button onClick={resetGame} className="flex flex-col items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            <RotateCcw className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-widest">RESET</span>
         </button>
      </nav>
    </div>
  );
}
