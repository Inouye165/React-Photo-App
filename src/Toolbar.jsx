import React from "react";

export default function Toolbar({
  onViewStaged,
  onViewInprogress,
  onViewFinished,
  onSelectFolder,
  showInprogress,
  showFinished,
  onRecheck,
  rechecking
}) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#2d3748", // dark blue-gray
        color: "#fff",
        padding: "12px 24px",
        margin: "16px",
        borderRadius: "8px",
        border: "2px solid #4a5568",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontWeight: "bold", fontSize: "1.1rem", marginRight: "20px" }}>
          Photo App (Backend View)
        </span>
        <button onClick={onSelectFolder}>Select Folder for Upload</button>
        <button onClick={onViewStaged}>View Staged</button>
        <button onClick={onViewInprogress}>View Inprogress</button>
        <button onClick={onViewFinished}>View Finished</button>
        <button
          onClick={onRecheck}
          disabled={rechecking}
          style={{
            marginLeft: "20px",
            background: rechecking ? "#6b7280" : "#8b5cf6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: "bold",
            cursor: rechecking ? "not-allowed" : "pointer",
            opacity: rechecking ? 0.7 : 1,
          }}
        >
          {rechecking ? "Rechecking..." : "Recheck AI"}
        </button>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <button
          style={{
            background: "#4a5568",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Login
        </button>
      </div>
    </nav>
  );
}
