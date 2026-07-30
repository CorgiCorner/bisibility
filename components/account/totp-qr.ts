const VERSION = 10;
const SIZE = VERSION * 4 + 17;
const QUIET_ZONE = 4;
const DATA_CODEWORDS = 274;
const ECC_CODEWORDS = 18;
const DATA_BLOCKS = [68, 68, 69, 69] as const;
const MAX_PAYLOAD_BYTES = 271;

type Matrix = boolean[][];

function createMatrix(value = false): Matrix {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => value));
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function dataCodewords(payload: string) {
  const bytes = Array.from(new TextEncoder().encode(payload));

  if (bytes.length > MAX_PAYLOAD_BYTES) {
    return null;
  }

  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 16);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }
  appendBits(bits, 0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  let padWord = 0xec;
  while (words.length < DATA_CODEWORDS) {
    words.push(padWord);
    padWord = padWord === 0xec ? 0x11 : 0xec;
  }
  return words;
}

function finiteFieldTables() {
  const exp = Array.from({ length: 512 }, () => 0);
  const log = Array.from({ length: 256 }, () => 0);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 0x100) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    exp[i] = exp[i - 255] ?? 0;
  }
  return { exp, log };
}

const FIELD = finiteFieldTables();

function multiply(x: number, y: number) {
  return x === 0 || y === 0 ? 0 : (FIELD.exp[(FIELD.log[x] ?? 0) + (FIELD.log[y] ?? 0)] ?? 0);
}

function generatorPolynomial(degree: number) {
  const polynomial: number[] = Array.from({ length: degree }, (_, index) =>
    index === degree - 1 ? 1 : 0,
  );
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < polynomial.length; j += 1) {
      polynomial[j] = multiply(polynomial[j] ?? 0, root);
      if (j + 1 < polynomial.length) {
        polynomial[j] = (polynomial[j] ?? 0) ^ (polynomial[j + 1] ?? 0);
      }
    }
    root = multiply(root, 0x02);
  }
  return polynomial;
}

function reedSolomonRemainder(block: number[]) {
  const generator = generatorPolynomial(ECC_CODEWORDS);
  const remainder = Array.from({ length: ECC_CODEWORDS }, () => 0);
  for (const word of block) {
    const factor = word ^ (remainder.shift() ?? 0);
    remainder.push(0);
    for (let i = 0; i < ECC_CODEWORDS; i += 1) {
      remainder[i] = (remainder[i] ?? 0) ^ multiply(generator[i] ?? 0, factor);
    }
  }
  return remainder;
}

function interleave(words: number[]) {
  let offset = 0;
  const blocks = DATA_BLOCKS.map((length) => {
    const block = words.slice(offset, offset + length);
    offset += length;
    return { data: block, ecc: reedSolomonRemainder(block) };
  });
  const result: number[] = [];
  for (let i = 0; i < 69; i += 1) {
    for (const block of blocks) {
      if (i < block.data.length) {
        result.push(block.data[i] ?? 0);
      }
    }
  }
  for (let i = 0; i < ECC_CODEWORDS; i += 1) {
    for (const block of blocks) {
      result.push(block.ecc[i] ?? 0);
    }
  }
  return result;
}

function setModule(matrix: Matrix, reserved: Matrix, x: number, y: number, black: boolean) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return;
  }
  matrix[y][x] = black;
  reserved[y][x] = true;
}

function finder(matrix: Matrix, reserved: Matrix, left: number, top: number) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const ring = x === 0 || x === 6 || y === 0 || y === 6;
      const center = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      setModule(matrix, reserved, left + x, top + y, inFinder && (ring || center));
    }
  }
}

function alignment(matrix: Matrix, reserved: Matrix, cx: number, cy: number) {
  const overlapsFinder =
    (cx === 6 && cy === 6) || (cx === 6 && cy === 50) || (cx === 50 && cy === 6);
  if (overlapsFinder) {
    return;
  }
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const black = Math.max(Math.abs(x), Math.abs(y)) !== 1;
      setModule(matrix, reserved, cx + x, cy + y, black);
    }
  }
}

