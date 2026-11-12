import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import App from "./App.jsx";
import "./styles.css";
import "./aurora.css";
import "./sports.css";

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Aurora couldn’t open this view.</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>Reload Aurora</button>
        <p>Your saved calendar has not been deleted.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
