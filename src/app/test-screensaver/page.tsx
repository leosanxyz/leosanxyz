"use client";
import { useState } from "react";
import Screensaver from "../components/Screensaver";

export default function TestScreensaver() {
  const [showScreensaver, setShowScreensaver] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Test Screensaver</h1>
      <button 
        onClick={() => setShowScreensaver(true)}
        style={{ 
          padding: "1rem 2rem", 
          fontSize: "1.2rem",
          marginRight: "1rem"
        }}
      >
        Show Screensaver
      </button>
      <button 
        onClick={() => setDarkMode(!darkMode)}
        style={{ 
          padding: "1rem 2rem", 
          fontSize: "1.2rem"
        }}
      >
        Toggle Dark Mode ({darkMode ? "ON" : "OFF"})
      </button>
      
      {showScreensaver && (
        <div onClick={() => setShowScreensaver(false)} style={{ cursor: "pointer" }}>
          <Screensaver darkMode={darkMode} />
        </div>
      )}
    </div>
  );
}