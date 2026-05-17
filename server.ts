import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Gemini
  const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  }) : null;

  app.use(express.json());

  // API Route: AI Ghost Commentary
  app.post("/api/ghost-talk", async (req, res) => {
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured" });
    }

    const { score, gameState } = req.body;
    
    try {
      const prompt = `You are an arcade ghost from Pac-Man. The player has a score of ${score} and is currently in state: ${gameState}. Give a short, witty, 1-sentence retro arcade style comment or taunt. Keep it under 15 words. Use emojis.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const text = response.text;
      res.json({ comment: text?.trim() || "Waka waka! 👻" });
    } catch (error: any) {
      if (error.status === 429 || error.message?.includes('quota')) {
        console.warn("Gemini quota exceeded. Using fallback.");
        return res.json({ comment: "The ghosts are plotting... 👻" });
      }
      console.error("Gemini error:", error);
      res.status(500).json({ error: "Failed to generate AI comment" });
    }
  });

  // API Route: Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
