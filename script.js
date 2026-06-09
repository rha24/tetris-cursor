// ── 캔버스 설정 ──────────────────────────────────────────────
const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');

// 보드 크기 (표준 테트리스: 가로 10칸 × 세로 20칸)
const COLS = 10;
const ROWS = 20;

// 캔버스 300×600px → 칸 하나당 30px
const CELL_SIZE = canvas.width / COLS;

// ── 보드 그리드 ──────────────────────────────────────────────
// 2차원 배열: board[row][col]
//   0  → 빈 칸
//   그 외 → 해당 칸에 고정된 블록의 색상 문자열 (예: '#00f0f0')
function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

// 현재 게임 보드 상태 (아직 블록이 쌓이지 않은 빈 보드)
const board = createEmptyBoard();

// ── 테트로미노 정의 ──────────────────────────────────────────
// 각 조각은 2차원 배열로 표현한다.
//   1 → 블록이 있는 칸
//   0 → 빈 칸
// 배열의 행·열 수는 조각마다 다를 수 있다 (O는 2×2, I는 4×4 등).
const TETROMINOES = {
  I: {
    color: '#00f0f0', // 시안
    shape: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  },
  O: {
    color: '#f0f000', // 노랑
    shape: [
      [1, 1],
      [1, 1],
    ],
  },
  T: {
    color: '#a000f0', // 보라
    shape: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  S: {
    color: '#00f000', // 초록
    shape: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
  },
  Z: {
    color: '#f00000', // 빨강
    shape: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
  },
  J: {
    color: '#0000f0', // 파랑
    shape: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
  L: {
    color: '#f0a000', // 주황
    shape: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
  },
};

// 낙하 속도 (레벨에 따라 변함)
const BASE_DROP_INTERVAL = 500;  // 레벨 1 기본 간격 (ms)
const DROP_SPEED_PER_LEVEL = 35; // 레벨당 감소량 (ms)
const MIN_DROP_INTERVAL = 80;    // 최소 간격 (ms)
const SCORE_PER_LEVEL = 1000;    // 이 점수마다 레벨 1 상승

// 조각 종류 목록 (무작위 생성에 사용)
const PIECE_TYPES = Object.keys(TETROMINOES);

// ── 현재 떨어지는 블록 ───────────────────────────────────────
// type  : TETROMINOES 키 ('I', 'O', 'T' …)
// x, y  : 보드 그리드 좌표 (왼쪽 위 기준, 0부터 시작)
// shape : 현재 회전 상태의 모양 배열 (지금은 회전 없이 초기 모양만 사용)
let currentPiece = null;

// 다음에 등장할 블록 종류 ('I', 'O', 'T' …)
let nextPieceType = null;

// 게임 오버 여부 (새 블록을 놓을 공간이 없을 때 true)
let isGameOver = false;

// 점수 · 라인 통계
let score = 0;
let totalLines = 0;

// 한 번에 지운 줄 수에 따른 점수 (테트리스: 1~4줄)
const LINE_SCORES = {
  1: 100,
  2: 300,
  3: 500,
  4: 800,
};

// UI 요소
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const linesElement = document.getElementById('lines');
const gameOverOverlay = document.getElementById('game-over-overlay');
const restartButton = document.getElementById('restart-btn');
const nextCanvas = document.getElementById('next-preview');
const nextCtx = nextCanvas.getContext('2d');

// 다음 블록 미리보기 캔버스 설정 (4×4 격자)
const PREVIEW_GRID = 4;
const PREVIEW_CELL = nextCanvas.width / PREVIEW_GRID;

// 자동 낙하 타이머 ID (게임 오버 시 해제)
let dropIntervalId = null;

// 보드 가로 중앙에 블록을 배치하는 x 좌표를 계산한다.
function getCenteredX(shape) {
  const shapeWidth = shape[0].length;
  return Math.floor((COLS - shapeWidth) / 2);
}

// shape 배열을 복제한다 (TETROMINOES 원본 오염·회전 롤백 방지).
function cloneShape(shape) {
  return shape.map((row) => [...row]);
}

// ── 충돌 판정 ────────────────────────────────────────────────

// 단일 칸이 보드 경계를 벗어났는지 검사한다.
//   col < 0 또는 col >= COLS → 좌우 벽 밖
//   row < 0              → 천장 위 (스폰 직후 판정에 사용)
//   row >= ROWS          → 바닥 아래
function isOutOfBounds(col, row) {
  return col < 0 || col >= COLS || row < 0 || row >= ROWS;
}

// 단일 칸이 이미 고정된 블록과 겹치는지 검사한다.
// 경계 밖 칸은 여기서 판정하지 않는다 (isOutOfBounds로 먼저 걸러야 함).
function collidesWithLockedBlock(col, row) {
  return board[row][col] !== 0;
}

// 블록이 차지하는 보드 칸 목록을 반환한다.
function getPieceCells(piece, x, y) {
  const cells = [];
  const { shape } = piece;

  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        cells.push({ col: x + col, row: y + row });
      }
    }
  }
  return cells;
}

