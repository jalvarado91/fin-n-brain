import { Color } from "chess.js";
import "./App.css";
import { Chessboard } from "react-chessboard";
import { useEffect, useMemo, useState } from "react";
import { Square } from "react-chessboard/dist/chessboard/types";
import stockFishWorker from "./stockfish-nnue-16?worker";
import { aChessStore, useChessStore } from "./chessStore";

interface EngineMove {
  from: string;
  to: string;
  promotion: string;
}

const UCI_READY = "uciok";

class Engine {
  stockfishWorker: Worker;
  initialized = false;
  /**
   *
   * @param name worker name
   * @param debug print verbose output for some commands
   * @param customElo target elo. Min supported is 1320, max 3190. Not specifying this makes strongest moves
   */
  constructor(
    public name?: string,
    private debug = false,
    private customElo?: number
  ) {
    this.stockfishWorker = new stockFishWorker({ name });
    this.instantiateStockfishWorker().then(async () => {
      if (this.customElo) {
        await this.setElo(this.customElo);
      }
    });
  }

  async instantiateStockfishWorker() {
    this.stockfishWorker.postMessage("uci");
    if (this.debug) {
      console.log("sent: uci");
    }

    const readyLines = await this.bufferUntil((line) => line === UCI_READY);
    if (this.debug) {
      console.log({ readyLines });
    }
    this.initialized = true;

    return;
  }

  async setElo(targetElo: number) {
    this.stockfishWorker.postMessage(
      `setoption name UCI_LimitStrength value true\nsetoption name UCI_Elo value ${targetElo}`
    );
  }

  async getSingleBestMove(fen: string, depth: number): Promise<EngineMove> {
    console.log("getSingleBestMove before", { fen, depth });

    this.stockfishWorker.postMessage(`position fen ${fen}`);
    this.stockfishWorker.postMessage(`go depth ${depth}`);

    const bestMoveRegex = /bestmove\s+(\S+)/;
    const lines = await this.bufferUntil((line) => bestMoveRegex.test(line));
    const lastLine = lines.slice(-1);
    const bestMove = lastLine[0].match(bestMoveRegex)?.[1];
    console.log("getSingleBestMove", { bestMove, lastLine, lines });
    return {
      from: bestMove!.substring(0, 2),
      to: bestMove!.substring(2, 4),
      promotion: bestMove!.substring(4, 5),
    };
  }

  evaluatePosition(fen: string, depth: number) {
    this.stockfishWorker.postMessage(`position fen ${fen}`);
    this.stockfishWorker.postMessage(`go depth ${depth}`);
  }
  stop() {
    this.stockfishWorker.postMessage("stop"); // Run when changing positions
  }
  quit() {
    this.stockfishWorker.postMessage("quit"); // Good to run this before unmounting.
    this.initialized = false;
  }
  cleanUp() {
    this.stockfishWorker.terminate();
    this.initialized = false;
  }

  private async bufferUntil(predicate: (line: string) => boolean) {
    const lines: string[] = [];
    let handler: (ev: MessageEvent) => void = () => {};

    const promise = new Promise((resolve, reject) => {
      handler = (ev) => {
        const line = ev.data;

        if (this.debug) {
          console.log("$: ", line);
        }
        if (predicate(line)) {
          resolve(lines);
        }

        lines.push(line);
      };
      this.stockfishWorker.addEventListener("message", handler);
      this.stockfishWorker.onerror = (err) => reject(err.error);
    });

    await promise;
    this.stockfishWorker.removeEventListener("message", handler);
    this.stockfishWorker.onerror = null;

    return lines;
  }
}

