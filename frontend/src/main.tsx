import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { GamePage } from "./game";
import { DocsPage } from "./docs";
import "./App.css";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<App />} />
				<Route path="/game" element={<GamePage />} />
				<Route path="/docs" element={<DocsPage />} />
			</Routes>
		</BrowserRouter>
	</StrictMode>,
);
