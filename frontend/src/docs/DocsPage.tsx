import { useEffect, useState } from "react";
import HeaderNav from "../components/HeaderNav";
import { APP_NAME, APP_TAGLINE, APP_VERSION } from "../config";
import { OverviewSection } from "./sections/OverviewSection";
import { GettingStartedSection } from "./sections/GettingStartedSection";
import { UsageSection } from "./sections/UsageSection";
import { AlgorithmsSection } from "./sections/AlgorithmsSection";
import { ApiSection } from "./sections/ApiSection";
import "./Docs.css";

const NAV = [
	{ id: "overview", label: "Overview" },
	{ id: "getting-started", label: "Getting started" },
	{ id: "usage", label: "Usage" },
	{ id: "algorithms", label: "Algorithms" },
	{ id: "api", label: "API reference" },
];

export default function DocsPage() {
	const [active, setActive] = useState("overview");

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActive(entry.target.id);
					}
				}
			},
			{ rootMargin: "-20% 0px -70% 0px" },
		);
		for (const item of NAV) {
			const el = document.getElementById(item.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
	}, []);

	return (
		<div className="docs-layout">
			<header className="app-header docs-header">
				<div className="header-brand">
					<span className="header-title">{APP_NAME}</span>
					<span className="header-version">v{APP_VERSION}</span>
				</div>
				<div className="header-tagline">Documentation</div>
				<HeaderNav />
			</header>
			<div className="docs-body">
				<nav className="docs-nav">
					<div className="docs-nav-title">Contents</div>
					{NAV.map((item) => (
						<a
							key={item.id}
							href={`#${item.id}`}
							className={
								"docs-nav-link" +
								(active === item.id ? " docs-nav-active" : "")
							}
							onClick={() => setActive(item.id)}
						>
							{item.label}
						</a>
					))}
				</nav>
				<main className="docs-main">
					<div className="docs-content">
						<OverviewSection />
						<GettingStartedSection />
						<UsageSection />
						<AlgorithmsSection />
						<ApiSection />
						<footer className="docs-footer">
							{APP_NAME} {APP_TAGLINE} - v{APP_VERSION}
						</footer>
					</div>
				</main>
			</div>
		</div>
	);
}