function App() {
  const [opponentElo] = useState(1350);
  const [playerFinElo] = useState();
  const opponentEngine = useMemo(
    () => new Engine("opponent", true, opponentElo),
    []
  );
  const playerEngine = useMemo(
    () => new Engine("player", false, playerFinElo),
    []
  );
  const [playerColor] = useState<Color>("w");
  const game = useChessStore(aChessStore);
  const isPlayerTurn = game.turn === playerColor;

  // useEffect(() => {
  //   function makeRandomOpponentMove() {
  //     const possibleMoves = game.moves;
  //     if (game.isGameOver || game.isDraw || possibleMoves.length === 0) return;

  //     const rndIdx = Math.floor(Math.random() * possibleMoves.length);
  //     const aMove = possibleMoves[rndIdx];
  //     console.log("makeRandomOpponentMove", { aMove });
  //     aChessStore.move(aMove);
  //   }

  //   if (!isPlayerTurn) {
  //     makeRandomOpponentMove();
  //   }
  // }, [game.isDraw, game.isGameOver, game.moves, isPlayerTurn]);

  useEffect(() => {
    async function findBestOpponentMove() {
      const possibleMoves = game.moves;
      if (possibleMoves.length === 0) {
        return;
      }
      const bestMove = await opponentEngine.getSingleBestMove(game.fen, 4);
      console.log("findBestOpponentMove: ", bestMove);
      return bestMove;
    }

    if (!isPlayerTurn) {
      findBestOpponentMove().then((bestMove) => {
        if (bestMove) {
          // Should always work as long as engine is good
          aChessStore.move(bestMove);
        }
      });
    }
  }, [game.fen, game.moves, isPlayerTurn, opponentEngine, playerEngine]);

  useEffect(() => {
    async function findBestPlayerMove() {
      const possibleMoves = game.moves;
      if (possibleMoves.length === 0) {
        return;
      }
      const bestMove = await playerEngine.getSingleBestMove(game.fen, 16);
      console.log("findBestPlayerMove: ", bestMove);
      return bestMove;
    }

    if (isPlayerTurn) {
      findBestPlayerMove().then((bestMove) => {
        setBestNextPlayerMove(bestMove);
      });
    } else {
      setBestNextPlayerMove(undefined);
    }
  }, [game.fen, game.moves, isPlayerTurn, playerEngine]);

  const [bestNextPlayerMove, setBestNextPlayerMove] = useState<EngineMove>();
  const nextPlayerSuggestedPiece = bestNextPlayerMove?.from;

  function onDrop(sourceSquare: Square, targetSquare: Square) {
    const move = aChessStore.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q", // Always promote to Queen
    });

    if (move == null) {
      return false;
    }

    if (game.isGameOver || game.isDraw) {
      return false;
    }

    return true;
  }

  return (
    <div className="container mx-auto w-full h-screen  grid grid-cols-8">
      <div className="col-span-5 w-full h-full">
        <div className="py-3 text-white">
          Stockfish {opponentElo ? <span>({opponentElo})</span> : null}
        </div>
        <Chessboard
          onPieceDrop={onDrop}
          position={game.fen}
          boardOrientation={playerColor === "b" ? "black" : "white"}
          arePremovesAllowed={false} // Premoves mess up the stable game ref
          id="BasicBoard"
        />
        <div className="py-3 text-white flex justify-between">
          <div>
            Me and Stockfish{" "}
            {playerFinElo ? <span>({playerFinElo})</span> : null}
          </div>{" "}
          <div className="transition-all text-lg">
            Suggested Piece:{" "}
            <span className="w-4">{nextPlayerSuggestedPiece}</span>
          </div>
        </div>
      </div>
      <div className="col-span-3 text-white  px-4 py-4">
        <div className="bg-zinc-700 shadow-inner shadow-gray-500/5  h-full rounded-md px-3 py-3">
          <div>
            <div>
              Game Me and Stockish{" "}
              {playerFinElo ? <span>({playerFinElo})</span> : null} vs Stockfish{" "}
              {opponentElo ? <span>({opponentElo})</span> : null}
            </div>
            <div
              dangerouslySetInnerHTML={{
                __html: game.pgnFormat,
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
