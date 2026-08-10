import { useState, useCallback } from "react";
import type { GameState, GameDefinition, GameData } from "../types";
import GameResultDialog from "./components/GameResultDialog";
import GameFinishDialog from "./components/GameFinishDialog";
import { fetchGameData } from "./api";

interface Props {
	gameState: GameState | null;
	currentRound: GameState["rounds"][number] | null;
	showGameResult: boolean;
	showGameFinish: boolean;
	gameLoading: boolean;
	showHowToPlay: boolean;
	showGamePicker: boolean;
	availableGames: GameDefinition[];
	gamesLoading: boolean;
	onCloseGameResult: () => void;
	onAdvanceRound: () => void;
	onGameFinish: () => void;
	onDismissHowToPlay: () => void;
	onPickGame: (gameData: GameData) => void;
}

	export default function Game({
	gameState,
	currentRound,
	showGameResult,
	showGameFinish,
	gameLoading,
	showHowToPlay,
	showGamePicker,
	availableGames,
	gamesLoading,
	onCloseGameResult,
	onAdvanceRound,
	onGameFinish,
	onDismissHowToPlay,
	onPickGame,
}: Props) {
	const [loadingGameName, setLoadingGameName] = useState<string | null>(null);

	const handlePickGame = useCallback(async (def: GameDefinition) => {
		setLoadingGameName(def.name);
		const data = await fetchGameData(def.filename);
		if (data) {
			onPickGame(data);
		} else {
			alert(`Failed to load game "${def.name}". Check the file and try again.`);
		}
		setLoadingGameName(null);
	}, [onPickGame]);

	return (
		<>
			{showGamePicker && !gameLoading && (
				<div className="dialog-overlay">
					<div className="dialog">
						<div className="dialog-title">Select Game</div>
						<div style={{ fontSize: 12, color: "#a8b2d1", marginBottom: 12 }}>
							Pick a scenario set.
						</div>
						{gamesLoading ? (
							<div style={{ fontSize: 12, color: "#a8b2d1", fontStyle: "italic" }}>
								Loading scenarios...
							</div>
						) : availableGames.length === 0 ? (
							<div style={{ fontSize: 12, color: "#e53935", fontStyle: "italic" }}>
								No game files found in backend/data/games/.
							</div>
						) : (
							<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
								{availableGames.map((g) => (
									<button
										key={g.filename}
										className="panel-button generate-button"
										style={{ textAlign: "left", padding: "8px 12px", height: "auto" }}
										onClick={() => handlePickGame(g)}
										disabled={loadingGameName === g.name}
									>
										<div style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</div>
										<div style={{ fontSize: 11, color: "#a8b2d1", marginTop: 2 }}>
											{g.description || "No description"}
										</div>
										<div style={{ fontSize: 10, color: "#64ffda", marginTop: 2 }}>
											{g.roundCount} round{g.roundCount !== 1 ? "s" : ""}
										</div>
									</button>
								))}
							</div>
						)}
						<button
							className="dialog-button"
							onClick={onGameFinish}
							style={{ marginTop: 12 }}
						>
							Back
						</button>
					</div>
				</div>
			)}
			{loadingGameName && (
				<div className="dialog-overlay">
					<div className="dialog" style={{ alignItems: "center" }}>
						<div className="dialog-title">Loading {loadingGameName}...</div>
						<div style={{ fontSize: 12, color: "#a8b2d1", marginTop: 8 }}>
							this may take a while
						</div>
					</div>
				</div>
			)}
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
								match, and power match.
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
