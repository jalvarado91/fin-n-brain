import { Color } from "chess.js";
import "./App.css";
import { Chessboard } from "react-chessboard";
import { useEffect, useMemo, useState } from "react";
import { Square } from "react-chessboard/dist/chessboard/types";
import stockFishWorker from "./stockfish-nnue-16?worker";
import { aChessStore, useChessStore } from "./chessStore";
import wk from "./assets/wk.png";
import bk from "./assets/bk.png";

const pieceToFullPieceMap = {
  p: "Pawn",
  n: "Knight",
  b: "Bishop",
  r: "Rook",
  q: "Queen",
  k: "King",
};

interface EngineMove {
  from: string;
  to: string;
  promotion: string;
}

const UCI_OK = "uciok";
const UCI_READY_OK = "readyok";

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

    const readyLines = await this.bufferUntil((line) => line === UCI_OK);
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
  async newGame() {
    this.stockfishWorker.postMessage("ucinewgame");
    this.stockfishWorker.postMessage("isready");
    const readyLines = await this.bufferUntil((line) => line === UCI_READY_OK);
    if (this.debug) {
      console.log("newGame", readyLines);
    }
    return;
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
  const [opponentElo, setOpponentElo] = useState(1350);
  const [partnerElo, setPartnerElo] = useState(3190);
  const opponentEngine = useMemo(
    () => new Engine("opponent", false, opponentElo),
    [opponentElo]
  );
  const playerEngine = useMemo(
    () => new Engine("player", false, partnerElo ? partnerElo : undefined),
    [partnerElo]
  );
  const [showSquare, setShowSquare] = useState(false);
  const [enableBlunderChance, setEnableBlunderChance] = useState(false);
  const [blunderChance, setBlunderChance] = useState(5);
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const game = useChessStore(aChessStore);
  const isPlayerTurn = game.turn === playerColor;
  const [activeScreen, setActiveScreen] = useState<"home" | "playing">("home");

  useEffect(() => {
    function makeRandomOpponentMove() {
      const possibleMoves = game.moves;
      if (game.isGameOver || game.isDraw || possibleMoves.length === 0) return;

      const rndIdx = Math.floor(Math.random() * possibleMoves.length);
      const move = possibleMoves[rndIdx];
      console.log("makeRandomOpponentMove", move);
      aChessStore.move(move);
    }

    async function findBestOpponentMove() {
      const possibleMoves = game.moves;
      if (possibleMoves.length === 0) {
        return;
      }
      const bestMove = await opponentEngine.getSingleBestMove(game.fen, 2);
      console.log("findBestOpponentMove: ", bestMove);
      return bestMove;
    }

    if (activeScreen === "playing" && !isPlayerTurn) {
      if (enableBlunderChance) {
        const isRandom = Math.random() < 1 / blunderChance;

        if (isRandom) {
          makeRandomOpponentMove();
          return;
        }
      }
      findBestOpponentMove().then((bestMove) => {
        if (bestMove) {
          // Should always work as long as engine is good
          aChessStore.move(bestMove);
        }
      });
    }
  }, [
    activeScreen,
    game.fen,
    game.isDraw,
    game.isGameOver,
    game.moves,
    enableBlunderChance,
    isPlayerTurn,
    opponentEngine,
    playerEngine,
    blunderChance,
  ]);

  const gameOverDetails = game.isGameOver && {
    winner: game.turn === "b" ? "white" : "black",
    draw: game.isDraw,
    checkMate: game.isCheckmate,
  };

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

    if (activeScreen === "playing" && isPlayerTurn) {
      findBestPlayerMove().then((bestMove) => {
        setBestPlayerMove(bestMove);
      });
    } else {
      setBestPlayerMove(undefined);
    }
  }, [activeScreen, game.fen, game.moves, isPlayerTurn, playerEngine]);

  const [bestPlayerMove, setBestPlayerMove] = useState<EngineMove>();
  const suggestedMoveFrom = bestPlayerMove?.from;
  const suggestedFullMove =
    bestPlayerMove &&
    game.movesVerbose.find(
      (v) => v.from === bestPlayerMove.from && v.to === bestPlayerMove.to
    );

  const suggestedPiece = suggestedFullMove && suggestedFullMove.piece;
  const suggestedPieceFull =
    suggestedPiece && pieceToFullPieceMap[suggestedPiece];

  function playAgain() {
    playerEngine.stop();
    opponentEngine.stop();
    console.log("play again");
    Promise.all([opponentEngine.newGame(), playerEngine.newGame()]).then(() => {
      console.log("engines ready for new game");
      setActiveScreen("playing");
      setBestPlayerMove(undefined);
      aChessStore.reset();
    });
  }

  function returnHome() {
    playerEngine.stop();
    opponentEngine.stop();
    console.log("return home");
    Promise.all([opponentEngine.newGame(), playerEngine.newGame()]).then(() => {
      console.log("engines ready for new game");
      aChessStore.reset();
      setActiveScreen("home");
      setBestPlayerMove(undefined);
    });
  }

  function onDrop(sourceSquare: Square, targetSquare: Square) {
    if (activeScreen !== "playing") {
      return false;
    }
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
    <div className="container mx-auto w-full h-screen grid md:grid-cols-8">
      <div className="md:col-span-5 px-4 md:px-0 w-full h-full">
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
        <div className="py-3 text-white flex justify-between w-full">
          <div className="w-full">
            Me and Stockfish{" "}
            {partnerElo ? <span>({partnerElo})</span> : <span>(3500+)</span>}
          </div>{" "}
          <div className="transition-all text-lg w-full flex space-x-1 justify-end">
            <div className="text-sm align-bottom">
              suggested piece:{" "}
              <span className="font-bold text-lg w-4">
                {suggestedPieceFull ?? "------"}
              </span>
            </div>
            {showSquare && (
              <div className="text-sm align-bottom">
                on{" "}
                <span className="text-lg font-bold w-4">
                  {suggestedMoveFrom ?? "--"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="md:col-span-3 text-zinc-200 px-4 py-4 max-h-[min(100vh,_1120px)]">
        <div className="bg-zinc-700 shadow-inner shadow-gray-500/5 flex flex-col max-h-full h-full rounded">
          {activeScreen === "home" ? (
            <div className="flex flex-col max-h-full h-full ">
              <div className="px-3 py-3 prose-invert prose-sm prose-zinc bg-zinc-900/20">
                <h3 className="font-bold">Hello! Welcome to Fin-n-Brain</h3>
                <p>
                  This is a variant of the Hand and Brain chess variant, but
                  against StockFish with another StockFish as your partner.
                </p>
                <p>
                  The rules are simple. You're playing StockFish with ELO of
                  your choosing, while another StockFish tells you a piece to
                  move based on the best moves in the position. The piece will
                  show at the bottom right of the board. Have fun!
                </p>
              </div>
              <div className="flex-1 px-3 py-3">
                <div className="text-sm opacity-70 mb-4">Setup you game</div>
                <div className="flex space-x-3">
                  <label className="block">
                    <span className="text-zinc-200 uppercase font-semibold text-xs">
                      Opponent Elo
                    </span>
                    <input
                      value={opponentElo}
                      onChange={(e) => setOpponentElo(Number(e.target.value))}
                      type="number"
                      className="form-input mt-1 block w-full bg-zinc-800 rounded-md border-zinc-800 shadow-sm focus:border-sky-300 focus:ring focus:ring-sky-200 focus:ring-opacity-50"
                      placeholder=""
                    />
                  </label>
                  <label className="block">
                    <span className="text-zinc-200 uppercase font-semibold text-xs">
                      Player Partner Elo
                    </span>
                    <input
                      value={partnerElo}
                      onChange={(e) => setPartnerElo(Number(e.target.value))}
                      type="email"
                      className="form-input mt-1 block w-full bg-zinc-800 rounded-md border-zinc-800 shadow-sm focus:border-sky-300 focus:ring focus:ring-sky-200 focus:ring-opacity-50"
                      placeholder="3500+"
                    />
                  </label>
                </div>
                <div className="text-xs mt-2 opacity-80">
                  Values must be between 1350 and 3190
                </div>
                <br />
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox rounded h-4 w-4 border-gray-300 text-sky-600 shadow-sm focus:border-sky-300 focus:ring focus:ring-offset-0 focus:ring-sky-200 focus:ring-opacity-50"
                      checked={showSquare}
                      onChange={(ev) => setShowSquare(ev.target.checked)}
                    />
                    <span className="ml-2 text-sm font-semibold">
                      Show Suggested Square
                    </span>
                  </label>
                </div>
                <div className="text-xs mt-2 opacity-80">
                  If enabled, will also show the coordinates of suggested piece
                  (e.g. e4)
                </div>
                <br />
                <div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="form-checkbox rounded h-4 w-4 border-gray-300 text-sky-600 shadow-sm focus:border-sky-300 focus:ring focus:ring-offset-0 focus:ring-sky-200 focus:ring-opacity-50"
                      checked={enableBlunderChance}
                      onChange={(ev) =>
                        setEnableBlunderChance(ev.target.checked)
                      }
                    />
                    <span className="ml-2 text-sm font-semibold">
                      Enable chance of opponent blunder
                    </span>
                  </label>
                </div>
                <div className="text-xs mt-2 opacity-80">
                  If enabled, opponent will have a 1 in{" "}
                  <input
                    className="inline-block w-7 bg-zinc-800 border-zinc-800 text-center py-1 font-bold disabled:opacity-30 disabled:pointer-events-none"
                    value={blunderChance}
                    disabled={!enableBlunderChance}
                    onChange={(ev) => setBlunderChance(Number(ev.target.value))}
                  />{" "}
                  chance of making a blunder
                </div>
                <br />
                <div className=" space-y-4">
                  <div className="font-semibold text-xs">PLAY AS</div>
                  <div className="flex justify-fill px-1 space-x-4">
                    <button
                      onClick={() => setPlayerColor("w")}
                      className={`bg-white py-2 flex  items-center justify-center space-x-3 flex-1 rounded-md  ${
                        playerColor === "w"
                          ? "outline-sky-500 outline-4 outline outline-offset-2"
                          : ""
                      }`}
                    >
                      <img src={wk} className="size-12" />
                    </button>
                    <button
                      onClick={() => setPlayerColor("b")}
                      className={`bg-zinc-900 py-2  flex items-center justify-center space-x-3 flex-1 rounded-md ${
                        playerColor === "b"
                          ? "outline-sky-500 outline-4 outline outline-offset-2"
                          : ""
                      }`}
                    >
                      <img src={bk} className="size-12" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-shrink-0 px-3 py-3">
                <button
                  onClick={() => setActiveScreen("playing")}
                  className="bg-sky-500 border border-sky-600 hover:bg-sky-400 transition-colors text-white tracking-wide shadow-md py-3 text-xl font-bold text-shadown w-full rounded-lg"
                >
                  Start Game
                </button>
              </div>
            </div>
          ) : activeScreen === "playing" ? (
            <div className="flex flex-col max-h-full h-full divide-y divide-gray-500">
              <div className="flex flex-1 h-full flex-col max-h-full">
                <div className="flex-shrink-0 px-3 py-3 text-center">
                  Me and Stockish{" "}
                  {partnerElo ? <span>({partnerElo})</span> : null} vs Stockfish{" "}
                  {opponentElo ? <span>({opponentElo})</span> : null}
                </div>
                <div
                  className="h-full px-4 py-4 flex-1 overflow-y-scroll bg-zinc-900/40"
                  dangerouslySetInnerHTML={{
                    __html: game.pgnFormat,
                  }}
                ></div>
                {game.isGameOver && (
                  <div className="flex flex-col justify-end flex-shrink-0 space-y-4 py-3 px-2">
                    {gameOverDetails && (
                      <div className="text-center">
                        {gameOverDetails.checkMate && (
                          <div className="text-xl font-bold capitalize">
                            {gameOverDetails.winner} wins by checkmate
                          </div>
                        )}
                        {gameOverDetails.draw && (
                          <div className="text-xl font-bold capitalize">
                            Draw
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={playAgain}
                      className="bg-sky-500 border border-sky-600 hover:bg-sky-400 transition-colors text-white tracking-wide shadow-md py-3 text-xl font-bold text-shadown w-full rounded-lg"
                    >
                      Play Again
                    </button>
                    <button
                      onClick={returnHome}
                      className="bg-zinc-500 border border-zinc-600 hover:bg-zinc-400 transition-colors text-white tracking-wide shadow-md py-3 text-xl font-bold text-shadown w-full rounded-lg"
                    >
                      Return Home
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default App;
