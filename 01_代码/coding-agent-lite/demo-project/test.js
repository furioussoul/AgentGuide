const assert = require('node:assert/strict');
const { createGame, setDirection, step, directionFromKey, TILE_COUNT } = require('./game');

function fixedRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

{
  const game = createGame(fixedRandom([0.75, 0.75]));
  assert.equal(game.snake.length, 3, '初始蛇长度应为 3');
  assert.deepEqual(game.direction, { x: 1, y: 0 }, '初始方向应向右');
  assert.ok(game.food.x >= 0 && game.food.x < TILE_COUNT, '食物 x 坐标应在棋盘内');
}

{
  const game = createGame(fixedRandom([0.75, 0.75]));
  step(game);
  assert.deepEqual(game.snake[0], { x: 10, y: 10 }, '移动一步后蛇头应前进');
  assert.equal(game.snake.length, 3, '未吃食物时长度不变');
}

{
  const game = createGame(fixedRandom([0.95, 0.95]));
  game.food = { x: 10, y: 10 };
  step(game);
  assert.equal(game.score, 1, '吃到食物后分数加 1');
  assert.equal(game.snake.length, 4, '吃到食物后长度加 1');
}

{
  const game = createGame(fixedRandom([0.75, 0.75]));
  setDirection(game, { x: -1, y: 0 });
  assert.deepEqual(game.nextDirection, { x: 1, y: 0 }, '不能直接反向移动');
  setDirection(game, { x: 0, y: -1 });
  assert.deepEqual(game.nextDirection, { x: 0, y: -1 }, '应允许转向上方');
}

{
  const game = createGame(fixedRandom([0.75, 0.75]));
  game.snake = [{ x: TILE_COUNT - 1, y: 0 }];
  game.direction = { x: 1, y: 0 };
  game.nextDirection = { x: 1, y: 0 };
  step(game);
  assert.equal(game.over, true, '撞墙后游戏结束');
}

{
  assert.deepEqual(directionFromKey('ArrowUp'), { x: 0, y: -1 }, '方向键应映射到方向');
  assert.deepEqual(directionFromKey('a'), { x: -1, y: 0 }, 'WASD 应映射到方向');
  assert.equal(directionFromKey('Enter'), undefined, '无关按键不应映射方向');
}

console.log('All tests passed');
