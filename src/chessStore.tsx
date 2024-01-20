import { Chess } from "chess.js";
import { useSyncExternalStore } from "react";

export class ChessStore {
  chess: Chess;
  listeners = new Set<() => void>();
  public projection: ReturnType<typeof getProjection>;

  constructor() {
    this.chess = new Chess();
    this.projection = getProjection(this.chess);
  }

  clear() {
    this.chess.clear();
    this.projection = getProjection(this.chess);
    this.emitChange();
  }
  load(fen: string) {
    this.chess.load(fen);
    this.projection = getProjection(this.chess);
    this.emitChange();
  }
  loadPgn(pgn: string) {
    this.chess.loadPgn(pgn);
    this.projection = getProjection(this.chess);
    this.emitChange();
  }
  move(...params: Parameters<typeof this.chess.move>) {
    const m = this.chess.move(...params);
    this.projection = getProjection(this.chess);
    this.emitChange();
    return m;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getSnapshot() {
    return this.projection;
  }

  emitChange() {
    this.listeners.forEach((listener) => listener());
  }
}

function getProjection(game: Chess) {
  return {
    fen: game.fen(),
    history: game.history(),
    inCheck: game.inCheck(),
    isCheckmate: game.isCheckmate(),
    isDraw: game.isDraw(),
    isInsufficientMaterial: game.isInsufficientMaterial(),
    isGameOver: game.isGameOver(),
    isStalemate: game.isStalemate(),
    isThreefoldRepetition: game.isThreefoldRepetition(),
    moveNumber: game.moveNumber(),
    moves: game.moves(),
    pgn: game.pgn(),
    pgnFormat: game.pgn({
      newline: "<br />",
      maxWidth: 5,
    }),
    turn: game.turn(),
  };
}

export function useChessStore(chessStore: ChessStore) {
  return useSyncExternalStore(
    chessStore.subscribe.bind(chessStore),
    chessStore.getSnapshot.bind(chessStore)
  );
}

export const aChessStore = new ChessStore();
