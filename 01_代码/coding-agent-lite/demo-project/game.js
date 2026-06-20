(function () {
  'use strict';

  const GRID_SIZE = 20;
  const TILE_COUNT = 20;
  const START_SNAKE = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 }
  ];

  function sameCell(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function createGame(random = Math.random) {
    const game = {
      snake: START_SNAKE.map(part => ({ ...part })),
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food: { x: 14, y: 10 },
      score: 0,
      over: false,
      random
    };
    placeFood(game);
    return game;
  }

  function setDirection(game, direction) {
    const isOpposite = direction.x + game.direction.x === 0 && direction.y + game.direction.y === 0;
    if (!isOpposite) {
      game.nextDirection = direction;
    }
  }

  function placeFood(game) {
    let food;
    do {
      food = {
        x: Math.floor(game.random() * TILE_COUNT),
        y: Math.floor(game.random() * TILE_COUNT)
      };
    } while (game.snake.some(part => sameCell(part, food)));
    game.food = food;
  }

  function step(game) {
    if (game.over) return game;

    game.direction = game.nextDirection;
    const head = game.snake[0];
    const nextHead = {
      x: head.x + game.direction.x,
      y: head.y + game.direction.y
    };

    const hitWall = nextHead.x < 0 || nextHead.x >= TILE_COUNT || nextHead.y < 0 || nextHead.y >= TILE_COUNT;
    const hitSelf = game.snake.some(part => sameCell(part, nextHead));
    if (hitWall || hitSelf) {
      game.over = true;
      return game;
    }

    game.snake.unshift(nextHead);
    if (sameCell(nextHead, game.food)) {
      game.score += 1;
      placeFood(game);
    } else {
      game.snake.pop();
    }
    return game;
  }

  function draw(game, context) {
    context.fillStyle = '#0f172a';
    context.fillRect(0, 0, GRID_SIZE * TILE_COUNT, GRID_SIZE * TILE_COUNT);

    context.fillStyle = '#ef4444';
    context.fillRect(game.food.x * GRID_SIZE, game.food.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);

    context.fillStyle = '#22c55e';
    game.snake.forEach((part, index) => {
      context.fillStyle = index === 0 ? '#86efac' : '#22c55e';
      context.fillRect(part.x * GRID_SIZE, part.y * GRID_SIZE, GRID_SIZE - 2, GRID_SIZE - 2);
    });

    if (game.over) {
      context.fillStyle = 'rgba(15, 23, 42, .72)';
      context.fillRect(0, 0, GRID_SIZE * TILE_COUNT, GRID_SIZE * TILE_COUNT);
      context.fillStyle = '#f9fafb';
      context.font = 'bold 32px system-ui';
      context.textAlign = 'center';
      context.fillText('游戏结束', 200, 190);
      context.font = '18px system-ui';
      context.fillText('点击重新开始', 200, 225);
    }
  }

  function directionFromKey(key) {
    const map = {
      ArrowUp: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      W: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      s: { x: 0, y: 1 },
      S: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      A: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      d: { x: 1, y: 0 },
      D: { x: 1, y: 0 }
    };
    return map[key];
  }

  function startBrowserGame() {
    const canvas = document.getElementById('board');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const restartButton = document.getElementById('restart');
    let game = createGame();

    function render() {
      scoreElement.textContent = game.score;
      draw(game, context);
    }

    document.addEventListener('keydown', event => {
      const direction = directionFromKey(event.key);
      if (direction) {
        event.preventDefault();
        setDirection(game, direction);
      }
    });

    restartButton.addEventListener('click', () => {
      game = createGame();
      render();
    });

    setInterval(() => {
      step(game);
      render();
    }, 120);
    render();
  }

  const api = { createGame, setDirection, step, directionFromKey, TILE_COUNT };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.SnakeGame = api;
    window.addEventListener('DOMContentLoaded', startBrowserGame);
  }
}());
