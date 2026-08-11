import { NavLink } from "react-router-dom";

/** Top navigation shown in the app header on every page. */
export default function HeaderNav() {
	return (
		<nav className="header-nav">
			<NavLink
				to="/"
				end
				className={({ isActive }) =>
					"header-nav-link" + (isActive ? " header-nav-active" : "")
				}
			>
				Planner
			</NavLink>
			<NavLink
				to="/game"
				className={({ isActive }) =>
					"header-nav-link" + (isActive ? " header-nav-active" : "")
				}
			>
				Game
			</NavLink>
			<NavLink
				to="/docs"
				className={({ isActive }) =>
					"header-nav-link" + (isActive ? " header-nav-active" : "")
				}
			>
				Docs
			</NavLink>
		</nav>
	);
}
