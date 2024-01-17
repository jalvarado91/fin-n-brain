import { Chess } from "chess.js";
import "./App.css";
import { Chessboard } from "react-chessboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Piece, Square } from "react-chessboard/dist/chessboard/types";
import stockFishWorker from "./stockfish-nnue-16?worker";

function useStockFish() {
  const engine = useMemo(() => new stockFishWorker(), []);
  useEffect(() => {
    console.log(engine);

    engine.onmessage = onEngineMessage;
    console.log(engine);
    engine.postMessage("uci");

    function onEngineMessage(ev: MessageEvent) {
      console.log("$", ev.data);
    }

    return () => {
      engine.postMessage("quit");
      void (engine.onmessage = null);
    };
  }, [engine]);

  const findBestMove = useCallback(
    (fen: string, depth = 8) => {
      console.log(engine);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${depth}`);
    },
    [engine]
  );

  return { findBestMove };
}

function App() {
  const game = useMemo(() => new Chess(), []);
  const { findBestMove } = useStockFish();

  const [gamePosition, setGamePosition] = useState(game.fen());

  function makeRandomMove() {
    findBestMove(game.fen(), 10);

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
    makeRandomMove();

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
