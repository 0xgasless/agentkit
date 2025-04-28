import express from "express";
import dotenv from "dotenv";
import contextRoutes from "./routes/context.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use("/api", contextRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