function bchRemainder(value: number, degree: number, generator: number) {
  let result = value;
  for (let i = 0; i < degree; i += 1) {
    result = (result << 1) ^ ((result >>> (degree - 1)) & 1 ? generator : 0);
  }
  return result;
}

function drawFormat(matrix: Matrix, reserved: Matrix) {
  const bits = ((0b01 << 13) | bchRemainder(0b01 << 3, 10, 0x537)) ^ 0x5412;
  const bit = (index: number) => Boolean((bits >>> index) & 1);
  for (let i = 0; i <= 5; i += 1) {
    setModule(matrix, reserved, 8, i, bit(i));
  }
  setModule(matrix, reserved, 8, 7, bit(6));
  setModule(matrix, reserved, 8, 8, bit(7));
  setModule(matrix, reserved, 7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) {
    setModule(matrix, reserved, 14 - i, 8, bit(i));
  }
  for (let i = 0; i < 8; i += 1) {
    setModule(matrix, reserved, SIZE - 1 - i, 8, bit(i));
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(matrix, reserved, 8, SIZE - 15 + i, bit(i));
  }
}

function drawVersion(matrix: Matrix, reserved: Matrix) {
  const bits = (VERSION << 12) | bchRemainder(VERSION, 12, 0x1f25);
  for (let i = 0; i < 18; i += 1) {
    const bit = Boolean((bits >>> i) & 1);
    const a = SIZE - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setModule(matrix, reserved, a, b, bit);
    setModule(matrix, reserved, b, a, bit);
  }
}

function drawFunctionPatterns(matrix: Matrix, reserved: Matrix) {
  finder(matrix, reserved, 0, 0);
  finder(matrix, reserved, SIZE - 7, 0);
  finder(matrix, reserved, 0, SIZE - 7);
  for (let i = 8; i < SIZE - 8; i += 1) {
    const black = i % 2 === 0;
    setModule(matrix, reserved, 6, i, black);
    setModule(matrix, reserved, i, 6, black);
  }
  for (const x of [6, 28, 50]) {
    for (const y of [6, 28, 50]) {
      alignment(matrix, reserved, x, y);
    }
  }
  setModule(matrix, reserved, 8, SIZE - 8, true);
  drawFormat(matrix, reserved);
  drawVersion(matrix, reserved);
}

function drawColumnPair(
  matrix: Matrix,
  reserved: Matrix,
  bits: number[],
  right: number,
  upward: boolean,
  initialBitIndex: number,
) {
  let bitIndex = initialBitIndex;
  for (let offset = 0; offset < SIZE; offset += 1) {
    const y = upward ? SIZE - 1 - offset : offset;
    for (const x of [right, right - 1]) {
      if (reserved[y][x]) continue;
      const mask = (x + y) % 2 === 0 ? 1 : 0;
      matrix[y][x] = Boolean((bits[bitIndex] ?? 0) ^ mask);
      bitIndex += 1;
    }
  }
  return bitIndex;
}

function drawData(matrix: Matrix, reserved: Matrix, words: number[]) {
  const bits = words.flatMap((word) =>
    Array.from({ length: 8 }, (_, index) => (word >>> (7 - index)) & 1),
  );
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    bitIndex = drawColumnPair(matrix, reserved, bits, right, upward, bitIndex);
    upward = !upward;
  }
}

function toSvg(matrix: Matrix) {
  const size = SIZE + QUIET_ZONE * 2;
  const path = matrix
    .flatMap((row, y) =>
      row.map((black, x) => (black ? `M${x + QUIET_ZONE},${y + QUIET_ZONE}h1v1h-1z` : "")),
    )
    .filter(Boolean)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><path fill="#1A1813" d="${path}"/></svg>`;
}

export function createTotpQrDataUrl(payload: string) {
  const codewords = dataCodewords(payload);
  if (!codewords) {
    return null;
  }
  const matrix = createMatrix();
  const reserved = createMatrix();
  drawFunctionPatterns(matrix, reserved);
  drawData(matrix, reserved, interleave(codewords));
  return `data:image/svg+xml;utf8,${encodeURIComponent(toSvg(matrix))}`;
}
