// core/trie.js
export class Trie {
  constructor(){ this.root = {}; }
  insert(w){ let n=this.root; for (const ch of w) n = n[ch] ??= {}; n.$ = true; }
  hasWord(w){ let n=this.root; for (const ch of w){ n=n[ch]; if(!n) return false; } return !!n.$; }
  hasPrefix(p){ let n=this.root; for (const ch of p){ n=n[ch]; if(!n) return false; } return true; }
}

