import type { GameState } from "../types";
import GameResultDialog from "./components/GameResultDialog";
import GameFinishDialog from "./components/GameFinishDialog";

interface Props {
	gameState: GameState | null;
	currentRound: GameState["rounds"][number] | null;
	showGameResult: boolean;
	showGameFinish: boolean;
	gameLoading: boolean;
	showHowToPlay: boolean;
	onCloseGameResult: () => void;
	onAdvanceRound: () => void;
	onGameFinish: () => void;
	onDismissHowToPlay: () => void;
}

export default function Game({
	gameState,
	currentRound,
	showGameResult,
	showGameFinish,
	gameLoading,
	showHowToPlay,
	onCloseGameResult,
	onAdvanceRound,
	onGameFinish,
	onDismissHowToPlay,
}: Props) {
	return (
		<>
			{showGameResult && currentRound && gameState && (
				<GameResultDialog
					round={gameState.currentRound + 1}
					totalRounds={gameState.rounds.length}
					siteName={currentRound.siteName}
					userScore={currentRound.userScore}
					autoScore={currentRound.autoScore}
					userStats={currentRound.userStats}
					autoStats={currentRound.autoStats}
					userGrade={
						(currentRound.userStats?.[
							"traversal_grade"
						] as string) || "F"
					}
					autoGrade={
						(currentRound.autoStats?.[
							"traversal_grade"
						] as string) || "F"
					}
					onNext={onAdvanceRound}
					onClose={onCloseGameResult}
					isLast={
						gameState.currentRound >= gameState.rounds.length - 1
					}
				/>
			)}
			{showGameFinish && gameState && (
				<GameFinishDialog
					rounds={gameState.rounds}
					onFinish={onGameFinish}
				/>
			)}
			{gameLoading && (
				<div className="dialog-overlay">
					<div className="dialog" style={{ alignItems: "center" }}>
						<div className="dialog-title">Loading game...</div>
						<div style={{ fontSize: 12, color: "#a8b2d1", marginTop: 8 }}>
							this may take a while
						</div>
					</div>
				</div>
			)}
			{showHowToPlay && (
				<div className="dialog-overlay">
					<div className="dialog">
						<div className="dialog-title">How to Play</div>
						<div style={{ fontSize: 12, lineHeight: 1.6, color: "#a8b2d1" }}>
							<p style={{ marginBottom: 8 }}>
								Plan a route across the lunar surface for the
								Artemis SR rover. Each round gives you several
								numbered waypoint markers to visit in order —
								place waypoints to define your path.
							</p>
							<p style={{ marginBottom: 8 }}>
								Click on the 2D map to place waypoints. The
								first waypoint must be near the blue{" "}
								<span style={{ color: "#4fc3f7" }}>1</span>{" "}
								marker and the last near the red{" "}
								<span style={{ color: "#e53935" }}>N</span>{" "}
								marker (where N is the final number). Orange
								markers in between must also be visited.
							</p>
							<p style={{ marginBottom: 8 }}>
								When you're ready, press{" "}
								<strong>Finish Path</strong> to score your route
								against the autodesigner's optimal path. The
								higher score wins the round!
							</p>
							<p style={{ marginBottom: 8 }}>
								Scores are based on path efficiency, energy
								economy, illumination, meteor safety, traction
								match, and power match across 5 rounds.
							</p>
						</div>
						<button className="dialog-button" onClick={onDismissHowToPlay}>
							Start Round 1
						</button>
					</div>
				</div>
			)}
		</>
	);
}
