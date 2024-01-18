import { Chess } from "chess.js";
import "./App.css";
import { Chessboard } from "react-chessboard";
import { useMemo, useState } from "react";
import { Piece, Square } from "react-chessboard/dist/chessboard/types";
import stockFishWorker from "./stockfish-nnue-16?worker";


class Engine {
  stockfish: Worker;
  onMessage: (callback: (m: { bestMove: string }) => void) => void;
  constructor() {
    this.stockfish = new stockFishWorker();
    this.onMessage = (callback) => {
      this.stockfish.addEventListener("message", (e) => {
        console.log("$", e.data);
        const bestMove = e.data?.match(/bestmove\s+(\S+)/)?.[1];

        callback({ bestMove });
      });
    };
    // Init engine
    this.stockfish.postMessage("uci");
    this.stockfish.postMessage("isready");
  }

  evaluatePosition(fen: string, depth: number) {
    this.stockfish.postMessage(`position fen ${fen}`);
    this.stockfish.postMessage(`go depth ${depth}`);
  }
  stop() {
    this.stockfish.postMessage("stop"); // Run when changing positions
  }
  quit() {
    this.stockfish.postMessage("quit"); // Good to run this before unmounting.
  }
}

function App() {
  const engine = useMemo(() => new Engine(), []);
  const game = useMemo(() => new Chess(), []);

  const [gamePosition, setGamePosition] = useState(game.fen());

  function findBestMove() {
    engine.evaluatePosition(game.fen(), 8);
    engine.onMessage((message: { bestMove: string }) => {
      console.log({ message });
      const bestMove = message?.bestMove ?? null;

      if (bestMove) {
        game.move({
          from: bestMove.substring(0, 2),
          to: bestMove.substring(2, 4),
          promotion: bestMove.substring(4, 5),
        });

        setGamePosition(game.fen());
      }
    });
  }

  function makeRandomMove() {
    const possibleMoves = game.moves();
    if (game.isGameOver() || game.isDraw() || possibleMoves.length === 0)
      return;

    const rndIdx = Math.floor(Math.random() * possibleMoves.length);
    const aMove = possibleMoves[rndIdx];
    console.log({ aMove });
    game.move(aMove);
    setGamePosition(game.fen());
  }

  function onDrop(sourceSquare: Square, targetSquare: Square, piece: Piece) {
    console.log({ sourceSquare, targetSquare, piece });

    const move = game.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q", // Always promote to Queen
    });

    console.log({ move });
    setGamePosition(game.fen());

    if (move == null) {
      return false;
    }

    if (game.isGameOver() || game.isDraw()) {
      return false;
    }

    // Have the computer make a move
    findBestMove();
    // makeRandomMove();

    return true;
  }

  return (
    <div className="container mx-auto w-full h-screen  grid grid-cols-8">
      <div className="col-span-5 w-full h-full">
        <div className="py-3 text-white">Opponent Stockfish</div>
        <Chessboard
          onPieceDrop={onDrop}
          position={game.fen()}
          id="BasicBoard"
        />
        <div className="py-3 text-white">Me and Stockfish</div>
      </div>
      <div className="col-span-3 text-white  px-4 py-4">
        <div className="bg-zinc-700 shadow-inner shadow-gray-500/5  h-full rounded-md px-3 py-3">
          <div>
            <div>Game Position:</div>
            <div>{game.fen()}</div>
            <div
              dangerouslySetInnerHTML={{
                __html: game.pgn({
                  newline: "<br />",
                  maxWidth: 5,
                }),
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