// 블록 전체가 (x, y) 위치에 놓일 수 있는지 종합 검사한다.
// 보드 경계를 벗어나거나 고정 블록과 겹치면 false.
function isValidPosition(piece, x, y) {
  for (const { col, row } of getPieceCells(piece, x, y)) {
    if (isOutOfBounds(col, row)) return false;
    if (collidesWithLockedBlock(col, row)) return false;
  }
  return true;
}

// ── 블록 생성 · 고정 · 낙하 ──────────────────────────────────

// 보드 그리드를 빈 상태로 초기화한다.
function resetBoard() {
  for (let row = 0; row < ROWS; row++) {
    board[row].fill(0);
  }
}

// 점수에 따른 현재 레벨을 계산한다 (1부터 시작).
function getLevel() {
  return Math.floor(score / SCORE_PER_LEVEL) + 1;
}

// 레벨에 따른 자동 낙하 간격(ms)을 계산한다.
function getDropInterval() {
  const level = getLevel();
  return Math.max(
    MIN_DROP_INTERVAL,
    BASE_DROP_INTERVAL - (level - 1) * DROP_SPEED_PER_LEVEL,
  );
}

// 점수 변동 후 낙하 속도를 갱신한다.
function updateDropSpeed() {
  if (!isGameOver) {
    startDropTimer();
  }
}

// 자동 낙하 타이머를 시작한다 (현재 레벨의 간격 적용).
function startDropTimer() {
  stopDropTimer();
  dropIntervalId = setInterval(dropPiece, getDropInterval());
}

// 자동 낙하 타이머를 멈춘다.
function stopDropTimer() {
  if (dropIntervalId !== null) {
    clearInterval(dropIntervalId);
    dropIntervalId = null;
  }
}

// 게임 오버 UI를 표시한다.
function showGameOverUI() {
  gameOverOverlay.classList.remove('hidden');
  gameOverOverlay.setAttribute('aria-hidden', 'false');
}

// 게임 오버 UI를 숨긴다.
function hideGameOverUI() {
  gameOverOverlay.classList.add('hidden');
  gameOverOverlay.setAttribute('aria-hidden', 'true');
}

// 게임 오버 처리: 낙하 중지, 오버레이 표시.
function triggerGameOver() {
  isGameOver = true;
  currentPiece = null;
  stopDropTimer();
  showGameOverUI();
  draw();
}

// 무작위 블록 종류를 반환한다.
function getRandomPieceType() {
  return PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
}

// 블록 종류로 떨어지는 조각 객체를 만든다.
function createPieceFromType(type) {
  const { shape, color } = TETROMINOES[type];
  const clonedShape = cloneShape(shape);
  return {
    type,
    x: getCenteredX(clonedShape),
    y: 0,
    shape: clonedShape,
    color,
  };
}

// 다음 블록 큐를 갱신한다.
function queueNextPiece() {
  nextPieceType = getRandomPieceType();
  drawNextPreview();
}

// 맨 위 중앙에 새 블록을 생성한다. 놓을 공간이 없으면 게임 오버.
function spawnPiece() {
  if (nextPieceType === null) {
    queueNextPiece();
  }

  const spawningType = nextPieceType;
  queueNextPiece();

  currentPiece = createPieceFromType(spawningType);

  if (!isValidPosition(currentPiece, currentPiece.x, currentPiece.y)) {
    triggerGameOver();
  }
}

