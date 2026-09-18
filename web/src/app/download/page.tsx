"use client";

import React, { useState } from "react";

export default function DownloadPage() {
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleDownload = () => {
    setDownloadStarted(true);
    // Trigger download
    const a = document.createElement("a");
    a.href = "/app-release.apk";
    a.download = "app-release.apk";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #0f2847 0%, #0a192f 60%, #020617 100%)",
        color: "#f8fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "clamp(1rem, 4vw, 2.5rem)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          width: "100%",
          background: "rgba(15, 23, 42, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "24px",
          padding: "clamp(1.5rem, 5vw, 2.5rem)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          textAlign: "center",
        }}
      >
        {/* Emblem & Branding */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(255, 255, 255, 0.08)",
            padding: "6px 16px",
            borderRadius: "999px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            marginBottom: "1.2rem",
          }}
        >
          <span style={{ fontSize: "1.2rem" }}>🏛️</span>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#fbbf24",
              textTransform: "uppercase",
            }}
          >
            राजस्थान सरकार | Govt. of Rajasthan
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(1.5rem, 5vw, 2rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            margin: "0 0 0.5rem",
            lineHeight: 1.25,
          }}
        >
          जन सुनवाई (Sampark Lite)
        </h1>
        <p style={{ fontSize: "0.95rem", color: "#94a3b8", margin: "0 0 1.8rem" }}>
          Official Video Hearing & Grievance Redressal Mobile Application
        </p>

        {/* APK Card Info */}
        <div
          style={{
            background: "rgba(2, 6, 23, 0.6)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            borderRadius: "16px",
            padding: "16px",
            marginBottom: "1.8rem",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.85rem" }}>
            <span style={{ color: "#94a3b8" }}>Package:</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>gov.rajasthan.jansunwai</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.85rem" }}>
            <span style={{ color: "#94a3b8" }}>Version:</span>
            <span style={{ color: "#34d399", fontWeight: 700 }}>v1.0.0 (Release)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.85rem" }}>
            <span style={{ color: "#94a3b8" }}>File Size:</span>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>105.8 MB</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span style={{ color: "#94a3b8" }}>Platform:</span>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>Android 8.0+ (ARM64 / x86_64)</span>
          </div>
        </div>

        {/* Big Download Button */}
        <button
          onClick={handleDownload}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            border: "1px solid #10b981",
            color: "#ffffff",
            fontSize: "1.1rem",
            fontWeight: 800,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            boxShadow: "0 10px 25px rgba(5, 150, 105, 0.4)",
            marginBottom: "1rem",
            transition: "all 0.2s ease",
          }}
        >
          <span style={{ fontSize: "1.4rem" }}>📲</span>
          <span>Download Android App (APK)</span>
        </button>

        {downloadStarted && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid #10b981",
              borderRadius: "10px",
              color: "#34d399",
              fontSize: "0.88rem",
              fontWeight: 600,
              marginBottom: "1.2rem",
            }}
          >
            ✓ Download started! Check your notification bar or Downloads folder.
          </div>
        )}

        {/* WhatsApp in-app browser note */}
        <div
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "12px",
            padding: "12px",
            marginBottom: "1.5rem",
            textAlign: "left",
            fontSize: "0.82rem",
            color: "#fbbf24",
            lineHeight: 1.4,
          }}
        >
          <strong>⚠️ Opening from WhatsApp or Instagram?</strong>
          <br />
          If the download doesn't start, tap the <strong>3 dots (⋮)</strong> in the top-right corner and select <strong>"Open in Chrome"</strong> or <strong>"Open in Browser"</strong>.
        </div>

        {/* Direct Link to Web Portal */}
        <div style={{ paddingTop: "1.2rem", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "0 0 0.8rem" }}>
            Don't want to install an app? Join directly from your browser:
          </p>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: "#38bdf8",
              fontSize: "0.95rem",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <span>💻 Open Web Hearing Portal</span>
            <span>➔</span>
          </a>
        </div>
      </div>
    </div>
  );
}
