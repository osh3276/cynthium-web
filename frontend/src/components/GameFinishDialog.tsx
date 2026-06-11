import type { GameRound } from "../types";

interface ScoreEntry {
	round: number;
	siteName: string;
	userScore: number;
	autoScore: number;
}

interface Props {
	rounds: GameRound[];
	onFinish: () => void;
}

export default function GameFinishDialog({ rounds, onFinish }: Props) {
	const entries: ScoreEntry[] = rounds.map((r, i) => ({
		round: i + 1,
		siteName: r.siteName,
		userScore: r.userScore,
		autoScore: r.autoScore,
	}));

	const userTotal = entries.reduce((s, e) => s + e.userScore, 0);
	const autoTotal = entries.reduce((s, e) => s + e.autoScore, 0);
	const userWon = userTotal > autoTotal;

	return (
		<div className="dialog-overlay">
			<div className="dialog">
				<h2 className="dialog-title">Game Over</h2>
				<div className={`dialog-result ${userWon ? "user-win" : "auto-win"}`}>
					{userWon ? "You win the game!" : "Autodesigner wins the game!"}
				</div>
				<p style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
					Final score: You {Math.round(userTotal)} — Autodesigner {Math.round(autoTotal)}
				</p>
				<table className="dialog-score-table">
					<thead>
						<tr>
							<th>Round</th>
							<th>Site</th>
							<th>Your Score</th>
							<th>Auto Score</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((e) => (
							<tr key={e.round}>
								<td className="dialog-label">{e.round}</td>
								<td className="dialog-label">{e.siteName}</td>
								<td className="dialog-val">{Math.round(e.userScore)}</td>
								<td className="dialog-val">{Math.round(e.autoScore)}</td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td></td>
							<td className="dialog-label"><strong>Total</strong></td>
							<td className="dialog-val"><strong>{Math.round(userTotal)}</strong></td>
							<td className="dialog-val"><strong>{Math.round(autoTotal)}</strong></td>
						</tr>
					</tfoot>
				</table>
				<button className="dialog-button" onClick={onFinish}>
					Back to Main Menu
				</button>
			</div>
		</div>
	);
}
