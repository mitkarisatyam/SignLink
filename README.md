# SIGNLINK: Two-Way Video Call for the Deaf

SIGNLINK is a real-time, browser-based, two-way communication platform designed to seamlessly bridge the gap between Deaf (Indian Sign Language users) and Hearing participants. 

## 🌟 Main Features

* **Voice/Text → ISL Avatar**: When a hearing participant speaks, the system converts speech to text and dynamically drives a 3D ISL Avatar ("Sanket") to sign the translated concepts in real-time.
* **ISL Sign → Text + Voice**: When a deaf participant performs Indian Sign Language, the system tracks body kinematics using MediaPipe and processes temporal sign sequences using a custom Neural Network (`SignTemporalGRU v2`), translating the signs into text and synthesized speech for the hearing participant.
* **Fully Local Edge AI**: All inference runs directly in the browser. No server-side video processing is needed, ensuring high privacy, extreme low latency, and zero cloud costs.
* **Responsive UI**: Real-time HUD showing confidence scores, active gesture tracking, Web Speech API integration, and manual trigger fallbacks.

## 🛠️ Tech Stack

* **Frontend**: React + Vite
* **3D Rendering**: Three.js (Avatar rendering and skeletal animation)
* **Vision & Tracking**: MediaPipe Tasks Vision (`HandLandmarker`)
* **Machine Learning**: 
  * Python + PyTorch (Training pipeline for the GRU model)
  * Custom Vanilla JavaScript inference engine (running PyTorch exported weights in-browser)
* **Speech**: Web Speech API (`SpeechRecognition` & `SpeechSynthesis`)

## 🚀 Setup & Run Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Run the development server:**
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser. (Note: A browser with Web Speech API support like Chrome is recommended).

## 🧠 AI & Model Overview

The custom sign language recognition engine uses a lightweight, temporal architecture:
* **Feature Extraction**: Normalizes MediaPipe hand landmarks relative to palm centers and scales them uniformly.
* **Temporal Sequence**: Resamples varying-length sequences to fixed 20-frame windows.
* **SignTemporalGRU v2**: A 2-layer Gated Recurrent Unit (GRU) model with 64 hidden dimensions, followed by Mean Pooling and BatchNorm layers.
* **Inference**: Deployed as a pure JS bundle (`sign_gru_v2_bundle.json`) evaluating frames in ~1ms without blocking the main UI thread.

## 📄 Credits, Licensing & Attributions

* **MediaPipe**: Built utilizing Google MediaPipe Vision tasks (`hand_landmarker.task`). Licensed under Apache 2.0.
* **Avatar & Animations**: The 3D avatar ("Sanket") and accompanying animations are developed for this project. 
* **Lucide Icons**: Utilizes Lucide React for UI iconography (ISC License).

*Disclaimer: This is a proof-of-concept for bridging ISL communication and supports a focused vocabulary dataset for demonstration.*
