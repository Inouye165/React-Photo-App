// This file is intentionally empty.
//
// The Stockfish npm package ships a self-contained Web Worker JS file at
// public/stockfish/stockfish-17.1-lite-single-03e3232.js.
// It auto-initializes the WASM engine and listens for UCI commands via
// self.onmessage / postMessage.  We load it directly as the Worker URL
// in useStockfish.ts — no wrapper needed.
//
// Previous attempts to importScripts() the Stockfish JS inside a custom
// worker always failed because:
//  1. The Stockfish script detects worker context and takes over onmessage
//     (so it never exposes a Stockfish/STOCKFISH global factory).
//  2. self.location inside a wrapper worker points to the wrapper, not the
//     Stockfish file, causing the WASM path derivation to fail.
export {}
