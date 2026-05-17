import { MAP_WIDTH, MAP_HEIGHT, MAZE_BLUEPRINT, Direction, DIRECTIONS } from '../constants';

export class GameEngine {
  pacman: { x: number; y: number; direction: Direction; nextDirection: Direction; mouthOpen: number };
  ghosts: { x: number; y: number; direction: Direction; color: string; type: string }[];
  dots: boolean[][];
  powerPellets: boolean[][];
  score: number;
  lives: number;
  isGameOver: boolean;
  isEnergized: number; // Ticks remaining for power pellet effect

  constructor() {
    this.pacman = { x: 10, y: 15, direction: Direction.NONE, nextDirection: Direction.NONE, mouthOpen: 0 };
    this.ghosts = [
      { x: 9, y: 9, direction: Direction.LEFT, color: '#ff2d2d', type: 'BLINKY' },
      { x: 10, y: 9, direction: Direction.UP, color: '#ffb6c1', type: 'PINKY' },
      { x: 11, y: 9, direction: Direction.RIGHT, color: '#00ffff', type: 'INKY' },
      { x: 10, y: 8, direction: Direction.DOWN, color: '#ffa500', type: 'CLYDE' },
    ];
    this.dots = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 0));
    this.powerPellets = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 3));
    this.score = 0;
    this.lives = 3;
    this.isGameOver = false;
    this.isEnergized = 0;
  }

  isWall(x: number, y: number) {
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    if (roundedX < 0 || roundedX >= MAP_WIDTH || roundedY < 0 || roundedY >= MAP_HEIGHT) return true;
    return MAZE_BLUEPRINT[roundedY][roundedX] === 1;
  }

  canMove(x: number, y: number, dir: Direction) {
    const { dx, dy } = DIRECTIONS[dir];
    const newX = Math.round(x + dx);
    const newY = Math.round(y + dy);
    return !this.isWall(newX, newY);
  }

  update() {
    if (this.isGameOver) return;

    if (this.isEnergized > 0) this.isEnergized--;

    // Update Pacman
    if (this.pacman.nextDirection !== Direction.NONE && this.canMove(this.pacman.x, this.pacman.y, this.pacman.nextDirection)) {
      this.pacman.direction = this.pacman.nextDirection;
      this.pacman.nextDirection = Direction.NONE;
    }

    if (this.canMove(this.pacman.x, this.pacman.y, this.pacman.direction)) {
      const { dx, dy } = DIRECTIONS[this.pacman.direction];
      this.pacman.x += dx * 0.15;
      this.pacman.y += dy * 0.15;
      this.pacman.mouthOpen = (this.pacman.mouthOpen + 1) % 20;
    }

    // Teleportation
    if (this.pacman.x < 0) this.pacman.x = MAP_WIDTH - 1;
    if (this.pacman.x >= MAP_WIDTH) this.pacman.x = 0;

    // Collect Dots
    const px = Math.round(this.pacman.x);
    const py = Math.round(this.pacman.y);
    if (this.dots[py][px]) {
      this.dots[py][px] = false;
      this.score += 10;
    }
    if (this.powerPellets[py][px]) {
      this.powerPellets[py][px] = false;
      this.score += 50;
      this.isEnergized = 600; // ~10 seconds at 60fps
    }

    // Update Ghosts
    this.ghosts.forEach(ghost => {
      // Simple random AI
      if (Math.random() < 0.05 || !this.canMove(ghost.x, ghost.y, ghost.direction)) {
        const possible = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT].filter(d => this.canMove(ghost.x, ghost.y, d));
        if (possible.length > 0) {
          ghost.direction = possible[Math.floor(Math.random() * possible.length)];
        }
      }

      const { dx, dy } = DIRECTIONS[ghost.direction];
      ghost.x += dx * (this.isEnergized > 0 ? 0.07 : 0.12);
      ghost.y += dy * (this.isEnergized > 0 ? 0.07 : 0.12);

      if (ghost.x < 0) ghost.x = MAP_WIDTH - 1;
      if (ghost.x >= MAP_WIDTH) ghost.x = 0;

      // Collision check
      const dist = Math.sqrt(Math.pow(this.pacman.x - ghost.x, 2) + Math.pow(this.pacman.y - ghost.y, 2));
      if (dist < 0.8) {
        if (this.isEnergized > 0) {
          // Eat ghost
          this.score += 200;
          ghost.x = 10;
          ghost.y = 9;
        } else {
          // Die
          this.lives--;
          if (this.lives <= 0) {
            this.isGameOver = true;
          } else {
            this.resetPositions();
          }
        }
      }
    });

    // Check Win (all dots eaten)
    if (!this.dots.some(row => row.some(dot => dot))) {
        this.nextLevel();
    }
  }

  resetPositions() {
    this.pacman.x = 10;
    this.pacman.y = 15;
    this.pacman.direction = Direction.NONE;
    this.ghosts.forEach((g, i) => {
        g.x = 9 + (i % 3);
        g.y = 9;
    });
  }

  nextLevel() {
      this.dots = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 0));
      this.powerPellets = MAZE_BLUEPRINT.map(row => row.map(cell => cell === 3));
      this.resetPositions();
      this.score += 1000;
  }
}