// 현재 블록을 보드에 고정한다 (색상을 board 배열에 기록).
// 경계 밖이면 고정하지 않는다 (예외로 게임 루프가 멈추는 것을 방지).
function lockPiece(piece) {
  if (!piece) return;

  const { color, x, y } = piece;

  if (!isValidPosition(piece, x, y)) {
    return;
  }

  for (const { col, row } of getPieceCells(piece, x, y)) {
    board[row][col] = color;
  }
}

// ── 라인 클리어 · 점수 ───────────────────────────────────────

// 한 줄(행 배열)이 가득 찼는지 검사한다 (모든 칸이 0이 아니면 true).
function isRowFull(row) {
  return row.every((cell) => cell !== 0);
}

// 가득 찬 줄을 모두 삭제하고, 위 블록을 아래로 내린다.
// 동시에 여러 줄이 지워질 수 있다. 지운 줄 수를 반환한다.
function clearFullLines() {
  // 가득 차지 않은 줄만 남긴다 (아래→위 순서 유지)
  const remaining = board.filter((row) => !isRowFull(row));
  const linesCleared = ROWS - remaining.length;

  if (linesCleared === 0) return 0;

  // 삭제된 만큼 위쪽에 빈 줄을 채워 보드 크기를 유지한다
  while (remaining.length < ROWS) {
    remaining.unshift(Array(COLS).fill(0));
  }

  for (let row = 0; row < ROWS; row++) {
    board[row] = remaining[row];
  }

  return linesCleared;
}

// 지운 줄 수에 따라 점수를 더하고 화면을 갱신한다.
function addLineClearScore(linesCleared) {
  if (linesCleared <= 0) return;

  const points = LINE_SCORES[linesCleared] ?? 0;
  const prevLevel = getLevel();
  score += points;
  totalLines += linesCleared;
  updateScoreDisplay();

  // 레벨이 올라가면 낙하 속도 갱신
  if (getLevel() > prevLevel) {
    updateDropSpeed();
  }
}

// 우측 패널의 점수·레벨·라인 수를 실시간 반영한다.
function updateScoreDisplay() {
  scoreElement.textContent = score;
  levelElement.textContent = getLevel();
  linesElement.textContent = totalLines;
}

// 현재 블록을 고정하고, 라인 클리어·점수 처리 후 다음 블록을 생성한다.
function lockCurrentPieceAndSpawnNext() {
  if (!currentPiece) return;

  // 유효한 위치에서만 고정 (경계 밖이면 스킵하되, 다음 블록은 반드시 생성)
  if (isValidPosition(currentPiece, currentPiece.x, currentPiece.y)) {
    lockPiece(currentPiece);
    const linesCleared = clearFullLines();
    addLineClearScore(linesCleared);
  }

  spawnPiece();
  draw();
}

// 보드·점수를 초기화하고 게임을 새로 시작한다.
function restartGame() {
  isGameOver = false;
  score = 0;
  totalLines = 0;
  nextPieceType = null;
  resetBoard();
  updateScoreDisplay();
  hideGameOverUI();
  spawnPiece();

  if (!isGameOver) {
    startDropTimer();
  }

  draw();
}

// 블록을 한 칸 아래로 이동 시도한다.
// 이동 불가 시 현재 블록을 고정하고 새 블록을 생성한다.
function dropPiece() {
  if (isGameOver || !currentPiece) return;

  const nextY = currentPiece.y + 1;

  if (isValidPosition(currentPiece, currentPiece.x, nextY)) {
    currentPiece.y = nextY;
  } else {
    lockCurrentPieceAndSpawnNext();
  }

  draw();
}

// ── 이동 · 회전 · 낙하 조작 ──────────────────────────────────

// 2차원 배열(블록 모양)을 시계 방향으로 90° 회전한다.
function rotateShapeClockwise(shape) {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      rotated[col][rows - 1 - row] = shape[row][col];
    }
  }
  return rotated;
}

// 블록을 (dx, dy)만큼 이동 시도한다. 성공 시 true, 막히면 false.
function tryMovePiece(dx, dy) {
  if (isGameOver || !currentPiece) return false;

  const newX = currentPiece.x + dx;
  const newY = currentPiece.y + dy;

  if (isValidPosition(currentPiece, newX, newY)) {
    currentPiece.x = newX;
    currentPiece.y = newY;
    draw();
    return true;
  }
  return false;
}

