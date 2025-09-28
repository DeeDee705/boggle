// core/gameCore.js
export const isAdj = (a,b) =>
  Math.abs(a.r-b.r) <= 1 && Math.abs(a.c-b.c) <= 1 && !(a.r===b.r && a.c===b.c);

export const pathToWord = (path, grid) =>
  path.map(p => grid[p.r][p.c]).join(""); // adapt if you support "Qu"

export const isValidPath = (path) => {
  if (path.length === 0) return false;
  for (let i = 1; i < path.length; i++){
    if (!isAdj(path[i-1], path[i])) return false;
    for (let j = 0; j < i; j++) if (path[i].r===path[j].r && path[i].c===path[j].c) return false;
  }
  return true;
};

export const scoreWord = (w) => {
  const n = w.length;
  if (n <= 2) return 0;
  if (n <= 4) return 1;
  if (n === 5) return 2;
  if (n === 6) return 3;
  if (n === 7) return 5;
  return 11;
};