// 시계 방향 회전을 시도한다. 벽·블록에 막히면 회전 취소(이전 모양 유지).
function tryRotatePiece() {
  if (isGameOver || !currentPiece) return false;

  const previousShape = currentPiece.shape;
  const rotatedShape = rotateShapeClockwise(previousShape);
  const testPiece = {
    type: currentPiece.type,
    x: currentPiece.x,
    y: currentPiece.y,
    shape: rotatedShape,
    color: currentPiece.color,
  };

  if (!isValidPosition(testPiece, currentPiece.x, currentPiece.y)) {
    currentPiece.shape = previousShape;
    return false;
  }

  currentPiece.shape = cloneShape(rotatedShape);
  draw();
  return true;
}

// 아래 화살표: 한 칸 빠른 낙하 (막히면 즉시 고정)
function softDrop() {
  dropPiece();
}

// 스페이스바: 바닥·블록에 닿을 때까지 즉시 하강 후 고정
function hardDrop() {
  if (isGameOver || !currentPiece) return;

  while (isValidPosition(currentPiece, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y++;
  }

  lockCurrentPieceAndSpawnNext();
  draw();
}

// ── 그리기 헬퍼 ──────────────────────────────────────────────

// 지정한 캔버스에 그리드 좌표 (col, row) 한 칸을 그린다.
function drawCellOnContext(context, col, row, color, cellSize) {
  const px = col * cellSize;
  const py = row * cellSize;

  context.fillStyle = color;
  context.fillRect(px, py, cellSize, cellSize);

  context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  context.lineWidth = 1;
  context.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);

  context.fillStyle = 'rgba(255, 255, 255, 0.15)';
  context.fillRect(px + 1, py + 1, cellSize - 2, cellSize / 4);
}

// 메인 보드에 한 칸을 그린다.
function drawCell(col, row, color) {
  drawCellOnContext(ctx, col, row, color, CELL_SIZE);
}

// 다음 블록 미리보기 캔버스를 그린다.
function drawNextPreview() {
  nextCtx.fillStyle = '#000';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (!nextPieceType) return;

  const { shape, color } = TETROMINOES[nextPieceType];
  const offsetX = Math.floor((PREVIEW_GRID - shape[0].length) / 2);
  const offsetY = Math.floor((PREVIEW_GRID - shape.length) / 2);

  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        drawCellOnContext(nextCtx, offsetX + col, offsetY + row, color, PREVIEW_CELL);
      }
    }
  }
}

// 보드 전체에 격자선을 그린다.
function drawGrid() {
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;

  // 세로선
  for (let col = 0; col <= COLS; col++) {
    const x = col * CELL_SIZE + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // 가로선
  for (let row = 0; row <= ROWS; row++) {
    const y = row * CELL_SIZE + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

// 보드에 이미 고정된 블록들을 그린다.
function drawBoard() {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell) {
        drawCell(col, row, cell);
      }
    }
  }
}

// 현재 떨어지는 블록을 그린다 (보드 안 칸만 렌더링).
function drawPiece(piece) {
  const { color, x, y } = piece;

  for (const { col, row } of getPieceCells(piece, x, y)) {
    if (!isOutOfBounds(col, row)) {
      drawCell(col, row, color);
    }
  }
}

// ── 메인 draw() ───────────────────────────────────────────────
// 캔버스를 지우고, 격자 → 고정 블록 → 현재 블록 순서로 그린다.
function draw() {
  // 배경 (검은색)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawBoard();

  if (currentPiece) {
    drawPiece(currentPiece);
  }
}

// ── 게임 시작 ────────────────────────────────────────────────
updateScoreDisplay();
spawnPiece();
draw();
startDropTimer();

restartButton.addEventListener('click', restartGame);

// ── 키보드 입력 ────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (isGameOver) return;

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      tryMovePiece(-1, 0);
      break;
    case 'ArrowRight':
      e.preventDefault();
      tryMovePiece(1, 0);
      break;
    case 'ArrowDown':
      e.preventDefault();
      softDrop();
      break;
    case 'ArrowUp':
      e.preventDefault();
      tryRotatePiece();
      break;
    case ' ':
      e.preventDefault();
      hardDrop();
      break;
  }
});
